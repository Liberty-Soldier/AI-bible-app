import "server-only";

import { validateEmetAiEvidencePacket, type EmetAiEvidencePacket } from "../EmetAiContract";
import type { EmetConversationContext } from "../EmetAiConversation";
import { buildEmetAiQuestionContract } from "../EmetAiQuestionContract";
import { EMET_AI_RETRIEVAL_PLAN_SCHEMA, type EmetAiRetrievalPlan } from "../EmetAiRetrievalPlan";
import {
  buildEmetAiTopicEvidence,
  emetAiLockedScriptureReferenceExists,
  expandPlannedReferences,
  type EmetAiReaderContext,
} from "../EmetAiTopicEvidence";
import { validateEmetAiSimpleAnswer, type EmetAiSimpleAnswer } from "./EmetAiSimpleContract";
import type { EmetAiSimpleProvider, EmetAiSimpleUsage } from "./EmetAiSimpleProvider";

export type EmetAiSimpleResult = {
  status: "complete" | "insufficient-evidence";
  answer: EmetAiSimpleAnswer | null;
  candidatePacket: EmetAiEvidencePacket | null;
  verifiedPacket: EmetAiEvidencePacket | null;
  validationErrors: string[];
  model: string;
  modelCalls: 1;
  usage: EmetAiSimpleUsage;
  stages: { candidateRetrievalMs: number; generationMs: number; verificationMs: number; totalMs: number };
  rawOutput: string;
};

function emptyUsage(): EmetAiSimpleUsage {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 };
}

function candidatePacket(question: string, conversation: EmetConversationContext | null, context: EmetAiReaderContext | null) {
  const evidence = buildEmetAiTopicEvidence({ question, conversation, context });
  return evidence.status === "ready" ? evidence.packet : null;
}

function finalPlan(question: string, references: string[], lexicalAnalyses: Array<{
  corpus: "hebrew" | "greek-nt" | "lxx";
  lexicalId: string;
  lemma: string;
}>, contract: ReturnType<typeof buildEmetAiQuestionContract>): EmetAiRetrievalPlan {
  return {
    schemaVersion: EMET_AI_RETRIEVAL_PLAN_SCHEMA,
    subject: question,
    analysisMode: contract.intent === "apparent-contradiction" ? "apparent-contradiction" : contract.commandApplicability ? "doctrinal-claim" : "simple",
    proposition: question,
    requiresScopeAnalysis: contract.commandApplicability,
    requiresTimeline: contract.temporalRelationship,
    components: references.length ? [{
      id: "simple-answer-support",
      proposition: "The reader-facing answer is supported by these model-selected references after locked-corpus verification.",
      category: "other",
      governingReferences: references,
    }] : [],
    intent: contract.commandApplicability ? "application" : contract.intent === "comparison" ? "comparison" : "other",
    passages: references.map((reference, index) => ({
      reference,
      role: index === 0 ? "direct" : "context",
      reason: "Selected by the simplified answer and independently resolved against locked Scripture.",
      priority: Math.max(1, 100 - index),
    })),
    sourcePhrases: lexicalAnalyses.map((claim) => ({
      corpus: claim.corpus,
      label: claim.lemma,
      lexicalIds: [claim.lexicalId],
      lemmas: [claim.lemma],
      reason: "Reader-visible source-word identity requires locked-index verification.",
    })),
    limitations: [],
  };
}

export async function answerWithSimplifiedEmet({
  question,
  provider,
  conversation = null,
  context = null,
  builtAt,
}: {
  question: string;
  provider: EmetAiSimpleProvider;
  conversation?: EmetConversationContext | null;
  context?: EmetAiReaderContext | null;
  builtAt?: string;
}): Promise<EmetAiSimpleResult> {
  const startedAt = performance.now();
  const retrievalStartedAt = performance.now();
  const candidates = candidatePacket(question, conversation, context);
  const candidateRetrievalMs = performance.now() - retrievalStartedAt;
  const generated = await provider.generate({ question, candidatePacket: candidates, conversation });
  if (!generated.draft) {
    return {
      status: "insufficient-evidence", answer: null, candidatePacket: candidates, verifiedPacket: null,
      validationErrors: ["The model did not return the simplified answer contract."], model: provider.model,
      modelCalls: 1, usage: generated.usage, rawOutput: generated.rawOutput,
      stages: { candidateRetrievalMs, generationMs: generated.latencyMs, verificationMs: 0, totalMs: performance.now() - startedAt },
    };
  }

  const verificationStartedAt = performance.now();
  const expandedReferences = Array.from(new Set(generated.draft.references.flatMap(expandPlannedReferences)));
  const invalidReferences = expandedReferences.filter((reference) => !emetAiLockedScriptureReferenceExists(reference));
  if (invalidReferences.length) {
    return {
      status: "insufficient-evidence", answer: null, candidatePacket: candidates, verifiedPacket: null,
      validationErrors: invalidReferences.map((reference) => `Reference ${reference} is not present in the locked Scripture corpus.`),
      model: provider.model, modelCalls: 1, usage: generated.usage, rawOutput: generated.rawOutput,
      stages: { candidateRetrievalMs, generationMs: generated.latencyMs, verificationMs: performance.now() - verificationStartedAt, totalMs: performance.now() - startedAt },
    };
  }

  const contract = buildEmetAiQuestionContract({ question, conversation, context });
  const evidence = buildEmetAiTopicEvidence({
    question,
    conversation,
    context,
    retrievalPlan: finalPlan(question, expandedReferences, generated.draft.lexicalAnalyses, contract),
    questionContract: contract,
    builtAt,
  });
  if (evidence.status !== "ready") {
    return {
      status: "insufficient-evidence", answer: null, candidatePacket: candidates, verifiedPacket: null,
      validationErrors: evidence.limitations, model: provider.model, modelCalls: 1, usage: generated.usage,
      rawOutput: generated.rawOutput,
      stages: { candidateRetrievalMs, generationMs: generated.latencyMs, verificationMs: performance.now() - verificationStartedAt, totalMs: performance.now() - startedAt },
    };
  }
  const packetValidation = validateEmetAiEvidencePacket(evidence.packet);
  const validation = packetValidation.ok
    ? validateEmetAiSimpleAnswer({ packet: packetValidation.value, draft: { ...generated.draft, references: expandedReferences } })
    : { ok: false as const, errors: packetValidation.errors };
  const verificationMs = performance.now() - verificationStartedAt;
  return validation.ok
    ? {
        status: validation.value.status, answer: validation.value, candidatePacket: candidates,
        verifiedPacket: evidence.packet, validationErrors: [], model: provider.model, modelCalls: 1,
        usage: generated.usage, rawOutput: generated.rawOutput,
        stages: { candidateRetrievalMs, generationMs: generated.latencyMs, verificationMs, totalMs: performance.now() - startedAt },
      }
    : {
        status: "insufficient-evidence", answer: null, candidatePacket: candidates,
        verifiedPacket: evidence.packet, validationErrors: validation.errors, model: provider.model,
        modelCalls: 1, usage: generated.usage, rawOutput: generated.rawOutput,
        stages: { candidateRetrievalMs, generationMs: generated.latencyMs, verificationMs, totalMs: performance.now() - startedAt },
      };
}

export { emptyUsage as emptyEmetAiSimpleUsage };
