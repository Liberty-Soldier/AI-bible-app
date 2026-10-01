import {
  findCanonicalHit,
  type CanonicalCompoundRoute,
} from "@/app/data/scripture/CanonicalVerseStore";
import { toEvidenceBook } from "@/app/data/evidence/evidenceBookMap";
import {
  loadWordStudyEntity,
  normalizeWordEntityId,
  type WordStudyRuntimeEntity,
  type WordStudyRuntimeReference,
} from "./WordStudyEntityStore";
import { loadLxxOccurrenceEntity } from "./LxxOccurrenceEntityStore";
import {
  loadFinalEmetRecord,
  type FinalEmetRuntimeRecord,
} from "./EmetFinalStore";
import type {
  BibleIQEntity,
  BibleIQEntityEvidence,
  BibleIQEmet,
  BibleIQKnowledgeExample,
  BibleIQMeaningInVerse,
  BibleIQOccurrence,
  BibleIQReference,
  BibleIQRequest,
  BibleIQResponse,
  BibleIQSeeEvidence,
  BibleIQSeeKnowledge,
  BibleIQSource,
  BibleIQSourceAlignment,
  BibleIQSourceComponentEvidence,
  BibleIQTranslation,
  BibleIQV2SourceRoute,
} from "./BibleIQTypes";

const NEW_TESTAMENT_BOOKS = new Set([
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "3 John",
  "1 John",
  "2 John",
  "Jude",
  "Revelation",
]);

