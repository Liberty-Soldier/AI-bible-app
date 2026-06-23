import hebrewLemmaIndexJson from "./generatedHebrewLemmaIndex.json";
import greekNTLemmaIndexJson from "./generatedGreekNTLemmaIndex.json";
import greekOccurrencesJson from "@/app/data/scripture/generatedGreekNTOccurrences.json";

import type {
  UnifiedWordStudyMatch,
  UnifiedWordStudyResult,
} from "./types";

type HebrewLemmaEntry = {
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

type GreekNTLemmaEntry = {
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

const hebrewLemmaIndex = hebrewLemmaIndexJson as HebrewLemmaEntry[];
const greekNTLemmaIndex = greekNTLemmaIndexJson as GreekNTLemmaEntry[];
const greekOccurrences = greekOccurrencesJson as Record<string, GreekOccurrenceEntry>;

function normalize(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase()
    .trim();
}

export function findUnifiedWordStudy(query: string): UnifiedWordStudyResult {
  const search = normalize(query);

  const matches: UnifiedWordStudyMatch[] = [];

  for (const entry of hebrewLemmaIndex) {
    const lemmaMatch = normalize(entry.lemma) === search;

    const surfaceMatch = entry.surfaces?.some(
      ([surface]) => normalize(surface) === search
    );

    if (lemmaMatch || surfaceMatch) {
      matches.push({
        id: `hebrew:${entry.lemma}`,
        language: "hebrew",
        corpus: "hebrew-bible",
        lemma: entry.lemma,
        occurrenceCount: entry.occurrenceCount,
        forms: entry.surfaces,
        morphs: entry.morphs,
        occurrences: entry.occurrences,
        source: "Hebrew WLC / MorphHB",
      });
    }
  }

  for (const entry of greekNTLemmaIndex) {
    const lemmaMatch = normalize(entry.lemma) === search;
    const glossMatch = normalize(entry.gloss) === search;
    const strongMatch = normalize(entry.strongs) === search;

    if (lemmaMatch || glossMatch || strongMatch) {
      matches.push({
        id: `nt-greek:${entry.strongs}`,
        language: "greek",
        corpus: "nt-greek",
        lemma: entry.lemma,
        strong: entry.strongs,
        gloss: entry.gloss,
        occurrenceCount: entry.occurrenceCount,
        occurrences: entry.occurrences,
        source: "OpenGNT",
      });
    }
  }

  for (const entry of Object.values(greekOccurrences)) {
    const glossMatch = normalize(entry.gloss) === search;
    const strongMatch = normalize(entry.strong) === search;
    const wordMatch = entry.words?.some((word) => normalize(word) === search);

    if (glossMatch || strongMatch || wordMatch) {
      matches.push({
        id: `nt-greek-occurrence:${entry.strong}`,
        language: "greek",
        corpus: "nt-greek",
        lemma: entry.strong,
        strong: entry.strong,
        gloss: entry.gloss,
        occurrenceCount: entry.occurrences.length,
        forms: entry.words.map((word) => [word, 1]),
        occurrences: entry.occurrences,
        source: "OpenGNT occurrences",
      });
    }
  }

  return {
    query,
    matches,
  };
}