import hebrewLemmaIndexJson from "./generatedHebrewLemmaIndex.json";

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

const hebrewLemmaIndex = hebrewLemmaIndexJson as HebrewLemmaEntry[];

export function findHebrewLemma(lemma: string) {
  return hebrewLemmaIndex.find((entry) => entry.lemma === lemma) || null;
}