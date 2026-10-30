import "server-only";

import { getSimpleEmetAccess, claimSimpleRequest, recordUnlimitedSimpleRequest, simpleRequestKey } from "./SimpleEmetAccess";
import { configuredSimpleEmetModel, generateSimpleEmet, parseSimpleHistory, type SimpleGenerationDiagnostics } from "./SimpleEmet";
import { verifySimpleDraft } from "./SimpleEmetScripture";
import { completeEmetAiQuestion, getEmetAiUsageSummary, refundFailedEmetAiQuestion, reserveEmetAiQuestion } from "../EmetAiQuota";

export async function handleSimpleEmet(input: { userId: string; requestId: string; question: string; conversationId: string; history: unknown; context: unknown }) {
  const access = await getSimpleEmetAccess(input.userId);
  if (!access.authorized) return { status: 403, body: { status: "engine-unavailable" } };
  const history = parseSimpleHistory(input.history);
  if (!history || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) return { status: 400, body: { status: "invalid-request" } };
  const model = configuredSimpleEmetModel();
  const key = simpleRequestKey(input.userId, input.requestId, model);
  const claim = await claimSimpleRequest(input.userId, input.requestId);
  if (claim !== "claimed") return { status: claim === "rate-limited" ? 429 : claim === "duplicate" ? 409 : 503, body: { status: claim === "rate-limited" ? "rate-limited" : claim === "duplicate" ? "duplicate-request" : "usage-unavailable" } };
  const quota = await reserveEmetAiQuestion(input.requestId, key);
  if (!quota || !quota.allowed) {
    await completeEmetAiQuestion(input.requestId, "fail-closed");
    return { status: quota ? 429 : 503, body: { status: quota ? "quota-exhausted" : "usage-unavailable", usage: quota } };
  }
  // A non-owner reservation with charged=false is the RPC's existing-request
  // result. Another worker owns it; never generate twice or refund its charge.
  if (!quota.unlimited && !quota.charged) return { status: 409, body: { status: "duplicate-request" } };
  if (quota.unlimited) {
    const record = await recordUnlimitedSimpleRequest(input.userId, input.requestId, key);
    if (record !== "recorded") return { status: record === "duplicate" ? 409 : 503, body: { status: record === "duplicate" ? "duplicate-request" : "usage-unavailable" } };
  }
  let generation: SimpleGenerationDiagnostics | undefined;
  let stage = "model-response";
  const report = (code: string, resultStage: string, httpStatus: number) => {
    const diagnostics = {
      ...generation, requestId: input.requestId, code, stage: resultStage, httpStatus,
    };
    console.info("EMET response result", diagnostics);
    return access.ownerDiagnostics ? { diagnostics } : {};
  };
  try {
    const result = await generateSimpleEmet(input.question, history, input.context, model);
    generation = result.diagnostics;
    const draft = result.draft;
    if (!draft) {
      stage = "usage-completion";
      await refundFailedEmetAiQuestion(input.requestId);
      await completeEmetAiQuestion(input.requestId, "fail-closed");
      const diagnosticFields = report(generation.code, generation.stage, 502);
      return { status: 502, body: {
        status: "answer-unavailable", engine: "simple", ...diagnosticFields,
        answer: "EMET did not return a complete, valid answer. Please try again.",
        limitations: access.ownerDiagnostics ? [`Owner diagnostic: ${generation.code} (${generation.stage}).`] : [],
        usage: await getEmetAiUsageSummary(),
      } };
    }
    stage = "citation-verification";
    const verified = verifySimpleDraft(draft);
    if (draft.status !== "complete") {
      stage = "usage-completion";
      await refundFailedEmetAiQuestion(input.requestId);
      await completeEmetAiQuestion(input.requestId, "fail-closed");
      return { status: 422, body: {
        status: "insufficient-evidence", engine: "simple", source: "simple-model",
        ...report("model-insufficient-evidence", "model-answer", 422),
        answer: {
          status: "insufficient-evidence", answer: draft.answer, conclusionSupport: draft.support,
          claims: [], componentChecks: [], continuityChecks: [], citations: verified.citations,
          sourceVerification: "locked-corpus-text", verificationStatus: "unverified",
          ...(access.ownerDiagnostics ? { unresolvedReferences: verified.unresolved } : {}),
          limitations: [...draft.limitations, "The model reported insufficient evidence. This explanation is unverified."],
        }, usage: await getEmetAiUsageSummary(),
      } };
    }
    stage = "usage-completion";
    if (!await completeEmetAiQuestion(input.requestId, "model")) return { status: 503, body: { status: "usage-unavailable", ...report("usage-completion-failed", stage, 503) } };
    const diagnosticFields = report(verified.ok ? "complete" : verified.code || "references-unverified", verified.ok ? "api-response" : "citation-resolution", 200);
    return {
      status: 200,
      body: {
        status: verified.ok ? "complete" : "complete-unverified", engine: "simple", source: "simple-model", usage: quota, ...diagnosticFields,
        answer: {
          status: "complete", answer: draft.answer, conclusionSupport: draft.support,
          claims: [], componentChecks: [], continuityChecks: [], citations: verified.citations,
          sourceVerification: "locked-corpus-text", verificationStatus: verified.ok ? "references-verified" : "unverified",
          ...(access.ownerDiagnostics ? { unresolvedReferences: verified.unresolved } : {}),
          limitations: [...draft.limitations, ...(!verified.ok ? ["Unverified model answer: some Scripture references could not be resolved. Only the separately displayed passages have verified corpus text."] : []), "The explanation, its prose references, and any quoted wording are model-generated and not independently verified. Only the server-supplied Scripture passages are checked against their stated translations; this does not establish support for every theological inference."],
        },
      },
    };
  } catch {
    await refundFailedEmetAiQuestion(input.requestId);
    await completeEmetAiQuestion(input.requestId, "fail-closed");
    return { status: 503, body: { status: "answer-unavailable", engine: "simple", ...report(stage === "model-response" ? "provider-error" : stage === "citation-verification" ? "scripture-unavailable" : "usage-completion-failed", stage, 503), answer: "EMET could not complete this request. Please try again." } };
  }
}
