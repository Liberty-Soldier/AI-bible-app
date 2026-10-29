import "server-only";

export const EMET_AI_PRETRAINED_ENGINE_PROFILE = "pretrained-first-v1" as const;
export const EMET_AI_PRETRAINED_MODEL = "gpt-5.4-mini" as const;
export const EMET_AI_PRETRAINED_REASONING_EFFORT = "none" as const;
export const EMET_AI_PRETRAINED_PROMPT_VERSION = "pretrained-first-stage-a@1" as const;
export const EMET_AI_PRETRAINED_PROMPT_SHA256 = "11949195e2fb40a943ec5a0e13a5b9fcedb1457affcca13c7022788cff09cb8f" as const;
export const EMET_AI_PRETRAINED_RESPONSE_SCHEMA = "emet-pretrained-stage-a@1" as const;
export const EMET_AI_PRETRAINED_VERIFIER_VERSION = "pretrained-local-verifier@1" as const;
export const EMET_AI_PRETRAINED_ADAPTER_VERSION = "pretrained-reader-adapter@1" as const;

export type EmetAiPretrainedConclusion = "yes" | "no" | "qualified" | "not-applicable" | "insufficient-evidence";
export type EmetAiPretrainedSupport = "explicit-statement" | "strong-implication" | "interpretation" | "possible-interpretation" | "does-not-establish";
export type EmetAiPretrainedClaim = { claim: string; support: EmetAiPretrainedSupport; references: string[] };
export type EmetAiPretrainedDraft = {
  question: string;
  proposedAnswer: string;
  conclusion: EmetAiPretrainedConclusion;
  conclusionSupport: EmetAiPretrainedSupport;
  references: string[];
  claims: EmetAiPretrainedClaim[];
  limitations: string[];
};
export type EmetAiPretrainedUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

const conclusions = new Set<EmetAiPretrainedConclusion>(["yes", "no", "qualified", "not-applicable", "insufficient-evidence"]);
const supports = new Set<EmetAiPretrainedSupport>(["explicit-statement", "strong-implication", "interpretation", "possible-interpretation", "does-not-establish"]);

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function cleanStrings(value: unknown, limit: number, maxLength: number) {
  if (!Array.isArray(value) || value.length > limit) return null;
  const cleaned = value.map((item) => cleanText(item, maxLength));
  if (cleaned.some((item) => !item)) return null;
  return Array.from(new Set(cleaned));
}

export function parseEmetAiPretrainedDraft(value: unknown): EmetAiPretrainedDraft | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const question = cleanText(candidate.question, 800);
  const proposedAnswer = cleanText(candidate.proposedAnswer, 4_000);
  const conclusion = candidate.conclusion as EmetAiPretrainedConclusion;
  const conclusionSupport = candidate.conclusionSupport as EmetAiPretrainedSupport;
  const references = cleanStrings(candidate.references, 10, 120);
  const limitations = cleanStrings(candidate.limitations, 6, 800);
  if (!question || !proposedAnswer || !conclusions.has(conclusion) || !supports.has(conclusionSupport) || !references?.length || !limitations || !Array.isArray(candidate.claims) || candidate.claims.length < 1 || candidate.claims.length > 10) return null;
  const claims: EmetAiPretrainedClaim[] = [];
  for (const value of candidate.claims) {
    if (!value || typeof value !== "object") return null;
    const claim = value as Record<string, unknown>;
    const text = cleanText(claim.claim, 1_200);
    const support = claim.support as EmetAiPretrainedSupport;
    const claimReferences = cleanStrings(claim.references, 8, 120);
    if (!text || !supports.has(support) || !claimReferences?.length) return null;
    claims.push({ claim: text, support, references: claimReferences });
  }
  return { question, proposedAnswer, conclusion, conclusionSupport, references, claims, limitations };
}

export const EMET_AI_PRETRAINED_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    question: { type: "string" },
    proposedAnswer: { type: "string" },
    conclusion: { type: "string", enum: Array.from(conclusions) },
    conclusionSupport: { type: "string", enum: Array.from(supports) },
    references: { type: "array", minItems: 1, maxItems: 10, items: { type: "string" } },
    claims: {
      type: "array", minItems: 1, maxItems: 10,
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          support: { type: "string", enum: Array.from(supports) },
          references: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
        },
        required: ["claim", "support", "references"],
        additionalProperties: false,
      },
    },
    limitations: { type: "array", maxItems: 6, items: { type: "string" } },
  },
  required: ["question", "proposedAnswer", "conclusion", "conclusionSupport", "references", "claims", "limitations"],
  additionalProperties: false,
} as const;
