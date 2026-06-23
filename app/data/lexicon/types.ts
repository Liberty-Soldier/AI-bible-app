export type LexiconCorpus =
  | "hebrew-bible"
  | "nt-greek"
  | "lxx-greek";

export type LexiconLanguage =
  | "hebrew"
  | "greek";

export type UnifiedWordStudyMatch = {
  id: string;
  language: LexiconLanguage;
  corpus: LexiconCorpus;

  lemma: string;
  strong?: string;
  gloss?: string;

  occurrenceCount: number;

  forms?: [string, number][];
  morphs?: [string, number][];

  occurrences: {
    book: string;
    reference: string;
    chapter?: number;
    verse?: number;
    word?: string;
    surface?: string;
    morph?: string;
  }[];

  source: string;
};

export type UnifiedWordStudyResult = {
  query: string;
  matches: UnifiedWordStudyMatch[];
};