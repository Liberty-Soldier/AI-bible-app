import "server-only";

import type {
  BibleIQReference,
  BibleIQTranslation,
} from "@/app/data/lexicon/BibleIQTypes";
import {
  normalizeReaderChapter,
  type ReaderChapter,
} from "@/app/data/scripture/ReaderVerseAdapter";
import type {
  EmetAiVerseEvidence,
  EmetAiVerseLoader,
} from "./EmetAiEvidenceBuilder";

function safeBook(book: string) {
  return String(book || "")
    .replace(/[^1-3A-Za-z ]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

function runtimeUrl(
  origin: string,
  translation: BibleIQTranslation,
  book: string,
  chapter: number,
) {
  return new URL(
    `/scripture/runtime/${translation}/${safeBook(book)}/${chapter}.json`,
    new URL(origin).origin,
  ).toString();
}

function verseText(chapter: ReaderChapter, verse: number) {
  const record = chapter.verses.find((item) => item.verse === verse);
  if (!record) return null;

  const text = record.sources.map((source) => source.text.trim()).find(Boolean);
  if (!text) return null;

  return {
    reference: record.reference,
    text,
    sourceId: record.id,
  };
}

export function createEmetAiVerseLoader(
  origin: string,
  requestHeaders?: Record<string, string>,
): EmetAiVerseLoader {
  const chapterCache = new Map<string, Promise<ReaderChapter | null>>();

  return async function loadVerse(
    reference: BibleIQReference,
  ): Promise<EmetAiVerseEvidence | null> {
    const translation = reference.routeTranslation;
    const url = runtimeUrl(
      origin,
      translation,
      reference.book,
      reference.chapter,
    );
    let pending = chapterCache.get(url);

    if (!pending) {
      pending = (async () => {
        try {
          const response = await fetch(url, {
            cache: "no-store",
            headers: requestHeaders,
          });

          if (!response.ok) return null;
          return normalizeReaderChapter(await response.json());
        } catch {
          return null;
        }
      })();
      chapterCache.set(url, pending);
    }

    const chapter = await pending;
    if (!chapter) return null;

    const verse = verseText(chapter, reference.verse);
    if (!verse) return null;

    return {
      ...verse,
      translation,
    };
  };
}
