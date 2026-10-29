import "server-only";

import type { EmetConversationContext } from "../EmetAiConversation";
import type { EmetAiAnswer, EmetAiEvidencePacket } from "../EmetAiContract";
import type { EmetAiReaderContext } from "../EmetAiTopicEvidence";
import { adaptEmetAiPretrainedAnswer, validateEmetAiPretrainedAdaptedContracts } from "./EmetAiPretrainedAdapter";
import {
  EMET_AI_PRETRAINED_MODEL,
  EMET_AI_PRETRAINED_PROMPT_VERSION,
  EMET_AI_PRETRAINED_PROMPT_SHA256,
  EMET_AI_PRETRAINED_VERIFIER_VERSION,
  type EmetAiPretrainedDraft,
  type EmetAiPretrainedUsage,
} from "./EmetAiPretrainedContract";
import type { EmetAiPretrainedProvider } from "./EmetAiPretrainedProvider";
import { verifyEmetAiPretrainedDraft, type EmetAiPretrainedVerification } from "./EmetAiPretrainedVerifier";

export function isEmetAiPretrainedFirstEnabled(value = process.env.EMET_AI_PRETRAINED_FIRST_ENABLED) {
  return value === "true";
}

export type EmetAiPretrainedFallbackReason =
  | "provider-unavailable"
  | "provider-error"
  | "malformed-model-output"
  | "local-verification-failed"
  | "reader-contract-failed";

export type EmetAiPretrainedAudit = {
  requestedEngine: "pretrained-first-v1";
  displayedEngine: "pretrained-first-v1" | "legacy" | "fast-two-path";
  fallbackReason: EmetAiPretrainedFallbackReason | null;
  model: string;
  promptVersion: string;
  promptSha256: string;
  verifierVersion: string;
  cacheSource: "model" | "pretrained-cache" | "fallback-cache" | "fallback-model";
  usage: EmetAiPretrainedUsage;
  estimatedCostUsd: number;
  generationLatencyMs: number;
  verificationLatencyMs: number;
  omissions: EmetAiPretrainedVerification["omissions"];
  warnings: string[];
};

export type EmetAiPretrainedResult = {
  status: "complete" | "fallback";
  packet: EmetAiEvidencePacket | null;
  answer: EmetAiAnswer | null;
  draft: EmetAiPretrainedDraft | null;
  rawOutput: string;
  verification: EmetAiPretrainedVerification | null;
  audit: EmetAiPretrainedAudit;
  errors: string[];
};

function emptyUsage(): EmetAiPretrainedUsage {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 };
}

function failed(reason: EmetAiPretrainedFallbackReason, errors: string[], overrides: Partial<EmetAiPretrainedResult> = {}): EmetAiPretrainedResult {
  return {
    status: "fallback",
    packet: null,
    answer: null,
    draft: null,
    rawOutput: "",
    verification: null,
    errors,
    audit: {
      requestedEngine: "pretrained-first-v1",
      displayedEngine: "legacy",
      fallbackReason: reason,
      model: EMET_AI_PRETRAINED_MODEL,
      promptVersion: EMET_AI_PRETRAINED_PROMPT_VERSION,
      promptSha256: EMET_AI_PRETRAINED_PROMPT_SHA256,
      verifierVersion: EMET_AI_PRETRAINED_VERIFIER_VERSION,
      cacheSource: "fallback-model",
      usage: emptyUsage(),
      estimatedCostUsd: 0,
      generationLatencyMs: 0,
      verificationLatencyMs: 0,
      omissions: [],
      warnings: [],
    },
    ...overrides,
  };
}

