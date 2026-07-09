import { buildEmetPrompt } from "./buildEmetPrompt";
import { callEmetProvider } from "./providers/openai";
import { validateEmetResponse } from "./validateEmetResponse";
import { formatEmetResponse } from "./formatEmetResponse";
import { EmetCache } from "./EmetCache";
import type { EmetEvidencePacket } from "./EmetEvidencePacket";

export type EmetServiceResponse = {
  explanation: string;
  confidence: "high" | "medium" | "low";
  source: "emet-live" | "emet-cache" | "emet-fallback";
  warnings?: string[];
  cacheKey?: string;
  generatedAt?: string;
};

export type EmetExplainOptions = {
  allowLive?: boolean;
};

export class EmetService {
  static async explain(
    packet: EmetEvidencePacket,
    options: EmetExplainOptions = {}
  ): Promise<EmetServiceResponse> {
    const cached = EmetCache.get(packet);

    if (cached) {
      return cached;
    }

    const allowLive =
      options.allowLive ?? process.env.EMET_LIVE_ENABLED === "true";

    if (!allowLive) {
      return {
        explanation:
          "SEE has structured evidence for this word, but a prebuilt EMET explanation has not been generated yet.",
        confidence: "low",
        source: "emet-fallback",
        cacheKey: EmetCache.keyFor(packet),
        warnings: ["Missing EMET cache entry"],
      };
    }

    try {
      const prompt = buildEmetPrompt(packet);
      const raw = await callEmetProvider(prompt);
      const validated = validateEmetResponse(raw);

      return {
        ...formatEmetResponse(validated),
        cacheKey: EmetCache.keyFor(packet),
      };
    } catch (error) {
      console.error("EMET service failed:", error);

      return {
        explanation:
          "EMET could not generate a live explanation from the available SEE evidence right now.",
        confidence: "low",
        source: "emet-fallback",
        cacheKey: EmetCache.keyFor(packet),
        warnings: ["EMET live provider unavailable"],
      };
    }
  }
}