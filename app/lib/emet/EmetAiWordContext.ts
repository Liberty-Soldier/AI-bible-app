import "server-only";

import { BibleIQEngine } from "@/app/data/lexicon/BibleIQEngine";
import type {
  BibleIQRequest,
  BibleIQResponse,
  BibleIQSource,
  BibleIQTranslation,
} from "@/app/data/lexicon/BibleIQTypes";
import { normalizeWordEntityId } from "@/app/data/lexicon/WordStudyEntityStore";
import { findCanonicalHit } from "@/app/data/scripture/CanonicalVerseStore";
import { resolveSourceBreakdown } from "@/app/data/bibleiq/SourceBreakdownRuntime";

export type EmetAiReaderWordContext = {
  book: string;
  chapter: number;
  verse: number;
  translation: BibleIQTranslation;
  displayWord: string;
  displayTokenIndex?: number;
  readerRecordId?: string;
  verseText?: string;
  entityId?: string;
  sourceOccurrenceId?: string;
  sourceLexicalId?: string;
  sourceCorpus?: BibleIQSource;
  sourceResolutionAuthority?: string;
  sourceResolutionMethod?: string;
};

function corpusFromEntityId(entityId: string): BibleIQSource | null {
  if (entityId.startsWith("word:hebrew:")) return "hebrew";
  if (entityId.startsWith("word:greek-nt:")) return "greek-nt";
  if (entityId.startsWith("word:lxx:")) return "lxx";
  return null;
}

function lexicalIdFromEntityId(entityId: string) {
  return entityId.split(":").at(-1) || "";
}

export async function resolveEmetAiReaderWord({
  context,
  origin,
  requestHeaders,
}: {
  context: EmetAiReaderWordContext;
  origin: string;
  requestHeaders?: Record<string, string>;
}): Promise<BibleIQResponse | null> {
  let entityId = "";
  let corpus: BibleIQSource | null = null;
  let lexicalId = "";
  let occurrenceId = "";
  let resolutionAuthority = "";
  let resolutionMethod = "";

  if (context.displayTokenIndex !== undefined && context.displayTokenIndex >= 0) {
    const hit = await findCanonicalHit({
      origin,
      translation: context.translation,
      book: context.book,
      chapter: context.chapter,
      verse: context.verse,
      displayTokenIndex: context.displayTokenIndex,
      readerRecordId: context.readerRecordId,
    });

    if (!hit || hit.compoundRoute) return null;

    const route = hit.v2Route?.sourceRoutes?.[0];
    if (
      hit.v2Route &&
      (hit.v2Route.mode !== "exact-single" ||
        hit.v2Route.sourceRoutes.length !== 1 ||
        route?.kind !== "lexical")
    ) {
      return null;
    }

    entityId = normalizeWordEntityId(route?.entityId || hit.entityId) || "";
    corpus = corpusFromEntityId(entityId);
    lexicalId =
      route?.lexicalId ||
      route?.strong ||
      hit.sourceToken?.strong ||
      lexicalIdFromEntityId(entityId);
    occurrenceId =
      route?.occurrenceId || route?.sourceTokenId || hit.sourceToken?.id || "";
    resolutionAuthority = "canonical-reader-occurrence-index";
    resolutionMethod = hit.v2Route
      ? `reader-${hit.v2Route.mode}`
      : "reader-exact-source-token";
  } else {
    entityId = normalizeWordEntityId(context.entityId || "") || "";
    corpus = context.sourceCorpus || corpusFromEntityId(entityId);
    lexicalId = context.sourceLexicalId || "";
    occurrenceId = context.sourceOccurrenceId || "";
    resolutionAuthority = context.sourceResolutionAuthority || "";
    resolutionMethod = context.sourceResolutionMethod || "";

    if (!entityId || !corpus || !lexicalId || !occurrenceId) return null;

    const breakdown = await resolveSourceBreakdown({
      origin,
      translation: context.translation,
      book: context.book,
      chapter: context.chapter,
      verse: context.verse,
      source: corpus,
      requestHeaders,
    });
    const matches = (breakdown?.sourceVerses || [])
      .flatMap((sourceVerse) => sourceVerse.occurrences)
      .filter((occurrence) => occurrence.id === occurrenceId);
    if (matches.length !== 1) return null;

    const occurrence = matches[0];
    const resolution = occurrence.lexicalResolution;
    if (
      occurrence.grammarOnly ||
      occurrence.lexicalId !== lexicalId ||
      occurrence.entityId !== entityId
    ) {
      return null;
    }

    if (resolution?.status === "resolved") {
      if (
        resolution.corpus !== corpus ||
        resolution.lexicalId !== lexicalId ||
        resolution.entityId !== entityId ||
        (resolutionAuthority && resolution.authority !== resolutionAuthority) ||
        (resolutionMethod && resolution.method !== resolutionMethod)
      ) {
        return null;
      }
      resolutionAuthority = resolution.authority;
      resolutionMethod = resolution.method;
    } else if (
      resolutionAuthority !== "canonical-source-breakdown-occurrence" ||
      resolutionMethod !== "exact-source-occurrence"
    ) {
      return null;
    }
  }

  if (!corpus || !lexicalId || !occurrenceId) return null;
  if (entityId !== `word:${corpus}:${lexicalId}`) return null;

  const input: BibleIQRequest = {
    entityId,
    book: context.book,
    chapter: context.chapter,
    verse: context.verse,
    translation: context.translation,
    displayWord: context.displayWord,
    selectedText: context.displayWord,
    displayTokenIndex: context.displayTokenIndex,
    readerRecordId: context.readerRecordId,
    verseText: context.verseText,
    sourceOccurrenceId: occurrenceId,
    sourceLexicalId: lexicalId,
    sourceCorpus: corpus,
    sourceResolutionAuthority: resolutionAuthority,
    sourceResolutionMethod: resolutionMethod,
  };

  const wordStudy = await BibleIQEngine.resolve(
    input,
    origin,
    requestHeaders,
  );

  const resolution = wordStudy.entity?.alignment?.lexicalResolution;
  if (
    !wordStudy.resolved ||
    !resolution ||
    resolution.entityId !== entityId ||
    resolution.lexicalId !== lexicalId ||
    resolution.corpus !== corpus ||
    resolution.sourceOccurrenceId !== occurrenceId
  ) {
    return null;
  }

  return wordStudy;
}
