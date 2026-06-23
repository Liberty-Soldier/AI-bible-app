import occurrences from "@/app/data/scripture/generatedGreekNTOccurrences.json";

type GreekOccurrenceEntry = {
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

const greekOccurrences = occurrences as Record<
  string,
  GreekOccurrenceEntry
>;

export function findGreekWordStudy(word: string) {
  const search = word.toLowerCase();

  for (const entry of Object.values(greekOccurrences)) {
    if (
      entry.gloss?.toLowerCase() === search ||
      entry.words?.some((w) => w.toLowerCase() === search)
    ) {
      return entry;
    }
  }

  return null;
}