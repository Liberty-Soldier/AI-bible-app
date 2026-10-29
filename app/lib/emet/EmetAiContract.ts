import {
  validateEmetAiConcreteAnswer,
  validateEmetAiScriptureOnlyFraming,
} from "./EmetAiAnswerCompleteness";
import { extractEmetAiRequestedCoverage } from "./EmetAiRequestedCoverage";
import { isEmetAiCommandApplicabilityQuestion } from "./EmetAiResponseDesign";
import { validateEmetAiDirectAnswerPolarity } from "./EmetAiAnswerNormalization";
import { verifiedSourcePhraseAtReference } from "./EmetAiSourcePhrase";

export const EMET_AI_EVIDENCE_SCHEMA = "emet-ai-evidence@4" as const;
export const EMET_AI_ANSWER_SCHEMA = "emet-ai-answer@4" as const;
export const EMET_AI_PROMPT_VERSION = "scripture-first-fast@53-identity-authority1" as const;
export const EMET_AI_COVERAGE_VERSION = "deterministic-coverage@1" as const;

export type EmetAiCorpus = "hebrew" | "lxx" | "greek-nt" | "translation";
export type EmetAiScopeType = "word" | "verse" | "passage" | "topic";
export type EmetAiIdentityGate =
  | "verified"
  | "not-applicable"
  | "ambiguous"
  | "unresolved";

export type EmetAiReasoningMode =
  | "simple"
  | "doctrinal-claim"
  | "apparent-contradiction";

export type EmetAiClaimSupport =
  | "explicit-statement"
  | "strong-implication"
  | "theological-synthesis"
  | "possible-interpretation"
  | "does-not-establish";

export type EmetAiReasoningCategory =
  | "identity"
  | "authority"
  | "nature"
  | "relationship"
  | "practice"
  | "duration"
  | "command"
  | "covenant"
  | "covenant-participants"
  | "priesthood"
  | "mediator"
  | "sanctuary"
  | "sacrifice"
  | "promise"
  | "timing"
  | "prophecy"
  | "chronology"
  | "event"
  | "application"
  | "other";

export type EmetAiPropositionPolarity =
  | "affirms"
  | "denies"
  | "qualifies";

export type EmetAiTiming =
  | "not-applicable"
  | "promised"
  | "inaugurated"
  | "presently-operating"
  | "transitioning"
  | "fulfilled"
  | "awaiting-full-realization"
  | "uncertain";

export type EmetAiEstablishedProposition = {
  id: string;
  text: string;
  support: EmetAiClaimSupport;
  category: EmetAiReasoningCategory;
  polarity: EmetAiPropositionPolarity;
  scope: string;
  timing: EmetAiTiming;
  evidenceIds: string[];
};

export type EmetAiIdentityQuestionSense =
  | "father-personal-identity"
  | "divine-designation"
  | "yahweh-identification"
  | "passage-referent";

export type EmetAiIdentityEvidenceLevel =
  | "direct-scripture"
  | "contextual-inference"
  | "project-governed-synthesis";

export type EmetAiFoundationalIdentityContract = {
  version: "foundational-identity@1";
  senses: EmetAiIdentityQuestionSense[];
  propositions: Array<{
    id: string;
    text: string;
    support: "explicit-statement";
    evidenceLevel: "direct-scripture";
    evidenceReferences: string[];
    evidenceIds: string[];
  }>;
  termDistinctions: Array<{
    term: "Yahweh" | "God" | "Elohim" | "Father" | "Son" | "Lord" | "divine";
    meaning: string;
  }>;
  interpretations: Array<{
    id: string;
    text: string;
    evidenceLevel: Exclude<EmetAiIdentityEvidenceLevel, "direct-scripture">;
    basisIds: string[];
    evidenceReferences: string[];
    evidenceIds: string[];
  }>;
  answerRequirements: Array<{
    id: string;
    sense: EmetAiIdentityQuestionSense;
    authorityId: string;
    required: true;
    answerBearing: true;
  }>;
  acceptanceRules: string[];
};

export type EmetAiEvidenceItem = {
  id: string;
  kind:
    | "scripture"
    | "lexical"
    | "morphology"
    | "rendering"
    | "relationship"
    | "event"
    | "theme";
  corpus: EmetAiCorpus;
  text: string;
  reference?: string;
  entityId?: string;
  lexicalId?: string;
  provenance: {
    authority: string;
    sourceId?: string;
    checksum?: string;
    retrieval?: {
      method:
        | "explicit-reference"
        | "reader-context"
        | "exact-source-phrase"
        | "semantic-plan"
        | "literal-text-match"
        | "governing-scripture";
      role:
        | "direct"
        | "foundation"
        | "later-witness"
        | "qualifying"
        | "contrast"
        | "context";
      reason: string;
      score: number;
    };
  };
};

export type EmetAiEvidencePacket = {
  schemaVersion: typeof EMET_AI_EVIDENCE_SCHEMA;
  question: string;
  responseDesign?: {
    depth: "concise" | "standard" | "deep";
    targetMinWords: number;
    targetMaxWords: number;
    maxScriptureCitations: number;
    progressiveFollowUp: boolean;
  };
  reasoning: {
    mode: EmetAiReasoningMode;
    proposition: string;
    requiresScopeAnalysis: boolean;
    requiresTimeline: boolean;
    commandApplicability?: boolean;
    components: Array<{
      id: string;
      proposition: string;
      category: EmetAiReasoningCategory;
    }>;
    establishedPropositions: EmetAiEstablishedProposition[];
  };
  governingCoverage?: Array<{
    componentId: string;
    evidenceIds: string[];
  }>;
  scope: {
    type: EmetAiScopeType;
    references: string[];
    entityIds: string[];
  };
  requestedCoverage?: {
    version: typeof EMET_AI_COVERAGE_VERSION;
    passages: Array<{ id: string; label: string; references: string[] }>;
    competingInterpretations: boolean;
    comparisonPassages: Array<{
      reference: string;
      evidenceId: string;
    }>;
    language: Array<{
      id: string;
      corpora: Array<"hebrew" | "greek-nt">;
      subject: string;
      terms: Array<{
        corpus: "hebrew" | "greek-nt";
        lexicalId: string;
        lemma: string;
        transliteration: string;
        meaning: string;
      }>;
    }>;
    subquestions: Array<{ id: string; text: string }>;
  };
  identity: {
    gate: EmetAiIdentityGate;
    canonicalEntityId?: string;
    corpus?: Exclude<EmetAiCorpus, "translation">;
    lexicalId?: string;
    lemma?: string;
    morphology?: string;
  };
  foundationalIdentityContract?: EmetAiFoundationalIdentityContract;
  evidence: EmetAiEvidenceItem[];
  provenance: {
    evidenceVersion: string;
    builtAt: string;
  };
};

