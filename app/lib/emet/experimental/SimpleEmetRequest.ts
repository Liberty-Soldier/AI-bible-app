import "server-only";

import { canUseSimpleEmet, claimSimpleRequest, simpleRequestKey } from "./SimpleEmetAccess";
import { configuredSimpleEmetModel, generateSimpleEmet, parseSimpleHistory, type SimpleGenerationDiagnostics } from "./SimpleEmet";
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
  let generation: SimpleGenerationDiagnostics | undefined;
  let stage = "model-response";
  const report = (code: string, resultStage: string, httpStatus: number) => {
    const diagnostics = {
      ...generation, requestId: input.requestId, code, stage: resultStage, httpStatus,
    };
    console.info("Simple EMET owner result", diagnostics);
    return diagnostics;
  };
  try {
    const result = await generateSimpleEmet(input.question, history, input.context, model);
    generation = result.diagnostics;
    const draft = result.draft;
    if (!draft) {
      stage = "usage-completion";
      await refundFailedEmetAiQuestion(input.requestId);
      await completeEmetAiQuestion(input.requestId, "fail-closed");
      const diagnostics = report(generation.code, generation.stage, 502);
      return { status: 502, body: {
        status: "answer-unavailable", engine: "simple", diagnostics,
        answer: "Simple EMET did not return a complete, valid answer. Please try again.",
        limitations: [`Owner diagnostic: ${generation.code} (${generation.stage}).`],
        usage: await getEmetAiUsageSummary(),
      } };
    }
    stage = "citation-verification";
    const verified = verifySimpleDraft(draft);
    if (!verified.ok || draft.status !== "complete") {
      stage = "usage-completion";
      await refundFailedEmetAiQuestion(input.requestId);
      await completeEmetAiQuestion(input.requestId, "fail-closed");
      // Only a valid, verified model-declared insufficiency is insufficient evidence.
      const code = !verified.ok ? verified.code : "model-insufficient-evidence";
      const resultStage = !verified.ok ? verified.stage : "model-answer";
      const status = !verified.ok ? 502 : 422;
      const diagnostics = report(code, resultStage, status);
      return { status, body: {
        status: !verified.ok ? "verification-failed" : "insufficient-evidence", engine: "simple", diagnostics,
        answer: !verified.ok
          ? "Simple EMET's answer did not pass Scripture verification. Please try again."
          : "Simple EMET could not establish an answer from the available Scripture evidence.",
        limitations: [!verified.ok ? verified.reason : "The model reported insufficient evidence.", `Owner diagnostic: ${code} (${resultStage}).`],
        usage: await getEmetAiUsageSummary(),
      } };
    }
    stage = "usage-completion";
    if (!await completeEmetAiQuestion(input.requestId, "model")) return { status: 503, body: { status: "usage-unavailable", diagnostics: report("usage-completion-failed", stage, 503) } };
    const diagnostics = report("complete", "api-response", 200);
    return {
      status: 200,
      body: {
        status: "complete", engine: "simple", source: "simple-owner-model", usage: quota, diagnostics,
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
    return { status: 503, body: { status: "answer-unavailable", engine: "simple", diagnostics: report(stage === "model-response" ? "provider-error" : stage === "citation-verification" ? "scripture-unavailable" : "usage-completion-failed", stage, 503), answer: "Simple EMET could not complete this request. Please try again." } };
  }
}
