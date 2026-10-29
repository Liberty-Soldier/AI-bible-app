import type { EmetAiClaimSupport } from "@/app/lib/emet/EmetAiContract";

export function followsLatest(viewport: { scrollHeight: number; scrollTop: number; clientHeight: number }) {
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 64;
}

export function boundedSimpleHistory(turns: Array<{ question: string; answer: string }>) {
  const result: Array<{ question: string; answer: string }> = [];
  let remaining = 32_000;
  for (const turn of turns.slice(-6).reverse()) {
    const bounded = { question: turn.question.slice(0, 800), answer: turn.answer.slice(0, 10_000) };
    const size = bounded.question.length + bounded.answer.length;
    if (size > remaining) break;
    result.unshift(bounded);
    remaining -= size;
  }
  return result;
}

export function safeChatReturnHref(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return null;
  const url = new URL(value, "https://emetsees.invalid");
  if (url.origin !== "https://emetsees.invalid" || /^\/(emet|auth)(\/|$)/.test(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

export const supportQualification: Partial<Record<EmetAiClaimSupport, string>> = {
  "strong-implication": "This answer includes an inference from Scripture.",
  "theological-synthesis": "This answer brings several passages together in interpretation.",
  "possible-interpretation": "This is a possible interpretation, rather than an explicit statement of Scripture.",
  "does-not-establish": "The available evidence does not establish this conclusion.",
};

// Qualifications remain visible; only internal identifiers/debug formatting are
// withheld. The authorized answer text itself never passes through this function.
export function publicQualification(value: string, internalIds: string[] = []): string {
  if (/^\s*[\[{]/.test(value) && /"(?:claimId|evidenceId|authority|debug|componentId)"\s*:/.test(value)) {
    try {
      const record = JSON.parse(value) as Record<string, unknown>;
      const message = record.message || record.explanation || record.limitation;
      if (typeof message === "string") return publicQualification(message, internalIds);
    } catch {
      // An incomplete debug record must not become reader-facing metadata.
    }
    return "Verification could not establish a complete answer from the available evidence.";
  }
  let result = value;
  for (const id of internalIds.filter(Boolean).sort((a, b) => b.length - a.length)) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`(^|[^\\w])${escaped}(?=$|[^\\w])`, "g"), "$1a supporting statement");
  }
  return result.replace(/\b(?:scripture|lexical|word|claim|component|proposition|authority):[^\s,;)\]]+/gi, "a source record");
}
