import type { EmetConversationContext } from "./EmetAiConversation";
import type { EmetAiReaderContext } from "./EmetAiTopicEvidence";
import {
  extractEmetAiRequestedCoverage,
  type EmetAiRequestedCoverage,
} from "./EmetAiRequestedCoverage";
import {
  classifyEmetAiInstructionProfile,
  classifyEmetAiResponseDesign,
  type EmetAiResponseDesign,
} from "./EmetAiResponseDesign";
import type { EmetAiInstructionProfile } from "./EmetAiConstitution";

export const EMET_AI_QUESTION_CONTRACT_VERSION =
  "canonical-question-contract@1" as const;

export type EmetAiQuestionIntent =
  | "direct"
  | "definition"
  | "symbolic"
  | "historical"
  | "doctrinal"
  | "comparison"
  | "apparent-contradiction"
  | "lexical"
  | "procedure"
  | "enumeration"
  | "multi-part"
  | "conversation-recall";

export type EmetAiQuestionContract = {
  version: typeof EMET_AI_QUESTION_CONTRACT_VERSION;
  question: string;
  intent: EmetAiQuestionIntent;
  instructionProfile: EmetAiInstructionProfile;
  responseDesign: EmetAiResponseDesign;
  requestedCoverage: EmetAiRequestedCoverage;
  explicitReferences: string[];
  biblicalEntities: string[];
  subquestions: string[];
  requestedLanguages: Array<"hebrew" | "greek-nt">;
  topicDomains: Array<"cosmology">;
  requiresSemanticPlanning: boolean;
  conversation: {
    relevant: boolean;
    recentQuestions: string[];
  };
  readerContext: EmetAiReaderContext | null;
  authority: {
    scriptureGovernsBiblicalClaims: true;
    interpretScriptureThroughScripture: true;
    preserveGenreAndOrdinaryContext: true;
    externalModelsAreNotGoverningAuthority: true;
    distinguishTextFromInference: true;
    verifiedSourceLanguagesOnly: true;
    failClosed: true;
  };
};

const SYMBOLIC_PATTERN =
  /\b(?:symbol(?:ize|ic)?|represent|signif(?:y|ies)|image(?:ry)?|vision|beast|dragon|woman clothed|morning star|jezebel)\b/i;
const HISTORICAL_PATTERN =
  /\b(?:histor(?:y|ical|ically)|first[- ]century|setting|circumstances|custom|practice|roman|synagogue)\b/i;
const DOCTRINAL_PATTERN =
  /\b(?:doctrine|trinity|under the law|law of moses|new covenant|required for salvation|saved by|justified by|does paul teach|paul teach(?:es)?)\b/i;
const CONFLICT_PATTERN =
  /\b(?:contradict|conflict|reconcile|apparent(?:ly)? different|yet\b.+\b(?:says?|calls?|describes?))\b/i;
const PROCEDURE_PATTERN = /\b(?:how (?:do|should|can)|observe|perform|practice)\b/i;
const ENUMERATION_PATTERN = /\b(?:what|which)\s+(?:are|foods?|commandments?|items?|things?)\b/i;
const RECALL_PATTERN = /\b(?:first question|previous question|earlier question|what did i ask|what was my)\b/i;
const MULTI_PART_PATTERN = /\?.+\?|\b(?:and|also)\s+(?:when|why|how|what|which|does|are|is)\b/i;
const COSMOLOGY_PATTERN =
  /\b(?:cosmolog|heliocentr|geocentr|firmament|expanse|earth\s+(?:spin|rotat|orbit|move|shape|fixed|stationary)|sun\s+(?:move|orbit|stand|stood)|moon\s+(?:move|orbit|stand|stood))\w*\b/i;

