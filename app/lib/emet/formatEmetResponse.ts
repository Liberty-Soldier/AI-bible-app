import type { EmetServiceResponse } from "./EmetService";
import type { ValidatedEmetResponse } from "./validateEmetResponse";

export function formatEmetResponse(
  validated: ValidatedEmetResponse
): EmetServiceResponse {
  const explanation = normalizeExplanation(validated.explanation);

  const warnings = Array.from(
    new Set(
      validated.warnings
        .map((warning) => warning.trim())
        .filter(Boolean)
    )
  );

  return {
    explanation,
    confidence: validated.confidence,
    source: "emet-live",
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

function normalizeExplanation(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}