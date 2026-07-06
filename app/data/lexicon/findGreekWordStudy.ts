export type GreekOccurrenceEntry = {
  strong: string;
  gloss: string;
  words: string[];
  occurrences: {
    book: string;
    chapter: number;
    verse: number;
    reference: string;
    word: string;
    gloss?: string;
    morph?: string;
    morphEnglish?: string;
    sort?: string;
  }[];
};

/**
 * Legacy helper retired.
 *
 * Greek word study now resolves through the
 * canonical BibleIQ evidence pipeline instead of
 * loading the 40+ MB occurrence index at runtime.
 */
export function findGreekWordStudy(
  _word: string
): GreekOccurrenceEntry | null {
  return null;
}