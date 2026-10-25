import type { EmetConversationContext } from "./EmetAiConversation";
import { extractEmetAiRequestedCoverage } from "./EmetAiRequestedCoverage";
import type { EmetAiInstructionProfile } from "./EmetAiConstitution";
import {
  classifyEmetAiConcreteAnswerRequirement,
  expectedEmetAiNamedListCount,
} from "./EmetAiAnswerCompleteness";

export type EmetAiResponseDepth = "concise" | "standard" | "deep";

export const EMET_AI_CONCISE_STYLE_VERSION = "answer-first-concise@1" as const;
export const EMET_AI_RESPONSE_POLICY_VERSION = "scripture-first-response-policy@3" as const;
export const EMET_AI_OBLIGATION_POLICY_VERSION = "command-applicability@2" as const;

export type EmetAiResponseDesign = {
  depth: EmetAiResponseDepth;
  targetMinWords: number;
  targetMaxWords: number;
  maxScriptureCitations: number;
  progressiveFollowUp: boolean;
};

const DEEP_PATTERN =
  /\b(?:deep study|comprehensive|in detail|thorough|compare|comparison|reconcile|contradict|original[- ]language|source[- ]language|hebrew|greek|septuagint|lxx|lexical|lemma|word study|etymolog|for and against|both sides|competing interpretations|same being|same person|same entity|divine nature|one essence|coequal|coeternal|trinity|triune)\b/i;
const FOLLOW_UP_PATTERN =
  /^(?:so|then)\b|\b(?:why|how so|explain|what about|but what about|however|you said|earlier answer|previous answer|objection|challenge|doesn['’]t|wouldn['’]t|isn['’]t|aren['’]t)\b/i;

const COMMAND_SUBJECT =
  String.raw`(?:commandments?|commands?|instructions?|torah|law(?:\s+of\s+moses)?|sabbath|ordinances?|statutes?|judgments?|precepts?|dietary\s+laws?|food\s+laws?)`;
const PEOPLE_SUBJECT =
  String.raw`(?:(?:all|modern)\s+)?(?:believers?|christians?|followers?\s+of\s+(?:messiah|christ|jesus|yeshua)|disciples?|israelites?|israel|gentiles?|jews?|new\s+covenant\s+(?:believers?|people)|people|humanity|humans?|mankind|priests?|non[- ]?priests?|kings?|non[- ]?kings?|queens?|parents?|children|masters?|servants?|slaves?|landowners?|farmers?|husbands?|wives|a\s+person|someone|we|i)`;
const OBLIGATION_VERB =
  String.raw`(?:should|must|need\s+to|ought\s+to|required\s+to|obligated\s+to|expected\s+to|called\s+to|responsib(?:le\s+for|ility\s+to))`;
const ROLE_OR_CONDITION_SUBJECT =
  /\b(?:priestly|levitical|kingly|royal|parental|agricultural|temple|sanctuary|land[- ]specific|role[- ]specific|conditional)\s+(?:duties|service|commands?|commandments?|instructions?|requirements?)\b|\b(?:duties|service|commands?|commandments?|instructions?|requirements?)\s+(?:assigned|given|addressed|limited|restricted)\s+(?:only\s+)?to\b/i;
const GENERAL_APPLICABILITY_LANGUAGE =
  /\b(?:should|must|ought|obligat(?:ed|ion)|required|responsib(?:le|ility)|binding|applicable|appl(?:y|ies)|assigned|authorized|permitted|forbidden|keep|obey|observe|perform|practice|remain(?:s|ed)?|continue(?:s|d)?)\b/i;

