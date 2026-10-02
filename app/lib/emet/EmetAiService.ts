import "server-only";

import {
  insufficientEmetAiAnswer,
  parseEmetAiAnswer,
  type EmetAiAnswer,
  type EmetAiEvidencePacket,
  validateEmetAiAnswer,
  validateEmetAiEvidencePacket,
} from "./EmetAiContract";
import {
  getEmetAiCacheKey,
  type EmetAiAnswerStore,
} from "./EmetAiCache";

export interface EmetAiProvider {
  model: string;
  generate(packet: EmetAiEvidencePacket): Promise<unknown>;
}

export type EmetAiServiceResult = {
  answer: EmetAiAnswer;
  source: "cache" | "model" | "fail-closed";
  cacheKey: string;
};

const inFlight = new Map<string, Promise<EmetAiServiceResult>>();

function failClosed(
  packet: EmetAiEvidencePacket,
  explanation: string,
  limitations: string[],
): EmetAiServiceResult {
  return {
    answer: insufficientEmetAiAnswer(explanation, limitations),
    source: "fail-closed",
    cacheKey: getEmetAiCacheKey(packet),
  };
}

export async function answerFromEmetAiEvidence({
  packet,
  store,
  provider,
  allowLive = false,
  generatedAt,
}: {
  packet: EmetAiEvidencePacket;
  store: EmetAiAnswerStore;
  provider?: EmetAiProvider;
  allowLive?: boolean;
  generatedAt?: string;
}): Promise<EmetAiServiceResult> {
  const packetValidation = validateEmetAiEvidencePacket(packet);
  if (!packetValidation.ok) {
    return failClosed(
      packet,
      "The available evidence could not support a reliable answer.",
      packetValidation.errors,
    );
  }

  const cacheKey = getEmetAiCacheKey(packet);
  const cached = await store.get(cacheKey);
  if (cached) {
    const parsed = parseEmetAiAnswer(cached.answer);
    const validation = parsed && validateEmetAiAnswer(packet, parsed);
    if (validation?.ok) {
      return { answer: validation.value, source: "cache", cacheKey };
    }
  }

  if (!allowLive || !provider) {
    return failClosed(
      packet,
      "EMET AI is not enabled for live answers yet.",
      ["No reusable verified answer is stored for this evidence packet."],
    );
  }

  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const pending = (async (): Promise<EmetAiServiceResult> => {
    try {
      const parsed = parseEmetAiAnswer(await provider.generate(packet));
      if (!parsed) {
        return failClosed(
          packet,
          "EMET AI could not produce a verifiable answer.",
          ["The model response did not match the required answer schema."],
        );
      }

      const validation = validateEmetAiAnswer(packet, parsed);
      if (!validation.ok) {
        return failClosed(
          packet,
          "EMET AI could not produce a verifiable answer.",
          validation.errors,
        );
      }

      if (validation.value.status === "complete") {
        await store.set(cacheKey, {
          answer: validation.value,
          createdAt: generatedAt || new Date().toISOString(),
          model: provider.model,
        });
      }

      return {
        answer: validation.value,
        source: "model",
        cacheKey,
      };
    } catch {
      return failClosed(
        packet,
        "EMET AI is temporarily unavailable.",
        ["The answer provider could not complete the request."],
      );
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, pending);
  return pending;
}
