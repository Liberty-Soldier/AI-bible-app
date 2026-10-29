import type {
  EmetAiClaimSupport,
  EmetAiEvidenceItem,
  EmetAiEvidencePacket,
  EmetAiIdentityEvidenceLevel,
} from "../EmetAiContract";
import {
  validateEmetAiConcreteAnswer,
  validateEmetAiScriptureOnlyFraming,
} from "../EmetAiAnswerCompleteness";
import { expandPlannedReferences } from "../EmetAiTopicEvidence";
import { extractEmetAiRequestedCoverage } from "../EmetAiRequestedCoverage";
import { verifiedSourcePhraseAtReference } from "../EmetAiSourcePhrase";

export const EMET_AI_SIMPLE_ANSWER_SCHEMA = "emet-ai-simple-answer@2" as const;
export const EMET_AI_SIMPLE_GENERATION_SCHEMA = "emet-ai-simple-generation@4" as const;

export type EmetAiSimpleDraft = {
  schemaVersion: typeof EMET_AI_SIMPLE_ANSWER_SCHEMA;
  status: "complete" | "insufficient-evidence";
  conclusion: "yes" | "no" | "qualified" | "not-applicable";
  conclusionSupport: EmetAiClaimSupport;
  answer: string;
  references: string[];
  claims: Array<{
    text: string;
    support: EmetAiClaimSupport;
    answerBearing?: boolean;
    evidenceLevel?: EmetAiIdentityEvidenceLevel;
    contractInterpretationId?: string;
    references: string[];
    excerpts: Array<{
      reference: string;
      text: string;
      evidenceKind: "scripture" | "lexical";
      verbatim: boolean;
    }>;
  }>;
  componentChecks: Array<{
    componentId: string;
    support: EmetAiClaimSupport;
    explanation: string;
    references: string[];
  }>;
  lexicalAnalyses: Array<{
    reference: string;
    corpus: "hebrew" | "greek-nt" | "lxx";
    lexicalId: string;
    lemma: string;
    transliteration: string;
    meaning: string;
  }>;
  limitations: string[];
};

export type EmetAiSimpleGenerationDraft = {
  schemaVersion: typeof EMET_AI_SIMPLE_GENERATION_SCHEMA;
  status: "complete" | "insufficient-evidence";
  conclusion: "yes" | "no" | "qualified" | "not-applicable";
  conclusionSupport: EmetAiClaimSupport;
  answer: string;
  references: string[];
  reasoning: Array<{
    text: string;
    support: EmetAiClaimSupport;
    answerBearing: boolean;
    authorityId: string;
    references: string[];
  }>;
  lexicalAnalyses: EmetAiSimpleDraft["lexicalAnalyses"];
  limitations: string[];
};

export type EmetAiSimpleAnswer = EmetAiSimpleDraft & {
  citations: Array<{ evidenceId: string; reference: string }>;
};

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function unique(values: string[], limit: number) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

const CLAIM_SUPPORTS = new Set<EmetAiClaimSupport>([
  "explicit-statement", "strong-implication", "theological-synthesis",
  "possible-interpretation", "does-not-establish",
]);

const IDENTITY_EVIDENCE_LEVELS = new Set<EmetAiIdentityEvidenceLevel>([
  "direct-scripture", "contextual-inference", "project-governed-synthesis",
]);

const SUPPORT_RANK: Record<EmetAiClaimSupport, number> = {
  "does-not-establish": 0,
  "possible-interpretation": 1,
  "theological-synthesis": 2,
  "strong-implication": 3,
  "explicit-statement": 4,
};

export function parseEmetAiSimpleDraft(value: unknown): EmetAiSimpleDraft | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== EMET_AI_SIMPLE_ANSWER_SCHEMA ||
    !["complete", "insufficient-evidence"].includes(String(candidate.status)) ||
    !["yes", "no", "qualified", "not-applicable"].includes(String(candidate.conclusion)) ||
    !CLAIM_SUPPORTS.has(candidate.conclusionSupport as EmetAiClaimSupport) ||
    !Array.isArray(candidate.references) ||
    !Array.isArray(candidate.claims) ||
    !Array.isArray(candidate.componentChecks) ||
    !Array.isArray(candidate.lexicalAnalyses) ||
    !Array.isArray(candidate.limitations)
  ) return null;

  const answer = clean(candidate.answer, 8_000);
  if (!answer) return null;
  const references = unique(candidate.references.map((item) => clean(item, 80)), 24);
  const claims = candidate.claims.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    if (!CLAIM_SUPPORTS.has(entry.support as EmetAiClaimSupport) || !Array.isArray(entry.references) || !Array.isArray(entry.excerpts)) return [];
    const text = clean(entry.text, 800);
    const answerBearing = typeof entry.answerBearing === "boolean" ? entry.answerBearing : undefined;
    const evidenceLevel = clean(entry.evidenceLevel, 40);
    const contractInterpretationId = clean(entry.contractInterpretationId, 120);
    const claimReferences = unique(entry.references.map((value) => clean(value, 80)), 12);
    const excerpts = entry.excerpts.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const excerpt = value as Record<string, unknown>;
      const reference = clean(excerpt.reference, 80);
      const excerptText = clean(excerpt.text, 500);
      const evidenceKind = clean(excerpt.evidenceKind, 16);
      if (!reference || !excerptText || !["scripture", "lexical"].includes(evidenceKind) || typeof excerpt.verbatim !== "boolean") return [];
      return [{
        reference,
        text: excerptText,
        evidenceKind: evidenceKind as "scripture" | "lexical",
        verbatim: excerpt.verbatim,
      }];
    }).slice(0, 12);
    return text && claimReferences.length && excerpts.length
      ? [{
          text,
          support: entry.support as EmetAiClaimSupport,
          answerBearing,
          evidenceLevel: IDENTITY_EVIDENCE_LEVELS.has(evidenceLevel as EmetAiIdentityEvidenceLevel)
            ? evidenceLevel as EmetAiIdentityEvidenceLevel
            : undefined,
          contractInterpretationId: contractInterpretationId || undefined,
          references: claimReferences,
          excerpts,
        }]
      : [];
  }).slice(0, 12);
  const componentChecks = candidate.componentChecks.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    if (!CLAIM_SUPPORTS.has(entry.support as EmetAiClaimSupport) || !Array.isArray(entry.references)) return [];
    const componentId = clean(entry.componentId, 80);
    const explanation = clean(entry.explanation, 800);
    const checkReferences = unique(entry.references.map((value) => clean(value, 80)), 12);
    return componentId && explanation && checkReferences.length
      ? [{ componentId, support: entry.support as EmetAiClaimSupport, explanation, references: checkReferences }]
      : [];
  }).slice(0, 16);
  const limitations = unique(candidate.limitations.map((item) => clean(item, 400)), 8);
  const lexicalAnalyses = candidate.lexicalAnalyses.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const corpus = clean(entry.corpus, 16);
    if (!["hebrew", "greek-nt", "lxx"].includes(corpus)) return [];
    const parsed = {
      reference: clean(entry.reference, 80),
      corpus: corpus as "hebrew" | "greek-nt" | "lxx",
      lexicalId: clean(entry.lexicalId, 32),
      lemma: clean(entry.lemma, 80),
      transliteration: clean(entry.transliteration, 100),
      meaning: clean(entry.meaning, 400),
    };
    return Object.values(parsed).every(Boolean) ? [parsed] : [];
  }).slice(0, 12);

  return {
    schemaVersion: EMET_AI_SIMPLE_ANSWER_SCHEMA,
    status: candidate.status as EmetAiSimpleDraft["status"],
    conclusion: candidate.conclusion as EmetAiSimpleDraft["conclusion"],
    conclusionSupport: candidate.conclusionSupport as EmetAiClaimSupport,
    answer,
    references,
    claims,
    componentChecks,
    lexicalAnalyses,
    limitations,
  };
}