const ENTITY_PATTERNS: Array<[string, RegExp]> = [
  ["Yahweh", /\b(?:yahweh|yhwh|the most high)\b/i],
  ["Messiah", /\b(?:jesus|yeshua|messiah|christ)\b/i],
  ["Paul", /\bpaul(?:'s)?\b/i],
  ["Torah", /\b(?:torah|law of moses)\b/i],
  ["commandments", /\bcommandments?\b/i],
  ["Sabbath", /\bsabbath\b/i],
  ["resurrection", /\b(?:resurrection|raised from the dead|dead raised)\b/i],
  ["new covenant", /\bnew covenant\b/i],
  ["Holy Spirit", /\b(?:holy spirit|spirit of god)\b/i],
];

function requestedReferenceLabels(coverage: EmetAiRequestedCoverage) {
  return coverage.passages.map((passage) => passage.label);
}

function classifyIntent(
  question: string,
  coverage: EmetAiRequestedCoverage,
  hasConversation: boolean,
): EmetAiQuestionIntent {
  if (coverage.language.length) return "lexical";
  if (RECALL_PATTERN.test(question) && hasConversation) return "conversation-recall";
  if (coverage.competingInterpretations || /\b(?:compare|both sides|for and against)\b/i.test(question)) return "comparison";
  if (CONFLICT_PATTERN.test(question)) return "apparent-contradiction";
  if (SYMBOLIC_PATTERN.test(question)) return "symbolic";
  if (HISTORICAL_PATTERN.test(question)) return "historical";
  if (coverage.subquestions.length > 1 || MULTI_PART_PATTERN.test(question)) return "multi-part";
  if (PROCEDURE_PATTERN.test(question)) return "procedure";
  if (ENUMERATION_PATTERN.test(question)) return "enumeration";
  if (DOCTRINAL_PATTERN.test(question)) return "doctrinal";
  if (/^\s*(?:what\s+is|define)\b|\bwhat\s+does\s+.+\s+mean\b/i.test(question)) return "definition";
  return "direct";
}

export function buildEmetAiQuestionContract({
  question,
  conversation = null,
  context = null,
}: {
  question: string;
  conversation?: EmetConversationContext | null;
  context?: EmetAiReaderContext | null;
}): EmetAiQuestionContract {
  const cleanQuestion = question.trim();
  const requestedCoverage = extractEmetAiRequestedCoverage(cleanQuestion);
  const intent = classifyIntent(
    cleanQuestion,
    requestedCoverage,
    Boolean(conversation?.recentExchanges.length),
  );
  const instructionProfile = classifyEmetAiInstructionProfile({
    question: cleanQuestion,
    conversation,
  });
  const responseDesign = classifyEmetAiResponseDesign({
    question: cleanQuestion,
    conversation,
  });
  const topicDomains: Array<"cosmology"> = COSMOLOGY_PATTERN.test(cleanQuestion)
    ? ["cosmology"]
    : [];
  const requestedLanguages = Array.from(
    new Set(requestedCoverage.language.flatMap((item) => item.corpora)),
  );
  const subquestions = requestedCoverage.subquestions.map((item) => item.text);
  const requiresSemanticPlanning = Boolean(conversation?.recentExchanges.length) || !(
    (intent === "direct" || intent === "definition") &&
    responseDesign.depth === "concise" &&
    !responseDesign.progressiveFollowUp &&
    !context &&
    requestedCoverage.passages.length === 0 &&
    requestedCoverage.language.length === 0 &&
    requestedCoverage.subquestions.length === 0 &&
    !requestedCoverage.competingInterpretations
  );

  return {
    version: EMET_AI_QUESTION_CONTRACT_VERSION,
    question: cleanQuestion,
    intent,
    instructionProfile,
    responseDesign,
    requestedCoverage,
    explicitReferences: requestedReferenceLabels(requestedCoverage),
    biblicalEntities: ENTITY_PATTERNS
      .filter(([, pattern]) => pattern.test(cleanQuestion))
      .map(([entity]) => entity),
    subquestions,
    requestedLanguages,
    topicDomains,
    requiresSemanticPlanning,
    conversation: {
      relevant: Boolean(conversation?.recentExchanges.length),
      recentQuestions: conversation?.recentExchanges
        .slice(-4)
        .map((exchange) => exchange.question) || [],
    },
    readerContext: context,
    authority: {
      scriptureGovernsBiblicalClaims: true,
      interpretScriptureThroughScripture: true,
      preserveGenreAndOrdinaryContext: true,
      externalModelsAreNotGoverningAuthority: true,
      distinguishTextFromInference: true,
      verifiedSourceLanguagesOnly: true,
      failClosed: true,
    },
  };
}
