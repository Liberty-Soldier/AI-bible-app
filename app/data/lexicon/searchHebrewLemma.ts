export type HebrewLemmaEntry = {
  testament: string;
  language: string;
  lemma: string;
  surfaces: [string, number][];
  morphs: [string, number][];
  occurrenceCount: number;
  occurrences: {
    book: string;
    reference: string;
    surface: string;
    morph: string;
  }[];
};

/**
 * Retired.
 *
 * Hebrew lemma lookup now comes from the BibleIQ
 * canonical evidence pipeline rather than loading a
 * massive runtime JSON index.
 */
export function findHebrewLemma(
  _lemma: string
): HebrewLemmaEntry | null {
  return null;
}