const COMMAND_AUDIENCE_APPLICABILITY_PATTERNS = [
  new RegExp(String.raw`\b${OBLIGATION_VERB}\s+${PEOPLE_SUBJECT}\s+(?:keep|obey|observe|follow|practice|perform)\b[^?]{0,100}\b${COMMAND_SUBJECT}\b`, "i"),
  new RegExp(String.raw`\b${PEOPLE_SUBJECT}\s+${OBLIGATION_VERB}\s+(?:keep|obey|observe|follow|practice|perform)\b[^?]{0,100}\b${COMMAND_SUBJECT}\b`, "i"),
  new RegExp(String.raw`\b(?:does|do|is|are)\s+${COMMAND_SUBJECT}\b[^?]{0,100}\b(?:apply|applicable|required|binding|obligatory)\b[^?]{0,80}\b${PEOPLE_SUBJECT}\b`, "i"),
  new RegExp(String.raw`\b${PEOPLE_SUBJECT}\b[^?]{0,100}\b(?:under|bound\s+by|obligated\s+to)\b[^?]{0,80}\b${COMMAND_SUBJECT}\b`, "i"),
  new RegExp(String.raw`\b(?:are|were)\s+${PEOPLE_SUBJECT}\s+(?:required|obligated|expected)\s+to\s+(?:keep|obey|observe|follow|practice|perform)\b[^?]{0,100}\b${COMMAND_SUBJECT}\b`, "i"),
  new RegExp(String.raw`\bwhat\s+${COMMAND_SUBJECT}\b[^?]{0,80}\b(?:apply|applies|applicable|required|binding|obligatory)\b[^?]{0,80}\b(?:to|for)\s+${PEOPLE_SUBJECT}\b`, "i"),
  new RegExp(String.raw`\bwhat\s+${COMMAND_SUBJECT}\b[^?]{0,80}\b${OBLIGATION_VERB}\s+${PEOPLE_SUBJECT}\s+(?:keep|obey|observe|follow|practice|perform)\b`, "i"),
];
const COMMAND_AUTHORITY_CHANGE_PATTERNS = [
  new RegExp(String.raw`\b(?:did|does|do|has|have)\s+(?:messiah|christ|jesus|paul|the\s+apostles?)\b[^?]{0,100}\b(?:abolish|repeal|end|cancel|remove|change|set\s+aside|nullify)\b[^?]{0,80}\b${COMMAND_SUBJECT}\b`, "i"),
  new RegExp(String.raw`\b(?:did|does|do)\s+(?:messiah|christ|jesus|paul|the\s+apostles?)\b[^?]{0,80}\bteach\b[^?]{0,80}\b${COMMAND_SUBJECT}\b[^?]{0,60}\b(?:abolished|repealed|ended|cancelled|removed|changed|set\s+aside|nullified)\b`, "i"),
  new RegExp(String.raw`\b(?:were|was|are|is)\s+${COMMAND_SUBJECT}\b[^?]{0,80}\b(?:abolished|repealed|ended|cancelled|removed|changed|set\s+aside|nullified)\b(?:[^?]{0,80}\bby\s+(?:messiah|christ|jesus|paul|the\s+apostles?))?`, "i"),
];

export type EmetAiCommandApplicabilityAnalysis = {
  applicable: boolean;
  audienceApplicability: boolean;
  authorityChange: boolean;
};

export function analyzeEmetAiCommandApplicabilityQuestion(
  question: string,
): EmetAiCommandApplicabilityAnalysis {
  const audienceApplicability =
    COMMAND_AUDIENCE_APPLICABILITY_PATTERNS.some((pattern) => pattern.test(question)) ||
    ((new RegExp(PEOPLE_SUBJECT, "i").test(question) || ROLE_OR_CONDITION_SUBJECT.test(question)) &&
      (new RegExp(COMMAND_SUBJECT, "i").test(question) || ROLE_OR_CONDITION_SUBJECT.test(question)) &&
      GENERAL_APPLICABILITY_LANGUAGE.test(question));
  const authorityChange = COMMAND_AUTHORITY_CHANGE_PATTERNS
    .some((pattern) => pattern.test(question)) ||
    (new RegExp(COMMAND_SUBJECT, "i").test(question) &&
      /\b(?:still|remain(?:s|ed)?|continue(?:s|d)?|abolish(?:ed)?|repeal(?:ed)?|end(?:ed)?|cancel(?:led)?|remove(?:d)?|change(?:d)?|set\s+aside|nullif(?:y|ied)|fulfill(?:ed|ment))\b/i.test(question) &&
      /\b(?:apply|applicable|binding|authority|valid|obligat|required|command)/i.test(question));
  return {
    applicable: audienceApplicability || authorityChange,
    audienceApplicability,
    authorityChange,
  };
}

