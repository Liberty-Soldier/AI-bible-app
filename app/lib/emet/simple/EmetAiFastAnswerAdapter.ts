import type { EmetAiAnswer, EmetAiEvidencePacket } from "../EmetAiContract";
import { normalizeEmetAiSimpleReferences, type EmetAiSimpleAnswer } from "./EmetAiSimpleContract";

export function adaptFastEmetAnswer({
  answer,
  packet,
}: {
  answer: EmetAiSimpleAnswer;
  packet: EmetAiEvidencePacket;
}): EmetAiAnswer {
  const idsForReferences = (references: string[]) => {
    const normalized = new Set(normalizeEmetAiSimpleReferences(references));
    return packet.evidence.flatMap((item) => item.kind === "scripture" && item.reference && normalized.has(item.reference) ? [item.id] : []);
  };
  const publicReferences = new Set(normalizeEmetAiSimpleReferences(answer.references));
  const support = answer.conclusionSupport;
  return {
    schemaVersion: "emet-ai-answer@4",
    status: answer.status,
    answer: answer.answer,
    conclusionSupport: support,
    componentChecks: answer.componentChecks.map((check) => {
      const normalized = new Set(normalizeEmetAiSimpleReferences(check.references));
      return {
        componentId: check.componentId,
        support: check.support,
        explanation: check.explanation,
        evidenceIds: packet.evidence.flatMap((item) =>
          item.reference && normalized.has(item.reference) ? [item.id] : []
        ),
      };
    }),
    claims: answer.status === "complete"
      ? answer.claims
        .filter((claim) => normalizeEmetAiSimpleReferences(claim.references).some((reference) => publicReferences.has(reference)))
        .map((claim, index) => ({
          id: `fast-answer-claim-${index + 1}`,
          text: claim.text,
          support: claim.support,
          category: packet.reasoning.components[0]?.category || "other",
          polarity: answer.conclusion === "no"
            ? "denies"
            : answer.conclusion === "qualified" || answer.conclusion === "not-applicable"
              ? "qualifies"
              : "affirms",
          scope: packet.question,
          timing: "uncertain",
          evidenceIds: idsForReferences(
            claim.references.filter((reference) =>
              normalizeEmetAiSimpleReferences([reference]).some((normalized) => publicReferences.has(normalized))
            ),
          ),
        }))
      : [],
    continuityChecks: [],
    citations: answer.citations,
    limitations: answer.limitations,
  };
}
