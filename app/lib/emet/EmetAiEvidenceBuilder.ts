import type {
  BibleIQEntity,
  BibleIQReference,
  BibleIQResponse,
  BibleIQSource,
  BibleIQTranslation,
} from "@/app/data/lexicon/BibleIQTypes";
import {
  EMET_AI_EVIDENCE_SCHEMA,
  type EmetAiEvidenceItem,
  type EmetAiEvidencePacket,
  validateEmetAiEvidencePacket,
} from "./EmetAiContract";

const MAX_SCRIPTURE_REFERENCES = 20;
const MAX_KNOWLEDGE_ITEMS_PER_KIND = 8;

export type EmetAiVerseEvidence = {
  reference: string;
  text: string;
  translation: BibleIQTranslation;
  sourceId?: string;
  checksum?: string;
};

export type EmetAiVerseLoader = (
  reference: BibleIQReference,
) => Promise<EmetAiVerseEvidence | null>;

export type EmetAiEvidenceBuildResult =
  | {
      status: "ready";
      packet: EmetAiEvidencePacket;
    }
  | {
      status: "insufficient-evidence";
      reason:
        | "invalid-question"
        | "unresolved-word"
        | "unverified-occurrence"
        | "identity-mismatch"
        | "no-usable-evidence"
        | "invalid-packet";
      limitations: string[];
    };

