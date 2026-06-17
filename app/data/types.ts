export type TextTradition =
  | "septuagint"
  | "lxx-greek"
  | "masoretic"
  | "dead-sea-scrolls"
  | "new-testament";

export interface VerseSource {
  tradition: TextTradition;
  label: string;
  sourceName: string;
  text: string;
  language?: "english" | "hebrew" | "greek" | "aramaic";
  notes?: string[];
}

export interface Verse {
  id: string;
  book: string;
  chapter: number;
  verse: number;
  reference: string;
  sources: VerseSource[];
}