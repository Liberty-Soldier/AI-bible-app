import type { UnifiedWordStudyResult } from "./types";

/**
 * Legacy unified lemma search retired.
 *
 * Do not import huge generated lemma/occurrence JSON files at runtime.
 * Word Study should resolve through:
 *
 * Reader token
 *   -> CanonicalVerseStore
 *   -> source token
 *   -> BibleIQ entity
 *
 * This file remains only as a compatibility shim until old callers are removed.
 */
export function findUnifiedWordStudy(query: string): UnifiedWordStudyResult {
  return {
    query,
    matches: [],
  };
}