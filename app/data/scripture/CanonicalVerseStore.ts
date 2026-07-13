import "server-only";

import type { BibleIQSource } from "@/app/data/lexicon/BibleIQTypes";
import { toEvidenceBook } from "@/app/data/evidence/evidenceBookMap";

type CanonicalSourceToken = {
  id: string;
  index: number;
  source: BibleIQSource;
  surface: string;
  lemma?: string;
  strong?: string;
  entityId: string;
  morph?: string;
};

type CompactSourceToken = [
  id: string,
  surface: string,
  lemma: string,
  strong: string,
  entityId: string,
  morph: string,
];

type CompactVerse = {
  s: CompactSourceToken[];
  a: Record<string, Record<string, number>>;
};

type CompactBook = {
  version: number;
  corpus: BibleIQSource;
  book: string;
  verses: Record<string, CompactVerse>;
};

type RuntimeManifest = {
  version: number;
  corpora: Record<
    BibleIQSource,
    {
      aliases: Record<string, string>;
      books: Record<string, unknown>;
    }
  >;
};

export type CanonicalHit = {
  entityId: string;
  sourceWord?: string;
  sourceToken?: CanonicalSourceToken;
};

const RUNTIME_ROOT = "/data/bibleiq/word-study";
const manifestCache = new Map<string, Promise<RuntimeManifest | null>>();
const bookCache = new Map<string, Promise<CompactBook | null>>();

const NEW_TESTAMENT_BOOKS = new Set([
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "1 John",
  "2 John",
  "3 John",
  "Jude",
  "Revelation",
]);

function normalizeAlias(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^0-9A-Za-z]+/g, "")
    .toLowerCase();
}

function safeTranslation(translation: string) {
  const value = String(translation || "").toLowerCase();
  if (value.includes("kjv") || value.includes("king james")) return "kjv";
  if (value.includes("web") || value.includes("world english")) return "web";
  if (value.includes("brenton")) return "brenton";
  return value || "web";
}

function preferredCorpusForTranslation(
  translation: string,
  book: string,
): BibleIQSource {
  const value = String(translation || "").toLowerCase();
  if (
    value.includes("brenton") ||
    value.includes("septuagint") ||
    value.includes("lxx")
  ) {
    return "lxx";
  }
  if (NEW_TESTAMENT_BOOKS.has(book)) return "greek-nt";
  return "hebrew";
}

function runtimeUrl(origin: string, relativePath: string) {
  return new URL(`${RUNTIME_ROOT}/${relativePath.replace(/^\/+/, "")}`, origin).toString();
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (error) {
    console.error(`BibleIQ runtime fetch failed: ${url}`, error);
    return null;
  }
}

function loadManifest(origin: string) {
  const key = new URL(origin).origin;
  let pending = manifestCache.get(key);
  if (!pending) {
    pending = fetchJson<RuntimeManifest>(runtimeUrl(key, "manifest.json"));
    manifestCache.set(key, pending);
  }
  return pending;
}

async function loadRuntimeBook(
  origin: string,
  corpus: BibleIQSource,
  book: string,
): Promise<CompactBook | null> {
  const manifest = await loadManifest(origin);
  const corpusManifest = manifest?.corpora?.[corpus];
  if (!corpusManifest) return null;

  const aliases = [book, toEvidenceBook(book)].map(normalizeAlias).filter(Boolean);
  const outputFile = aliases
    .map((alias) => corpusManifest.aliases?.[alias])
    .find(Boolean);
  if (!outputFile) return null;

  const originKey = new URL(origin).origin;
  const cacheKey = `${originKey}|${corpus}|${outputFile}`;
  let pending = bookCache.get(cacheKey);
  if (!pending) {
    pending = fetchJson<CompactBook>(runtimeUrl(originKey, `${corpus}/${outputFile}`));
    bookCache.set(cacheKey, pending);
  }
  return pending;
}

function expandSourceToken(
  corpus: BibleIQSource,
  compact: CompactSourceToken,
  index: number,
): CanonicalSourceToken {
  return {
    id: compact[0],
    index,
    source: corpus,
    surface: compact[1],
    lemma: compact[2] || undefined,
    strong: compact[3] || undefined,
    entityId: compact[4],
    morph: compact[5] || undefined,
  };
}

export async function findCanonicalHit({
  origin,
  book,
  chapter,
  verse,
  translation,
  displayTokenIndex,
}: {
  origin: string;
  book: string;
  chapter: number;
  verse: number;
  translation: string;
  displayTokenIndex?: number;
}): Promise<CanonicalHit | null> {
  if (displayTokenIndex == null || displayTokenIndex < 0) return null;

  const corpus = preferredCorpusForTranslation(translation, book);
  const translationKey = safeTranslation(translation);
  const runtimeBook = await loadRuntimeBook(origin, corpus, book);
  const compactVerse = runtimeBook?.verses?.[`${chapter}:${verse}`];
  if (!compactVerse) return null;

  const sourceIndex = compactVerse.a?.[translationKey]?.[String(displayTokenIndex)];
  if (
    typeof sourceIndex !== "number" ||
    !Number.isInteger(sourceIndex) ||
    sourceIndex < 0
  ) {
    return null;
  }

  const compactSource = compactVerse.s?.[sourceIndex];
  if (!compactSource) return null;

  const sourceToken = expandSourceToken(corpus, compactSource, sourceIndex);
  if (!sourceToken.entityId) return null;

  return {
    entityId: sourceToken.entityId,
    sourceWord: sourceToken.surface,
    sourceToken,
  };
}