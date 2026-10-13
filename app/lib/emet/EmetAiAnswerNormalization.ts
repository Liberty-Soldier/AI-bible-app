/**
 * Removes mechanically repairable model bookkeeping language without changing
 * claims, evidence, support levels, or theological conclusions.
 */
export type EmetAiVisibleEvidenceReference = {
  id: string;
  kind?: string;
  reference?: string;
};

const INTERNAL_EVIDENCE_ID = String.raw`(?:scripture|lexical|morphology):[A-Za-z0-9._:-]+`;

function visibleReferenceAnnotation(
  annotation: string,
  evidence: readonly EmetAiVisibleEvidenceReference[],
  precedingText: string,
) {
  const currentParagraph = precedingText.slice(precedingText.lastIndexOf("\n") + 1);
  if (/\b(?:[1-3]\s+)?[A-Z][A-Za-z]+(?:\s+[A-Za-z]+)*\s+\d+:\d+/u.test(currentParagraph)) {
    return "";
  }
  const byId = new Map(evidence.map((item) => [item.id, item] as const));
  const references = Array.from(new Set(
    Array.from(annotation.matchAll(new RegExp(INTERNAL_EVIDENCE_ID, "gi")))
      .map((match) => byId.get(match[0]))
      .filter((item) => item?.kind === "scripture" && Boolean(item.reference))
      .map((item) => item?.reference as string),
  ));
  return references.length ? ` (${references.join("; ")})` : "";
}

export function normalizeEmetAiMechanicalAnswerText(
  value: string,
  evidence: readonly EmetAiVisibleEvidenceReference[] = [],
) {
  return value
    .replace(
      new RegExp(String.raw`\s*\[\s*${INTERNAL_EVIDENCE_ID}(?:\s*,\s*${INTERNAL_EVIDENCE_ID})*\s*\]`, "gi"),
      (annotation, offset, source) =>
        visibleReferenceAnnotation(annotation, evidence, source.slice(0, offset)),
    )
    .replace(/\s*\([^)]*\b(?:scripture|lexical|morphology):[^)]*\)/gi, "")
    .replace(
      /\b(?:the\s+)?(?:supplied|provided)\s+(?:passages|texts|scriptures?|evidence)\b/gi,
      "Scripture",
    )
    .replace(
      /\b(?:the\s+)?(?:passages|texts|scriptures?|evidence)\s+(?:supplied|provided)\b/gi,
      "The cited passages",
    )
    .replace(
      /\b(?:the\s+)?verified lexical (?:meaning|data) in (?:the|this) packet\b/gi,
      "The verified lexical meaning",
    )
    .replace(
      /\b(?:the\s+)?(?:verified\s+)?evidence packet\b/gi,
      "the verified source material",
    )
    .replace(/\b(?:the|this) packet\b/gi, "the verified source material")
    .replace(/\bScripture do not\b/g, "Scripture does not")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
