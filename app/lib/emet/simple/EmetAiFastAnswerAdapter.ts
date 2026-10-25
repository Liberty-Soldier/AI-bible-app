import type { EmetAiAnswer, EmetAiEvidencePacket } from "../EmetAiContract";
import type { EmetAiSimpleAnswer } from "./EmetAiSimpleContract";

export function adaptFastEmetAnswer({
  answer,
  packet,
}: {
  answer: EmetAiSimpleAnswer;
  packet: EmetAiEvidencePacket;
}): EmetAiAnswer {
  const evidenceIds = Array.from(new Set(answer.citations.map((item) => item.evidenceId)));
  const support = answer.conclusion === "qualified" || answer.conclusion === "not-applicable"
    ? "theological-synthesis" as const
    : "strong-implication" as const;
  return {
    schemaVersion: "emet-ai-answer@4",
    status: answer.status,
    answer: answer.answer,
    conclusionSupport: support,
    componentChecks: [],
    claims: answer.status === "complete" && evidenceIds.length
      ? [{
          id: "fast-answer-conclusion",
          text: answer.answer,
          support,
          category: "other",
          polarity: answer.conclusion === "no"
            ? "denies"
            : answer.conclusion === "qualified" || answer.conclusion === "not-applicable"
              ? "qualifies"
              : "affirms",
          scope: packet.question,
          timing: "uncertain",
          evidenceIds,
        }]
      : [],
    continuityChecks: [],
    citations: answer.citations,
    limitations: answer.limitations,
  };
}
