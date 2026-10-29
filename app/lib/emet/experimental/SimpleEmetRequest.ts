import "server-only";

import { canUseSimpleEmet, claimSimpleRequest, simpleRequestKey } from "./SimpleEmetAccess";
import { configuredSimpleEmetModel, generateSimpleEmet, parseSimpleHistory } from "./SimpleEmet";
import { verifySimpleDraft } from "./SimpleEmetScripture";
import { completeEmetAiQuestion, getEmetAiUsageSummary, refundFailedEmetAiQuestion, reserveEmetAiQuestion } from "../EmetAiQuota";

export async function handleSimpleEmet(input: { userId: string; requestId: string; question: string; conversationId: string; history: unknown; context: unknown }) {
  if (!await canUseSimpleEmet(input.userId)) return { status: 403, body: { status: "engine-unavailable" } };
  const history = parseSimpleHistory(input.history);
  if (!history || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) return { status: 400, body: { status: "invalid-request" } };
  const model = configuredSimpleEmetModel();
  const key = simpleRequestKey(input.userId, input.requestId, model);
  const claim = await claimSimpleRequest(input.userId, input.requestId, key);
  if (claim !== "claimed") return { status: claim === "rate-limited" ? 429 : claim === "duplicate" ? 409 : 503, body: { status: claim === "rate-limited" ? "rate-limited" : claim === "duplicate" ? "duplicate-request" : "usage-unavailable" } };
  const quota = await reserveEmetAiQuestion(input.requestId, key);
  if (!quota || !quota.allowed) {
    await completeEmetAiQuestion(input.requestId, "fail-closed");
    return { status: quota ? 429 : 503, body: { status: quota ? "quota-exhausted" : "usage-unavailable", usage: quota } };
  }
  try {
    const draft = await generateSimpleEmet(input.question, history, input.context, model);
    const verified = draft ? verifySimpleDraft(draft) : null;
    if (!draft || !verified?.ok || draft.status !== "complete") {
      await refundFailedEmetAiQuestion(input.requestId);
      await completeEmetAiQuestion(input.requestId, "fail-closed");
      return {
        status: 422,
        body: {
          status: "insufficient-evidence", engine: "simple",
          answer: "Simple EMET could not provide a complete answer with verified Scripture citations.",
          limitations: [...(draft?.limitations || []), verified && !verified.ok ? verified.reason : "The response did not pass Scripture verification."],
          usage: await getEmetAiUsageSummary(),
        },
      };
    }
    if (!await completeEmetAiQuestion(input.requestId, "model")) return { status: 503, body: { status: "usage-unavailable" } };
    return {
      status: 200,
      body: {
        status: "complete", engine: "simple", source: "simple-owner-model", usage: quota,
        answer: {
          status: "complete", answer: draft.answer, conclusionSupport: draft.support,
          claims: [], componentChecks: [], continuityChecks: [], citations: verified.citations,
          limitations: [...draft.limitations, "Owner experiment: Scripture references and quotations are checked; the conclusions remain model interpretations."],
        },
      },
    };
  } catch {
    await refundFailedEmetAiQuestion(input.requestId);
    await completeEmetAiQuestion(input.requestId, "fail-closed");
    return { status: 503, body: { status: "answer-unavailable", engine: "simple", answer: "Simple EMET could not complete this request. Please try again." } };
  }
}
