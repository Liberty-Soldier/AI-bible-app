// Exact application notices only. This is not a classifier of theological prose.
// A material qualification which does not match these service notices is retained.
const serviceNotices = [
  "Please check the passages and limitations below before relying on this explanation.",
  "EMET can make mistakes. Always verify its answers against Scripture.",
  "Some Scripture references in this answer could not be verified. Please check them before relying on this explanation.",
  "The model reported insufficient evidence. This explanation is unverified.",
  "Unverified model answer: some Scripture references could not be resolved. Only the separately displayed passages have verified corpus text.",
  "The explanation, its prose references, and any quoted wording are model-generated and not independently verified. Only the server-supplied Scripture passages are checked against their stated translations; this does not establish support for every theological inference.",
];
export function withoutServiceNotices(value: string): string {
  let result = value;
  for (let count = 0; count < serviceNotices.length; count++) {
    const notice = serviceNotices.find(notice => result.trimStart().startsWith(notice));
    if (notice) {
      result = result.trimStart().slice(notice.length).trimStart();
      continue;
    }
    const suffix = serviceNotices.find(notice => result.trimEnd().endsWith(notice));
    if (!suffix) break;
    result = result.trimEnd().slice(0, -suffix.length).trimEnd();
  }
  return result;
}
export function answerWithoutServiceNotices(value: string): string {
  // Never erase an entire answer or invent substitute wording. Normal substantive
  // explanations are untouched; known service framing is removed only when
  // substantive explanation text remains.
  return withoutServiceNotices(value) || value;
}
// Shared transport boundary. Substantive answer prose is never paraphrased.
export function isPrivateAnswerNote(note: string): boolean {
  if (/owner\s*(?:diagnostic|inspection|experiment|testing)|owner[- ]only|citation-resolution|inline-citation-unverified|quotation-unverified/i.test(note)) return true;
  if (/^\s*[\[{]/.test(note) && /"(?:diagnostics?|debug|claimId|authority|unresolvedReferences)"\s*:/i.test(note)) return true;
  return false;
}
export function publicAnswerNotes(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((note): note is string => typeof note === 'string' && !isPrivateAnswerNote(note)).map(withoutServiceNotices).filter(note => Boolean(note.trim())) : [];
}
const privateKeys = new Set(['diagnostics', 'diagnostic', 'unresolvedreferences', 'ownerdiagnostics', 'debug', 'debugrecords', 'authoritymetadata']);
export function publicAnswerResponse(body: Record<string, unknown>): Record<string, unknown> {
  function clean(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
      if (privateKeys.has(key.replace(/[_-]/g, '').toLowerCase())) return [];
      if (key === 'limitations' || key === 'qualifications') return [[key, publicAnswerNotes(item)]];
      // These strings contain the user's question or the model's actual wording.
      if (key === 'answer' && typeof item === 'string') return [[key, answerWithoutServiceNotices(item)]];
      return [[key, clean(item)]];
    }));
  }
  return clean(body) as Record<string, unknown>;
}
