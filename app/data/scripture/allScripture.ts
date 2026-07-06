export type ScriptureSource = {
  sourceName: string;
  text: string;
  tradition?: string;
  label?: string;
  language?: string;
  isOriginalLanguage?: boolean;
};

export type ScriptureVerse = {
  id: string;
  reference: string;
  book: string;
  chapter: number;
  verse: number;
  sources: ScriptureSource[];
};

/**
 * Retired bulk scripture import.
 * Do not import full Bible JSON into runtime.
 */
export const allScripture: ScriptureVerse[] = [];