export type WordStudyEntry = {
  strong: string;
  lemma: string;
  transliteration?: string;
  pronunciation?: string;
  language: string;
  corpus: string;
  gloss?: string;
  definition?: string;
  occurrenceCount?: number;
  forms?: unknown[];
  occurrences?: unknown[];
  sources?: string[];
};

export type WordStudyResult = {
  query: string;
  matches: WordStudyEntry[];
};

// Temporary placeholder.
// Do NOT import giant JSON files here yet.
// We already proved that breaks the Next build.
export async function getWordStudy(query: string): Promise<WordStudyResult> {
  return {
    query,
    matches: [],
  };
}