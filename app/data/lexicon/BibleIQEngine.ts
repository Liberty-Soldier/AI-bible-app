import { findCanonicalHit } from "@/app/data/scripture/CanonicalVerseStore";

import type {
  BibleIQEntity,
  BibleIQRequest,
  BibleIQResponse,
  BibleIQSource,
} from "./BibleIQTypes";

function normalize(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function safeEntityIdPart(value: string) {
  return String(value || "").replace(/[^A-Za-z0-9_-]/g, "");
}

function entityPublicPath(entityId: string) {
  const cleanId = entityId.startsWith("word:")
    ? entityId.replace(/^word:/, "")
    : entityId;

  const [source, strong] = cleanId.split(":");

  if (!source || !strong) return null;

  return `/data/bibleiq/entities/${safeEntityIdPart(source)}/${safeEntityIdPart(
    strong
  )}.json`;
}

async function loadEntity(entityId: string, origin: string) {
  const publicPath = entityPublicPath(entityId);
  if (!publicPath) return null;

  const response = await fetch(`${origin}${publicPath}`, {
    cache: "force-cache",
  });

  if (!response.ok) return null;

  return (await response.json()) as BibleIQEntity;
}

function isNewTestament(book: string) {
  return new Set([
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
  ]).has(book);
}

function determinePreferredSource(input: BibleIQRequest): BibleIQSource {
  const translation = normalize(input.translation);

  if (isNewTestament(input.book)) return "greek-nt";

  if (
    translation.includes("brenton") ||
    translation.includes("septuagint") ||
    translation.includes("lxx")
  ) {
    return "lxx";
  }

  return "hebrew";
}

function unresolved(
  input: BibleIQRequest,
  preferredSource: BibleIQSource
): BibleIQResponse {
  return {
    resolved: false,
    resolutionType: "unresolved",
    preferredSource,
    query: input.displayWord,
    message: "BibleIQ could not resolve this word from canonical verse context yet.",
  };
}

function buildPlaceholderEntity(
  input: BibleIQRequest,
  preferredSource: BibleIQSource
): BibleIQEntity {
  const title = input.displayWord.trim();

  return {
    id: `${preferredSource}:${input.book}:${input.chapter}:${input.verse}:${normalize(
      title
    )}`,
    type: "word",
    title,
    subtitle: "BibleIQ Evidence",

    simple: {
      meaning: undefined,
      inThisVerse: input.verseText
        ? `This word appears in ${input.book} ${input.chapter}:${input.verse}.`
        : "This word appears in the selected verse.",
      whyItMatters:
        "BibleIQ is preparing the source-language evidence for this word.",
      summary:
        "This word has not been connected to the canonical source-language verse model yet.",
    },

    evidence: {
      originalLanguage: input.originalWord
        ? {
            source: preferredSource,
            word: input.originalWord,
          }
        : undefined,

      firstMention: undefined,
      keyReferences: [`${input.book} ${input.chapter}:${input.verse}`],

      related: {
        people: [],
        places: [],
        concepts: [],
        events: [],
      },

      occurrences: [
        {
          reference: `${input.book} ${input.chapter}:${input.verse}`,
          book: input.book,
          chapter: input.chapter,
          verse: input.verse,
          englishText: input.verseText || "",
          sourceWord: input.originalWord,
          source: preferredSource,
        },
      ],
    },
  };
}

export async function resolveBibleIQ(
  input: BibleIQRequest,
  origin: string
): Promise<BibleIQResponse> {
  const preferredSource = determinePreferredSource(input);

  if (!input.displayWord?.trim()) {
    return unresolved(input, preferredSource);
  }

  const hit = findCanonicalHit({
    translation: input.translation,
    book: input.book,
    chapter: input.chapter,
    verse: input.verse,
    displayTokenIndex: input.displayTokenIndex,
  });

  if (hit) {
    const entity = await loadEntity(hit.entityId, origin);

    if (entity) {
      return {
        resolved: true,
        resolutionType: "verse-context",
        preferredSource,
        query: input.displayWord,
        entity: {
          ...entity,
          evidence: {
            ...entity.evidence,
            originalLanguage: entity.evidence.originalLanguage
              ? {
                  ...entity.evidence.originalLanguage,
                  word: hit.sourceWord || entity.evidence.originalLanguage.word,
                  strong: entity.evidence.originalLanguage.strong,
                }
              : undefined,
          },
        },
      };
    }
  }

  const entity = buildPlaceholderEntity(input, preferredSource);

  return {
    resolved: true,
    resolutionType: "unresolved",
    preferredSource,
    query: input.displayWord,
    entity,
  };
}

export const BibleIQEngine = {
  resolve: resolveBibleIQ,
};