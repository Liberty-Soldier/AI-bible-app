import type { EmetConversationContext } from "./EmetAiConversation";
import { extractEmetAiRequestedCoverage } from "./EmetAiRequestedCoverage";

export type EmetAiResponseDepth = "concise" | "standard" | "deep";

export type EmetAiResponseDesign = {
  depth: EmetAiResponseDepth;
  targetMinWords: number;
  targetMaxWords: number;
  maxScriptureCitations: number;
  progressiveFollowUp: boolean;
};

const DEEP_PATTERN =
  /\b(?:deep study|comprehensive|in detail|thorough|compare|comparison|reconcile|contradict|original[- ]language|source[- ]language|hebrew|greek|septuagint|lxx|lexical|lemma|word study|etymolog|for and against|both sides|competing interpretations)\b/i;
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
