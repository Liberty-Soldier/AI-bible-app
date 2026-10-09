import type { EmetConversationContext } from "./EmetAiConversation";
import { extractEmetAiRequestedCoverage } from "./EmetAiRequestedCoverage";
import type { EmetAiInstructionProfile } from "./EmetAiConstitution";

export type EmetAiResponseDepth = "concise" | "standard" | "deep";

export const EMET_AI_CONCISE_STYLE_VERSION = "answer-first-concise@1" as const;
export const EMET_AI_RESPONSE_POLICY_VERSION = "scripture-first-response-policy@2" as const;

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

export function classifyEmetAiResponseDesign({
  question,
  conversation = null,
}: {
  question: string;
  conversation?: EmetConversationContext | null;
}): EmetAiResponseDesign {
  const coverage = extractEmetAiRequestedCoverage(question);
  const progressiveFollowUp = Boolean(
    conversation?.recentExchanges.length && FOLLOW_UP_PATTERN.test(question),
  );
  const isDeep =
    DEEP_PATTERN.test(question) ||
    coverage.competingInterpretations ||
    coverage.language.length > 0 ||
    coverage.passages.length > 1 ||
    coverage.subquestions.length > 1 ||
    question.length > 360;
  const isStandard =
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
}: {
  question: string;
  conversation?: EmetConversationContext | null;
}): EmetAiInstructionProfile {
  const coverage = extractEmetAiRequestedCoverage(question);
  const design = classifyEmetAiResponseDesign({ question, conversation });
  if (coverage.language.length > 0) return "lexical";
  if (coverage.competingInterpretations || /\b(?:compare|comparison|reconcile|contradict|for and against|both sides)\b/i.test(question)) {
    return "comparison";
  }
  if (design.progressiveFollowUp) return "challenge";
  if (/^\s*(?:what\s+is|define)\b|\bwhat\s+does\s+.+\s+mean\b/i.test(question)) {
    return "definition";
  }
  if (design.depth === "deep" || coverage.subquestions.length > 1) return "complex";
  return design.depth === "concise" ? "direct" : "definition";
}