type BuildWordEvidenceInput = {
  question: string;
  wordStudy: BibleIQResponse;
  loadVerse: EmetAiVerseLoader;
  builtAt?: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function referenceKey(reference: Pick<BibleIQReference, "book" | "chapter" | "verse">) {
  return `${reference.book}.${reference.chapter}.${reference.verse}`;
}

function evidenceIdPart(value: string) {
  return value.replace(/[^0-9A-Za-z._:-]+/g, "-");
}

function expectedEntityId(corpus: BibleIQSource, lexicalId: string) {
  return `word:${corpus}:${lexicalId}`;
}

function validLexicalId(corpus: BibleIQSource, lexicalId: string) {
  if (corpus === "hebrew") return /^H\d+$/.test(lexicalId);
  if (corpus === "greek-nt") return /^G\d+$/.test(lexicalId);
  return /^L\d+$/.test(lexicalId);
}

function identityFailure(
  reason: Extract<
    EmetAiEvidenceBuildResult,
    { status: "insufficient-evidence" }
  >["reason"],
  limitation: string,
): EmetAiEvidenceBuildResult {
  return {
    status: "insufficient-evidence",
    reason,
    limitations: [limitation],
  };
}

function verifiedWordIdentity(wordStudy: BibleIQResponse) {
  if (!wordStudy.resolved || wordStudy.resolutionType === "unresolved") {
    return identityFailure(
      "unresolved-word",
      "The selected source occurrence did not resolve to a canonical lexical entity.",
    );
  }

  const entity = wordStudy.entity;
  if (!entity || entity.type !== "word") {
    return identityFailure(
      "unresolved-word",
      "The selected item is not a resolved source-word entity.",
    );
  }

  const alignment = entity.alignment;
  const resolution = alignment?.lexicalResolution;
  if (!alignment || !resolution || resolution.status !== "resolved") {
    return identityFailure(
      "unverified-occurrence",
      "The source occurrence has no verified canonical lexical-resolution record.",
    );
  }

  const lexicalId = clean(resolution.lexicalId);
  const corpus = resolution.corpus;
  const entityLexicalId = clean(entity.entityEvidence?.lexical.lexicalId);
  const canonicalEntityId = expectedEntityId(corpus, lexicalId);
  const identitiesAgree =
    validLexicalId(corpus, lexicalId) &&
    resolution.entityId === canonicalEntityId &&
    alignment.entityId === canonicalEntityId &&
    alignment.source === corpus &&
    clean(alignment.lexicalId) === lexicalId &&
    entity.id === canonicalEntityId &&
    entityLexicalId === lexicalId;

  if (!identitiesAgree) {
    return identityFailure(
      "identity-mismatch",
      "The occurrence, alignment, and Word Overview records do not agree on one lexical identity.",
    );
  }

  return {
    status: "verified" as const,
    entity,
    corpus,
    lexicalId,
    canonicalEntityId,
    morphology: clean(alignment.morph) || undefined,
  };
}

function addEvidence(
  evidence: EmetAiEvidenceItem[],
  seenIds: Set<string>,
  item: EmetAiEvidenceItem,
) {
  if (!clean(item.text) || seenIds.has(item.id)) return;
  seenIds.add(item.id);
  evidence.push(item);
}

function lexicalEvidence(
  entity: BibleIQEntity,
  corpus: BibleIQSource,
  lexicalId: string,
  canonicalEntityId: string,
) {
  const lexical = entity.entityEvidence?.lexical;
  if (!lexical) return "";

  const fields = [
    lexical.lemma ? `Lemma: ${lexical.lemma}.` : "",
    lexical.transliteration
      ? `Transliteration: ${lexical.transliteration}.`
      : "",
    lexical.partsOfSpeech.length
      ? `Part of speech: ${lexical.partsOfSpeech.join(", ")}.`
      : "",
    lexical.glosses.length ? `Glosses: ${lexical.glosses.join("; ")}.` : "",
    lexical.shortDefinitions.length
      ? `Source dictionary wording: ${lexical.shortDefinitions.join(" ")}`
      : "",
  ].filter(Boolean);

  if (!fields.length) return "";

  return {
    id: `lexical:${canonicalEntityId}`,
    kind: "lexical" as const,
    corpus,
    text: fields.join(" "),
    entityId: canonicalEntityId,
    lexicalId,
    provenance: {
      authority: "canonical-word-study-runtime",
      sourceId: entity.see?.evidenceId,
      checksum:
        entity.emet?.packetChecksum || entity.emet?.explanationChecksum,
    },
  };
}

function uniqueReferences(entity: BibleIQEntity) {
  const references: BibleIQReference[] = [];
  const seen = new Set<string>();
  const selectedOccurrences = entity.evidence.occurrences.filter(
    (occurrence) => occurrence.englishText || occurrence.sourceWord,
  );
  const candidates = [
    ...selectedOccurrences,
    ...(entity.keyReferences || []),
    ...(entity.entityEvidence?.representativeReferences || []),
    ...(entity.entityEvidence?.chronology.firstOccurrence
      ? [entity.entityEvidence.chronology.firstOccurrence]
      : []),
    ...(entity.entityEvidence?.chronology.lastOccurrence
      ? [entity.entityEvidence.chronology.lastOccurrence]
      : []),
    ...entity.evidence.occurrences,
  ];

  for (const reference of candidates) {
    const key = `${referenceKey(reference)}|${reference.routeTranslation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push(reference);
    if (references.length >= MAX_SCRIPTURE_REFERENCES) break;
  }

  return references;
}

function addKnowledgeEvidence(
  evidence: EmetAiEvidenceItem[],
  seenIds: Set<string>,
  entity: BibleIQEntity,
  corpus: BibleIQSource,
  lexicalId: string,
  canonicalEntityId: string,
) {
  const knowledge = entity.seeKnowledge;
  if (!knowledge?.available) return;

  const groups = [
    ["relationship", knowledge.relationships],
    ["event", knowledge.events],
    ["theme", knowledge.themes],
  ] as const;

  for (const [kind, items] of groups) {
    for (const [index, item] of items
      .slice(0, MAX_KNOWLEDGE_ITEMS_PER_KIND)
      .entries()) {
      const reference = item.reference?.reference;
      addEvidence(evidence, seenIds, {
        id: `${kind}:${evidenceIdPart(canonicalEntityId)}:${index + 1}`,
        kind,
        corpus,
        text: [item.label, item.details].filter(Boolean).join(" — "),
        reference,
        entityId: canonicalEntityId,
        lexicalId,
        provenance: {
          authority: "canonical-see-knowledge-runtime",
          sourceId: item.reference?.evidenceId || entity.see?.evidenceId,
        },
      });
    }
  }
}

export async function buildEmetAiWordEvidence(
  input: BuildWordEvidenceInput,
): Promise<EmetAiEvidenceBuildResult> {
  const question = clean(input.question);
  if (!question) {
    return identityFailure("invalid-question", "A question is required.");
  }

  const identity = verifiedWordIdentity(input.wordStudy);
  if (identity.status !== "verified") return identity;

  const {
    entity,
    corpus,
    lexicalId,
    canonicalEntityId,
    morphology,
  } = identity;
  const evidence: EmetAiEvidenceItem[] = [];
  const seenIds = new Set<string>();
  const lexical = lexicalEvidence(
    entity,
    corpus,
    lexicalId,
    canonicalEntityId,
  );

  if (lexical) addEvidence(evidence, seenIds, lexical);

  if (morphology) {
    addEvidence(evidence, seenIds, {
      id: `morphology:${canonicalEntityId}:${evidenceIdPart(
        entity.alignment!.lexicalResolution!.sourceOccurrenceId,
      )}`,
      kind: "morphology",
      corpus,
      text: `Occurrence morphology: ${morphology}.`,
      entityId: canonicalEntityId,
      lexicalId,
      provenance: {
        authority: entity.alignment!.lexicalResolution!.authority,
        sourceId: entity.alignment!.lexicalResolution!.sourceOccurrenceId,
      },
    });
  }

  const renderings = entity.entityEvidence?.renderings.mostCommon || [];
  if (renderings.length) {
    addEvidence(evidence, seenIds, {
      id: `rendering:${canonicalEntityId}`,
      kind: "rendering",
      corpus,
      text: `Verified translation renderings: ${renderings
        .slice(0, 12)
        .map((item) => `${item.text} (${item.count}, ${item.translation})`)
        .join("; ")}.`,
      entityId: canonicalEntityId,
      lexicalId,
      provenance: {
        authority: "canonical-word-study-rendering-runtime",
        sourceId: entity.see?.evidenceId,
      },
    });
  }

  if (entity.emet?.status === "complete" && clean(entity.emet.explanation)) {
    addEvidence(evidence, seenIds, {
      id: `explanation:${canonicalEntityId}`,
      kind: "lexical",
      corpus,
      text: entity.emet.explanation!,
      entityId: canonicalEntityId,
      lexicalId,
      provenance: {
        authority: "approved-emet-word-explanation-runtime",
        sourceId: entity.emet.sourceEntityId || canonicalEntityId,
        checksum: entity.emet.explanationChecksum,
      },
    });
  }

  const scripture = await Promise.all(
    uniqueReferences(entity).map((reference) => input.loadVerse(reference)),
  );

  for (const item of scripture) {
    if (!item) continue;
    addEvidence(evidence, seenIds, {
      id: `scripture:${evidenceIdPart(item.translation)}:${evidenceIdPart(
        item.reference,
      )}`,
      kind: "scripture",
      corpus: "translation",
      text: item.text,
      reference: item.reference,
      entityId: canonicalEntityId,
      lexicalId,
      provenance: {
        authority: "locked-scripture-runtime",
        sourceId: item.sourceId,
        checksum: item.checksum,
      },
    });
  }

  addKnowledgeEvidence(
    evidence,
    seenIds,
    entity,
    corpus,
    lexicalId,
    canonicalEntityId,
  );

  if (!evidence.length) {
    return identityFailure(
      "no-usable-evidence",
      "The verified lexical identity has no usable evidence for an answer.",
    );
  }

  const references = Array.from(
    new Set(
      evidence
        .map((item) => item.reference)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const packet: EmetAiEvidencePacket = {
    schemaVersion: EMET_AI_EVIDENCE_SCHEMA,
    question,
    reasoning: {
      mode: "simple",
      proposition: question.trim(),
      requiresScopeAnalysis: false,
      requiresTimeline: false,
      components: [],
      establishedPropositions: [],
    },
    scope: {
      type: "word",
      references,
      entityIds: [canonicalEntityId],
    },
    identity: {
      gate: "verified",
      canonicalEntityId,
      corpus,
      lexicalId,
      lemma:
        entity.entityEvidence?.lexical.lemma || entity.alignment?.lemma,
      morphology,
    },
    evidence,
    provenance: {
      evidenceVersion:
        entity.emet?.packetChecksum ||
        entity.emet?.explanationChecksum ||
        entity.see?.evidenceId ||
        "canonical-word-study-runtime@1",
      builtAt: input.builtAt || new Date().toISOString(),
    },
  };
  const validation = validateEmetAiEvidencePacket(packet);

  if (!validation.ok) {
    return {
      status: "insufficient-evidence",
      reason: "invalid-packet",
      limitations: validation.errors,
    };
  }

  return { status: "ready", packet: validation.value };
}