export type EmetAiClaim = {
  id: string;
  text: string;
  support: EmetAiClaimSupport;
  category: EmetAiReasoningCategory;
  polarity: EmetAiPropositionPolarity;
  scope: string;
  timing: EmetAiTiming;
  evidenceIds: string[];
};

export type EmetAiContinuityCheck = {
  propositionId: string;
  verdict: "preserved" | "narrowed" | "reconciled" | "unresolved-conflict";
  explanation: string;
  evidenceIds: string[];
};

export type EmetAiComponentCheck = {
  componentId: string;
  support: EmetAiClaimSupport;
  explanation: string;
  evidenceIds: string[];
};

export type EmetAiAnswer = {
  schemaVersion: typeof EMET_AI_ANSWER_SCHEMA;
  status: "complete" | "insufficient-evidence";
  answer: string;
  conclusionSupport: EmetAiClaimSupport;
  componentChecks: EmetAiComponentCheck[];
  claims: EmetAiClaim[];
  continuityChecks: EmetAiContinuityCheck[];
  citations: Array<{
    evidenceId: string;
    reference?: string;
  }>;
  limitations: string[];
};

export type EmetAiValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export type EmetAiValidationIssueKind =
  | "formatting"
  | "missing-essential-evidence"
  | "unsupported-claim"
  | "evidence-integrity"
  | "genuine-uncertainty";

export function classifyEmetAiValidationIssue(
  error: string,
): EmetAiValidationIssueKind {
  if (/schema|exactly one|unique non-empty|invalid scope|answer text is required|internal generation language|internal evidence selection/i.test(error)) {
    return "formatting";
  }
  if (/requested passage|requested .* analysis|comparison passage|each interpretation|concrete actions|concrete items|named multi-item list/i.test(error)) {
    return "missing-essential-evidence";
  }
  if (/quotation|source term|citation|unavailable evidence|requires evidence|unsupported|missing from citations/i.test(error)) {
    return "evidence-integrity";
  }
  if (/possible conclusion|does-not-establish|unresolved conflict|cannot receive stronger support/i.test(error)) {
    return "genuine-uncertainty";
  }
  return "unsupported-claim";
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedVisibleText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[“”‘’'"`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MEANINGFUL_COVERAGE_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "because", "been", "but", "by",
  "for", "from", "had", "has", "have", "he", "her", "him", "his", "i", "in",
  "is", "it", "its", "lord", "god", "messiah", "of", "on", "or", "said", "says",
  "scripture", "shall", "she", "that", "the", "their", "them", "there", "they",
  "this", "those", "to", "was", "were", "what", "when", "which", "who", "will",
  "with", "you", "your",
]);

function meaningfulCoverageTerms(value: string) {
  return Array.from(new Set(
    normalizedVisibleText(value)
      .split(" ")
      .filter((term) => term.length >= 4 && !MEANINGFUL_COVERAGE_STOP_WORDS.has(term)),
  ));
}

function readerMeaningfullyAddressesEvidence(answer: string, evidenceText: string) {
  const answerTerms = new Set(meaningfulCoverageTerms(answer));
  const evidenceTerms = meaningfulCoverageTerms(evidenceText);
  const requiredOverlap = Math.min(2, evidenceTerms.length);
  return requiredOverlap > 0 && evidenceTerms.filter((term) => answerTerms.has(term)).length >= requiredOverlap;
}

function expandedRequestedReferences(value: string) {
  const coverage = extractEmetAiRequestedCoverage(value);
  return coverage.passages.flatMap((passage) => {
    if (passage.startVerse === undefined) return [];
    const endVerse = passage.endVerse || passage.startVerse;
    return Array.from(
      { length: endVerse - passage.startVerse + 1 },
      (_, offset) => `${passage.book} ${passage.chapter}:${passage.startVerse! + offset}`,
    );
  });
}