export function isEmetAiCommandApplicabilityQuestion(question: string) {
  return analyzeEmetAiCommandApplicabilityQuestion(question).applicable;
}

export function classifyEmetAiResponseDesign({
  question,
  conversation = null,
  commandApplicability,
}: {
  question: string;
  conversation?: EmetConversationContext | null;
  commandApplicability?: EmetAiCommandApplicabilityAnalysis;
}): EmetAiResponseDesign {
  const coverage = extractEmetAiRequestedCoverage(question);
  const namedListCount = expectedEmetAiNamedListCount(question);
  const concreteRequirement = classifyEmetAiConcreteAnswerRequirement(question);
  const applicability = commandApplicability || analyzeEmetAiCommandApplicabilityQuestion(question);
  const progressiveFollowUp = Boolean(
    conversation?.recentExchanges.length && FOLLOW_UP_PATTERN.test(question),
  );
  const isDeep =
    Boolean(namedListCount) ||
    DEEP_PATTERN.test(question) ||
    coverage.competingInterpretations ||
    coverage.language.length > 0 ||
    coverage.passages.length > 1 ||
    coverage.subquestions.length > 1 ||
    question.length > 360;
  const isStandard =
    applicability.audienceApplicability ||
    progressiveFollowUp ||
    /\b(?:why|how|explain|meaning|context)\b/i.test(question) ||
    coverage.passages.length === 1 ||
    question.length > 180;

  if (isDeep) {
    return {
      depth: "deep",
      targetMinWords: 120,
      targetMaxWords: 500,
      maxScriptureCitations: 16,
      progressiveFollowUp,
    };
  }
  if (concreteRequirement) {
    return {
      depth: "standard",
      targetMinWords: 30,
      targetMaxWords: 140,
      maxScriptureCitations: 5,
      progressiveFollowUp,
    };
  }
  if (isStandard) {
    return {
      depth: "standard",
      targetMinWords: 65,
      targetMaxWords: 220,
      maxScriptureCitations: 8,
      progressiveFollowUp,
    };
  }
  return {
    depth: "concise",
    targetMinWords: 30,
    targetMaxWords: 65,
    maxScriptureCitations: 4,
    progressiveFollowUp,
  };
}

export function classifyEmetAiInstructionProfile({
  question,
  conversation = null,
  commandApplicability,
}: {
  question: string;
  conversation?: EmetConversationContext | null;
  commandApplicability?: EmetAiCommandApplicabilityAnalysis;
}): EmetAiInstructionProfile {
  const coverage = extractEmetAiRequestedCoverage(question);
  const applicability = commandApplicability || analyzeEmetAiCommandApplicabilityQuestion(question);
  const design = classifyEmetAiResponseDesign({ question, conversation, commandApplicability: applicability });
  const concreteRequirement = classifyEmetAiConcreteAnswerRequirement(question);
  if (coverage.language.length > 0) return "lexical";
  if (coverage.competingInterpretations || /\b(?:compare|comparison|reconcile|contradict|for and against|both sides)\b/i.test(question)) {
    return "comparison";
  }
  if (design.progressiveFollowUp) return "challenge";
  if (applicability.applicable) return "complex";
  if (concreteRequirement) return "definition";
  if (/^\s*(?:what\s+is|define)\b|\bwhat\s+does\s+.+\s+mean\b/i.test(question)) {
    return "definition";
  }
  if (design.depth === "deep" || coverage.subquestions.length > 1) return "complex";
  return design.depth === "concise" ? "direct" : "definition";
}
