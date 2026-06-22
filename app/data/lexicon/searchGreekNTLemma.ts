import greekNTLemmaIndexJson from "./generatedGreekNTLemmaIndex.json";

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

const greekNTLemmaIndex = greekNTLemmaIndexJson as GreekNTLemmaEntry[];

export function findGreekNTLemma(strongs: string) {
  return greekNTLemmaIndex.find((entry) => entry.strongs === strongs) || null;
}