export function parseEmetAiSimpleGenerationDraft(value: unknown): EmetAiSimpleGenerationDraft | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== EMET_AI_SIMPLE_GENERATION_SCHEMA ||
    !["complete", "insufficient-evidence"].includes(String(candidate.status)) ||
    !["yes", "no", "qualified", "not-applicable"].includes(String(candidate.conclusion)) ||
    !CLAIM_SUPPORTS.has(candidate.conclusionSupport as EmetAiClaimSupport) ||
    !Array.isArray(candidate.references) ||
    !Array.isArray(candidate.reasoning) ||
    !Array.isArray(candidate.lexicalAnalyses) ||
    !Array.isArray(candidate.limitations)
  ) return null;

  const answer = clean(candidate.answer, 8_000);
  if (!answer) return null;
  const references = unique(candidate.references.map((item) => clean(item, 80)), 24);
  const reasoning = candidate.reasoning.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    if (!CLAIM_SUPPORTS.has(entry.support as EmetAiClaimSupport) || !Array.isArray(entry.references)) return [];
    const text = clean(entry.text, 800);
    const answerBearing = entry.answerBearing;
    const authorityId = clean(entry.authorityId, 120);
    const claimReferences = unique(entry.references.map((entryReference) => clean(entryReference, 80)), 10);
    return text && typeof answerBearing === "boolean" && claimReferences.length && authorityId
      ? [{
          text,
          support: entry.support as EmetAiClaimSupport,
          answerBearing,
          authorityId,
          references: claimReferences,
        }]
      : [];
  }).slice(0, 8);
  const lexicalAnalyses = candidate.lexicalAnalyses.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const corpus = clean(entry.corpus, 16);
    if (!["hebrew", "greek-nt", "lxx"].includes(corpus)) return [];
    const parsed = {
      reference: clean(entry.reference, 80),
      corpus: corpus as "hebrew" | "greek-nt" | "lxx",
      lexicalId: clean(entry.lexicalId, 32),
      lemma: clean(entry.lemma, 80),
      transliteration: clean(entry.transliteration, 100),
      meaning: clean(entry.meaning, 400),
    };
    return Object.values(parsed).every(Boolean) ? [parsed] : [];
  }).slice(0, 12);

  return {
    schemaVersion: EMET_AI_SIMPLE_GENERATION_SCHEMA,
    status: candidate.status as EmetAiSimpleGenerationDraft["status"],
    conclusion: candidate.conclusion as EmetAiSimpleGenerationDraft["conclusion"],
    conclusionSupport: candidate.conclusionSupport as EmetAiClaimSupport,
    answer,
    references,
    reasoning,
    lexicalAnalyses,
    limitations: unique(candidate.limitations.map((item) => clean(item, 400)), 8),
  };
}

