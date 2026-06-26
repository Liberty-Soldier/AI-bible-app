export type AskContextChip =
  | {
      id: string;
      type: "reader";
      label: string;
      book: string;
      chapter: number;
      verse?: number | null;
      translation?: string;
      studyMode?: boolean;
    }
  | {
      id: string;
      type: "word";
      label: string;
      word: string;
      lemma?: string;
      strong?: string;
    };