function normalize(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function normalizedBookKey(book: string) {
  const key = String(book || "")
    .replace(/[^0-9A-Za-z]+/g, "")
    .toLowerCase();

  if (key === "songofsongs" || key === "songofsolomon") {
    return "song";
  }

  return key;
}

function booksEquivalent(left: string, right: string) {
  const leftEvidence = toEvidenceBook(left);
  const rightEvidence = toEvidenceBook(right);

  return (
    normalizedBookKey(leftEvidence) ===
      normalizedBookKey(rightEvidence) ||
    normalizedBookKey(left) === normalizedBookKey(right)
  );
}

function runtimeReferenceKey(book: string, chapter: number, verse: number) {
  return `${normalizedBookKey(book)}:${chapter}:${verse}`;
}

function validatedOccurrenceEmet(
  runtime: WordStudyRuntimeEntity,
  candidate: FinalEmetRuntimeRecord | null,
) {
  if (
    !candidate ||
    candidate.status !== "approved" ||
    candidate.independentReviewerApproved !== true ||
    candidate.entityId !== runtime.entityId ||
    candidate.corpus !== runtime.corpus ||
    !candidate.explanation?.trim() ||
    candidate.citations.length === 0
  ) {
    return null;
  }

  const verifiedReferenceKeys = new Set(
    runtime.occurrences.verifiedReferenceKeys ||
      runtime.occurrences.orderedReferences.map((reference) =>
        runtimeReferenceKey(
          reference.book,
          reference.chapter,
          reference.verse,
        ),
      ),
  );
  const citationsRemainValid = candidate.citations.every(
    (citation) =>
      Boolean(citation.book) &&
      Number.isFinite(citation.chapter) &&
      Number.isFinite(citation.verse) &&
      (verifiedReferenceKeys.has(
        runtimeReferenceKey(
          citation.book!,
          citation.chapter!,
          citation.verse!,
        ),
      ) ||
        runtime.occurrences.orderedReferences.some(
          (reference) =>
            booksEquivalent(reference.book, citation.book!) &&
            reference.chapter === citation.chapter &&
            reference.verse === citation.verse,
        )),
  );

  if (!citationsRemainValid) return null;

  const explanation = normalize(candidate.explanation);
  const currentMeaningTerms = [
    ...runtime.identity.shortDefinitions,
    ...runtime.identity.glosses,
  ]
    .flatMap((value) => String(value || "").split(/[;,/]/u))
    .map(normalize)
    .filter((value) => value.length >= 3);

  return currentMeaningTerms.some((meaning) => explanation.includes(meaning))
    ? candidate
    : null;
}

function lexicalEvidenceSources(runtime: WordStudyRuntimeEntity) {
  const witnesses = runtime.identity.witnesses
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (witnesses.length) return Array.from(new Set(witnesses));
  if (runtime.corpus === "lxx") return ["LXX lexical source record"];
  if (runtime.corpus === "hebrew") return ["Strong's / Hebrew lexicon record"];
  return ["Strong's / Greek lexicon record"];
}

function hasVerifiedLexicalIdentity(runtime: WordStudyRuntimeEntity) {
  const lexicalId = String(runtime.identity.lexicalId || "").trim();
  const lemma = String(
    runtime.identity.lemma || runtime.identity.normalizedLemma || "",
  ).trim();

  return Boolean(
    lexicalId &&
      lemma &&
      runtime.entityId === `word:${runtime.corpus}:${lexicalId}`,
  );
}

function lexicalBaselineExplanation(runtime: WordStudyRuntimeEntity) {
  if (!hasVerifiedLexicalIdentity(runtime)) return null;

  const meaning = [
    ...runtime.identity.shortDefinitions,
    ...runtime.identity.glosses,
  ]
    .map((value) =>
      String(value || "")
        .replace(/\s+/gu, " ")
        .replace(/\s+([,;:.!?])/gu, "$1")
        .trim(),
    )
    .find(Boolean);
  if (!meaning) return null;

  const label =
    String(runtime.identity.transliteration || "").trim() ||
    String(runtime.identity.lemma || runtime.identity.normalizedLemma || "").trim();
  const cleanMeaning = meaning.replace(/[.\s]+$/u, "");

  return `The lexical evidence describes ${label} as “${cleanMeaning}.”`;
}

function buildRuntimeEmet(
  runtime: WordStudyRuntimeEntity,
  finalEmet: FinalEmetRuntimeRecord | null | undefined,
  scope: BibleIQEmet["scope"] = "entity",
): BibleIQEmet {
  const identity = runtime.identity;
  const lemma =
    identity.lemma ||
    identity.normalizedLemma ||
    identity.lexicalId ||
    runtime.entityId;
  const evidenceSources = lexicalEvidenceSources(runtime);

  if (finalEmet?.status === "approved" && finalEmet.explanation?.trim()) {
    const citationDetails = finalEmet.citations
      .filter(
        (citation) =>
          Boolean(citation.book) &&
          Number.isFinite(citation.chapter) &&
          Number.isFinite(citation.verse),
      )
      .map((citation) => ({
        reference:
          citation.reference ||
          referenceLabel(
            citation.book!,
            citation.chapter!,
            citation.verse!,
          ),
        book: citation.book!,
        chapter: citation.chapter!,
        verse: citation.verse!,
        evidenceId: citation.evidenceId,
        kind: citation.kind,
      }));

    return {
      scope,
      sourceEntityId: runtime.entityId,
      sourceLemma: lemma,
      sourceLexicalId: identity.lexicalId,
      status: "complete",
      approval: "approved-p07",
      derivation: "reviewed-explanation",
      evidenceSources,
      explanation: finalEmet.explanation,
      citations: finalEmet.citations.map((citation) => citation.reference),
      citationDetails,
      explanationChecksum: finalEmet.explanationChecksum,
      packetChecksum: finalEmet.viewChecksum,
      packet: null,
    };
  }

  const baseline = lexicalBaselineExplanation(runtime);
  if (baseline) {
    return {
      scope,
      sourceEntityId: runtime.entityId,
      sourceLemma: lemma,
      sourceLexicalId: identity.lexicalId,
      status: "complete",
      approval: "evidence-derived-lexicon",
      derivation: "lexicon-baseline",
      evidenceSources,
      headline: "What the lexical evidence supports",
      explanation: baseline,
      citations: [],
      citationDetails: [],
      packet: null,
    };
  }

  return {
    scope,
    sourceEntityId: runtime.entityId,
    sourceLemma: lemma,
    sourceLexicalId: identity.lexicalId,
    status:
      finalEmet?.status === "no-explanation"
        ? "insufficient-evidence"
        : "missing",
    approval:
      finalEmet?.status === "no-explanation"
        ? "no-explanation-p07"
        : undefined,
    evidenceSources,
    explanation: undefined,
    citations: [],
    citationDetails: [],
    packet: null,
  };
}

function determinePreferredSource(input: BibleIQRequest): BibleIQSource {
  const rawBook = String(input.book || "").trim();
  const evidenceBook = toEvidenceBook(rawBook);

  if (
    NEW_TESTAMENT_BOOKS.has(rawBook) ||
    Array.from(NEW_TESTAMENT_BOOKS).some(
      (bookName) => toEvidenceBook(bookName) === evidenceBook,
    )
  ) {
    return "greek-nt";
  }

  const translation = normalize(input.translation);
  if (
    translation.includes("brenton") ||
    translation.includes("septuagint") ||
    translation.includes("lxx")
  ) {
    return "lxx";
  }

  return "hebrew";
}

function unresolved(
  input: BibleIQRequest,
  preferredSource: BibleIQSource,
): BibleIQResponse {
  return {
    resolved: false,
    resolutionType: "unresolved",
    preferredSource,
    query: input.displayWord,
    message:
      "SEE could not resolve this word from the aligned source context yet.",
  };
}

function sourceLabel(source: BibleIQSource) {
  if (source === "greek-nt") return "Greek NT";
  if (source === "lxx") return "Greek LXX";
  return "Hebrew";
}

function translationKey(value?: string): BibleIQTranslation {
  const normalized = normalize(value || "");

  if (normalized.includes("kjv") || normalized.includes("king james")) {
    return "kjv";
  }

  if (
    normalized.includes("brenton") ||
    normalized.includes("septuagint") ||
    normalized.includes("lxx")
  ) {
    return "brenton";
  }

  return "web";
}

function translationLabel(value: string) {
  const key = translationKey(value);
  if (key === "kjv") return "KJV";
  if (key === "brenton") return "Brenton LXX";
  return "WEB";
}

function routeTranslationForSource(
  source: BibleIQSource,
  selectedTranslation?: string,
): BibleIQTranslation {
  if (source === "lxx") return "brenton";

  const selected = translationKey(selectedTranslation);
  return selected === "kjv" ? "kjv" : "web";
}

function referenceLabel(book: string, chapter: number, verse: number) {
  return `${book} ${chapter}:${verse}`;
}

function renderingsForTranslation(
  reference: WordStudyRuntimeReference,
  routeTranslation: BibleIQTranslation,
) {
  const preferred = reference.renderings[routeTranslation];
  if (preferred?.length) return preferred;

  return Object.values(reference.renderings).flat();
}

function toPublicReference(
  reference: WordStudyRuntimeReference,
  source: BibleIQSource,
  selectedTranslation?: string,
): BibleIQReference {
  const routeTranslation = routeTranslationForSource(
    source,
    selectedTranslation,
  );

  return {
    reference: referenceLabel(
      reference.book,
      reference.chapter,
      reference.verse,
    ),
    book: reference.book,
    chapter: reference.chapter,
    verse: reference.verse,
    source,
    routeTranslation,
    renderings: renderingsForTranslation(reference, routeTranslation),
    occurrenceCount: reference.occurrenceCount,
    evidenceId: reference.evidenceId,
  };
}

function chronologyReference(
  value:
    | {
        book: string;
        chapter: number;
        verse: number;
      }
    | undefined,
  source: BibleIQSource,
  selectedTranslation?: string,
): BibleIQReference | undefined {
  if (!value) return undefined;

  return {
    reference: referenceLabel(value.book, value.chapter, value.verse),
    book: value.book,
    chapter: value.chapter,
    verse: value.verse,
    source,
    routeTranslation: routeTranslationForSource(
      source,
      selectedTranslation,
    ),
  };
}

function uniqueReferences(values: BibleIQReference[]) {
  const result: BibleIQReference[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const key = `${value.source}|${value.book}|${value.chapter}|${value.verse}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

function buildKeyReferences(
  runtime: WordStudyRuntimeEntity,
  selectedTranslation?: string,
  finalEmet?: FinalEmetRuntimeRecord | null,
) {
  const source = runtime.corpus;
  const routeTranslation = routeTranslationForSource(
    source,
    selectedTranslation,
  );

  const citationReferences = (finalEmet?.status === "approved"
    ? finalEmet.citations
    : [])
    .filter(
      (citation) =>
        Boolean(citation.book) &&
        Number.isFinite(citation.chapter) &&
        Number.isFinite(citation.verse),
    )
    .map((citation): BibleIQReference => ({
      reference: referenceLabel(
        citation.book!,
        citation.chapter!,
        citation.verse!,
      ),
      book: citation.book!,
      chapter: citation.chapter!,
      verse: citation.verse!,
      source,
      routeTranslation,
      evidenceId: citation.evidenceId,
    }),
  );

  const representative = runtime.occurrences.representativeReferences.map(
    (reference) =>
      toPublicReference(reference, source, selectedTranslation),
  );

  const chronology = [
    chronologyReference(
      runtime.occurrences.firstOccurrence,
      source,
      selectedTranslation,
    ),
    chronologyReference(
      runtime.occurrences.lastOccurrence,
      source,
      selectedTranslation,
    ),
  ].filter((value): value is BibleIQReference => Boolean(value));

  return uniqueReferences([
    ...citationReferences,
    ...chronology,
    ...representative,
  ]);
}

function buildMeaningInVerse({
  input,
  runtime,
  sourceWord,
  morph,
}: {
  input: BibleIQRequest;
  runtime: WordStudyRuntimeEntity;
  sourceWord?: string;
  morph?: string;
}): BibleIQMeaningInVerse {
  const identity = runtime.identity;
  const source = sourceLabel(runtime.corpus);
  const reference = referenceLabel(
    input.book,
    input.chapter,
    input.verse,
  );
  const selectedEnglish = input.selectedText || input.displayWord;
  const lemma = identity.lemma || identity.normalizedLemma;
  const lexicalId = identity.lexicalId;
  const translation = translationLabel(input.translation);

  const parts = [
    `In ${reference}, the selected ${translation} word “${selectedEnglish}” is aligned to the ${source} source form${
      sourceWord ? ` ${sourceWord}` : ""
    }.`,
  ];

  if (lemma && lemma !== sourceWord) {
    parts.push(`It is a grammatical form of the lemma ${lemma}${lexicalId ? ` (${lexicalId})` : ""}.`);
  } else if (lexicalId) {
    parts.push(`SEE identifies the source-word entity as ${lexicalId}.`);
  }

  return {
    reference,
    selectedEnglish,
    selectedTranslation: translation,
    verseText: input.verseText,
    renderingText: selectedEnglish,
    sourceWord,
    lemma,
    lexicalId,
    morph,
    statement: parts.join(" "),
  };
}

function buildSeeKnowledge(
  runtime: WordStudyRuntimeEntity,
  selectedTranslation?: string,
): BibleIQSeeKnowledge {
  const source = runtime.corpus;

  function mapExample(
    example: WordStudyRuntimeEntity["seeKnowledge"]["relationships"][number],
  ): BibleIQKnowledgeExample {
    return {
      reference: example.reference
        ? {
            reference: referenceLabel(
              example.reference.book,
              example.reference.chapter,
              example.reference.verse,
            ),
            book: example.reference.book,
            chapter: example.reference.chapter,
            verse: example.reference.verse,
            source,
            routeTranslation: routeTranslationForSource(
              source,
              selectedTranslation,
            ),
          }
        : undefined,
      label: example.label,
      details: example.details,
      confidence: example.confidence,
    };
  }

  return {
    available: runtime.seeKnowledge.available,
    relationshipCount: runtime.seeKnowledge.relationshipCount,
    eventCount: runtime.seeKnowledge.eventCount,
    themeCount: runtime.seeKnowledge.themeCount,
    totalReferenceCount: runtime.seeKnowledge.totalReferenceCount,
    relationships: runtime.seeKnowledge.relationships.map(mapExample),
    events: runtime.seeKnowledge.events.map(mapExample),
    themes: runtime.seeKnowledge.themes.map(mapExample),
  };
}

function buildEntityEvidence(
  runtime: WordStudyRuntimeEntity,
  selectedTranslation?: string,
): BibleIQEntityEvidence {
  return {
    lexical: {
      ...runtime.identity,
    },
    occurrenceSummary: {
      corpusOccurrenceCount:
        runtime.occurrences.corpusOccurrenceCount,
      totalEntityOccurrences:
        runtime.occurrences.totalEntityOccurrences,
      uniqueVerseCount: runtime.occurrences.uniqueVerseCount,
      alignedSourceTokenCount:
        runtime.occurrences.alignedSourceTokenCount,
      alignedVerseCount: runtime.occurrences.alignedVerseCount,
      translationAlignmentCount:
        runtime.occurrences.translationAlignmentCount,
    },
    renderings: {
      available: runtime.renderings.available,
      totalAlignedRenderings:
        runtime.renderings.totalAlignedRenderings,
      translations: runtime.renderings.byTranslation.map(
        (translation) => ({
          translation: translation.translation,
          count:
            runtime.renderings.translationCounts.find(
              (item) =>
                item.translation === translation.translation,
            )?.count || 0,
          forms: translation.forms.map((form) => ({
            ...form,
            translation: translation.translation,
          })),
        }),
      ),
      mostCommon: runtime.renderings.mostCommon,
    },
    chronology: {
      firstOccurrence: chronologyReference(
        runtime.occurrences.firstOccurrence,
        runtime.corpus,
        selectedTranslation,
      ),
      lastOccurrence: chronologyReference(
        runtime.occurrences.lastOccurrence,
        runtime.corpus,
        selectedTranslation,
      ),
    },
    representativeReferences:
      runtime.occurrences.representativeReferences.map(
        (reference) =>
          toPublicReference(
            reference,
            runtime.corpus,
            selectedTranslation,
          ),
      ),
    health: {
      ...runtime.health,
    },
  };
}

function buildOccurrences({
  input,
  runtime,
  sourceWord,
}: {
  input: BibleIQRequest;
  runtime: WordStudyRuntimeEntity;
  sourceWord?: string;
}): BibleIQOccurrence[] {
  return runtime.occurrences.orderedReferences.map((reference) => {
    const publicReference = toPublicReference(
      reference,
      runtime.corpus,
      input.translation,
    );
    const isSelectedOccurrence =
      booksEquivalent(reference.book, input.book) &&
      reference.chapter === input.chapter &&
      reference.verse === input.verse;

    return {
      ...publicReference,
      englishText: isSelectedOccurrence
        ? input.verseText || undefined
        : undefined,
      sourceWord: isSelectedOccurrence ? sourceWord : undefined,
    };
  });
}

function buildRuntimeEntity({
  input,
  runtime,
  sourceWord,
  morph,
  finalEmet,
  routeMode,
  sourceRoutes,
  sourceSegment,
  sourceComponentEvidence,
}: {
  input: BibleIQRequest;
  runtime: WordStudyRuntimeEntity;
  sourceWord?: string;
  morph?: string;
  finalEmet?: FinalEmetRuntimeRecord | null;
  routeMode?: BibleIQSourceAlignment["routeMode"];
  sourceRoutes?: BibleIQV2SourceRoute[];
  sourceSegment?: BibleIQSourceAlignment["sourceSegment"];
  sourceComponentEvidence?: BibleIQSourceComponentEvidence[];
}): BibleIQEntity {
  const identity = runtime.identity;
  const lemma =
    identity.lemma ||
    identity.normalizedLemma ||
    sourceWord ||
    identity.lexicalId ||
    input.displayWord;
  const firstOccurrence = chronologyReference(
    runtime.occurrences.firstOccurrence,
    runtime.corpus,
    input.translation,
  );
  const lastOccurrence = chronologyReference(
    runtime.occurrences.lastOccurrence,
    runtime.corpus,
    input.translation,
  );
  const keyReferences = buildKeyReferences(
    runtime,
    input.translation,
    finalEmet,
  );
  const seeKnowledge = buildSeeKnowledge(
    runtime,
    input.translation,
  );
  const occurrences = buildOccurrences({
    input,
    runtime,
    sourceWord,
  });
  const selectedReference = referenceLabel(
    input.book,
    input.chapter,
    input.verse,
  );

  const see: BibleIQSeeEvidence = {
    evidenceId: `p03:${runtime.entityId}`,
    countId: runtime.entityId.replace(/^word:/, ""),
    occurrenceCount:
      runtime.occurrences.corpusOccurrenceCount ||
      runtime.occurrences.totalEntityOccurrences,
    firstOccurrence: firstOccurrence?.reference,
    lastOccurrence: lastOccurrence?.reference,
    relationshipCount: seeKnowledge.relationshipCount,
    eventCount: seeKnowledge.eventCount,
    themeCount: seeKnowledge.themeCount,
  };

  const alignment: BibleIQSourceAlignment = {
    selectedEnglish: input.selectedText || input.displayWord,
    sourceWord,
    source: runtime.corpus,
    strong: runtime.corpus === "lxx" ? undefined : identity.strong,
    lexicalId: identity.lexicalId,
    lemma,
    morph,
    entityId: runtime.entityId,
    seeEvidenceId: see.evidenceId,
    routeMode,
    sourceRoutes,
    sourceSegment,
    sourceComponentEvidence,
    noForcedSingleSourceIdentity: false,
    lexicalResolution:
      input.sourceOccurrenceId &&
      input.sourceLexicalId &&
      input.sourceCorpus &&
      input.sourceResolutionAuthority &&
      input.sourceResolutionMethod
        ? {
            status: "resolved",
            sourceOccurrenceId: input.sourceOccurrenceId,
            authority: input.sourceResolutionAuthority,
            method: input.sourceResolutionMethod,
            corpus: input.sourceCorpus,
            lexicalId: input.sourceLexicalId,
            entityId: runtime.entityId,
          }
        : undefined,
  };

  const approvedExplanation =
    finalEmet?.status === "approved"
      ? finalEmet
      : null;

  const emet = buildRuntimeEmet(runtime, finalEmet, "entity");

  return {
    id: runtime.entityId,
    type: "word",
    title: input.selectedText || input.displayWord,
    subtitle: `${lemma} • ${sourceLabel(runtime.corpus)}`,
    emet,
    meaningInVerse: buildMeaningInVerse({
      input,
      runtime,
      sourceWord,
      morph,
    }),
    see,
    seeKnowledge,
    alignment,
    entityEvidence: buildEntityEvidence(
      runtime,
      input.translation,
    ),
    keyReferences,
    simple: {
      meaning:
        identity.shortDefinitions[0] ||
        identity.glosses[0] ||
        lemma,
      inThisVerse: `The selected word is aligned to ${
        sourceWord || lemma
      } in ${selectedReference}.`,
      whyItMatters:
        "This study preserves the aligned source occurrence and the supporting SEE evidence.",
      summary:
        emet.explanation || approvedExplanation?.explanation ||
        `SEE preserves the source identity, usage, and references for ${lemma}.`,
    },
    contextConnections: {
      people: [],
      places: [],
      events: seeKnowledge.events.map((item) => item.label),
      concepts: seeKnowledge.relationships.map(
        (item) => item.label,
      ),
      themes: seeKnowledge.themes.map((item) => item.label),
      laterReferences: [],
    },
    evidence: {
      originalLanguage: {
        source: runtime.corpus,
        word: sourceWord || lemma,
        transliteration: identity.transliteration,
        pronunciation: identity.pronunciation,
        strong:
          runtime.corpus === "lxx"
            ? undefined
            : identity.strong,
        lemma,
        lemmaId: identity.lexicalId,
        partOfSpeech: identity.partsOfSpeech.join(", ") || undefined,
        forms: identity.sourceForms.map(
          (form) => form.surface,
        ),
        morph,
        seeEvidenceId: see.evidenceId,
      },
      definitions: {
        short:
          identity.shortDefinitions[0] ||
          identity.glosses[0],
        usage: identity.glosses.join("; ") || undefined,
        sources: identity.witnesses,
      },
      firstMention: firstOccurrence?.reference,
      keyReferences: keyReferences.map(
        (reference) => reference.reference,
      ),
      related: {
        people: [],
        places: [],
        concepts: seeKnowledge.relationships.map(
          (item) => item.label,
        ),
        events: seeKnowledge.events.map(
          (item) => item.label,
        ),
      },
      occurrenceCount:
        runtime.occurrences.corpusOccurrenceCount ||
        runtime.occurrences.totalEntityOccurrences,
      occurrences,
    },
  };
}

function readerDisplayTokens(value?: string) {
  return String(value || "")
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter((token) => token && /[\p{L}\p{N}]/u.test(token));
}

function cleanRenderingSpanBoundary(value: string) {
  return String(value || "")
    .replace(/^[\s“”‘’'"«»]+|[\s“”‘’'"«».,;:!?]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function renderingTextForRoute(
  input: BibleIQRequest,
  route: NonNullable<NonNullable<Awaited<ReturnType<typeof findCanonicalHit>>>["v2Route"]>,
) {
  const start = route.sourceSegment?.renderingStartTokenIndex;
  const end = route.sourceSegment?.renderingEndTokenIndex;
  const tokens = readerDisplayTokens(input.verseText);

  if (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    Number(start) >= 0 &&
    Number(end) >= Number(start) &&
    Number(end) < tokens.length
  ) {
    const rendered = cleanRenderingSpanBoundary(
      tokens.slice(Number(start), Number(end) + 1).join(" "),
    );
    if (rendered) return rendered;
  }

  return input.selectedText || input.displayWord;
}

function componentRenderingsForTranslation(
  runtime: WordStudyRuntimeEntity,
  translation: string,
) {
  const wanted = String(translation || "").trim().toLowerCase();
  const selected = runtime.renderings.byTranslation.find(
    (entry) => String(entry.translation || "").trim().toLowerCase() === wanted,
  );

  if (!selected) return [];

  return selected.forms.slice(0, 4).map((form) => ({
    text: form.text,
    count: form.count,
    translation: selected.translation,
  }));
}

async function buildV2SourceComponentEvidence({
  routes,
  input,
  origin,
}: {
  routes: BibleIQV2SourceRoute[];
  input: BibleIQRequest;
  origin: string;
}): Promise<BibleIQSourceComponentEvidence[]> {
  const runtimeByEntityId = new Map<string, WordStudyRuntimeEntity | null>();
  const lexicalEntityIds = Array.from(
    new Set(
      routes
        .filter((route) => route.kind === "lexical")
        .map((route) => String(route.entityId || ""))
        .filter((entityId) => /^word:(?:hebrew|greek-nt|lxx):[^:]+$/.test(entityId)),
    ),
  );

  await Promise.all(
    lexicalEntityIds.map(async (entityId) => {
      runtimeByEntityId.set(
        entityId,
        await loadWordStudyEntity(origin, entityId),
      );
    }),
  );

  return routes.map((route) => {
    const runtime = route.entityId
      ? runtimeByEntityId.get(route.entityId) || null
      : null;
    const identity = runtime?.identity;
    const firstOccurrence = runtime
      ? chronologyReference(
          runtime.occurrences.firstOccurrence,
          runtime.corpus,
          input.translation,
        )
      : undefined;

    return {
      ...route,
      strong: route.strong || identity?.strong,
      lexicalId: route.lexicalId || identity?.lexicalId,
      lemma: route.lemma || identity?.lemma || identity?.normalizedLemma,
      transliteration: identity?.transliteration,
      pronunciation: identity?.pronunciation,
      shortDefinition:
        identity?.shortDefinitions?.[0] || identity?.glosses?.[0],
      partsOfSpeech: identity?.partsOfSpeech,
      occurrenceCount:
        runtime?.occurrences.corpusOccurrenceCount ||
        runtime?.occurrences.totalEntityOccurrences,
      uniqueVerseCount: runtime?.occurrences.uniqueVerseCount,
      firstOccurrence,
      commonRenderings: runtime
        ? componentRenderingsForTranslation(runtime, input.translation)
        : [],
    };
  });
}

async function buildV2SpanAlignmentEntity({
  input,
  preferredSource,
  hit,
  origin,
}: {
  input: BibleIQRequest;
  preferredSource: BibleIQSource;
  hit: NonNullable<Awaited<ReturnType<typeof findCanonicalHit>>>;
  origin: string;
}): Promise<BibleIQEntity> {
  const route = hit.v2Route!;
  const reference = referenceLabel(
    input.book,
    input.chapter,
    input.verse,
  );
  const routes: BibleIQV2SourceRoute[] = route.sourceRoutes || [];
  const sourceComponentEvidence = await buildV2SourceComponentEvidence({
    routes,
    input,
    origin,
  });
  const lexical = routes.filter((item) => item.kind === "lexical");
  const grammar = routes.filter((item) => item.kind === "grammar");
  const sourceWords = routes
    .map((item) => item.sourceWord)
    .filter((value): value is string => Boolean(value));
  const sourceWord = sourceWords.join(" + ") || hit.sourceWord;
  const renderingText = renderingTextForRoute(input, route);
  const selectedEnglish = input.selectedText || input.displayWord;
  const routeLabel =
    route.mode === "segment-context"
      ? "Source Segment Context"
      : route.mode === "exact-multi"
        ? "Multiple Exact Source Components"
        : grammar.length
          ? "Exact Grammatical Source Component"
          : "Exact Source Alignment";

  const lexicalOwnerIds = Array.from(
    new Set(
      lexical
        .map((item) => String(item.entityId || ""))
        .filter((entityId) => /^word:hebrew:H\d+$/.test(entityId)),
    ),
  );
  const lexicalOwnerId =
    lexicalOwnerIds.length === 1 ? lexicalOwnerIds[0] : undefined;
  const lexicalRoute = lexicalOwnerId
    ? lexical.find((item) => item.entityId === lexicalOwnerId)
    : undefined;
  const lexicalRuntime = lexicalOwnerId
    ? await loadWordStudyEntity(origin, lexicalOwnerId)
    : null;
  const lexicalEmet = lexicalRuntime
    ? await loadFinalEmetRecord(origin, lexicalRuntime.entityId)
    : null;
  const lexicalIdentity = lexicalRuntime?.identity;
  const lexicalLemma =
    lexicalRoute?.lemma ||
    lexicalIdentity?.lemma ||
    lexicalIdentity?.normalizedLemma;

  const statement =
    route.mode === "segment-context"
      ? `In ${reference}, “${selectedEnglish}” is part of the ${translationLabel(input.translation)} rendering “${renderingText}” for this Hebrew source segment. The relationship is phrase-to-segment; no one-English-word-to-one-Hebrew-word identity is being claimed.`
      : route.mode === "exact-multi"
        ? `In ${reference}, “${selectedEnglish}” is supported by multiple exact Hebrew source components. SEE preserves the full source relationship instead of selecting only one component.`
        : grammar.length
          ? `In ${reference}, “${selectedEnglish}” renders an exact grammatical component of the Hebrew source occurrence. It is not being relabeled as a lexical Strong entry.`
          : "The selected word is aligned to " +
            (sourceWord || "the exact Hebrew source occurrence") +
            ".";

  const alignment: BibleIQSourceAlignment = {
    selectedEnglish,
    sourceWord,
    source: preferredSource,
    strong:
      lexical.length === 1 && routes.length === 1
        ? lexical[0].strong
        : undefined,
    lexicalId:
      lexical.length === 1 && routes.length === 1
        ? lexical[0].lexicalId
        : undefined,
    lemma: routes.length === 1 ? routes[0].lemma : undefined,
    morph: routes.length === 1 ? routes[0].morph : undefined,
    entityId: hit.entityId,
    routeMode: route.mode,
    sourceRoutes: routes,
    sourceSegment: route.sourceSegment,
    sourceComponentEvidence,
    noForcedSingleSourceIdentity:
      route.mode !== "exact-single" || grammar.length > 0,
  };

  const emet = lexicalRuntime
    ? buildRuntimeEmet(lexicalRuntime, lexicalEmet, "lexical-source")
    : {
        status: "insufficient-evidence" as const,
        packet: null,
        explanation: undefined,
        citations: [reference],
      };

  const entityEvidence = lexicalRuntime
    ? buildEntityEvidence(lexicalRuntime, input.translation)
    : undefined;
  const seeKnowledge = lexicalRuntime
    ? buildSeeKnowledge(lexicalRuntime, input.translation)
    : undefined;
  const keyReferences = lexicalRuntime
    ? buildKeyReferences(lexicalRuntime, input.translation, lexicalEmet)
    : [];
  const firstOccurrence = lexicalRuntime
    ? chronologyReference(
        lexicalRuntime.occurrences.firstOccurrence,
        lexicalRuntime.corpus,
        input.translation,
      )
    : undefined;
  const lexicalOccurrences = lexicalRuntime
    ? buildOccurrences({
        input,
        runtime: lexicalRuntime,
        sourceWord: lexicalRoute?.sourceWord,
      })
    : [];

  return {
    id: hit.entityId,
    type: "word",
    title: selectedEnglish,
    subtitle: routeLabel + " • Hebrew",
    alignment,
    emet,
    entityEvidence,
    seeKnowledge,
    keyReferences,
    meaningInVerse: {
      reference,
      selectedEnglish,
      selectedTranslation: translationLabel(input.translation),
      verseText: input.verseText,
      renderingText,
      sourceWord,
      lemma: lexicalLemma,
      lexicalId: lexicalIdentity?.lexicalId,
      morph: lexicalRoute?.morph,
      statement,
    },
    simple: {
      meaning:
        lexicalIdentity?.shortDefinitions?.[0] ||
        lexicalIdentity?.glosses?.[0] ||
        lexicalLemma ||
        selectedEnglish,
      inThisVerse: statement,
      whyItMatters:
        "SEE preserves the full source segment behind the English rendering while keeping lexical and grammatical evidence distinct.",
      summary:
        lexicalEmet?.status === "approved" && lexicalEmet.explanation
          ? lexicalEmet.explanation
          : "This is an evidence-grounded source-segment alignment. No unsupported one-word source identity is asserted.",
    },
    evidence: {
      originalLanguage: lexicalRuntime
        ? {
            source: preferredSource,
            word:
              lexicalRoute?.sourceWord ||
              lexicalIdentity?.lemma ||
              lexicalIdentity?.normalizedLemma ||
              sourceWord ||
              selectedEnglish,
            transliteration: lexicalIdentity?.transliteration,
            pronunciation: lexicalIdentity?.pronunciation,
            strong: lexicalIdentity?.strong,
            lemma: lexicalLemma,
            lemmaId: lexicalIdentity?.lexicalId,
            partOfSpeech:
              lexicalIdentity?.partsOfSpeech?.join(", ") || undefined,
            forms: lexicalIdentity?.sourceForms?.map(
              (form) => form.surface,
            ),
            morph: lexicalRoute?.morph,
            seeEvidenceId: `p03:${lexicalRuntime.entityId}`,
          }
        : {
            source: preferredSource,
            word: sourceWord || selectedEnglish,
          },
      definitions: lexicalRuntime
        ? {
            short:
              lexicalIdentity?.shortDefinitions?.[0] ||
              lexicalIdentity?.glosses?.[0],
            usage: lexicalIdentity?.glosses?.join("; ") || undefined,
            sources: lexicalIdentity?.witnesses,
          }
        : undefined,
      firstMention: firstOccurrence?.reference,
      keyReferences: keyReferences.length
        ? keyReferences.map((item) => item.reference)
        : [reference],
      related: {
        people: [],
        places: [],
        concepts: seeKnowledge?.relationships.map((item) => item.label) || [routeLabel],
        events: seeKnowledge?.events.map((item) => item.label) || [],
      },
      occurrenceCount:
        lexicalRuntime?.occurrences.corpusOccurrenceCount ||
        lexicalRuntime?.occurrences.totalEntityOccurrences,
      occurrences: lexicalOccurrences.length
        ? lexicalOccurrences
        : [
            {
              reference,
              book: input.book,
              chapter: input.chapter,
              verse: input.verse,
              englishText: input.verseText || undefined,
              sourceWord,
              source: preferredSource,
              routeTranslation: routeTranslationForSource(
                preferredSource,
                input.translation,
              ),
            },
          ],
    },
  };
}

function buildCanonicalAlignmentEntity({
  input,
  preferredSource,
  entityId,
  sourceWord,
  strong,
  lemma,
  morph,
  compoundRoute,
}: {
  input: BibleIQRequest;
  preferredSource: BibleIQSource;
  entityId: string;
  sourceWord?: string;
  strong?: string;
  lemma?: string;
  morph?: string;
  compoundRoute?: CanonicalCompoundRoute;
}): BibleIQEntity {
  const title = lemma || sourceWord || input.displayWord.trim();
  const reference = referenceLabel(
    input.book,
    input.chapter,
    input.verse,
  );
  const label = sourceLabel(preferredSource);
  const routeTranslation = routeTranslationForSource(
    preferredSource,
    input.translation,
  );

  const alignment: BibleIQSourceAlignment = {
    selectedEnglish: input.displayWord,
    sourceWord,
    source: preferredSource,
    strong: preferredSource === "lxx" ? undefined : strong,
    lexicalId:
      compoundRoute?.lexicalId ||
      entityId.split(":").at(-1) ||
      undefined,
    lemma,
    morph,
    entityId,
    isCompoundRoute: Boolean(compoundRoute),
    compoundRouteKind: compoundRoute?.routeKind,
    componentLexicalIds:
      compoundRoute?.componentLexicalIds,
  };

  return {
    id: entityId,
    type: "word",
    title: input.displayWord,
    subtitle: compoundRoute
      ? `${title} • ${label} Compound Source Alignment`
      : `${title} • ${label} Source Alignment`,
    alignment,
    emet: {
      status: compoundRoute
        ? "insufficient-evidence"
        : "missing",
      packet: null,
      explanation: undefined,
      citations: [reference],
    },
    meaningInVerse: {
      reference,
      selectedEnglish: input.displayWord,
      selectedTranslation: translationLabel(input.translation),
      verseText: input.verseText,
      sourceWord,
      lemma,
      lexicalId: alignment.lexicalId,
      morph,
      statement: compoundRoute
        ? `The selected word is aligned to the compound Greek source form ${
            sourceWord || title
          } (${compoundRoute.componentLexicalIds.join(
            " + ",
          )}). The compound route is preserved without forcing it onto only one component.`
        : `The selected word is aligned to ${
            sourceWord || title
          } in the ${label} source text. The full cached study is temporarily unavailable.`,
    },
    simple: {
      meaning: title,
      inThisVerse: sourceWord
        ? `The selected English word is aligned to ${sourceWord}.`
        : `This word appears in ${reference}.`,
      whyItMatters: compoundRoute
        ? "SEE preserves both components of this compound Greek source form instead of assigning the English word to an unsupported single component."
        : "SEE preserved the source alignment, but the full cached study could not be loaded.",
      summary: compoundRoute
        ? "This is a transparent compound-source alignment. No synthetic cached EMET explanation was created, and no live AI was invoked."
        : "The source alignment remains available. No live AI was invoked.",
    },
    evidence: {
      originalLanguage: {
        source: preferredSource,
        word: sourceWord || title,
        strong: preferredSource === "lxx" ? undefined : strong,
        lemma,
        lemmaId: alignment.lexicalId,
        morph,
      },
      keyReferences: [reference],
      related: {
        people: [],
        places: [],
        concepts: compoundRoute
          ? [
              "Compound Greek source alignment",
              ...compoundRoute.componentLexicalIds,
            ]
          : ["Canonical source alignment available"],
        events: [],
      },
      occurrences: [
        {
          reference,
          book: input.book,
          chapter: input.chapter,
          verse: input.verse,
          englishText: input.verseText || undefined,
          sourceWord,
          source: preferredSource,
          routeTranslation,
        },
      ],
    },
  };
}

function buildPlaceholderEntity(
  input: BibleIQRequest,
  preferredSource: BibleIQSource,
): BibleIQEntity {
  const title = input.displayWord.trim();
  const reference = referenceLabel(
    input.book,
    input.chapter,
    input.verse,
  );

  return {
    id: `${preferredSource}:${input.book}:${input.chapter}:${input.verse}:${normalize(
      title,
    )}`,
    type: "word",
    title,
    subtitle: "SEE Evidence",
    emet: {
      status: "insufficient-evidence",
      packet: null,
      explanation: undefined,
      citations: [reference],
    },
    simple: {
      meaning: undefined,
      inThisVerse: input.verseText
        ? `This word appears in ${reference}.`
        : "This word appears in the selected verse.",
      whyItMatters:
        "SEE has not connected this display token to a source entity.",
      summary:
        "This word has not been connected to source evidence yet.",
    },
    evidence: {
      originalLanguage: input.originalWord
        ? {
            source: preferredSource,
            word: input.originalWord,
          }
        : undefined,
      keyReferences: [reference],
      related: {
        people: [],
        places: [],
        concepts: [],
        events: [],
      },
      occurrences: [
        {
          reference,
          book: input.book,
          chapter: input.chapter,
          verse: input.verse,
          englishText: input.verseText || undefined,
          sourceWord: input.originalWord,
          source: preferredSource,
          routeTranslation: routeTranslationForSource(
            preferredSource,
            input.translation,
          ),
        },
      ],
    },
  };
}

export async function resolveBibleIQ(
  input: BibleIQRequest,
  origin: string,
  requestHeaders?: Record<string, string>,
): Promise<BibleIQResponse> {
  const preferredSource = determinePreferredSource(input);
  const requestedEntityId = normalizeWordEntityId(input.entityId || "");

  if (requestedEntityId) {
    const hasOccurrenceContract = Boolean(
      input.sourceOccurrenceId ||
        input.sourceLexicalId ||
        input.sourceCorpus ||
        input.sourceResolutionAuthority ||
        input.sourceResolutionMethod,
    );
    const expectedOccurrenceEntityId =
      input.sourceCorpus && input.sourceLexicalId
        ? normalizeWordEntityId(
            `word:${input.sourceCorpus}:${input.sourceLexicalId}`,
          )
        : null;

    if (
      hasOccurrenceContract &&
      (!input.sourceOccurrenceId ||
        !input.sourceLexicalId ||
        !input.sourceCorpus ||
        !input.sourceResolutionAuthority ||
        !input.sourceResolutionMethod ||
        expectedOccurrenceEntityId !== requestedEntityId)
    ) {
      return {
        resolved: false,
        resolutionType: "unresolved",
        preferredSource,
        query: input.displayWord || requestedEntityId,
        message:
          "This source occurrence does not have one verified lexical identity.",
      };
    }

    let runtime = await loadWordStudyEntity(
      origin,
      requestedEntityId,
      requestHeaders,
    );
    let occurrenceEvidenceOverride = false;

    if (
      hasOccurrenceContract &&
      input.sourceCorpus === "lxx"
    ) {
      const occurrenceRuntime = await loadLxxOccurrenceEntity(
        origin,
        requestedEntityId,
        requestHeaders,
      );
      if (occurrenceRuntime) {
        runtime = occurrenceRuntime;
        occurrenceEvidenceOverride = true;
      }
    }

    if (!runtime) {
      return {
        resolved: false,
        resolutionType: "unresolved",
        preferredSource,
        query: input.displayWord || requestedEntityId,
        message: "This lexical source entity is not available in the current runtime.",
      };
    }

    if (
      hasOccurrenceContract &&
      (runtime.corpus !== input.sourceCorpus ||
        runtime.identity.lexicalId !== input.sourceLexicalId ||
        runtime.entityId !== requestedEntityId)
    ) {
      return {
        resolved: false,
        resolutionType: "unresolved",
        preferredSource,
        query: input.displayWord || requestedEntityId,
        message:
          "The source occurrence identity disagrees with the canonical lexical entity.",
      };
    }

    const finalEmetCandidate = await loadFinalEmetRecord(
      origin,
      runtime.entityId,
      requestHeaders,
    );
    const finalEmet = occurrenceEvidenceOverride
      ? validatedOccurrenceEmet(runtime, finalEmetCandidate)
      : finalEmetCandidate;
    const directWord =
      input.displayWord?.trim() ||
      runtime.identity.lemma ||
      runtime.identity.normalizedLemma ||
      runtime.identity.lexicalId ||
      requestedEntityId;
    const directInput: BibleIQRequest = {
      ...input,
      displayWord: directWord,
      selectedText: directWord,
    };

    return {
      resolved: true,
      resolutionType: "entity",
      preferredSource: runtime.corpus,
      query: directWord,
      entity: buildRuntimeEntity({
        input: directInput,
        runtime,
        sourceWord:
          runtime.identity.lemma ||
          runtime.identity.normalizedLemma ||
          runtime.identity.lexicalId,
        finalEmet,
      }),
    };
  }

  if (!input.displayWord?.trim()) {
    return unresolved(input, preferredSource);
  }

  const hit = await findCanonicalHit({
    origin,
    translation: input.translation,
    book: input.book,
    chapter: input.chapter,
    verse: input.verse,
    displayTokenIndex: input.displayTokenIndex,
    readerRecordId: input.readerRecordId,
  });

  if (hit) {
    const source = hit.sourceToken?.source || preferredSource;
    const v2NeedsContextEntity = Boolean(
      hit.v2Route &&
        !(
          hit.v2Route.mode === "exact-single" &&
          hit.v2Route.sourceRoutes.length === 1 &&
          hit.v2Route.sourceRoutes[0]?.kind === "lexical" &&
          /^word:hebrew:H\d+$/.test(hit.entityId)
        ),
    );

    if (v2NeedsContextEntity) {
      return {
        resolved: true,
        resolutionType: "verse-context",
        preferredSource: source,
        query: input.displayWord,
        entity: await buildV2SpanAlignmentEntity({
          input,
          preferredSource: source,
          hit,
          origin,
        }),
      };
    }

    const canonicalEntityId =
      normalizeWordEntityId(hit.entityId) || hit.entityId;
    const runtime = hit.compoundRoute
      ? null
      : await loadWordStudyEntity(
          origin,
          canonicalEntityId,
        );
    const finalEmet = runtime
      ? await loadFinalEmetRecord(origin, runtime.entityId)
      : null;

    const exactSourceComponentEvidence =
      runtime && hit.v2Route
        ? await buildV2SourceComponentEvidence({
            routes: hit.v2Route.sourceRoutes || [],
            input,
            origin,
          })
        : undefined;

    const entity = runtime
      ? buildRuntimeEntity({
          input,
          runtime,
          sourceWord: hit.sourceWord,
          morph: hit.sourceToken?.morph,
          finalEmet,
          routeMode: hit.v2Route?.mode,
          sourceRoutes: hit.v2Route?.sourceRoutes,
          sourceSegment: hit.v2Route?.sourceSegment,
          sourceComponentEvidence: exactSourceComponentEvidence,
        })
      : buildCanonicalAlignmentEntity({
          input,
          preferredSource: source,
          entityId: canonicalEntityId,
          sourceWord: hit.sourceWord,
          strong: hit.sourceToken?.strong,
          lemma: hit.sourceToken?.lemma,
          morph: hit.sourceToken?.morph,
          compoundRoute: hit.compoundRoute,
        });

    return {
      resolved: true,
      resolutionType: "verse-context",
      preferredSource: source,
      query: input.displayWord,
      entity,
    };
  }

  const entity = buildPlaceholderEntity(input, preferredSource);
  return {
    resolved: true,
    resolutionType: "unresolved",
    preferredSource,
    query: input.displayWord,
    entity,
  };
}

export const BibleIQEngine = {
  resolve: resolveBibleIQ,
};