export async function answerWithPretrainedEmet({
  question,
  conversation,
  context,
  provider,
  fallbackEngine,
  preflightError = null,
}: {
  question: string;
  conversation: EmetConversationContext | null;
  context: EmetAiReaderContext | null;
  provider: EmetAiPretrainedProvider | null;
  fallbackEngine: "legacy" | "fast-two-path";
  preflightError?: string | null;
}): Promise<EmetAiPretrainedResult> {
  if (preflightError) {
    const result = failed("local-verification-failed", [preflightError]);
    result.audit.displayedEngine = fallbackEngine;
    return result;
  }
  if (!provider) {
    const result = failed("provider-unavailable", ["The pretrained provider is unavailable."]);
    result.audit.displayedEngine = fallbackEngine;
    return result;
  }
  let generation;
  try {
    generation = await provider.generate({ question, conversation, context });
  } catch (error) {
    const result = failed("provider-error", [error instanceof Error ? error.message : String(error)]);
    result.audit.displayedEngine = fallbackEngine;
    result.audit.model = provider.model;
    return result;
  }
  if (!generation.draft) {
    const result = failed("malformed-model-output", [generation.failureReason || "The model returned no parseable Stage A result."], { rawOutput: generation.rawOutput });
    result.audit.displayedEngine = fallbackEngine;
    result.audit.model = provider.model;
    result.audit.usage = generation.usage;
    result.audit.estimatedCostUsd = generation.estimatedCostUsd;
    result.audit.generationLatencyMs = generation.latencyMs;
    return result;
  }
  let verification: EmetAiPretrainedVerification;
  try {
    verification = verifyEmetAiPretrainedDraft({ question, draft: generation.draft, context });
  } catch (error) {
    const result = failed("local-verification-failed", [error instanceof Error ? error.message : String(error)], { draft: generation.draft, rawOutput: generation.rawOutput });
    result.audit.displayedEngine = fallbackEngine;
    result.audit.model = provider.model;
    result.audit.usage = generation.usage;
    result.audit.estimatedCostUsd = generation.estimatedCostUsd;
    result.audit.generationLatencyMs = generation.latencyMs;
    return result;
  }
  const baseAudit: EmetAiPretrainedAudit = {
    requestedEngine: "pretrained-first-v1",
    displayedEngine: verification.ok ? "pretrained-first-v1" : fallbackEngine,
    fallbackReason: verification.ok ? null : "local-verification-failed",
    model: provider.model,
    promptVersion: EMET_AI_PRETRAINED_PROMPT_VERSION,
    promptSha256: EMET_AI_PRETRAINED_PROMPT_SHA256,
    verifierVersion: EMET_AI_PRETRAINED_VERIFIER_VERSION,
    cacheSource: verification.ok ? "model" : "fallback-model",
    usage: generation.usage,
    estimatedCostUsd: generation.estimatedCostUsd,
    generationLatencyMs: generation.latencyMs,
    verificationLatencyMs: verification.latencyMs,
    omissions: verification.omissions,
    warnings: verification.warnings,
  };
  if (!verification.ok) return {
    status: "fallback", packet: null, answer: null, draft: generation.draft,
    rawOutput: generation.rawOutput, verification, audit: baseAudit, errors: verification.errors,
  };
  const adapted = adaptEmetAiPretrainedAnswer({ draft: generation.draft, verification });
  if (!adapted) return {
    status: "fallback", packet: null, answer: null, draft: generation.draft,
    rawOutput: generation.rawOutput, verification,
    audit: { ...baseAudit, displayedEngine: fallbackEngine, fallbackReason: "reader-contract-failed", cacheSource: "fallback-model" },
    errors: ["The verified answer could not be adapted to the reader contract."],
  };
  const contract = validateEmetAiPretrainedAdaptedContracts(adapted.packet, adapted.answer);
  if (!contract.ok) return {
    status: "fallback", packet: null, answer: null, draft: generation.draft,
    rawOutput: generation.rawOutput, verification,
    audit: { ...baseAudit, displayedEngine: fallbackEngine, fallbackReason: "reader-contract-failed", cacheSource: "fallback-model" },
    errors: contract.errors,
  };
  return {
    status: "complete",
    packet: contract.packet,
    answer: contract.answer,
    draft: generation.draft,
    rawOutput: generation.rawOutput,
    verification,
    audit: baseAudit,
    errors: [],
  };
}

