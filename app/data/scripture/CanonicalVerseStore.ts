import "server-only";
import fs from "fs";
import path from "path";
import type {
  BibleIQEntity,
  BibleIQSource,
} from "@/app/data/lexicon/BibleIQTypes";
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

type CanonicalTranslationToken = {
  index: number;
  text: string;
  normalized: string;
  alignedSourceTokenIds: string[];
  confidence?: string;
  method?: string;
};

type CanonicalVerse = {
  reference: string;
  book: string;
  chapter: number;
  verse: number;
  source: BibleIQSource;
  sourceTokens: CanonicalSourceToken[];
  translations: Record<
    string,
    {
      text: string;
      tokens: CanonicalTranslationToken[];
    }
  >;
};

type CanonicalHit = {
  entityId: string;
  sourceWord?: string;
  sourceToken?: CanonicalSourceToken;
  displayToken?: CanonicalTranslationToken;
};

const CANONICAL_ROOT = path.join(
  process.cwd(),
  "app",
  "data",
  "bibleiq",
  "canonical"
);

const RUNTIME_ENTITY_ROOT = path.join(
  process.cwd(),
  "app",
  "data",
  "bibleiq",
  "entities"
);

function safeEntityIdPart(value: string) {
  return String(value || "").replace(/[^A-Za-z0-9_-]/g, "");
}

function safeBook(book: string) {
  const evidenceBook = toEvidenceBook(book);
  return String(evidenceBook || "").replace(/[^1-3A-Za-z]/g, "");
}

function safeTranslation(translation: string) {
  const value = String(translation || "").toLowerCase();

  if (value.includes("kjv") || value.includes("king james")) return "kjv";
  if (value.includes("web") || value.includes("world english")) return "web";
  if (value.includes("brenton")) return "brenton";

  return value || "web";
}

function preferredCorpusForTranslation(translation: string): BibleIQSource {
  const value = String(translation || "").toLowerCase();

  if (value.includes("brenton") || value.includes("septuagint")) {
    return "lxx";
  }

  return "hebrew";
}

function loadCanonicalBook(corpus: BibleIQSource, book: string) {
  const filePath = path.join(
    CANONICAL_ROOT,
    corpus,
    `${safeBook(book)}.json`
  );

  if (!fs.existsSync(filePath)) return {};

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<
    string,
    CanonicalVerse
  >;
}
function entityPathFromId(entityId: string) {
  const cleanId = entityId.startsWith("word:")
    ? entityId.replace(/^word:/, "")
    : entityId;

  const [source, strong] = cleanId.split(":");

  if (!source || !strong) return null;

  return path.join(
    RUNTIME_ENTITY_ROOT,
    safeEntityIdPart(source),
    `${safeEntityIdPart(strong)}.json`
  );
}

export function findCanonicalHit({
  book,
  chapter,
  verse,
  translation,
  displayTokenIndex,
}: {
  book: string;
  chapter: number;
  verse: number;
  translation: string;
  displayTokenIndex?: number;
}): CanonicalHit | null {
  if (displayTokenIndex == null || displayTokenIndex < 0) return null;

  const corpus = preferredCorpusForTranslation(translation);
  const translationKey = safeTranslation(translation);
  const canonicalBook = loadCanonicalBook(corpus, book);
  const verseKey = `${safeBook(book)}:${chapter}:${verse}`;
  const canonical = canonicalBook[verseKey];

  if (!canonical) return null;

  const translationData = canonical.translations[translationKey];
  if (!translationData) return null;

  const displayToken = translationData.tokens.find(
    (token) => token.index === displayTokenIndex
  );

  if (!displayToken?.alignedSourceTokenIds?.length) return null;

  const sourceToken = canonical.sourceTokens.find(
    (token) => token.id === displayToken.alignedSourceTokenIds[0]
  );

  if (!sourceToken) return null;

  return {
    entityId: sourceToken.entityId,
    sourceWord: sourceToken.surface,
    sourceToken,
    displayToken,
  };
}
export function loadEntityFromCanonicalHit(
  hit: CanonicalHit
): BibleIQEntity | null {
  const filePath = entityPathFromId(hit.entityId);

  if (!filePath || !fs.existsSync(filePath)) return null;

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as BibleIQEntity;
}