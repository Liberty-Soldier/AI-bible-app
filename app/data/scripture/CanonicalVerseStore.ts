import "server-only";

import type {
  BibleIQChapterTokenAvailability,
  BibleIQVerseTokenAvailability,
  BibleIQCompoundRouteKind,
  BibleIQSource,
  BibleIQV2RouteMode,
  BibleIQV2SourceRoute,
  BibleIQV2SourceSegment,
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

type CompactSourceToken = [
  id: string,
  surface: string,
  lemma: string,
  strong: string,
  entityId: string,
  morph: string,
];

type CompactV2Route = {
  mode: BibleIQV2RouteMode;
  si?: number[];
  routes?: Array<Record<string, unknown>>;
  segment?: Record<string, unknown>;
  d?: string;
};

type CompactVerse = {
  s: CompactSourceToken[];
  a: Record<string, Record<string, number>>;
  v?: Record<string, Record<string, CompactV2Route>>;
};

type CompactBook = {
  version: number;
  corpus: BibleIQSource;
  book: string;
  verses: Record<string, CompactVerse>;
};

type RuntimeCorpusManifest = {
  aliases: Record<string, string>;
  books: Record<string, unknown>;
};

type RuntimeManifest = {
  version: number;
  corpora: Record<BibleIQSource, RuntimeCorpusManifest>;
};

type KjvReaderRuntimeManifest = {
  version: number;
  aliases: Record<string, string>;
  books: Record<string, unknown>;
};

export type CanonicalCompoundRoute = {
  routeId: string;
  lexicalId: string;
  label: string;
  routeKind: BibleIQCompoundRouteKind;
  componentLexicalIds: string[];
};

export type CanonicalV2Route = {
  mode: BibleIQV2RouteMode;
  displayText?: string;
  sourceRoutes: BibleIQV2SourceRoute[];
  sourceSegment?: BibleIQV2SourceSegment;
};

export type CanonicalHit = {
  entityId: string;
  sourceWord?: string;
  sourceToken?: CanonicalSourceToken;
  compoundRoute?: CanonicalCompoundRoute;
  v2Route?: CanonicalV2Route;
};

const RUNTIME_ROOT = "/data/bibleiq/word-study";
const manifestCache = new Map<string, Promise<RuntimeManifest | null>>();
const bookCache = new Map<string, Promise<CompactBook | null>>();
const KJV_READER_RUNTIME_ROOT = "/data/bibleiq/word-study-kjv-reader";
const kjvReaderManifestCache = new Map<string, Promise<KjvReaderRuntimeManifest | null>>();
const kjvReaderBookCache = new Map<string, Promise<CompactBook | null>>();


const GREEK_COMPOUND_ROUTES: Record<
  string,
  Omit<CanonicalCompoundRoute, "lexicalId">
> = {
  "G4566«G4567": {
    routeId: "compound:greek-nt:G4566-G4567",
    label: "Satan",
    routeKind: "lexical-compound-alias",
    componentLexicalIds: ["G4566", "G4567"],
  },
  "G3535«G3536": {
    routeId: "compound:greek-nt:G3535-G3536",
    label: "Ninevites",
    routeKind: "lexical-compound-alias",
    componentLexicalIds: ["G3535", "G3536"],
  },
  "G1176+G3638": {
    routeId: "compound:greek-nt:G1176-G3638",
    label: "eighteen",
    routeKind: "compositional-number",
    componentLexicalIds: ["G1176", "G3638"],
  },
  "G3379+G4219": {
    routeId: "compound:greek-nt:G3379-G4219",
    label: "lest",
    routeKind: "compositional-function-word",
    componentLexicalIds: ["G3379", "G4219"],
  },
};

function compoundRouteForSourceToken(
  sourceToken: CanonicalSourceToken,
): CanonicalCompoundRoute | undefined {
  if (sourceToken.source !== "greek-nt" || !sourceToken.strong) {
    return undefined;
  }

  const route = GREEK_COMPOUND_ROUTES[sourceToken.strong];
  if (!route || sourceToken.entityId !== route.routeId) {
    return undefined;
  }

  return {
    ...route,
    lexicalId: sourceToken.strong,
  };
}

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

function canonicalBookName(book: string) {
  return toEvidenceBook(book) || book;
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
  const rawBook = String(book || "").trim();
  const evidenceBook = toEvidenceBook(rawBook);

  // Source ownership is determined by canon first. Accept both reader names
  // ("Revelation") and SEE/evidence abbreviations ("Rev").
  if (
    NEW_TESTAMENT_BOOKS.has(rawBook) ||
    Array.from(NEW_TESTAMENT_BOOKS).some(
      (bookName) => toEvidenceBook(bookName) === evidenceBook
    )
  ) {
    return "greek-nt";
  }

  const value = String(translation || "").toLowerCase();
  if (
    value.includes("brenton") ||
    value.includes("septuagint") ||
    value.includes("lxx")
  ) {
    return "lxx";
  }

  return "hebrew";
}

function runtimeUrl(origin: string, relativePath: string) {
  return new URL(
    `${RUNTIME_ROOT}/${relativePath.replace(/^\/+/, "")}`,
    origin,
  ).toString();
}

function kjvReaderRuntimeUrl(origin: string, relativePath: string) {
  return new URL(
    `${KJV_READER_RUNTIME_ROOT}/${relativePath.replace(/^\/+/, "")}`,
    origin,
  ).toString();
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      console.error(`SEE runtime returned ${response.status}: ${url}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error(`SEE runtime fetch failed: ${url}`, error);
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

  const aliases = [book, canonicalBookName(book)]
    .map(normalizeAlias)
    .filter(Boolean);

  const outputFile = aliases
    .map((alias) => corpusManifest.aliases?.[alias])
    .find(Boolean);

  if (!outputFile) {
    console.error(
      `SEE runtime has no ${corpus} book alias for ${book} (${aliases.join(
        ", ",
      )})`,
    );
    return null;
  }

  const originKey = new URL(origin).origin;
  const cacheKey = `${originKey}|${corpus}|${outputFile}`;
  let pending = bookCache.get(cacheKey);

  if (!pending) {
    pending = fetchJson<CompactBook>(
      runtimeUrl(originKey, `${corpus}/${outputFile}`),
    );
    bookCache.set(cacheKey, pending);
  }

  return pending;
}

function loadKjvReaderManifest(origin: string) {
  const key = new URL(origin).origin;
  let pending = kjvReaderManifestCache.get(key);

  if (!pending) {
    pending = fetchJson<KjvReaderRuntimeManifest>(
      kjvReaderRuntimeUrl(key, "manifest.json"),
    );
    kjvReaderManifestCache.set(key, pending);
  }

  return pending;
}

async function loadKjvReaderBook(
  origin: string,
  book: string,
): Promise<CompactBook | null> {
  const manifest = await loadKjvReaderManifest(origin);
  const aliases = [book, canonicalBookName(book)]
    .map(normalizeAlias)
    .filter(Boolean);
  const outputFile = aliases
    .map((alias) => manifest?.aliases?.[alias])
    .find(Boolean);

  if (!outputFile) return null;

  const originKey = new URL(origin).origin;
  const cacheKey = `${originKey}|${outputFile}`;
  let pending = kjvReaderBookCache.get(cacheKey);

  if (!pending) {
    pending = fetchJson<CompactBook>(
      kjvReaderRuntimeUrl(originKey, outputFile),
    );
    kjvReaderBookCache.set(cacheKey, pending);
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

function expandCompactV2Route(
  corpus: BibleIQSource,
  compactVerse: CompactVerse,
  compact: CompactV2Route,
): { route: CanonicalV2Route; sourceTokens: CanonicalSourceToken[] } {
  const indices = Array.isArray(compact.si)
    ? compact.si.filter(
        (value) => Number.isInteger(value) && Number(value) >= 0,
      )
    : [];

  const sourceTokens = indices
    .map((index) => {
      const token = compactVerse.s?.[index];
      return token ? expandSourceToken(corpus, token, index) : null;
    })
    .filter(
      (token): token is CanonicalSourceToken => Boolean(token),
    );

  const compactRoutes = Array.isArray(compact.routes)
    ? compact.routes
    : [];

  const sourceRoutes: BibleIQV2SourceRoute[] = compactRoutes.map(
    (item, index) => {
      const token = sourceTokens[index];
      const kind = item?.k === "grammar" ? "grammar" : "lexical";
      const strong = String(item?.s || token?.strong || "") || undefined;

      return {
        kind,
        sourceTokenId: token?.id,
        sourceWord: token?.surface,
        occurrenceId: String(item?.o || "") || undefined,
        componentId: String(item?.c || "") || undefined,
        grammarId: String(item?.g || "") || undefined,
        strong: kind === "lexical" ? strong : undefined,
        lexicalId: kind === "lexical" ? strong : undefined,
        lemma: token?.lemma,
        morph: token?.morph,
        entityId:
          kind === "lexical"
            ? String(item?.e || token?.entityId || "") || undefined
            : undefined,
      };
    },
  );

  const segment = compact.segment || {};
  const sourceSegment: BibleIQV2SourceSegment = {
    sourceOccurrenceIds: Array.isArray(segment.sourceOccurrenceIds)
      ? segment.sourceOccurrenceIds.map(String)
      : [],
    sourceComponentIds: Array.isArray(segment.sourceComponentIds)
      ? segment.sourceComponentIds.map(String)
      : [],
    layer: typeof segment.layer === "string" ? segment.layer : null,
    lane: typeof segment.lane === "string" ? segment.lane : null,
    renderingStartTokenIndex: Number.isInteger(
      Number(segment.renderingStartTokenIndex),
    )
      ? Number(segment.renderingStartTokenIndex)
      : undefined,
    renderingEndTokenIndex: Number.isInteger(
      Number(segment.renderingEndTokenIndex),
    )
      ? Number(segment.renderingEndTokenIndex)
      : undefined,
  };

  return {
    route: {
      mode: compact.mode,
      displayText: compact.d || undefined,
      sourceRoutes,
      sourceSegment,
    },
    sourceTokens,
  };
}

function syntheticV2RouteEntityId(
  book: string,
  chapter: number,
  verse: number,
  displayTokenIndex: number,
) {
  return (
    "route:web-wlc-v2:" +
    normalizeAlias(book) +
    ":" +
    chapter +
    ":" +
    verse +
    ":" +
    displayTokenIndex
  );
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

  const translationKey = safeTranslation(translation);
  const kjvReaderBook =
    translationKey === "kjv"
      ? await loadKjvReaderBook(origin, book)
      : null;
  const corpus =
    kjvReaderBook?.corpus ||
    preferredCorpusForTranslation(translation, book);
  const runtimeBook =
    kjvReaderBook ||
    (await loadRuntimeBook(origin, corpus, book));
  const compactVerse = runtimeBook?.verses?.[`${chapter}:${verse}`];
  if (!compactVerse) return null;

  if (translationKey === "web") {
    const compactV2 =
      compactVerse.v?.web?.[String(displayTokenIndex)];

    if (compactV2) {
      const expanded = expandCompactV2Route(
        corpus,
        compactVerse,
        compactV2,
      );
      const routes = expanded.route.sourceRoutes;
      const exactLexicalSingle =
        expanded.route.mode === "exact-single" &&
        routes.length === 1 &&
        routes[0]?.kind === "lexical" &&
        expanded.sourceTokens.length === 1 &&
        /^word:hebrew:H\d+$/.test(
          expanded.sourceTokens[0]?.entityId || "",
        );

      if (exactLexicalSingle) {
        const sourceToken = expanded.sourceTokens[0];
        return {
          entityId: sourceToken.entityId,
          sourceWord: sourceToken.surface,
          sourceToken,
          compoundRoute: compoundRouteForSourceToken(sourceToken),
          v2Route: expanded.route,
        };
      }

      return {
        entityId: syntheticV2RouteEntityId(
          book,
          chapter,
          verse,
          displayTokenIndex,
        ),
        sourceWord:
          expanded.sourceTokens
            .map((token) => token.surface)
            .filter(Boolean)
            .join(" + ") || undefined,
        v2Route: expanded.route,
      };
    }
  }

  const sourceIndex =
    compactVerse.a?.[translationKey]?.[String(displayTokenIndex)];

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
    compoundRoute: compoundRouteForSourceToken(sourceToken),
  };
}

function lexicalIdFromEntityId(entityId: string, strong?: string) {
  const value = String(entityId || "").trim();
  const wordMatch = value.match(
    /^word:(?:hebrew|greek-nt|lxx):([^:]+)$/,
  );
  if (wordMatch?.[1]) return wordMatch[1];

  if (
    /^compound:greek-nt:G\d+-G\d+$/.test(value) &&
    strong
  ) {
    return strong;
  }

  return undefined;
}

export async function getCanonicalChapterTokenAvailability({
  origin,
  book,
  chapter,
  translation,
}: {
  origin: string;
  book: string;
  chapter: number;
  translation: string;
}): Promise<BibleIQChapterTokenAvailability> {
  const translationKey = safeTranslation(translation);
  const kjvReaderBook =
    translationKey === "kjv"
      ? await loadKjvReaderBook(origin, book)
      : null;
  const corpus =
    kjvReaderBook?.corpus ||
    preferredCorpusForTranslation(translation, book);
  const runtimeBook =
    kjvReaderBook ||
    (await loadRuntimeBook(origin, corpus, book));
  const result: BibleIQChapterTokenAvailability = {};

  if (!runtimeBook) return result;

  for (const [verseKey, compactVerse] of Object.entries(
    runtimeBook.verses || {},
  )) {
    const [chapterText, verseText] = verseKey.split(":");
    const verseChapter = Number(chapterText);
    const verseNumber = Number(verseText);

    if (verseChapter !== chapter || !Number.isInteger(verseNumber)) {
      continue;
    }

    const available: BibleIQVerseTokenAvailability = {};

    if (translationKey === "web" && compactVerse.v?.web) {
      for (const [displayIndex, compactV2] of Object.entries(
        compactVerse.v.web,
      )) {
        const expanded = expandCompactV2Route(
          corpus,
          compactVerse,
          compactV2,
        );
        const routes = expanded.route.sourceRoutes;
        const exactLexicalSingle =
          expanded.route.mode === "exact-single" &&
          routes.length === 1 &&
          routes[0]?.kind === "lexical" &&
          expanded.sourceTokens.length === 1 &&
          /^word:hebrew:H\d+$/.test(
            expanded.sourceTokens[0]?.entityId || "",
          );
        const sourceToken = exactLexicalSingle
          ? expanded.sourceTokens[0]
          : undefined;

        available[displayIndex] = {
          entityId: sourceToken?.entityId ||
            syntheticV2RouteEntityId(
              book,
              chapter,
              verseNumber,
              Number(displayIndex),
            ),
          source: corpus,
          sourceWord:
            sourceToken?.surface ||
            expanded.sourceTokens
              .map((token) => token.surface)
              .filter(Boolean)
              .join(" + ") ||
            undefined,
          lexicalId: sourceToken
            ? lexicalIdFromEntityId(
                sourceToken.entityId,
                sourceToken.strong,
              )
            : undefined,
          displayText: expanded.route.displayText,
          isV2SpanRoute: true,
          routeMode: expanded.route.mode,
          sourceRoutes: expanded.route.sourceRoutes,
          sourceSegment: expanded.route.sourceSegment,
        };
      }
    } else {
      const aligned = compactVerse.a?.[translationKey] || {};

      for (const [displayIndex, sourceIndex] of Object.entries(aligned)) {
        if (!Number.isInteger(sourceIndex) || sourceIndex < 0) continue;

        const compactSource = compactVerse.s?.[sourceIndex];
        const entityId = String(compactSource?.[4] || "").trim();

        const isOrdinaryEntity =
          /^word:(?:hebrew:H\d+|greek-nt:G\d+|lxx:L\d+)$/.test(
            entityId,
          );
        const isCompoundRoute =
          /^compound:greek-nt:G\d+-G\d+$/.test(entityId);

        if (!isOrdinaryEntity && !isCompoundRoute) continue;

        const strong = compactSource?.[3] || undefined;
        const route =
          isCompoundRoute && strong
            ? GREEK_COMPOUND_ROUTES[strong]
            : undefined;

        available[displayIndex] = {
          entityId,
          source: corpus,
          sourceWord: compactSource?.[1] || undefined,
          lexicalId: lexicalIdFromEntityId(entityId, strong),
          isCompoundRoute,
          compoundRouteKind: route?.routeKind,
          componentLexicalIds: route?.componentLexicalIds,
        };
      }
    }

    if (Object.keys(available).length > 0) {
      result[String(verseNumber)] = available;
    }
  }

  return result;
}