export function composeIdentityContractAnswer({
  status,
  conclusion,
  claims,
}: {
  status: EmetAiSimpleDraft["status"];
  conclusion: EmetAiSimpleDraft["conclusion"];
  claims: Array<Pick<EmetAiSimpleDraft["claims"][number], "text">>;
}) {
  const sentences = claims.map((claim) => claim.text.trim())
    .filter(Boolean)
    .map((text) => /[.!?][”"’'']?$/.test(text) ? text : `${text}.`);
  if (sentences.length === 0) {
    return status === "insufficient-evidence"
      ? "I couldn't assemble enough verified Scripture to answer that reliably."
      : "";
  }
  const expectedOpening = conclusion === "yes" ? "yes" : conclusion === "no" ? "no" : "";
  const firstOpening = sentences[0]?.match(/^\s*(yes|no)\b/i)?.[1]?.toLocaleLowerCase("en-US") || "";
  const prefix = expectedOpening && firstOpening !== expectedOpening
    ? `${expectedOpening[0].toLocaleUpperCase("en-US")}${expectedOpening.slice(1)}.`
    : "";
  return [prefix, ...sentences].filter(Boolean).join(" ");
}

function explicitlyNamedScriptureReferences(text: string) {
  return extractEmetAiRequestedCoverage(text).passages.flatMap((passage) => {
    if (passage.startVerse === undefined) return [];
    const endVerse = passage.endVerse || passage.startVerse;
    return Array.from({ length: endVerse - passage.startVerse + 1 }, (_, offset) =>
      `${passage.book} ${passage.chapter}:${passage.startVerse! + offset}`
    );
  });
}

export function hydrateEmetAiSimpleGenerationDraft({
  packet,
  draft,
}: {
  packet: EmetAiEvidencePacket;
  draft: EmetAiSimpleGenerationDraft;
}): EmetAiSimpleDraft {
  const evidenceFor = (reference: string) =>
    packet.evidence.find((item) => item.kind === "scripture" && item.reference === reference) ||
    packet.evidence.find((item) => item.kind === "lexical" && item.reference === reference);
  const excerptFor = (reference: string) => {
    const evidence = evidenceFor(reference);
    return evidence ? [{
      reference,
      text: evidence.text,
      evidenceKind: evidence.kind as "scripture" | "lexical",
      verbatim: true,
    }] : [];
  };
  const identityContract = packet.foundationalIdentityContract;
  const authorityFor = (authorityId: string) => {
    const proposition = identityContract?.propositions.find((item) => item.id === authorityId);
    if (proposition) return {
      id: proposition.id,
      text: proposition.text,
      support: proposition.support as EmetAiClaimSupport,
      evidenceLevel: proposition.evidenceLevel as EmetAiIdentityEvidenceLevel,
      evidenceReferences: proposition.evidenceReferences,
      evidenceIds: proposition.evidenceIds,
    };
    const interpretation = identityContract?.interpretations.find((item) => item.id === authorityId);
    if (interpretation) return {
      id: interpretation.id,
      text: interpretation.text,
      support: "theological-synthesis" as EmetAiClaimSupport,
      evidenceLevel: interpretation.evidenceLevel,
      evidenceReferences: interpretation.evidenceReferences,
      evidenceIds: interpretation.evidenceIds,
    };
    return null;
  };
  const authoritativeClaim = (authorityId: string, answerBearing: boolean) => {
    const authority = authorityFor(authorityId);
    if (!authority) return null;
    const references = authority.evidenceIds.flatMap((evidenceId) => {
      const reference = packet.evidence.find((item) => item.id === evidenceId)?.reference;
      return reference ? [reference] : [];
    });
    if (
      references.length !== authority.evidenceReferences.length ||
      authority.evidenceReferences.some((reference) => !references.includes(reference)) ||
      references.some((reference) => !evidenceFor(reference))
    ) {
      return null;
    }
    return {
      text: authority.text,
      support: authority.support,
      answerBearing,
      evidenceLevel: authority.evidenceLevel,
      contractInterpretationId: authority.id,
      references: unique([...references, ...explicitlyNamedScriptureReferences(authority.text)], 12),
      excerpts: unique([...references, ...explicitlyNamedScriptureReferences(authority.text)], 12)
        .flatMap(excerptFor),
    } satisfies EmetAiSimpleDraft["claims"][number];
  };

  let identityEvidenceMissing = false;
  let claims: EmetAiSimpleDraft["claims"];
  if (identityContract) {
    if (draft.status === "complete" && !draft.reasoning.some((reason) => reason.answerBearing)) {
      identityEvidenceMissing = true;
    }
    const proposedReferences = new Set(draft.reasoning.flatMap((reason) => reason.references));
    const requiredClaims = identityContract.answerRequirements.flatMap((requirement) => {
      const claim = authoritativeClaim(requirement.authorityId, requirement.answerBearing);
      if (!claim || !claim.references.some((reference) => proposedReferences.has(reference))) {
        identityEvidenceMissing = true;
        return [];
      }
      return [claim];
    });
    const requiredAuthorityIds = new Set(identityContract.answerRequirements.map((item) => item.authorityId));
    const selectedClaims = draft.reasoning.flatMap((reason) => {
      if (requiredAuthorityIds.has(reason.authorityId)) return [];
      const claim = authoritativeClaim(reason.authorityId, false);
      return claim ? [claim] : [];
    });
    const publicCitationLimit = packet.responseDesign?.maxScriptureCitations || 8;
    claims = [...requiredClaims];
    let selectedReferences = new Set(claims.flatMap((claim) => claim.references));
    for (const claim of selectedClaims) {
      const nextReferences = new Set([...selectedReferences, ...claim.references]);
      // Optional selected observations may enrich the answer, but they cannot
      // displace a required answer claim or force evidence beyond the public
      // citation budget. The model''s prose is never copied into this decision.
      if (nextReferences.size > publicCitationLimit) continue;
      claims.push(claim);
      selectedReferences = nextReferences;
    }
  } else {
    claims = draft.reasoning.map((reason) => ({
      text: reason.text,
      support: reason.support,
      answerBearing: reason.answerBearing,
      references: reason.references,
      excerpts: reason.references.flatMap(excerptFor),
    }));
  }
  const componentChecks: EmetAiSimpleDraft["componentChecks"] = packet.reasoning.components.map((component) => {
    const references = (packet.governingCoverage?.find((item) => item.componentId === component.id)?.evidenceIds || [])
      .flatMap((id) => {
        const reference = packet.evidence.find((item) => item.id === id)?.reference;
        return reference ? [reference] : [];
      });
    const relatedClaims = claims.filter((claim) => claim.references.some((reference) => references.includes(reference)));
    const strongest = relatedClaims.sort((left, right) => SUPPORT_RANK[right.support] - SUPPORT_RANK[left.support])[0];
    return {
      componentId: component.id,
      support: strongest?.support || "does-not-establish",
      explanation: strongest?.text || "Verified evidence retained for: " + component.proposition,
      references: unique(references, 12),
    };
  });
  const status = identityEvidenceMissing ? "insufficient-evidence" as const : draft.status;
  const answer = identityContract
    ? composeIdentityContractAnswer({ status, conclusion: draft.conclusion, claims: identityEvidenceMissing ? [] : claims })
    : draft.answer;
  const references = identityContract
    ? identityEvidenceMissing ? [] : Array.from(new Set(claims.flatMap((claim) => claim.references)))
    : draft.references;
  return {
    schemaVersion: EMET_AI_SIMPLE_ANSWER_SCHEMA,
    status,
    conclusion: draft.conclusion,
    conclusionSupport: draft.conclusionSupport,
    answer,
    references,
    claims: identityEvidenceMissing ? [] : claims,
    componentChecks,
    lexicalAnalyses: draft.lexicalAnalyses,
    limitations: identityEvidenceMissing
      ? unique([...draft.limitations, "The active identity contract''s required evidence was unavailable in the verified packet."], 8)
      : draft.limitations,
  };
}

function normalizedText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const READER_CLAIM_STOP_WORDS = new Set([
  "about", "according", "also", "among", "answer", "because", "being", "does",
  "from", "into", "itself", "scripture", "says", "said", "that", "their", "them",
  "there", "these", "they", "this", "those", "through", "with", "would", "therefore",
  "contextual", "directly", "lexical", "entry", "many", "verse", "sense", "same", "text", "word", "words",
]);

const READER_CLAIM_CONCEPTS = [
  ["identify", "establish", "declare", "reveal", "name", "present"],
  ["appoint", "assign"],
  ["king", "ruler", "reign", "royal", "prince", "government"],
  ["david", "davidic"],
  ["christian", "believe", "believer", "follower"],
  ["priest", "priestly", "priesthood"],
  ["die", "death", "dead"],
  ["allow", "permit"],
  ["state", "say", "tell"],
  ["differ", "different", "vary", "another"],
  ["significance", "regard", "treat"],
] as const;

function readerClaimRoot(value: string) {
  if (/^command/.test(value)) return "command";
  if (/^believ/.test(value)) return "believe";
  if (/^(?:keep|kept|keeping)$/.test(value)) return "keep";
  if (/^(?:come|comes|came|coming)$/.test(value)) return "come";
  if (/^(?:state|states|stated|stating)$/.test(value)) return "state";
  if (/^christian/.test(value)) return "christian";
  if (value.length > 5 && value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.length > 5 && value.endsWith("ing")) return value.slice(0, -3);
  if (value.length > 4 && value.endsWith("ed")) return value.slice(0, -2);
  if (value.length > 5 && value.endsWith("es")) return value.slice(0, -2);
  if (value.length > 4 && value.endsWith("s")) return value.slice(0, -1);
  return value;
}

function readerClaimTerm(value: string) {
  const root = readerClaimRoot(value);
  return READER_CLAIM_CONCEPTS.find((family) =>
    family.includes(root as never)
  )?.[0] || root;
}

const NORMATIVE_ACTION_GROUPS = [
  ["keep", "observe", "obey", "practice", "follow"],
  ["perform", "do", "serve"],
  ["approach", "come"],
] as const;

function normativeActionConcept(value: string) {
  const root = readerClaimRoot(value);
  return NORMATIVE_ACTION_GROUPS.find((group) => group.includes(root as never))?.[0] || root;
}

function assertedModalAction(value: string) {
  return normalizedText(value).match(/\b(?:should|must|may|ought|need)\s+(?:not\s+)?([a-z]+)/)?.[1] || "";
}

function readerClaimTerms(value: string) {
  const terms = normalizedText(value).split(" ")
    .filter((term) => term.length >= 4 && !READER_CLAIM_STOP_WORDS.has(term))
    .map(readerClaimTerm);
  if (/\b(?:no|not|never|den(?:y|ies|ied))\b/i.test(value)) terms.push("__negation");
  return Array.from(new Set(terms));
}

const DESIGNATION_STOP_WORDS = new Set([
  "and", "the", "his", "her", "him", "its", "their", "them", "this", "that",
  "coming", "promised", "also", "both", "called", "named", "true", "only",
]);

function designationTerms(value: string) {
  return Array.from(new Set(normalizedText(value).split(" ")
    .filter((term) => term.length >= 3 && !DESIGNATION_STOP_WORDS.has(term))
    .map(readerClaimTerm)));
}

function unsupportedClaimDesignations(
  question: string,
  claim: EmetAiSimpleDraft["claims"][number],
) {
  // This guard is deliberately limited to an explicit identification. Verbs
  // such as "describes" or "presents" commonly introduce a list of ordinary
  // attributes (divine, preexistent, creator, and so on); treating that entire
  // list as one proper-name designation caused supported descriptions to be
  // rejected by exact word matching.
  const match = claim.text.match(
    /\b(?:identif(?:y|ies)|call(?:s|ed)?|nam(?:e|es|ed))\s+(.{1,100}?)\s+as\s+(.+?)(?:,|\s+so\b|[.;]|$)/i,
  );
  if (!match) return [];
  const identityQuestion = /\bwho\b[^?]{0,100}\b(?:is|are|was|were)\b|\b(?:identity|nature)\b/i.test(question);
  if (!identityQuestion) return [];
  const identifiedSubject = match[1];
  const designation = match[2];
  // Relative descriptions such as "the people who ..." assert properties of an
  // already identified subject; they are not an additional identity label.
  if (/^\s*(?:the\s+)?(?:people|persons?|ones?|those)\s+who\b/i.test(designation)) return [];
  // A relative predicate describes what the named subject does; it does not
  // introduce a proper-name or identity designation for the subject. Keep the
  // identity guard for compact nominal complements such as "Judas as Yahweh."
  if (/\b(?:who|that|which)\b/i.test(designation)) return [];
  const subjectTerms = designationTerms(identifiedSubject);
  const subjectTerm = subjectTerms.at(-1) || "";
  const designationTokens = designationTerms(designation);
  if (!subjectTerm || designationTokens.length === 0) return [];
  const subjectEntities = identityEntities(identifiedSubject);
  const designationEntities = identityEntities(designation);
  const genericDescribedGroup = /^\s*(?:the|these|those)\b/i.test(identifiedSubject) ||
    /\b(?:people|persons?|ones?|those|recipients?)\b/i.test(identifiedSubject);
  const supportedByAttachedExcerpt = claim.excerpts.some((excerpt) => {
    const excerptTerms = new Set(designationTerms(excerpt.text));
    const excerptEntities = new Set(identityEntities(excerpt.text));
    const subjectSupported = genericDescribedGroup
      ? true
      : subjectEntities.length > 0
      ? subjectEntities.some((entity) => excerptEntities.has(entity))
      : excerptTerms.has(subjectTerm);
    const designationSupported = designationEntities.length > 0
      ? designationEntities.every((entity) => excerptEntities.has(entity))
      : designationTokens.every((term) => excerptTerms.has(term));
    return subjectSupported && designationSupported;
  });
  return supportedByAttachedExcerpt ? [] : [designation.trim()];
}

const IDENTITY_ENTITY_PATTERNS: Array<[string, RegExp]> = [
  ["yahweh", /\b(?:yahweh|yhwh)\b/i],
  ["messiah", /\b(?:yahshua|yeshua|jesus|messiah|christ|the son|son of god|the word)\b/i],
  ["father", /\b(?:god the father|the father|father)\b/i],
  ["god", /\b(?:god|elohim)\b/i],
];

function identityEntities(value: string) {
  return IDENTITY_ENTITY_PATTERNS.filter(([, pattern]) => pattern.test(value)).map(([entity]) => entity);
}

function exactSamePersonQuestion(value: string) {
  const match = value.match(/(?:^|[?,;]\s*|\band\s+)is\s+(.{1,80}?)\s+(?:the\s+)?same\s+person\s+as\s+(.{1,80}?)(?:[?,]|$)/i);
  if (!match) return null;
  const left = identityEntities(match[1]);
  const right = identityEntities(match[2]);
  return left.length && right.length ? { left, right } : null;
}

function claimAddressesIdentityPair(claim: string, pair: NonNullable<ReturnType<typeof exactSamePersonQuestion>>) {
  const entities = new Set(identityEntities(claim));
  const namesLeft = pair.left.some((entity) => entities.has(entity));
  const namesRight = pair.right.some((entity) => entities.has(entity));
  const statesRelationship = /\b(?:same\s+person|identical|distinct(?:ion)?|different|not\s+the\s+same|is\s+not|isn't)\b/i.test(claim);
  return namesLeft && namesRight && statesRelationship;
}

function claimIsDisplayedInAnswer(question: string, answer: string, claim: string) {
  const sourceTerms = visibleSourceTerms(claim);
  if (sourceTerms.some((term) => answer.normalize("NFKC").includes(term))) return true;
  const questionTerms = new Set(readerClaimTerms(question));
  const answerTerms = new Set(readerClaimTerms(answer));
  const materialClaimTerms = readerClaimTerms(claim).filter((term) => !questionTerms.has(term));
  if (!materialClaimTerms.length) return true;
  const overlap = materialClaimTerms.filter((term) => answerTerms.has(term)).length;
  const requiredOverlap = materialClaimTerms.length <= 2
    ? materialClaimTerms.length
    : Math.min(3, Math.ceil(materialClaimTerms.length * 0.4));
  return overlap >= requiredOverlap;
}

function scriptureQuotations(value: string) {
  return Array.from(value.matchAll(/[“"]([^”"\n]{8,300})[”"]/g)).flatMap((match) => {
    const quote = match[1].trim();
    if (quote.split(/\s+/).length < 4) return [];
    const start = match.index || 0;
    const before = value.slice(Math.max(0, start - 90), start);
    const after = value.slice(start + match[0].length, start + match[0].length + 90);
    const attributed = /\b(?:scripture|the\s+(?:text|verse|passage)|\w+\s+\d+:\d+)[^.]{0,70}\b(?:says?|said|writes?|declares?|reads?)\s*[:,]?\s*$/i.test(before) ||
      /^\s*(?:\([^)]*\b(?:[1-3]\s+)?[A-Z][A-Za-z]+\s+\d+:\d+)/.test(after);
    return attributed ? [quote] : [];
  });
}

function visibleSourceTerms(value: string) {
  return Array.from(value.matchAll(/[\u0590-\u05ff]+|[\u0370-\u03ff\u1f00-\u1fff]+/gu))
    .map((match) => match[0].normalize("NFKC"));
}

function evidenceForReference(evidence: EmetAiEvidenceItem[], reference: string) {
  return evidence.find((item) => item.kind === "scripture" && item.reference === reference);
}

function evidenceForReferenceAndKind(
  evidence: EmetAiEvidenceItem[],
  reference: string,
  kind: "scripture" | "lexical",
) {
  return evidence.find((item) => item.kind === kind && item.reference === reference);
}

/**
 * Canonicalizes only the unambiguous same-book, same-chapter comma shorthand
 * emitted by answer models (for example, Romans 7:7, 12, 14). Everything else
 * stays unchanged and must pass the existing locked-corpus resolver.
 */
export function normalizeEmetAiSimpleReferences(references: string[]) {
  return unique(references.flatMap((raw) => {
    const cleaned = raw.trim().replace(/[–—]/g, "-").replace(/`/g, "");
    const fullReference = /^(?:[1-3]\s+)?[A-Za-z]+(?:\s+[A-Za-z]+)*\s+\d+:\d+(?:-\d+)?$/;
    const delimited = cleaned.split(/\s*[,;]\s*/);
    const candidates = delimited.length > 1 && delimited.every((part) => fullReference.test(part))
      ? delimited
      : [cleaned];
    return candidates.flatMap((reference) => {
      const expanded = expandAnswerReference(reference);
      return expanded.length ? expanded : [reference];
    });
  }), 96);
}

const ANSWER_RANGE_LIMIT = 48;

function expandAnswerReference(reference: string) {
  const normalized = reference.trim().replace(/[–—]/g, "-");
  const range = normalized.match(/^((?:[1-3]\s+)?[A-Za-z]+(?:\s+[A-Za-z]+)*)\s+(\d+):(\d+)-(\d+)$/);
  if (range) {
    const [, book, chapterText, startText, endText] = range;
    const start = Number(startText);
    const end = Number(endText);
    if (end >= start && end - start + 1 <= ANSWER_RANGE_LIMIT) {
      return Array.from({ length: end - start + 1 }, (_, index) => `${book} ${chapterText}:${start + index}`);
    }
    return [];
  }
  return expandPlannedReferences(normalized);
}

function countScriptureCitationGroups(references: string[]) {
  const versesByChapter = new Map<string, Set<number>>();
  let ungrouped = 0;
  for (const reference of references) {
    const match = reference.match(/^((?:[1-3]\s+)?[A-Za-z]+(?:\s+[A-Za-z]+)*)\s+(\d+):(\d+)$/);
    if (!match) {
      ungrouped += 1;
      continue;
    }
    const key = `${match[1]} ${match[2]}`;
    const verses = versesByChapter.get(key) || new Set<number>();
    verses.add(Number(match[3]));
    versesByChapter.set(key, verses);
  }
  return ungrouped + Array.from(versesByChapter.values()).reduce((total, verses) => {
    const ordered = Array.from(verses).sort((left, right) => left - right);
    return total + ordered.reduce((runs, verse, index) =>
      runs + (index === 0 || verse !== ordered[index - 1] + 1 ? 1 : 0), 0);
  }, 0);
}

const MEANING_FAMILIES = [
  ["guard", "keep", "protect", "observe", "attend", "watch"],
  ["action", "deed", "work", "activity", "transaction", "act"],
  ["judgment", "verdict", "justice", "sentence", "decree", "decision"],
  ["whole", "all", "every", "entire"],
  ["human", "person", "people", "mankind", "man", "humanity"],
  ["command", "commandment", "order", "instruction", "law", "precept"],
  ["fear", "revere", "reverence", "awe"],
] as const;

function meaningConcept(word: string) {
  return MEANING_FAMILIES.find((family) => family.includes(word as never))?.[0] || word;
}

function lexicalMeaningSupported(evidenceText: string, claimedMeaning: string) {
  const ignored = new Set([
    "and", "the", "means", "meaning", "to", "a", "an", "of", "or", "as",
    "also", "broader", "broadly", "lexical", "range", "sense", "senses", "include", "includes",
    "included", "listed", "entry", "gloss", "glosses", "ordinal", "context",
    "contextual", "contextually", "range", "use", "uses", "word", "translated",
  ]);
  const evidenceConcepts = new Set(normalizedText(evidenceText).split(" ")
    .filter((word) => word.length > 1 && !ignored.has(word))
    .map(meaningConcept));
  const claimConcepts = Array.from(new Set(normalizedText(claimedMeaning).split(" ")
    .filter((word) => word.length > 1 && !ignored.has(word))
    .map(meaningConcept)));
  return claimConcepts.length > 0 && claimConcepts.every((concept) => evidenceConcepts.has(concept));
}

function normalizedTransliteration(value: string) {
  return value.normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/ch/g, "h");
}

export function usesOmissionAsNonApplicability(answer: string) {
  const omission = /\b(?:acts\s+(?:15|21)|a\s+(?:later\s+)?list|the\s+(?:apostolic\s+)?decree|later scripture|the new testament)\b[^.]{0,220}\b(?:does not|did not|doesn't|didn't|no)\b[^.]{0,160}\b(?:include|mention|list|place|restate|repeat|command|require)/i;
  const resultingNegative = /\b(?:therefore|so|thus|for that reason|on that basis)\b[^.]{0,260}\b(?:not\s+(?:required|commanded|binding|applicable)|not\s+shown\s+as\s+(?:being\s+)?required|need not|exempt|does not (?:apply|bind|require)|do not directly command)/i;
  const compressedExemption = /\b(?:acts\s+(?:15|21)|apostles?|apostolic\s+decree|later\s+(?:list|scripture)|new testament)\b[^.]{0,420}\b(?:only\s+(?:the\s+)?(?:listed|following)?\s*(?:necessities|requirements|instructions)|did\s+not\s+(?:include|mention|list|restate|repeat))\b[^.]{0,260}\b(?:not\s+[^.]{0,100}\b(?:requirement|required|binding|obligation)|need\s+not|exempt|does\s+not\s+(?:apply|bind|require))/i;
  const unstatedCommandExemption = /\bnot\s+(?:explicitly|directly|plainly|textually)\s+(?:commanded|required)\b[^.]{0,320}\b(?:as\s+(?:a\s+)?binding|as\s+(?:a\s+)?binding\s+(?:covenant\s+)?(?:command|obligation)|not\s+binding|nonbinding|need\s+not|does\s+not\s+(?:apply|bind)|rather\s+than\s+(?:as\s+)?(?:a\s+)?binding|instead\s+of\s+(?:a\s+)?binding)\b/i;
  const statedGentileExemption = /\b(?:acts\s+(?:15|21)|gentile\s+believers?)\b[^.]{0,260}\b(?:not\s+(?:required|burdened|bound)|were\s+not\s+(?:required|burdened|bound))\b/i;
  const modernRestatementLimitation = /\b(?:new testament|supplied texts?|texts? here)\b[^.]{0,180}\b(?:does not|do not|doesn't|don't)\b[^.]{0,120}\b(?:direct|explicit|modern)\b[^.]{0,100}\b(?:command|require)/i;
  const absenceOfRepeal = /\b(?:nothing|no supplied (?:text|passage|evidence)|none of (?:these|the supplied))\b[^.]{0,160}\b(?:repeals?|revokes?|abolishes?)\b|\b(?:texts?|evidence|passages?)\b[^.]{0,100}\b(?:do not|does not)\b[^.]{0,100}\b(?:provide|state|show)\b[^.]{0,100}\b(?:repeal|exemption)\b/i;
  const missingUniversalWording = /\b(?:does not|do not|no)\b[^.]{0,120}\b(?:separate|simple|explicit|direct|universal|modern|new testament)\b[^.]{0,120}\b(?:command|obligation)\b[^.]{0,180}\b(?:not\s+(?:stated|shown|given)|not\s+universally\s+binding|for\s+(?:all\s+)?christians?)\b|\b(?:command|obligation)\b[^.]{0,120}\b(?:not\s+(?:stated|shown|given))\b[^.]{0,100}\b(?:universally\s+binding|for\s+(?:all\s+)?christians?)\b/i;
  const restatementCaveat = /\b(?:question|command|obligation|requirement|rule|evidence|text|scripture|passages?|taken together)\b[^.]{0,140}\b(?:does\s+not|do\s+not|is\s+not|was\s+not)\s+(?:explicitly\s+)?(?:establish|state|give|repeat|restate)\b[^.]{0,180}\b(?:simple|universal|binding|same form|all believers|all christians|every believer|every christian)\b/i;
  const presentationCaveat = /\b(?:text|scripture|evidence)\b[^.]{0,180}\bdoes\s+not\s+(?:present|state|give|frame)\b[^.]{0,180}\b(?:obligation|command|requirement)\b[^.]{0,120}\b(?:simple|universal|every\s+christian|all\s+christians)\b/i;
  return (omission.test(answer) && resultingNegative.test(answer)) || compressedExemption.test(answer) || unstatedCommandExemption.test(answer) || statedGentileExemption.test(answer) || modernRestatementLimitation.test(answer) || absenceOfRepeal.test(answer) || missingUniversalWording.test(answer) || restatementCaveat.test(answer) || presentationCaveat.test(answer);
}
function parseNormativeActionQuestion(question: string): [string, string, string, string] | null {
  const direct = question.trim().match(
    /^(?:should|must)\s+(.+?)\s+(keep|observe|perform|follow|obey|do)\s+(.+?)\??$/i,
  );
  if (direct) return [question, direct[1], direct[2], direct[3]];
  const supposed = question.trim().match(
    /^(?:is|are)\s+(.+?)\s+(?:supposed|required)\s+to\s+(keep|observe|perform|follow|obey|do)\s+(.+?)\??$/i,
  );
  return supposed ? [question, supposed[1], supposed[2], supposed[3]] : null;
}


export function validateEmetAiSimpleAnswer({
  packet,
  draft,
}: {
  packet: EmetAiEvidencePacket;
  draft: EmetAiSimpleDraft;
}): { ok: true; value: EmetAiSimpleAnswer } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const claims = Array.isArray(draft.claims) ? draft.claims : [];
  const componentChecks = Array.isArray(draft.componentChecks) ? draft.componentChecks : [];
  const membershipNormativeQuestion = parseNormativeActionQuestion(packet.question);
  const askedGroupTerms = membershipNormativeQuestion ? readerClaimTerms(membershipNormativeQuestion[1]) : [];
  const claimNamesAskedGroup = (claimText: string) =>
    askedGroupTerms.length === 0 ||
    askedGroupTerms.some((term) => readerClaimTerms(claimText).includes(term));
  // The answer model may correctly assess a necessary applicability premise in
  // a structured claim yet omit that premise from its concise prose. Expose the
  // model's own verified claim instead of accepting hidden reasoning or adding
  // a second generation pass. This applies to every command-membership question.
  const membershipReferencesForPresentation = new Set(
    (packet.governingCoverage?.find((coverage) => coverage.componentId === "covenant-membership")?.evidenceIds || [])
      .flatMap((id) => {
        const reference = packet.evidence.find((item) => item.id === id)?.reference;
        return reference ? [reference] : [];
      }),
  );
  const membershipClaimForPresentation = claims.find((claim) => {
    const references = normalizeEmetAiSimpleReferences(claim.references);
    return ["explicit-statement", "strong-implication", "theological-synthesis"].includes(claim.support) &&
      references.length > 0 &&
      claimNamesAskedGroup(claim.text) &&
      references.every((reference) => membershipReferencesForPresentation.has(reference));
  });
  if (
    draft.status === "complete" && packet.reasoning.commandApplicability &&
    ["yes", "qualified"].includes(draft.conclusion) && membershipClaimForPresentation &&
    !claimIsDisplayedInAnswer(packet.question, draft.answer, membershipClaimForPresentation.text)
  ) {
    draft.answer = `${draft.answer.trim().replace(/[.!?]?$/, ".")} ${membershipClaimForPresentation.text.trim()}`;
  }
  // Preserve the question's normative force in presentation when the model's
  // structured conclusion is positive but its prose only says "Yes" followed
  // by supporting facts. This restates the asked proposition; it does not pick
  // a conclusion or add a theological premise.
  const normativeQuestion = parseNormativeActionQuestion(packet.question);
  const alreadyStatesPositiveObligation =
    /\b(?:should|must|ought\s+to|required\s+to)\s+(?!not\b)(?:keep|observe|perform|follow|obey|do)\b/i.test(draft.answer);
  if (
    draft.status === "complete" && ["yes", "qualified"].includes(draft.conclusion) &&
    normativeQuestion && /^\s*yes\b/i.test(draft.answer) && !alreadyStatesPositiveObligation
  ) {
    const [, subject, action, object] = normativeQuestion;
    const remainder = draft.answer.replace(/^\s*yes\b[\s.!—:;-]*/i, "").trim();
    draft.answer = `Yes. ${subject} should ${action} ${object.replace(/\?$/, "")}. ${remainder}`.trim();
  }
  if (!Array.isArray(draft.claims) || !Array.isArray(draft.componentChecks) || !CLAIM_SUPPORTS.has(draft.conclusionSupport)) {
    errors.push("The answer is missing structured claim-support verification.");
  }
  if (packet.foundationalIdentityContract) {
    const propositions = new Map(
      packet.foundationalIdentityContract.propositions.map((proposition) => [proposition.id, proposition]),
    );
    const interpretations = new Map(
      (packet.foundationalIdentityContract.interpretations || []).map((interpretation) => [interpretation.id, interpretation]),
    );
    for (const claim of claims) {
      if (!claim.evidenceLevel || !IDENTITY_EVIDENCE_LEVELS.has(claim.evidenceLevel)) {
        errors.push("Every foundational-identity claim requires a valid evidence level.");
        continue;
      }
      const authorityId = claim.contractInterpretationId || "";
      const proposition = propositions.get(authorityId);
      const interpretation = interpretations.get(authorityId);
      const authority = proposition || interpretation;
      if (!authority) {
        errors.push(`Foundational identity claim uses an unavailable typed authority ID: ${authorityId || "<missing>"}.`);
        continue;
      }
      if (claim.evidenceLevel !== authority.evidenceLevel) {
        errors.push(`Foundational identity claim ${authorityId} does not use its registry-controlled evidence level.`);
      }
      if (claim.text.trim() !== authority.text.trim()) {
        errors.push(`Foundational identity claim ${authorityId} does not reproduce its approved authority statement exactly.`);
      }
      const expectedSupport: EmetAiClaimSupport = proposition ? "explicit-statement" : "theological-synthesis";
      if (claim.support !== expectedSupport) {
        errors.push(`Foundational identity claim ${authorityId} does not use its registry-controlled support type.`);
      }
      const claimReferences = new Set(normalizeEmetAiSimpleReferences(claim.references));
      const requiredReferences = authority.evidenceIds.flatMap((evidenceId) => {
        const reference = packet.evidence.find((item) => item.id === evidenceId)?.reference;
        return reference ? [reference] : [];
      });
      const missingReferences = requiredReferences.filter((reference) => !claimReferences.has(reference));
      if (missingReferences.length > 0) {
        errors.push(`Foundational identity claim ${authorityId} is missing its registry evidence: ${missingReferences.join(", ")}.`);
      }
    }
    const answerBearingClaims = claims.filter((claim) => claim.answerBearing === true);
    if (draft.status === "complete" && answerBearingClaims.length === 0) {
      errors.push("A complete foundational-identity answer requires an answer-bearing structured claim.");
    }
    for (const claim of answerBearingClaims) {
      if (["possible-interpretation", "does-not-establish"].includes(claim.support)) {
        errors.push("An answer-bearing identity claim lacks sufficient structured support.");
      }
    }
    const constructedAnswer = composeIdentityContractAnswer({
      status: draft.status,
      conclusion: draft.conclusion,
      claims,
    });
    if (draft.answer.trim() !== constructedAnswer.trim()) {
      errors.push("The foundational-identity public answer is not constructed from the exact approved structured claims.");
    }
  }
  if (/(?:scripture|lexical|morphology):[A-Za-z0-9._:-]+/i.test(draft.answer)) {
    errors.push("Reader-facing prose exposes an internal evidence identifier.");
  }
  if (/\p{Script=Cyrillic}+\p{Script=Latin}+|\p{Script=Latin}+\p{Script=Cyrillic}+/u.test(draft.answer)) {
    errors.push("Reader-facing prose contains a malformed mixed-script word.");
  }
  const opening = /^\s*(yes|no)\b/i.exec(draft.answer)?.[1]?.toLocaleLowerCase("en-US");
  if (opening && (draft.conclusion === "yes" || draft.conclusion === "no") && opening !== draft.conclusion) {
    errors.push(`The opening ${opening.toUpperCase()} contradicts the structured ${draft.conclusion.toUpperCase()} conclusion.`);
  }
  if (draft.status === "complete" && draft.references.length === 0) {
    errors.push("A complete answer requires verified Scripture references.");
  }
  const asksUnqualifiedFaithGroup = /\b(?:christians?|believers?|followers? of (?:the )?messiah)\b/i.test(packet.question);
  const recastsGroupAsConditional = /\b(?:self[- ]described|nominal)\b/i.test(draft.answer) ||
    /\b(?:christians?|believers?|followers? of (?:the )?messiah)\b[^.]{0,80}\bif\b[^.]{0,80}\b(?:belong|genuine|truly|really)\b/i.test(draft.answer);
  if (asksUnqualifiedFaithGroup && recastsGroupAsConditional) {
    errors.push("The answer replaces the question's unqualified faith-group subject with an unrequested nominal-membership condition.");
  }
    const asksNormativeModal = /^(?:should|must)\b|\b(?:supposed|required)\s+to\b/i.test(packet.question.trim());
  const statesPositiveObligation = /\b(?:should|must|ought\s+to|required\s+to)\s+(?!not\b)(?:(?:faithfully|properly|continue\s+to)\s+)?(?:keep|observe|perform|follow|obey|do)\b/i.test(draft.answer);
  const statesNegativeObligation = /\b(?:should|must|ought\s+to)\s+not\s+(?:keep|observe|perform|follow|obey|do)\b|\b(?:need|needs)\s+not\s+(?:keep|observe|perform|follow|obey|do)\b|\b(?:is|are)\s+not\s+required\s+to\s+(?:keep|observe|perform|follow|obey|do)\b/i.test(draft.answer);
  const directlyAnswersNo = draft.conclusion === "no" && opening === "no";
  const readerLabelsQualified = /^\s*qualified\b/i.test(draft.answer);
  const normalizeUnqualifiedPositiveSynthesis =
    draft.conclusion === "qualified" &&
    statesPositiveObligation &&
    draft.limitations.length === 0 &&
    !readerLabelsQualified;
  if (
    asksNormativeModal &&
    draft.status === "complete" &&
    !statesPositiveObligation &&
    !statesNegativeObligation &&
    !directlyAnswersNo
  ) {
    errors.push("The answer does not directly preserve the question's should/must force for the action asked about.");
  }
  if (
    asksNormativeModal &&
    draft.status === "complete" &&
    draft.conclusion === "qualified" &&
    draft.limitations.length === 0 &&
    !normalizeUnqualifiedPositiveSynthesis
  ) {
    errors.push("A qualified should/must answer requires a concrete text-supported limitation; synthesis alone does not qualify the proposition.");
  }

  let declaredReferences = normalizeEmetAiSimpleReferences(draft.references);
  const claimSelectedReferences = new Set(claims.flatMap((claim) =>
    normalizeEmetAiSimpleReferences(claim.references)
  ));
  // A reference written explicitly in the reader-facing answer is public even
  // when the model accidentally omitted it from its parallel references array.
  // Recover it only when the same verified reference already supports a
  // structured claim; this cannot introduce a new or invented citation.
  const explicitlyDisplayedReferences = explicitlyNamedScriptureReferences(draft.answer);
  for (const reference of explicitlyDisplayedReferences) {
    if (!evidenceForReference(packet.evidence, reference)) {
      errors.push(`Reader-facing reference ${reference} was not resolved from the locked Scripture corpus.`);
      continue;
    }
    if (claimSelectedReferences.has(reference) && !declaredReferences.includes(reference)) {
      declaredReferences = [...declaredReferences, reference];
    }
  }
  for (const reference of declaredReferences) {
    const expanded = expandAnswerReference(reference);
    const items = expanded.map((part) => evidenceForReference(packet.evidence, part));
    if (!expanded.length || items.some((item) => !item)) {
      errors.push(`Reference ${reference} was not resolved from the locked Scripture corpus.`);
    }
  }
  const materiallyUsedReferences = new Set<string>();
  const compoundClaimClauses = (claim: string) => claim
    .split(/\s*,\s+that\s+|\s*,?\s+and\s+that\s+/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const partiallyDisplayedClaims = claims.filter((claim) => {
    const clauses = compoundClaimClauses(claim.text);
    return clauses.length > 1 &&
      claimIsDisplayedInAnswer(packet.question, draft.answer, claim.text) &&
      !clauses.every((clause) => claimIsDisplayedInAnswer(packet.question, draft.answer, clause));
  });
  if (partiallyDisplayedClaims.length > 0) {
    errors.push("A compound structured claim is only partially represented in the reader-facing answer.");
  }
  const readerFacingClaims = new Set(
    claims.filter((claim) => {
      const clauses = compoundClaimClauses(claim.text);
      return claimIsDisplayedInAnswer(packet.question, draft.answer, claim.text) &&
        clauses.every((clause) => claimIsDisplayedInAnswer(packet.question, draft.answer, clause));
    }),
  );

  if (draft.status === "complete" && readerFacingClaims.size === 0) {
    errors.push("The reader-facing answer has no structured material claim supporting its displayed content.");
  }
  const samePersonQuestion = exactSamePersonQuestion(packet.question);
  if (
    draft.status === "complete" &&
    (draft.conclusion === "yes" || draft.conclusion === "no") &&
    samePersonQuestion &&
    !claims.some((claim) => claim.answerBearing === true && claimAddressesIdentityPair(claim.text, samePersonQuestion))
  ) {
    errors.push("The categorical identity conclusion is broader than the structured claims: no claim addresses the exact identity pair asked about.");
  }
  if (packet.reasoning.commandApplicability && membershipNormativeQuestion) {
    const askedAction = normativeActionConcept(membershipNormativeQuestion[2]);
    for (const claim of readerFacingClaims) {
      const assertedAction = assertedModalAction(claim.text);
      if (!assertedAction || normativeActionConcept(assertedAction) === askedAction) continue;
      const claimReferences = new Set(normalizeEmetAiSimpleReferences(claim.references));
      // A role or circumstance passage can state another action (for example,
      // who may approach) that supplies the stated basis for the action asked
      // about. Accept that only when a displayed synthesis explicitly states
      // the asked action and shares verified support with this claim.
      const hasDisplayedBridge = Array.from(readerFacingClaims).some((candidate) => {
        const candidateAction = assertedModalAction(candidate.text);
        if (!candidateAction || normativeActionConcept(candidateAction) !== askedAction) return false;
        return normalizeEmetAiSimpleReferences(candidate.references).some((reference) =>
          claimReferences.has(reference)
        );
      });
      const roleReferences = new Set(
        (packet.governingCoverage?.find((coverage) => coverage.componentId === "role-circumstance")?.evidenceIds || [])
          .flatMap((id) => {
            const reference = packet.evidence.find((item) => item.id === id)?.reference;
            return reference ? [reference] : [];
          }),
      );
      const claimConnectsRoleToAskedAction =
        Array.from(claimReferences).some((reference) => roleReferences.has(reference)) &&
        readerClaimTerms(claim.text).includes(askedAction) &&
        /\b(?:assign(?:s|ed)?|forbid(?:s|den)?|restrict(?:s|ed)?|unauthoriz\w*|only|but|not|priest\w*)\b/i.test(claim.text);
      if (!hasDisplayedBridge && !claimConnectsRoleToAskedAction) {
        errors.push("A reader-facing claim introduces a different modal action without establishing how it bears on the action asked.");
      }
    }
  }
  if (draft.status === "complete" && claims.length === 0) {
    errors.push("A complete answer requires structured material claims.");
  }
  for (const claim of claims) {
    const claimReferences = normalizeEmetAiSimpleReferences(claim.references);
    const publicClaimReferences = claimReferences.filter((reference) => declaredReferences.includes(reference));
    if (readerFacingClaims.has(claim) && publicClaimReferences.length === 0) {
      errors.push("A reader-facing material claim has no selected public citation.");
    }
    if (packet.foundationalIdentityContract && readerFacingClaims.has(claim)) {
      const missingPublicReferences = claimReferences.filter((reference) => !declaredReferences.includes(reference));
      if (missingPublicReferences.length > 0) {
        errors.push(`Reader-facing identity claim is missing required public citations: ${missingPublicReferences.join(", ")}.`);
      }
      const missingStructuredReferences = explicitlyNamedScriptureReferences(claim.text)
        .filter((reference) => !claimReferences.includes(reference));
      if (missingStructuredReferences.length > 0) {
        errors.push(`Reader-facing identity claim explicitly names references absent from its structured citations: ${missingStructuredReferences.join(", ")}.`);
      }
    }
    for (const reference of claimReferences) {
      if (!evidenceForReference(packet.evidence, reference)) {
        errors.push(`Claim reference ${reference} was not resolved from the final evidence packet.`);
      }
      if (readerFacingClaims.has(claim) && declaredReferences.includes(reference)) {
        materiallyUsedReferences.add(reference);
      }
    }
    // Exact project-governed statements already passed registry authority,
    // wording, and complete evidence-dependency checks above. A single-verse
    // designation heuristic cannot evaluate a reviewed synthesis that is
    // intentionally established across several bound passages.
    const unsupportedDesignations = claim.evidenceLevel === "project-governed-synthesis"
      ? []
      : unsupportedClaimDesignations(packet.question, claim);
    if (unsupportedDesignations.length > 0) {
      errors.push(`Claim designation is not supported by its attached excerpts: ${unsupportedDesignations.join(", ")}.`);
    }
    for (const excerpt of claim.excerpts) {
      const excerptReferences = normalizeEmetAiSimpleReferences([excerpt.reference]);
      if (!excerptReferences.length || excerptReferences.some((reference) => !claimReferences.includes(reference))) {
        errors.push(`Claim excerpt reference ${excerpt.reference} is not attached to the claim.`);
        continue;
      }
      const items = excerptReferences.map((reference) => evidenceForReferenceAndKind(packet.evidence, reference, excerpt.evidenceKind));
      if (items.some((item) => !item)) {
        errors.push(`Claim ${excerpt.evidenceKind} evidence at ${excerpt.reference} is absent from the final evidence packet.`);
      }
    }
  }

  const readerExcerptReferences = new Set(
    Array.from(readerFacingClaims).flatMap((claim) =>
      claim.excerpts.flatMap((excerpt) => normalizeEmetAiSimpleReferences([excerpt.reference]))
    ),
  );
  for (const reference of materiallyUsedReferences) {
    if (!readerExcerptReferences.has(reference)) {
      errors.push(`Public claim reference ${reference} has no attached verified excerpt.`);
    }
  }

  const expectedComponents = new Map(packet.reasoning.components.map((component) => [component.id, component]));
  const componentIds = componentChecks.map((check) => check.componentId);
  if (
    draft.status === "complete" &&
    (componentIds.length !== expectedComponents.size || new Set(componentIds).size !== componentIds.length || componentIds.some((id) => !expectedComponents.has(id)))
  ) {
    errors.push("Every required evidence component needs exactly one support assessment.");
  }
  for (const check of componentChecks) {
    const checkReferences = normalizeEmetAiSimpleReferences(check.references);
    const governing = packet.governingCoverage?.find((item) => item.componentId === check.componentId);
    const allowed = new Set((governing?.evidenceIds || []).flatMap((id) => {
      const reference = packet.evidence.find((item) => item.id === id)?.reference;
      return reference ? [reference] : [];
    }));
    if (!governing || allowed.size === 0) errors.push(`Component ${check.componentId} has no verified governing evidence in the final packet.`);
    for (const reference of checkReferences) {
      if (!packet.evidence.some((item) => item.reference === reference)) {
        errors.push(`Component reference ${reference} is absent from the final evidence packet.`);
      }
    }
  }
  if (
    packet.reasoning.commandApplicability &&
    ["yes", "qualified"].includes(draft.conclusion)
  ) {
    // A positive applicability synthesis depends materially on how the people
    // named in the question relate to the command's covenant recipients. The
    // premise must be a reader-facing material claim; internal component notes
    // cannot silently supply it or force their references into public citations.
    const verifiedMembershipReferences = (packet.governingCoverage?.find((coverage) =>
      coverage.componentId === "covenant-membership"
    )?.evidenceIds || []).flatMap((id) => {
      const reference = packet.evidence.find((item) => item.id === id)?.reference;
      return reference ? [reference] : [];
    });
    const membershipClaim = claims.find((claim) =>
      claimNamesAskedGroup(claim.text) &&
      normalizeEmetAiSimpleReferences(claim.references).some((reference) => verifiedMembershipReferences.includes(reference))
    );
    const membershipPremiseDisplayed = membershipClaim && (() => {
      if (readerFacingClaims.has(membershipClaim)) return true;
      const answerTerms = new Set(readerClaimTerms(draft.answer));
      const materialTerms = readerClaimTerms(membershipClaim.text)
        .filter((term) => !askedGroupTerms.includes(term));
      const overlap = materialTerms.filter((term) => answerTerms.has(term)).length;
      const hasPublicMembershipCitation = normalizeEmetAiSimpleReferences(membershipClaim.references)
        .some((reference) => declaredReferences.includes(reference));
      return claimNamesAskedGroup(membershipClaim.text) && hasPublicMembershipCitation &&
        overlap >= Math.min(2, materialTerms.length);
    })();
    if (verifiedMembershipReferences.length > 0 && !membershipPremiseDisplayed) {
      errors.push("A positive command-applicability synthesis leaves its covenant-membership premise outside the reader-facing reasoning.");
    }
  }
  if (claims.length) {
    const strongestClaim = Math.max(...claims.map((claim) => SUPPORT_RANK[claim.support]));
    if (SUPPORT_RANK[draft.conclusionSupport] > strongestClaim) {
      errors.push("The conclusion claims stronger support than any material claim assessment.");
    }
  }

  // Preserve displayed ranges while adapting to the full answer contract.
  explicitlyDisplayedReferences.filter((reference) => declaredReferences.includes(reference)).forEach((reference) => materiallyUsedReferences.add(reference));
  const normalizedReferences = declaredReferences.filter((reference) =>
    claimSelectedReferences.has(reference) || materiallyUsedReferences.has(reference)
  );
  const publicCitationLimit = Math.max(1, packet.responseDesign?.maxScriptureCitations || 8);
  const publicCitationCount = countScriptureCitationGroups(normalizedReferences);
  if (publicCitationCount > publicCitationLimit) {
    errors.push(`The reader-facing answer uses ${publicCitationCount} Scripture citations; its response design permits ${publicCitationLimit}.`);
  }
  const citations = normalizedReferences.flatMap((reference) => {
    const item = evidenceForReference(packet.evidence, reference);
    return item?.reference ? [{ evidenceId: item.id, reference: item.reference }] : [];
  });

  // A categorical negative applicability answer needs affirmative textual
  // support for the negative proposition itself. Silence, a different
  // predicate (for example, judging), or citations attached only to a positive
  // command cannot establish that the command does not apply.
  if (
    packet.reasoning.commandApplicability &&
    membershipNormativeQuestion &&
    packet.reasoning.components.some((component) => component.id === "duration-conditions") &&
    draft.conclusion === "no"
  ) {
    const ignored = new Set(["christian", "christians", "believer", "believers", "modern", "should", "supposed", "keep", "observe", "command", "commandment"]);
    const subjects = normalizedText(packet.question).split(" ").filter((term) => term.length > 3 && !ignored.has(term));
    const durationEvidenceReferences = new Set(
      (packet.governingCoverage?.find((coverage) => coverage.componentId === "duration-conditions")?.evidenceIds || [])
        .flatMap((id) => {
          const reference = packet.evidence.find((item) => item.id === id)?.reference;
          return reference ? [reference] : [];
        })
    );
    const hasExplicitNegativeBasis = claims.some((claim) =>
      ["explicit-statement", "strong-implication"].includes(claim.support) &&
      claim.excerpts.some((excerpt) => {
        if (!durationEvidenceReferences.has(excerpt.reference)) return false;
        if (excerpt.evidenceKind !== "scripture") return false;
        const text = normalizedText(excerpt.text);
        const namesSubject = subjects.length > 0 && subjects.some((term) => text.includes(term));
        const negatesApplicability = /\b(?:not|never|abolish(?:ed)?|ended?|ceased?|free from|no longer)\b/i.test(excerpt.text);
        const addressesRequiredAction = /\b(?:keep|observe|obey|required?|command(?:ed|ment)?|appl(?:y|ies|ied)|bind(?:ing)?)\b/i.test(excerpt.text);
        return namesSubject && negatesApplicability && addressesRequiredAction;
      })
    );
    const hasExplicitRoleRestriction = componentChecks.some((check) =>
      check.componentId === "role-circumstance" && ["explicit-statement", "strong-implication"].includes(check.support)
    );
    if (!hasExplicitNegativeBasis && !hasExplicitRoleRestriction) {
      errors.push("A categorical nonapplicability conclusion lacks explicit or strongly implicating textual support for that negative proposition.");
    }
  }

  const scriptureText = packet.evidence
    .filter((item) => item.kind === "scripture")
    .map((item) => normalizedText(item.text));
  for (const quote of scriptureQuotations(draft.answer)) {
    const normalizedQuote = normalizedText(quote);
    if (!scriptureText.some((text) => text.includes(normalizedQuote))) {
      errors.push(`Scripture quotation is not exact verified packet text: “${quote.slice(0, 80)}”.`);
    }
  }

  const lexicalEvidence = packet.evidence.filter((item) => item.kind === "lexical");
  const contextualMeaningClause = draft.answer.match(/\bin\s+(?:(?:that|this)\s+(?:verse|passage)|(?:[1-3]\s+)?[A-Z][A-Za-z]+(?:\s+[A-Za-z]+)*\s+\d+:\d+)\b[^.]{0,220}\bmeans?\b[^.]{0,220}/i)?.[0] || "";
  const contextualGlosses = Array.from(contextualMeaningClause.matchAll(/[“"]([^”"]{1,80})[”"]/g))
    .map((match) => match[1])
    .filter((gloss) => !/^(?:first|second|third)$/i.test(gloss));
  if (
    lexicalEvidence.length > 0 &&
    contextualGlosses.length > 0 &&
    !lexicalEvidence.some((item) => lexicalMeaningSupported(item.text, contextualGlosses.join(" ")))
  ) {
    errors.push("The contextual lexical gloss includes a meaning not present in the locked source-language evidence.");
  }

  if (
    lexicalEvidence.length > 0 &&
    /\bor\b/i.test(contextualMeaningClause) &&
    !/\b(?:broader|lexical\s+range|dictionary)\b/i.test(contextualMeaningClause)
  ) {
    errors.push("The answer conflates the word's contextual sense with alternative glosses from its broader lexical range.");
  }
  if (
    /\b(?:hebrew|greek|original[- ]language)\b/i.test(packet.question) &&
    lexicalEvidence.length > 0 &&
    draft.lexicalAnalyses.length === 0
  ) {
    errors.push("The requested source-language explanation omitted verified lexical analysis.");
  }
  for (const term of visibleSourceTerms(draft.answer)) {
    const directlyVerified = lexicalEvidence.some((item) => item.text.normalize("NFKC").includes(term));
    const phraseVerified = !directlyVerified && lexicalEvidence.some((item) => {
      if (!item.reference || !item.corpus || !["hebrew", "greek-nt", "lxx"].includes(item.corpus)) return false;
      return verifiedSourcePhraseAtReference({
        corpus: item.corpus as "hebrew" | "greek-nt" | "lxx",
        reference: item.reference,
        phrase: term,
      });
    });
    if (!directlyVerified && !phraseVerified) {
      errors.push(`Reader-facing source term ${term} has no verified lexical identity.`);
    }
  }
  for (const claim of draft.lexicalAnalyses) {
    const matching = lexicalEvidence.find((item) =>
      item.corpus === claim.corpus &&
      item.reference === claim.reference &&
      item.lexicalId?.split("+").includes(claim.lexicalId) &&
      normalizedText(item.text).includes(normalizedText(claim.lemma)) &&
      normalizedTransliteration(item.text).includes(normalizedTransliteration(claim.transliteration)) &&
      // Meaning prose may summarize a locked gloss. Identity, occurrence,
      // lemma, and transliteration must still match independently; the
      // canonical locked gloss remains in the evidence packet.
      (normalizedText(item.text).includes(normalizedText(claim.meaning)) ||
        lexicalMeaningSupported(item.text, claim.meaning))
    );
    if (!matching) errors.push(`Lexical claim ${claim.corpus}:${claim.lexicalId} is not verified at ${claim.reference}.`);
  }

  const causalMarker = /\b(?:because|since|as a result of|on the basis that|with (?:the )?result that|therefore|so that)\b/i;
  const evidenceCausalMarker = /\b(?:because|since|for|therefore|so that)\b/i;
  const displayedCausalRelations = Array.from(draft.answer.matchAll(/\b(?:because|since|as a result of|on the basis that|with (?:the )?result that|therefore|so that)\b[^.]{0,240}/gi))
    .map((match) => match[0]);
  if (
    displayedCausalRelations.length > 0 &&
    !displayedCausalRelations.every((relation) => Array.from(readerFacingClaims).some((claim) => {
      const claimStatesRelation = causalMarker.test(claim.text) || claim.support === "theological-synthesis";
      const citedTextStatesRelation = claim.excerpts.some((excerpt) =>
        excerpt.evidenceKind === "scripture" && evidenceCausalMarker.test(excerpt.text)
      );
      if (!claimStatesRelation && !citedTextStatesRelation) return false;
      const relationTerms = readerClaimTerms(relation);
      const claimTerms = new Set(readerClaimTerms(claim.text));
      const overlap = relationTerms.filter((term) => claimTerms.has(term)).length;
      return overlap >= Math.min(2, relationTerms.length);
    }))
  ) {
    errors.push("A reader-facing causal relationship is not represented by a cited structured claim or its cited text.");
  }

  const concreteError = validateEmetAiConcreteAnswer({
    question: packet.question,
    answer: draft.answer,
    evidence: packet.evidence,
  });
  if (concreteError) errors.push(concreteError);
  const framingError = validateEmetAiScriptureOnlyFraming({
    question: packet.question,
    answer: draft.answer,
  });
  if (framingError) errors.push(framingError);
  if (packet.reasoning.commandApplicability && usesOmissionAsNonApplicability(draft.answer)) {
    errors.push("The answer treats omission from a later list as evidence of repeal, exemption, or nonapplicability.");
  }

  return errors.length
    ? { ok: false, errors }
    : {
        ok: true,
        value: {
          ...draft,
          conclusion: draft.conclusion,
          references: normalizedReferences,
          citations,
        },
      };
}
