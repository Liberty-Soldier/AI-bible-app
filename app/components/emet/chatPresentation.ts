import { isPrivateAnswerNote } from "@/app/lib/emet/answerPrivacy";
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

// Presentation only: these exact service notices are not Scriptural qualifications.
export const CITATION_VERIFICATION_NOTICE = "The explanation, its prose references, and any quoted wording are model-generated and not independently verified. Only the server-supplied Scripture passages are checked against their stated translations; this does not establish support for every theological inference.";
export const UNVERIFIED_SERVICE_NOTICE = "Unverified model answer: some Scripture references could not be resolved. Only the separately displayed passages have verified corpus text.";
export const UNVERIFIED_REFERENCE_WARNING = "Some Scripture references in this answer could not be verified. Please check them before relying on this explanation.";
export function isGeneralAnswerNotice(note: string) {
  return note === CITATION_VERIFICATION_NOTICE || note === UNVERIFIED_SERVICE_NOTICE || note === "The model reported insufficient evidence. This explanation is unverified.";
}
export function isOwnerAnswerDiagnostic(note: string) {
  return isPrivateAnswerNote(note);
}
export function formatAnswerForSharing({ question, answer, limitations = [], unverified = false, imported = false }: {
  question: string; answer: string; limitations?: string[]; unverified?: boolean; imported?: boolean;
}) {
  const notes = [...new Set(limitations.map(note => publicQualification(note)).filter(note => !isGeneralAnswerNotice(note) && !isOwnerAnswerDiagnostic(note)))];
  return [
    "AI-generated explanation",
    question,
    answer,
    ...(unverified ? [UNVERIFIED_REFERENCE_WARNING] : []),
    ...(imported ? ["Imported browser answer. Its references have not been reverified."] : []),
    ...(notes.length ? [`Notes:\n${notes.join("\n\n")}`] : []),
    "Explore Scripture with EMETSEES\nhttps://www.emetsees.com",
  ].join("\n\n");
}
