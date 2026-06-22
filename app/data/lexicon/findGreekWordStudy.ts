import occurrences from "@/app/data/scripture/generatedGreekNTOccurrences.json";

type GreekOccurrenceEntry = {
  strong: string;
  gloss: string;
  words: string[];
  occurrences: {
    reference: string;
    word: string;
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