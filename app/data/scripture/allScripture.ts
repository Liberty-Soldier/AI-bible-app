import generatedBrentonJson from "./generatedBrenton.json";
import generatedWEBJson from "./generatedWEB.json";
import generatedKJVJson from "./generatedKJV.json";
import generatedGNTJson from "./generatedGNT.json";

type RawScriptureVerse = {
  reference: string;
  sources: {
    tradition?: string;
    label?: string;
    sourceName: string;
    language?: string;
    text: string;
  }[];
};

type ScriptureSource = {
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

function parseReference(reference: string) {
  const match = reference.match(/^(.+?)\s+(\d+):(\d+)$/);

  if (!match) {
    return {
      book: reference,
      chapter: 1,
      verse: 1,
    };
  }

  return {
    book: match[1],
    chapter: Number(match[2]),
    verse: Number(match[3]),
  };
}

function normalizeVerse(raw: RawScriptureVerse): ScriptureVerse {
  const parsed = parseReference(raw.reference);

  return {
    id: raw.reference,
    reference: raw.reference,
    book: parsed.book,
    chapter: parsed.chapter,
    verse: parsed.verse,
    sources: raw.sources.map((source) => ({
      sourceName: source.sourceName,
      text: source.text,
    })),
  };
}

const generatedBrenton = (generatedBrentonJson as RawScriptureVerse[]).map(normalizeVerse);
const generatedWEB = (generatedWEBJson as RawScriptureVerse[]).map(normalizeVerse);
const generatedKJV = (generatedKJVJson as RawScriptureVerse[]).map(normalizeVerse);
const generatedGNT = (generatedGNTJson as RawScriptureVerse[]).map(normalizeVerse);

export const allScripture: ScriptureVerse[] = [
  ...generatedBrenton,
  ...generatedWEB,
  ...generatedKJV,
  ...generatedGNT,
];