function scriptureQuotations(value: string) {
  return Array.from(value.matchAll(/[“"]([^”"\n]{8,300})[”"]/g))
    .flatMap((match) => {
      const quote = match[1].trim();
      if (quote.split(/\s+/).length < 4) return [];
      const start = match.index || 0;
      const before = value.slice(Math.max(0, start - 90), start);
      const after = value.slice(start + match[0].length, start + match[0].length + 90);
      const attributedAsScripture =
        /\b(?:scripture|the\s+(?:text|verse|passage)|\w+\s+\d+:\d+)[^.]{0,70}\b(?:says?|said|writes?|wrote|declares?|reads?|answers?)\s*[:,]?\s*$/i.test(before) ||
        /^\s*(?:\([^)]*\b(?:[1-3]\s+)?[A-Z][A-Za-z]+\s+\d+:\d+)/.test(after);
      return attributedAsScripture ? [{ quote, before, after }] : [];
    });
}

function visibleSourceTerms(value: string) {
  return Array.from(value.matchAll(/[\u0590-\u05ff]+|[\u0370-\u03ff\u1f00-\u1fff]+/gu))
    .map((match) => match[0].normalize("NFKC"));
}

const claimSupports = new Set<EmetAiClaimSupport>([
  "explicit-statement",
  "strong-implication",
  "theological-synthesis",
  "possible-interpretation",
  "does-not-establish",
]);
const reasoningCategories = new Set<EmetAiReasoningCategory>([
  "identity", "authority", "nature", "relationship", "practice", "duration",
  "command", "covenant", "covenant-participants", "priesthood", "mediator",
  "sanctuary", "sacrifice", "promise", "timing", "prophecy", "chronology",
  "event", "application", "other",
]);
const propositionPolarities = new Set<EmetAiPropositionPolarity>([
  "affirms", "denies", "qualifies",
]);
const timings = new Set<EmetAiTiming>([
  "not-applicable", "promised", "inaugurated", "presently-operating",
  "transitioning", "fulfilled", "awaiting-full-realization", "uncertain",
]);
const continuityVerdicts = new Set<EmetAiContinuityCheck["verdict"]>([
  "preserved", "narrowed", "reconciled", "unresolved-conflict",
]);

const supportRank: Record<EmetAiClaimSupport, number> = {
  "does-not-establish": 0,
  "possible-interpretation": 1,
  "theological-synthesis": 2,
  "strong-implication": 3,
  "explicit-statement": 4,
};

function normalizedScope(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function uniqueNonEmpty(values: string[]) {
  return new Set(values.map((value) => value.trim()).filter(Boolean)).size ===
    values.length;
}

export function validateEmetAiEvidencePacket(
  packet: EmetAiEvidencePacket,
): EmetAiValidationResult<EmetAiEvidencePacket> {
  const errors: string[] = [];

  if (packet.schemaVersion !== EMET_AI_EVIDENCE_SCHEMA) {
    errors.push("Unsupported EMET evidence schema.");
  }

  if (!clean(packet.question)) {
    errors.push("The question is required.");
  }

  if (
    packet.responseDesign &&
    (
      !["concise", "standard", "deep"].includes(packet.responseDesign.depth) ||
      !Number.isInteger(packet.responseDesign.targetMinWords) ||
      !Number.isInteger(packet.responseDesign.targetMaxWords) ||
      packet.responseDesign.targetMinWords < 1 ||
      packet.responseDesign.targetMaxWords < packet.responseDesign.targetMinWords ||
      !Number.isInteger(packet.responseDesign.maxScriptureCitations) ||
      packet.responseDesign.maxScriptureCitations < 1 ||
      typeof packet.responseDesign.progressiveFollowUp !== "boolean"
    )
  ) {
    errors.push("The response-design contract is invalid.");
  }

  if (!clean(packet.reasoning?.proposition)) {
    errors.push("The proposition being tested is required.");
  }

  if (
    !["simple", "doctrinal-claim", "apparent-contradiction"].includes(
      packet.reasoning?.mode,
    )
  ) {
    errors.push("The reasoning mode is invalid.");
  }

  const componentIds = packet.reasoning?.components?.map((item) => clean(item.id)) || [];
  if (
    !Array.isArray(packet.reasoning?.components) ||
    componentIds.some((id) => !id) ||
    !uniqueNonEmpty(componentIds) ||
    packet.reasoning.components.some((item) => !clean(item.proposition))
  ) {
    errors.push("Reasoning components must be identified and non-empty.");
  }
  if (packet.governingCoverage) {
    const coverageIds = packet.governingCoverage.map((item) => item.componentId);
    if (
      !uniqueNonEmpty(coverageIds) ||
      coverageIds.some((id) => !componentIds.includes(id)) ||
      packet.governingCoverage.some((item) =>
        !item.evidenceIds.length ||
        item.evidenceIds.some((id) => !packet.evidence.some((evidence) => evidence.id === id)),
      )
    ) {
      errors.push("Every governing component must identify available verified evidence.");
    }
  }

  if (packet.requestedCoverage) {
    if (packet.requestedCoverage.version !== EMET_AI_COVERAGE_VERSION) {
      errors.push("Unsupported requested-coverage contract.");
    }
    const requirementIds = packet.requestedCoverage.subquestions.map((item) => item.id);
    if (!uniqueNonEmpty(requirementIds) || requirementIds.some((id) => !componentIds.includes(id))) {
      errors.push("Every requested coverage requirement must have a reasoning component.");
    }
    for (const passage of packet.requestedCoverage.passages) {
      if (!clean(passage.label) || !passage.references.length) {
        errors.push(`Requested passage ${passage.label || passage.id} could not be resolved from locked Scripture.`);
      }
      for (const reference of passage.references) {
        if (!packet.evidence.some((item) => item.kind === "scripture" && item.reference === reference)) {
          errors.push(`Requested passage reference ${reference} is missing from evidence.`);
        }
      }
    }
    for (const language of packet.requestedCoverage.language) {
      for (const corpus of language.corpora) {
        if (!packet.evidence.some((item) => item.kind === "lexical" && item.corpus === corpus)) {
          errors.push(`Requested ${corpus} analysis has no verified lexical evidence.`);
        }
        if (!language.terms.some((term) => term.corpus === corpus && clean(term.lemma) && clean(term.transliteration) && clean(term.meaning))) {
          errors.push(`Requested ${corpus} analysis has no verified reader-visible lexical term.`);
        }
      }
    }
    if (packet.requestedCoverage.competingInterpretations) {
      const comparisonIds = new Set(
        packet.requestedCoverage.comparisonPassages.map((item) => item.evidenceId),
      );
      const comparisonEvidence = packet.evidence.filter((item) =>
        comparisonIds.has(item.id),
      );
      if (
        !packet.evidence.some((item) => item.provenance.retrieval?.role === "contrast") ||
        !packet.evidence.some((item) =>
          item.provenance.retrieval?.role === "direct" ||
          item.provenance.retrieval?.role === "foundation" ||
          item.provenance.retrieval?.role === "later-witness"
        )
      ) {
        errors.push("A requested comparison requires verified supporting and contrasting Scripture evidence.");
      }
      if (
        packet.requestedCoverage.comparisonPassages.some((item) =>
          !item.reference || !item.evidenceId ||
          !comparisonEvidence.some((evidence) =>
            evidence.id === item.evidenceId && evidence.reference === item.reference
          )
        )
      ) {
        errors.push("A required comparison passage is missing from locked Scripture evidence.");
      }
    }
  }

  if (
    typeof packet.reasoning?.requiresScopeAnalysis !== "boolean" ||
    typeof packet.reasoning?.requiresTimeline !== "boolean"
  ) {
    errors.push("Reasoning scope and timeline requirements must be explicit.");
  }

  if (
    packet.reasoning.components.some(
      (item) => !reasoningCategories.has(item.category),
    )
  ) {
    errors.push("A reasoning component uses an invalid category.");
  }

  const establishedIds = packet.reasoning?.establishedPropositions?.map(
    (item) => clean(item.id),
  ) || [];
  if (
    !Array.isArray(packet.reasoning?.establishedPropositions) ||
    establishedIds.some((id) => !id) ||
    !uniqueNonEmpty(establishedIds)
  ) {
    errors.push("Established propositions must have unique non-empty IDs.");
  } else {
    const availableEvidenceIds = new Set(packet.evidence.map((item) => item.id));
    for (const proposition of packet.reasoning.establishedPropositions) {
      if (
        !clean(proposition.text) ||
        !claimSupports.has(proposition.support) ||
        !reasoningCategories.has(proposition.category) ||
        !propositionPolarities.has(proposition.polarity) ||
        !clean(proposition.scope) ||
        !timings.has(proposition.timing) ||
        !proposition.evidenceIds.length ||
        proposition.evidenceIds.some((id) => !availableEvidenceIds.has(id))
      ) {
        errors.push(`Established proposition ${proposition.id || "<missing>"} is not re-established by current evidence.`);
      }
      if (
        proposition.support !== "explicit-statement" &&
        proposition.support !== "strong-implication"
      ) {
        errors.push(`Established proposition ${proposition.id} is too inferential to constrain later answers.`);
      }
    }
  }

  if (packet.scope.type === "word") {
    if (packet.identity.gate !== "verified") {
      errors.push(
        "Word questions require one verified canonical lexical identity.",
      );
    }

    if (
      !clean(packet.identity.canonicalEntityId) ||
      !clean(packet.identity.lexicalId) ||
      !packet.identity.corpus
    ) {
      errors.push(
        "A verified word identity requires its entity, lexical ID, and corpus.",
      );
    }

    if (
      packet.identity.canonicalEntityId &&
      !packet.scope.entityIds.includes(packet.identity.canonicalEntityId)
    ) {
      errors.push("The canonical lexical entity is absent from the scope.");
    }
  }

  if (packet.scope.type !== "word" && packet.identity.gate === "verified") {
    if (!clean(packet.identity.canonicalEntityId)) {
      errors.push("A verified identity must include its canonical entity ID.");
    }
  }

  if (packet.foundationalIdentityContract) {
    const identityContract = packet.foundationalIdentityContract;
    const availableEvidenceIds = new Set(packet.evidence.map((item) => item.id));
    const propositionIds = identityContract.propositions.map((item) => clean(item.id));
    const interpretationIds = identityContract.interpretations.map((item) => clean(item.id));
    const contractStatementIds = new Set([...propositionIds, ...interpretationIds]);
    const answerRequirements = identityContract.answerRequirements || [];
    const answerRequirementIds = answerRequirements.map((item) => clean(item.id));
    if (
      identityContract.version !== "foundational-identity@1" ||
      identityContract.senses.length === 0 ||
      identityContract.propositions.length === 0 ||
      propositionIds.some((id) => !id) ||
      !uniqueNonEmpty(propositionIds) ||
      interpretationIds.some((id) => !id) ||
      !uniqueNonEmpty(interpretationIds) ||
      answerRequirementIds.some((id) => !id) ||
      !uniqueNonEmpty(answerRequirementIds) ||
      identityContract.termDistinctions.length === 0 ||
      identityContract.acceptanceRules.length === 0
    ) {
      errors.push("The foundational identity contract is incomplete or has an unsupported version.");
    }
    for (const proposition of identityContract.propositions) {
      const resolvedReferences = proposition.evidenceIds.flatMap((id) => {
        const reference = packet.evidence.find((item) => item.id === id)?.reference;
        return reference ? [reference] : [];
      });
      if (
        !clean(proposition.text) ||
        proposition.support !== "explicit-statement" ||
        proposition.evidenceLevel !== "direct-scripture" ||
        proposition.evidenceIds.length === 0 ||
        proposition.evidenceIds.some((id) => !availableEvidenceIds.has(id)) ||
        proposition.evidenceReferences.length !== resolvedReferences.length ||
        proposition.evidenceReferences.some((reference) => !resolvedReferences.includes(reference))
      ) {
        errors.push(`Foundational identity proposition ${proposition.id || "<missing>"} is not backed by verified packet evidence.`);
      }
    }
    for (const interpretation of identityContract.interpretations) {
      const resolvedReferences = interpretation.evidenceIds.flatMap((id) => {
        const reference = packet.evidence.find((item) => item.id === id)?.reference;
        return reference ? [reference] : [];
      });
      if (
        !clean(interpretation.text) ||
        (interpretation.evidenceLevel !== "contextual-inference" &&
          interpretation.evidenceLevel !== "project-governed-synthesis") ||
        interpretation.basisIds.length === 0 ||
        interpretation.basisIds.some((id) => !contractStatementIds.has(id)) ||
        interpretation.evidenceIds.length === 0 ||
        interpretation.evidenceIds.some((id) => !availableEvidenceIds.has(id)) ||
        interpretation.evidenceReferences.length !== resolvedReferences.length ||
        interpretation.evidenceReferences.some((reference) => !resolvedReferences.includes(reference))
      ) {
        errors.push(`Foundational identity interpretation ${interpretation.id || "<missing>"} is not traceable to its stated premise and verified packet evidence.`);
      }
    }
    if (
      identityContract.senses.some((sense) => sense === "divine-designation" || sense === "father-personal-identity" || sense === "yahweh-identification") &&
      answerRequirements.length === 0
    ) {
      errors.push("The foundational identity contract is missing typed answer requirements for its identity sense.");
    }
    for (const requirement of answerRequirements) {
      if (
        !identityContract.senses.includes(requirement.sense) ||
        !contractStatementIds.has(requirement.authorityId) ||
        requirement.required !== true ||
        requirement.answerBearing !== true
      ) {
        errors.push(`Foundational identity answer requirement ${requirement.id || "<missing>"} is not bound to an available typed authority.`);
      }
    }
  }

  if (packet.evidence.length === 0) {
    errors.push("No evidence is available for generation.");
  }

  const evidenceIds = packet.evidence.map((item) => clean(item.id));
  if (evidenceIds.some((id) => !id) || !uniqueNonEmpty(evidenceIds)) {
    errors.push("Evidence IDs must be non-empty and unique.");
  }

  for (const item of packet.evidence) {
    if (!clean(item.text)) {
      errors.push(`Evidence ${item.id || "<missing>"} has no content.`);
    }

    if (!clean(item.provenance?.authority)) {
      errors.push(`Evidence ${item.id || "<missing>"} has no authority.`);
    }

    if (item.provenance.retrieval) {
      if (!clean(item.provenance.retrieval.reason)) {
        errors.push(`Evidence ${item.id} has no retrieval reason.`);
      }
      if (
        !Number.isFinite(item.provenance.retrieval.score) ||
        item.provenance.retrieval.score < 0 ||
        item.provenance.retrieval.score > 100
      ) {
        errors.push(`Evidence ${item.id} has an invalid retrieval score.`);
      }
    }

    if (
      item.entityId &&
      !packet.scope.entityIds.includes(item.entityId)
    ) {
      errors.push(`Evidence ${item.id} uses an entity outside the scope.`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: packet };
}

export function validateEmetAiAnswer(
  packet: EmetAiEvidencePacket,
  answer: EmetAiAnswer,
): EmetAiValidationResult<EmetAiAnswer> {
  const errors: string[] = [];
  const packetValidation = validateEmetAiEvidencePacket(packet);

  if (!packetValidation.ok) {
    errors.push(...packetValidation.errors);
  }

  if (answer.schemaVersion !== EMET_AI_ANSWER_SCHEMA) {
    errors.push("Unsupported EMET answer schema.");
  }

  if (!clean(answer.answer)) {
    errors.push("The answer text is required.");
  }
  const directAnswerPolarityError = validateEmetAiDirectAnswerPolarity(
    packet.question.split(/\n\nResolved retrieval subject/)[0],
    answer,
  );
  if (directAnswerPolarityError) errors.push(directAnswerPolarityError);
  if (
    /\b(?:the|this|a)?\s*(?:draft|packet|prompt|system instruction|model output|evidence packet)\b/i.test(
      answer.answer,
    )
  ) {
    errors.push("The reader-facing answer exposes internal generation language.");
  }
  if (
    /\b(?:the\s+)?(?:supplied|provided)\s+(?:passages|texts|evidence)\b|\bthis\s+(?:scripture|evidence)\s+set\b/i.test(
      answer.answer,
    )
  ) {
    errors.push("The reader-facing answer describes the internal evidence selection instead of speaking naturally from Scripture.");
  }
  if (
    /(?:scripture|lexical|morphology):[A-Za-z0-9._:-]+/i.test(answer.answer)
  ) {
    errors.push("The reader-facing answer exposes an internal evidence identifier.");
  }
  if (
    packet.evidence.some((item) => item.kind === "scripture" && item.reference === "Ecclesiastes 12:13") &&
    /\bduty\b/i.test(answer.answer) &&
    !/\b(?:english\s+)?(?:translation|rendering)\b[^.]{0,100}\b(?:supplies|uses|renders?)\b[^.]{0,60}\bduty\b|\bduty\b[^.]{0,100}\b(?:supplied|translation|rendering)\b|\bsupplied\s+english\s+word\s+duty\b/i.test(answer.answer)
  ) {
    errors.push("Ecclesiastes 12:13 may use “duty” as identified English rendering language, but not as though it were a distinct Hebrew noun.");
  }

  if (answer.status === "complete") {
    const concreteAnswerError = validateEmetAiConcreteAnswer({
      question: packet.question,
      answer: answer.answer,
      evidence: packet.evidence,
    });
    if (concreteAnswerError) errors.push(concreteAnswerError);
    const scriptureOnlyError = validateEmetAiScriptureOnlyFraming({
      question: packet.question,
      answer: answer.answer,
    });
    if (scriptureOnlyError) errors.push(scriptureOnlyError);
    const answerUsesHebrew = /[\u0590-\u05ff]/u.test(answer.answer);
    const answerUsesGreek = /[\u0370-\u03ff\u1f00-\u1fff]/u.test(answer.answer);
    if (
      answerUsesHebrew &&
      !packet.evidence.some((item) => item.kind === "lexical" && item.corpus === "hebrew")
    ) {
      errors.push("Reader-facing Hebrew requires verified Hebrew lexical evidence.");
    }
    if (
      answerUsesGreek &&
      !packet.evidence.some((item) => item.kind === "lexical" && ["greek-nt", "lxx"].includes(item.corpus || ""))
    ) {
      errors.push("Reader-facing Greek requires verified Greek lexical evidence.");
    }
  }

  if (!claimSupports.has(answer.conclusionSupport)) {
    errors.push("The full proposition requires a valid support classification.");
  }

  const allowedEvidence = new Map(
    packet.evidence.map((item) => [item.id, item] as const),
  );
  const citedEvidenceIds = new Set<string>();

  for (const citation of answer.citations) {
    const item = allowedEvidence.get(citation.evidenceId);
    if (!item) {
      errors.push(`Citation ${citation.evidenceId} is not in the packet.`);
      continue;
    }

    if (citation.reference && citation.reference !== item.reference) {
      errors.push(
        `Citation ${citation.evidenceId} changes its supplied reference.`,
      );
    }

    citedEvidenceIds.add(citation.evidenceId);
  }

  const scriptureByReference = new Map<string, string[]>();
  for (const item of packet.evidence) {
    if (item.kind !== "scripture" || !item.reference) continue;
    const ids = scriptureByReference.get(item.reference) || [];
    ids.push(item.id);
    scriptureByReference.set(item.reference, ids);
  }
  for (const reference of expandedRequestedReferences(answer.answer)) {
    const evidenceIds = scriptureByReference.get(reference) || [];
    if (!evidenceIds.length) {
      errors.push(`Reader-facing reference ${reference} is not in the verified evidence packet.`);
    } else if (!evidenceIds.some((id) => citedEvidenceIds.has(id))) {
      errors.push(`Reader-facing reference ${reference} is missing from structured citations.`);
    }
  }

  const normalizedScripture = packet.evidence
    .filter((item) => item.kind === "scripture")
    .map((item) => normalizedVisibleText(item.text));
  for (const { quote } of scriptureQuotations(answer.answer)) {
    const segments = quote
      .split(/(?:\.{3}|…)/)
      .map(normalizedVisibleText)
      .filter((segment) => segment.split(/\s+/).length >= 2);
    if (
      !segments.length ||
      !normalizedScripture.some((text) => segments.every((segment) => text.includes(segment)))
    ) {
      errors.push(`Reader-facing Scripture quotation is not exact verified packet text: “${quote.slice(0, 80)}”.`);
    }
  }

  const verifiedSourceTerms = new Set(
    [
      ...(packet.identity.gate === "verified" && packet.identity.lemma
        ? [packet.identity.lemma]
        : []),
      ...packet.evidence
        .filter((item) => item.kind === "lexical")
        .flatMap((item) => visibleSourceTerms(item.text)),
      ...(packet.requestedCoverage?.language || [])
        .flatMap((requirement) => requirement.terms)
        .map((term) => term.lemma),
    ].flatMap(visibleSourceTerms),
  );
  for (const term of visibleSourceTerms(answer.answer)) {
    const phraseVerified = !verifiedSourceTerms.has(term) && packet.evidence.some((item) =>
      item.kind === "lexical" && item.reference && ["hebrew", "greek-nt", "lxx"].includes(item.corpus) &&
      verifiedSourcePhraseAtReference({
        corpus: item.corpus as "hebrew" | "greek-nt" | "lxx",
        reference: item.reference,
        phrase: term,
      })
    );
    if (!verifiedSourceTerms.has(term) && !phraseVerified) {
      errors.push(`Reader-facing source term ${term} has no exact verified lexical identity in the packet.`);
    }
  }

  if (answer.status === "complete") {
    if (answer.claims.length === 0) {
      errors.push("A complete answer requires at least one supported claim.");
    }

    if (answer.citations.length === 0) {
      errors.push("A complete answer requires evidence citations.");
    }
    const components = new Map(
      packet.reasoning.components.map((item) => [item.id, item]),
    );
    const componentCheckIds = answer.componentChecks.map(
      (item) => item.componentId,
    );
    if (
      componentCheckIds.some((id) => !components.has(id)) ||
      new Set(componentCheckIds).size !== componentCheckIds.length ||
      components.size !== componentCheckIds.length
    ) {
      errors.push("Every proposition component requires exactly one component check.");
    }

    for (const check of answer.componentChecks) {
      if (
        !claimSupports.has(check.support) ||
        !clean(check.explanation) ||
        !check.evidenceIds.length ||
        check.evidenceIds.some((id) => !allowedEvidence.has(id))
      ) {
        errors.push(`Component check ${check.componentId || "<missing>"} is invalid or unsupported.`);
      }
      const governing = packet.governingCoverage?.find(
        (item) => item.componentId === check.componentId,
      );
      const materiallyUsedEvidence = new Set([
        ...check.evidenceIds,
        ...answer.claims.flatMap((claim) => claim.evidenceIds),
      ]);
      if (
        governing &&
        !governing.evidenceIds.some((id) => materiallyUsedEvidence.has(id))
      ) {
        errors.push(`Answer component ${check.componentId} does not use its governing Scripture evidence.`);
      }
    }

    if (packet.requestedCoverage) {
      const meaningfullyUsedEvidenceIds = new Set([
        ...answer.componentChecks.flatMap((item) => item.evidenceIds),
        ...answer.claims.flatMap((item) => item.evidenceIds),
      ]);
      for (const passage of packet.requestedCoverage.passages) {
        const requiredEvidence = packet.evidence
          .filter((item) => item.kind === "scripture" && item.reference && passage.references.includes(item.reference))
        const requiredEvidenceIds = requiredEvidence.map((item) => item.id);
        const meaningfullyCovered = passage.label.includes(":")
          ? requiredEvidenceIds.every((id) =>
              meaningfullyUsedEvidenceIds.has(id) && citedEvidenceIds.has(id),
            )
          : requiredEvidenceIds.some((id) =>
              meaningfullyUsedEvidenceIds.has(id) && citedEvidenceIds.has(id),
            );
        if (!meaningfullyCovered) {
          errors.push(`Requested passage ${passage.label} must be retrieved, cited, and meaningfully discussed.`);
        }
        // A specifically requested range (for example Colossians 2:16-17)
        // requires visible treatment of each verse. A chapter-level request
        // may be answered by grouping its material passages and must not turn
        // every retrieved contextual verse into a separate prose obligation.
        if (passage.label.includes(":") && passage.references.length > 1) {
          for (const evidence of requiredEvidence) {
            if (
              evidence.reference &&
              !readerMeaningfullyAddressesEvidence(answer.answer, evidence.text)
            ) {
              errors.push(`Requested verse ${evidence.reference} is retrieved and cited but not substantively addressed in the reader-facing answer.`);
            }
          }
        }
      }
      for (const language of packet.requestedCoverage.language) {
        const lexicalIdsByCorpus = language.corpora.map((corpus) => packet.evidence
          .filter((item) => item.kind === "lexical" && item.corpus === corpus)
          .map((item) => item.id));
        if (
          lexicalIdsByCorpus.some((ids) => !ids.length) ||
          lexicalIdsByCorpus.some((ids) => !ids.some((id) => meaningfullyUsedEvidenceIds.has(id))) ||
          lexicalIdsByCorpus.some((ids) => !ids.some((id) => citedEvidenceIds.has(id)))
        ) {
          errors.push(`Requested ${language.corpora.join(" and ")} analysis requires verified lexical evidence and contextual discussion.`);
        }
        for (const corpus of language.corpora) {
          const terms = language.terms.filter((term) => term.corpus === corpus);
          const displaysVerifiedTerm = terms.some((term) =>
            answer.answer.includes(term.lemma) &&
            answer.answer.toLocaleLowerCase("en-US").includes(term.transliteration.toLocaleLowerCase("en-US")),
          );
          if (!displaysVerifiedTerm) {
            errors.push(`The reader-facing answer must name a verified ${corpus} source word and transliteration.`);
          }
        }
      }
      if (packet.requestedCoverage.competingInterpretations) {
        const contrastEvidenceIds = packet.evidence
          .filter((item) => item.provenance.retrieval?.role === "contrast")
          .map((item) => item.id);
        const supportingEvidenceIds = packet.evidence
          .filter((item) => ["direct", "foundation", "later-witness"].includes(item.provenance.retrieval?.role || ""))
          .map((item) => item.id);
        if (
          !contrastEvidenceIds.some((id) => meaningfullyUsedEvidenceIds.has(id) && citedEvidenceIds.has(id)) ||
          !supportingEvidenceIds.some((id) => meaningfullyUsedEvidenceIds.has(id) && citedEvidenceIds.has(id))
        ) {
          errors.push("A requested comparison must meaningfully discuss and cite verified evidence associated with each interpretation.");
        }
        for (const passage of packet.requestedCoverage.comparisonPassages) {
          if (
            !meaningfullyUsedEvidenceIds.has(passage.evidenceId) ||
            !citedEvidenceIds.has(passage.evidenceId)
          ) {
            errors.push(`Comparison passage ${passage.reference} must be cited and meaningfully discussed.`);
          }
        }
      }
    }

    if (answer.claims.length) {
      const strongestClaim = Math.max(
        ...answer.claims.map((item) => supportRank[item.support]),
      );
      if (supportRank[answer.conclusionSupport] > strongestClaim) {
        errors.push(
          "The full proposition claims stronger support than any material claim assessment.",
        );
      }
    }

    const claimIds = answer.claims.map((claim) => clean(claim.id));
    if (claimIds.some((id) => !id) || !uniqueNonEmpty(claimIds)) {
      errors.push("Answer claims require unique non-empty proposition IDs.");
    }

    for (const claim of answer.claims) {
      if (!clean(claim.text)) {
        errors.push("Every claim must contain text.");
      }

      if (!claimSupports.has(claim.support)) {
        errors.push("Every claim requires a valid support classification.");
      }

      if (
        !reasoningCategories.has(claim.category) ||
        !propositionPolarities.has(claim.polarity) ||
        !clean(claim.scope) ||
        !timings.has(claim.timing)
      ) {
        errors.push(`Claim ${claim.id || "<missing>"} has invalid scope, category, polarity, or timing.`);
      }

      if (claim.evidenceIds.length === 0) {
        errors.push("Every complete-answer claim requires evidence.");
      }

      for (const evidenceId of claim.evidenceIds) {
        if (!allowedEvidence.has(evidenceId)) {
          errors.push(`Claim cites unavailable evidence ${evidenceId}.`);
        } else if (!citedEvidenceIds.has(evidenceId)) {
          errors.push(`Claim evidence ${evidenceId} is missing from citations.`);
        }
      }
    }

    const established = new Map(
      packet.reasoning.establishedPropositions.map((item) => [item.id, item]),
    );
    const continuityIds = answer.continuityChecks.map((item) => item.propositionId);
    if (
      continuityIds.some((id) => !established.has(id)) ||
      new Set(continuityIds).size !== continuityIds.length ||
      established.size !== continuityIds.length
    ) {
      errors.push("Every established proposition requires exactly one continuity check.");
    }

    for (const check of answer.continuityChecks) {
      if (
        !continuityVerdicts.has(check.verdict) ||
        !clean(check.explanation) ||
        !check.evidenceIds.length ||
        check.evidenceIds.some((id) => !allowedEvidence.has(id))
      ) {
        errors.push(`Continuity check ${check.propositionId || "<missing>"} is invalid or unsupported.`);
      }
      if (check.verdict === "unresolved-conflict") {
        errors.push(`Established proposition ${check.propositionId} has an unresolved conflict.`);
      }
    }

    for (const claim of answer.claims) {
      for (const proposition of established.values()) {
        const sameDomain =
          claim.category === proposition.category &&
          normalizedScope(claim.scope) === normalizedScope(proposition.scope);
        const opposite =
          (claim.polarity === "affirms" && proposition.polarity === "denies") ||
          (claim.polarity === "denies" && proposition.polarity === "affirms");
        if (!sameDomain || !opposite) continue;
        const check = answer.continuityChecks.find(
          (item) => item.propositionId === proposition.id,
        );
        if (!check || check.verdict !== "reconciled") {
          errors.push(`Claim ${claim.id} contradicts established proposition ${proposition.id} without reconciliation.`);
        }
        if (
          proposition.support === "explicit-statement" &&
          claim.support !== "explicit-statement"
        ) {
          errors.push(`Claim ${claim.id} uses lower-level inference against explicit proposition ${proposition.id}.`);
        }
      }
    }

    if (packet.reasoning.mode !== "simple") {
      const hasContinuityQuestion = packet.reasoning.components.some(
        (component) =>
          component.category === "command" ||
          component.category === "duration" ||
          component.category === "application",
      );
      const commandApplicability = packet.reasoning.commandApplicability ??
        isEmetAiCommandApplicabilityQuestion(packet.question);
      const absenceAsNonApplicability =
        /\b(?:this|the|supplied|available|current|limited)\s+(?:scripture\s+)?evidence\b[^.]{0,100}\b(?:does not|doesn['’]t|cannot|can['’]t)\s+(?:explicitly\s+|directly\s+)?establish\b[^.]{0,180}\b(?:categorical\s+)?(?:new testament|later scripture|apostolic)\s+(?:command|requirement|obligation|mandate)\b/i.test(answer.answer) ||
        /\b(?:no|without)\s+(?:explicit\s+|direct\s+|categorical\s+)?(?:new testament|later scripture|apostolic)\s+(?:command|restatement|repetition|requirement|mandate)\b[^.]{0,140}\b(?:not|required|binding|obligat|need not|does not apply)/i.test(answer.answer);
      if (
        hasContinuityQuestion &&
        (/\b(?:the\s+)?(?:new testament|later scripture|later passages)\b[^.]{0,120}(?:do not|does not|did not)\s+(?:explicitly\s+|directly\s+)?(?:say|state|restate|repeat|establish)\b[^.]{0,220}\b(?:modern christians?|new covenant believers?|believers?)\b[^.]{0,120}\b(?:obligat|required|must|binding)/i.test(
          answer.answer,
        ) ||
          /(?:do not|does not|did not)\s+(?:explicitly\s+|directly\s+)?establish\b[^.]{0,220}\b(?:modern christians?|new covenant believers?|believers?)\b[^.]{0,120}\b(?:obligat|required|must|binding)/i.test(
          answer.answer,
        ) ||
          /\b(?:not|no longer)\s+(?:placed\s+)?under\s+(?:the\s+)?law of moses\b[^.]{0,160}\b(?:binding|administration|code)/i.test(
            answer.answer,
          ) ||
          /\b(?:apostolic\s+)?(?:list|decree)\b[^.]{0,160}\b(?:does not|did not|no)\b[^.]{0,100}\b(?:include|mention|require|burden)\b[^.]{0,100}\b(?:therefore|so|thus|not|required|binding|obligat)/i.test(
            answer.answer,
          ) ||
          /\bacts\s+15\b[^.]{0,160}\b(?:places?|put|imposes?)\s+no\b[^.]{0,80}\b(?:sabbath|law|torah)\b[^.]{0,80}\b(?:burden|requirement|obligation)/i.test(
            answer.answer,
          ) ||
          /\b(?:same|original)\s+covenant(?:al)?\s+(?:form|way|setting)\b/i.test(
            answer.answer,
          ) ||
          (commandApplicability && absenceAsNonApplicability))
      ) {
        errors.push(
          "The answer replaces governing continuity evidence with a modern-audience or covenant-code restatement test.",
        );
      }
      if (
        (answer.conclusionSupport === "possible-interpretation" ||
          answer.conclusionSupport === "does-not-establish") &&
        /^\s*(yes|no)\s*[.!,:;-]/i.test(answer.answer)
      ) {
        errors.push(
          "An unestablished or merely possible conclusion cannot begin with a categorical yes or no.",
        );
      }
      if (
        answer.conclusionSupport !== "explicit-statement" &&
        /\b(?:scripture|the bible|these passages|these texts|the passages|the texts|the evidence)\s+(?:clearly\s+|directly\s+)?(?:proves?|proved)\b|\b(?:is|was|has been)\s+proven\b/i.test(
          answer.answer,
        )
      ) {
        errors.push(
          "A disputed claim cannot use proof language without an explicit statement.",
        );
      }
    }
  }

  if (
    packet.scope.type === "word" &&
    packet.identity.gate !== "verified" &&
    answer.status !== "insufficient-evidence"
  ) {
    errors.push("An uncertain word identity must fail closed.");
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: answer };
}

export function insufficientEmetAiAnswer(
  explanation: string,
  limitations: string[] = [],
): EmetAiAnswer {
  return {
    schemaVersion: EMET_AI_ANSWER_SCHEMA,
    status: "insufficient-evidence",
    answer: explanation,
    conclusionSupport: "does-not-establish",
    claims: [],
    componentChecks: [],
    continuityChecks: [],
    citations: [],
    limitations,
  };
}

export function parseEmetAiAnswer(value: unknown): EmetAiAnswer | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== EMET_AI_ANSWER_SCHEMA ||
    (candidate.status !== "complete" &&
      candidate.status !== "insufficient-evidence") ||
    typeof candidate.answer !== "string" ||
    !claimSupports.has(candidate.conclusionSupport as EmetAiClaimSupport) ||
    !Array.isArray(candidate.claims) ||
    !Array.isArray(candidate.componentChecks) ||
    !Array.isArray(candidate.continuityChecks) ||
    !Array.isArray(candidate.citations) ||
    !Array.isArray(candidate.limitations)
  ) {
    return null;
  }

  const claims: EmetAiClaim[] = [];
  for (const value of candidate.claims) {
    if (!value || typeof value !== "object") return null;
    const claim = value as Record<string, unknown>;
    if (
      typeof claim.id !== "string" ||
      typeof claim.text !== "string" ||
      (claim.support !== "explicit-statement" &&
        claim.support !== "strong-implication" &&
        claim.support !== "theological-synthesis" &&
        claim.support !== "possible-interpretation" &&
        claim.support !== "does-not-establish") ||
      !reasoningCategories.has(claim.category as EmetAiReasoningCategory) ||
      !propositionPolarities.has(claim.polarity as EmetAiPropositionPolarity) ||
      typeof claim.scope !== "string" ||
      !timings.has(claim.timing as EmetAiTiming) ||
      !Array.isArray(claim.evidenceIds) ||
      claim.evidenceIds.some((id) => typeof id !== "string")
    ) {
      return null;
    }
    claims.push({
      id: claim.id as string,
      text: claim.text,
      support: claim.support,
      category: claim.category as EmetAiReasoningCategory,
      polarity: claim.polarity as EmetAiPropositionPolarity,
      scope: claim.scope as string,
      timing: claim.timing as EmetAiTiming,
      evidenceIds: claim.evidenceIds as string[],
    });
  }

  const componentChecks: EmetAiComponentCheck[] = [];
  for (const value of candidate.componentChecks) {
    if (!value || typeof value !== "object") return null;
    const check = value as Record<string, unknown>;
    if (
      typeof check.componentId !== "string" ||
      !claimSupports.has(check.support as EmetAiClaimSupport) ||
      typeof check.explanation !== "string" ||
      !Array.isArray(check.evidenceIds) ||
      check.evidenceIds.some((id) => typeof id !== "string")
    ) return null;
    componentChecks.push({
      componentId: check.componentId,
      support: check.support as EmetAiClaimSupport,
      explanation: check.explanation,
      evidenceIds: check.evidenceIds as string[],
    });
  }

  const continuityChecks: EmetAiContinuityCheck[] = [];
  for (const value of candidate.continuityChecks) {
    if (!value || typeof value !== "object") return null;
    const check = value as Record<string, unknown>;
    if (
      typeof check.propositionId !== "string" ||
      !continuityVerdicts.has(check.verdict as EmetAiContinuityCheck["verdict"]) ||
      typeof check.explanation !== "string" ||
      !Array.isArray(check.evidenceIds) ||
      check.evidenceIds.some((id) => typeof id !== "string")
    ) return null;
    continuityChecks.push({
      propositionId: check.propositionId,
      verdict: check.verdict as EmetAiContinuityCheck["verdict"],
      explanation: check.explanation,
      evidenceIds: check.evidenceIds as string[],
    });
  }

  const citations: EmetAiAnswer["citations"] = [];
  for (const value of candidate.citations) {
    if (!value || typeof value !== "object") return null;
    const citation = value as Record<string, unknown>;
    if (
      typeof citation.evidenceId !== "string" ||
      (citation.reference !== undefined &&
        typeof citation.reference !== "string")
    ) {
      return null;
    }
    citations.push({
      evidenceId: citation.evidenceId,
      ...(clean(citation.reference)
        ? { reference: citation.reference as string }
        : {}),
    });
  }

  if (candidate.limitations.some((item) => typeof item !== "string")) {
    return null;
  }

  return {
    schemaVersion: EMET_AI_ANSWER_SCHEMA,
    status: candidate.status,
    answer: candidate.answer,
    conclusionSupport: candidate.conclusionSupport as EmetAiClaimSupport,
    componentChecks,
    claims,
    continuityChecks,
    citations,
    limitations: candidate.limitations as string[],
  };
}
