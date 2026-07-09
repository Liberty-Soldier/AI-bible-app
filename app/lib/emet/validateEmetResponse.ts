export type ValidatedEmetResponse = {
  explanation: string;
  confidence: "high" | "medium" | "low";
  warnings: string[];
};

export function validateEmetResponse(
  raw: string
): ValidatedEmetResponse {
  try {
    const parsed = JSON.parse(raw);

    const explanation =
      typeof parsed.explanation === "string"
        ? parsed.explanation.trim()
        : "";

    const confidence =
      parsed.confidence === "high" ||
      parsed.confidence === "medium" ||
      parsed.confidence === "low"
        ? parsed.confidence
        : "low";

    const warnings = Array.isArray(parsed.warnings)
      ? parsed.warnings.filter(
          (w: unknown): w is string => typeof w === "string"
        )
      : [];

    if (!explanation) {
      throw new Error("Missing explanation.");
    }

    return {
      explanation,
      confidence,
      warnings,
    };
  } catch {
    return {
      explanation:
        "EMET could not generate a validated explanation from the available SEE evidence.",
      confidence: "low",
      warnings: [
        "Invalid AI response",
      ],
    };
  }
}