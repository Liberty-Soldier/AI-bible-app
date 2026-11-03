// Shared transport boundary. Answer prose is deliberately never rewritten.
export function isPrivateAnswerNote(note: string): boolean {
  if (/owner\s*(?:diagnostic|inspection)|owner[- ]only|citation-resolution|inline-citation-unverified|quotation-unverified/i.test(note)) return true;
  if (/^\s*[\[{]/.test(note) && /"(?:diagnostics?|debug|claimId|authority|unresolvedReferences)"\s*:/i.test(note)) return true;
  return false;
}
export function publicAnswerNotes(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((note): note is string => typeof note === 'string' && !isPrivateAnswerNote(note) && note !== 'The model reported insufficient evidence. This explanation is unverified.') : [];
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
      if (key === 'answer' && typeof item === 'string') return [[key, item]];
      return [[key, clean(item)]];
    }));
  }
  return clean(body) as Record<string, unknown>;
}
