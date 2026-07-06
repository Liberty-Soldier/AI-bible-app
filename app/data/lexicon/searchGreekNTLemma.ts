export type GreekNTLemmaEntry = {
  testament: string;
  language: string;
  strongs: string;
  lemma: string;
  gloss: string;
  occurrenceCount: number;
  occurrences: {
    book: string;
    reference: string;
    chapter: number;
    verse: number;
  }[];
};

/**
 * Retired.
 *
 * NT lemma lookup now comes from the BibleIQ
 * canonical evidence pipeline rather than loading
 * a massive runtime JSON index.
 */
export function findGreekNTLemma(
  _strongs: string
): GreekNTLemmaEntry | null {
  return null;
}