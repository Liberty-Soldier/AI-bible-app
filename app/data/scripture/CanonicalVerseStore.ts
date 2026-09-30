import "server-only";

import { createHash } from "node:crypto";

import type {
  BibleIQChapterTokenAvailability,
  BibleIQVerseTokenAvailability,
  BibleIQTokenAvailability,
  BibleIQCompoundRouteKind,
  BibleIQReaderOwnership,
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
  vo?: Record<string, Record<string, string>>;
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

type BrentonReaderRecordRoute = [
  sourceIndex: number,
  sourceOccurrenceId: string,
  entityId: string,
];

type BrentonReaderRecordOverlayRecord = {
  reference?: string;
  ownershipKey?: string;
  runtimeFile: string;
  runtimeVerseKey: string;
  routes: Record<string, BrentonReaderRecordRoute>;
};

type BrentonReaderRecordOverlay = {
  schemaVersion: string;
  counts: {
    records: number;
    routes: number;
  };
  records: Record<string, BrentonReaderRecordOverlayRecord>;
  checksum: string;
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
const BRENTON_READER_RECORD_RUNTIME_ROOT =
  "/data/bibleiq/word-study-brenton-reader-record";
const brentonReaderRecordOverlayCache = new Map<
  string,
  Promise<BrentonReaderRecordOverlay | null>
>();


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

function brentonReaderRecordRuntimeUrl(
  origin: string,
  relativePath: string,
) {
  return new URL(
    `${BRENTON_READER_RECORD_RUNTIME_ROOT}/${relativePath.replace(/^\/+/, "")}`,
    origin,
  ).toString();
}

async function loadRuntimeBookFile(
  origin: string,
  corpus: BibleIQSource,
  outputFile: string,
): Promise<CompactBook | null> {
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

function brentonReaderRecordOverlayChecksum(
  overlay: BrentonReaderRecordOverlay,
) {
  const { checksum: _checksum, ...check } = overlay;

  return createHash("sha256")
    .update(JSON.stringify(check))
    .digest("hex");
}

function loadBrentonReaderRecordOverlay(origin: string) {
  const key = new URL(origin).origin;
  let pending = brentonReaderRecordOverlayCache.get(key);

  if (!pending) {
    pending = (async () => {
      const overlay = await fetchJson<BrentonReaderRecordOverlay>(
        brentonReaderRecordRuntimeUrl(key, "manifest.json"),
      );

      if (!overlay) return null;

      const recordCount = Object.keys(overlay.records || {}).length;
      const routeCount = Object.values(overlay.records || {}).reduce(
        (total, record) => total + Object.keys(record.routes || {}).length,
        0,
      );

      const checksum = brentonReaderRecordOverlayChecksum(overlay);

      if (
        overlay.schemaVersion !==
          "emet-p0812r2-brenton-reader-record-routes/v1" ||
        overlay.counts?.records !== 2017 ||
        overlay.counts?.routes !== 9915 ||
        recordCount !== 2017 ||
        routeCount !== 9915 ||
        !overlay.checksum ||
        overlay.checksum !== checksum
      ) {
        console.error(
          "SEE Brenton reader-record overlay failed its sealed contract.",
        );
        return null;
      }

      return overlay;
    })();

    brentonReaderRecordOverlayCache.set(key, pending);
  }

  return pending;
}

async function resolveBrentonReaderRecordHit({
  origin,
  readerRecordId,
  displayTokenIndex,
}: {
  origin: string;
  readerRecordId: string;
  displayTokenIndex: number;
}): Promise<{
  recordScoped: boolean;
  hit: CanonicalHit | null;
}> {
  const overlay = await loadBrentonReaderRecordOverlay(origin);

  // If the record-specific overlay cannot be verified, Brenton taps fail
  // closed rather than falling back to an ambiguous numeric-verse route.
  if (!overlay) {
    return {
      recordScoped: true,
      hit: null,
    };
  }

  const record = overlay.records?.[readerRecordId];

  if (!record) {
    return {
      recordScoped: false,
      hit: null,
    };
  }

  const runtimeBook = await loadRuntimeBookFile(
    origin,
    "lxx",
    record.runtimeFile,
  );
  const compactVerse = runtimeBook?.verses?.[record.runtimeVerseKey];

  if (!compactVerse) {
    return {
      recordScoped: true,
      hit: null,
    };
  }

  const route = record.routes?.[String(displayTokenIndex)];

  if (route) {
    const [sourceIndex, sourceOccurrenceId, entityId] = route;

    if (
      !Number.isInteger(sourceIndex) ||
      sourceIndex < 0 ||
      !sourceOccurrenceId ||
      !/^word:lxx:L\d+$/.test(entityId)
    ) {
      return {
        recordScoped: true,
        hit: null,
      };
    }

    const compactSource = compactVerse.s?.[sourceIndex];

    if (
      !compactSource ||
      compactSource[0] !== sourceOccurrenceId ||
      compactSource[4] !== entityId
    ) {
      return {
        recordScoped: true,
        hit: null,
      };
    }

    const sourceToken = expandSourceToken("lxx", compactSource, sourceIndex);

    return {
      recordScoped: true,
      hit: {
        entityId: sourceToken.entityId,
        sourceWord: sourceToken.surface,
        sourceToken,
      },
    };
  }

  return {
    recordScoped: true,
    hit: resolveOwnedBrentonCompactV2Hit(
      compactVerse,
      readerRecordId,
      displayTokenIndex,
    ),
  };
}

async function buildBrentonReaderRecordAvailability(
  origin: string,
  overlay: BrentonReaderRecordOverlay,
  readerRecordId: string,
): Promise<BibleIQVerseTokenAvailability | undefined> {
  const record = overlay.records?.[readerRecordId];
  if (!record) return undefined;

  const runtimeBook = await loadRuntimeBookFile(
    origin,
    "lxx",
    record.runtimeFile,
  );
  const compactVerse = runtimeBook?.verses?.[record.runtimeVerseKey];

  if (!compactVerse) return undefined;

  const available: BibleIQVerseTokenAvailability = {};

  for (const [displayIndex, route] of Object.entries(record.routes || {})) {
    const [sourceIndex, sourceOccurrenceId, entityId] = route;

    if (
      !Number.isInteger(sourceIndex) ||
      sourceIndex < 0 ||
      !sourceOccurrenceId ||
      !/^word:lxx:L\d+$/.test(entityId)
    ) {
      continue;
    }

    const compactSource = compactVerse.s?.[sourceIndex];

    if (
      !compactSource ||
      compactSource[0] !== sourceOccurrenceId ||
      compactSource[4] !== entityId
    ) {
      continue;
    }

    const numericDisplayIndex = Number(displayIndex);
    if (!Number.isInteger(numericDisplayIndex) || numericDisplayIndex < 0) {
      continue;
    }

    const sourceToken = expandSourceToken(
      "lxx",
      compactSource,
      sourceIndex,
    );

    available[displayIndex] = {
      entityId,
      source: "lxx",
      sourceWord: compactSource[1] || undefined,
      lexicalId: lexicalIdFromEntityId(
        entityId,
        compactSource[3] || undefined,
      ),
      readerOwnership: legacyReaderOwnership(
        "lxx",
        numericDisplayIndex,
        sourceToken,
      ),
    };
  }

  const v2Availability = buildOwnedBrentonCompactV2Availability(
    compactVerse,
    readerRecordId,
  );

  /*
   * The sealed reader-record overlay is the exact Brenton authority.
   * Owned V2 routes fill gaps but never replace an exact overlay tap.
   */
  for (const [displayIndex, candidate] of Object.entries(v2Availability)) {
    if (!available[displayIndex]) {
      available[displayIndex] = candidate;
    }
  }

  return available;
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

type CanonicalReaderOwnershipResolution = {
  availability: BibleIQTokenAvailability;
  hit: CanonicalHit;
};

function isCanonicalWordEntityForCorpus(
  entityId: string,
  corpus: BibleIQSource,
) {
  const value = String(entityId || "");

  if (corpus === "hebrew") {
    return /^word:hebrew:H\d+$/.test(value);
  }

  if (corpus === "greek-nt") {
    return /^word:greek-nt:G\d+$/.test(value);
  }

  return /^word:lxx:L\d+$/.test(value);
}

function v2ReaderOwnership(
  corpus: BibleIQSource,
  displayTokenIndex: number,
  route: CanonicalV2Route,
): BibleIQReaderOwnership {
  const segment = route.sourceSegment;
  const rawStart = segment?.renderingStartTokenIndex;
  const rawEnd = segment?.renderingEndTokenIndex;
  const hasValidExactBounds =
    route.mode !== "segment-context" &&
    Number.isInteger(rawStart) &&
    Number.isInteger(rawEnd) &&
    Number(rawStart) >= 0 &&
    Number(rawEnd) >= Number(rawStart) &&
    displayTokenIndex >= Number(rawStart) &&
    displayTokenIndex <= Number(rawEnd);

  const startTokenIndex = hasValidExactBounds
    ? Number(rawStart)
    : displayTokenIndex;
  const endTokenIndex = hasValidExactBounds
    ? Number(rawEnd)
    : displayTokenIndex;
  const kind: BibleIQReaderOwnership["kind"] =
    route.mode === "segment-context" ? "context" : "exact";
  const sourceOccurrenceIds = [
    ...(segment?.sourceOccurrenceIds || []),
  ].sort();
  const sourceComponentIds = [
    ...(segment?.sourceComponentIds || []),
  ].sort();
  const anchorSuffix =
    kind === "context" ? `:${displayTokenIndex}` : "";

  return {
    kind,
    ownershipId: [
      "v2",
      corpus,
      route.mode,
      startTokenIndex,
      endTokenIndex,
      sourceOccurrenceIds.join(","),
      sourceComponentIds.join(","),
    ].join("|") + anchorSuffix,
    sourceOccurrenceIds,
    anchorTokenIndex: displayTokenIndex,
    startTokenIndex,
    endTokenIndex,
  };
}

function legacyReaderOwnership(
  corpus: BibleIQSource,
  displayTokenIndex: number,
  sourceToken: CanonicalSourceToken,
): BibleIQReaderOwnership {
  return {
    kind: "exact",
    ownershipId: [
      "legacy",
      corpus,
      displayTokenIndex,
      sourceToken.id,
      sourceToken.entityId,
    ].join("|"),
    sourceOccurrenceIds: [sourceToken.id],
    anchorTokenIndex: displayTokenIndex,
    startTokenIndex: displayTokenIndex,
    endTokenIndex: displayTokenIndex,
  };
}

function resolveLegacyCompactReaderOwnership(
  corpus: BibleIQSource,
  translationKey: string,
  compactVerse: CompactVerse,
  displayTokenIndex: number,
): CanonicalReaderOwnershipResolution | null {
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

  const sourceToken = expandSourceToken(
    corpus,
    compactSource,
    sourceIndex,
  );
  const entityId = String(sourceToken.entityId || "").trim();
  const isOrdinaryEntity =
    /^word:(?:hebrew:H\d+|greek-nt:G\d+|lxx:L\d+)$/.test(entityId);
  const isCompoundRoute =
    /^compound:greek-nt:G\d+-G\d+$/.test(entityId);

  if (!isOrdinaryEntity && !isCompoundRoute) {
    return null;
  }

  const compoundRoute = compoundRouteForSourceToken(sourceToken);

  return {
    availability: {
      entityId,
      source: corpus,
      sourceWord: sourceToken.surface || undefined,
      lexicalId: lexicalIdFromEntityId(
        entityId,
        sourceToken.strong,
      ),
      isCompoundRoute,
      compoundRouteKind: compoundRoute?.routeKind,
      componentLexicalIds: compoundRoute?.componentLexicalIds,
      readerOwnership: legacyReaderOwnership(
        corpus,
        displayTokenIndex,
        sourceToken,
      ),
    },
    hit: {
      entityId,
      sourceWord: sourceToken.surface,
      sourceToken,
      compoundRoute,
    },
  };
}

function resolveWebV2ReaderOwnership(
  corpus: BibleIQSource,
  compactVerse: CompactVerse,
  compactV2: CompactV2Route,
  book: string,
  chapter: number,
  verse: number,
  displayTokenIndex: number,
): CanonicalReaderOwnershipResolution | null {
  const expanded = expandCompactV2Route(
    corpus,
    compactVerse,
    compactV2,
  );
  const routes = expanded.route.sourceRoutes;

  if (!routes.length || !expanded.sourceTokens.length) {
    return null;
  }

  const exactLexicalSingle =
    expanded.route.mode === "exact-single" &&
    routes.length === 1 &&
    routes[0]?.kind === "lexical" &&
    expanded.sourceTokens.length === 1 &&
    isCanonicalWordEntityForCorpus(
      expanded.sourceTokens[0]?.entityId || "",
      corpus,
    );
  const sourceToken = exactLexicalSingle
    ? expanded.sourceTokens[0]
    : undefined;
  const entityId =
    sourceToken?.entityId ||
    syntheticV2RouteEntityId(
      book,
      chapter,
      verse,
      displayTokenIndex,
    );
  const sourceWord =
    sourceToken?.surface ||
    expanded.sourceTokens
      .map((token) => token.surface)
      .filter(Boolean)
      .join(" + ") ||
    undefined;

  return {
    availability: {
      entityId,
      source: corpus,
      sourceWord,
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
      readerOwnership: v2ReaderOwnership(
        corpus,
        displayTokenIndex,
        expanded.route,
      ),
    },
    hit: sourceToken
      ? {
          entityId: sourceToken.entityId,
          sourceWord: sourceToken.surface,
          sourceToken,
          compoundRoute: compoundRouteForSourceToken(sourceToken),
          v2Route: expanded.route,
        }
      : {
          entityId,
          sourceWord,
          v2Route: expanded.route,
        },
  };
}

/*
 * Single authority for ordinary WEB/KJV reader taps.
 *
 * Precedence is evidence-based and global:
 *   1. exact V2 ownership
 *   2. sealed legacy exact ownership at the same English token
 *   3. V2 segment context
 *   4. unmapped / fail closed
 *
 * Segment context never becomes a one-source-word lexical claim here.
 */
function resolveCompactReaderOwnershipAtToken({
  corpus,
  translationKey,
  compactVerse,
  book,
  chapter,
  verse,
  displayTokenIndex,
}: {
  corpus: BibleIQSource;
  translationKey: string;
  compactVerse: CompactVerse;
  book: string;
  chapter: number;
  verse: number;
  displayTokenIndex: number;
}): CanonicalReaderOwnershipResolution | null {
  const legacy = resolveLegacyCompactReaderOwnership(
    corpus,
    translationKey,
    compactVerse,
    displayTokenIndex,
  );
  const compactV2 =
    translationKey === "web"
      ? compactVerse.v?.web?.[String(displayTokenIndex)]
      : undefined;
  const v2 = compactV2
    ? resolveWebV2ReaderOwnership(
        corpus,
        compactVerse,
        compactV2,
        book,
        chapter,
        verse,
        displayTokenIndex,
      )
    : null;

  if (v2?.hit.v2Route?.mode !== "segment-context") {
    if (v2) return v2;
  }

  if (legacy) return legacy;
  if (v2) return v2;

  return null;
}

function brentonCompactV2Owner(
  compactVerse: CompactVerse,
  displayTokenIndex: number,
) {
  const owner = String(
    compactVerse.vo?.brenton?.[String(displayTokenIndex)] || "",
  ).trim();

  return owner || null;
}

function ownedBrentonCompactV2(
  compactVerse: CompactVerse,
  readerRecordId: string | undefined,
  displayTokenIndex: number,
) {
  if (
    !readerRecordId ||
    brentonCompactV2Owner(compactVerse, displayTokenIndex) !== readerRecordId
  ) {
    return undefined;
  }

  return compactVerse.v?.brenton?.[String(displayTokenIndex)];
}

function syntheticBrentonReaderV2RouteEntityId(
  readerRecordId: string,
  displayTokenIndex: number,
) {
  return (
    "route:brenton-lxx-v2:" +
    readerRecordId +
    ":" +
    displayTokenIndex
  );
}

function resolveOwnedBrentonCompactV2Hit(
  compactVerse: CompactVerse,
  readerRecordId: string | undefined,
  displayTokenIndex: number,
): CanonicalHit | null {
  const compactV2 = ownedBrentonCompactV2(
    compactVerse,
    readerRecordId,
    displayTokenIndex,
  );

  if (!compactV2 || !readerRecordId) return null;

  const expanded = expandCompactV2Route(
    "lxx",
    compactVerse,
    compactV2,
  );
  const routes = expanded.route.sourceRoutes;
  const exactLexicalSingle =
    expanded.route.mode === "exact-single" &&
    routes.length === 1 &&
    routes[0]?.kind === "lexical" &&
    expanded.sourceTokens.length === 1 &&
    /^word:lxx:L\d+$/.test(
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
    entityId: syntheticBrentonReaderV2RouteEntityId(
      readerRecordId,
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

function buildOwnedBrentonCompactV2Availability(
  compactVerse: CompactVerse,
  readerRecordId: string,
): BibleIQVerseTokenAvailability {
  const available: BibleIQVerseTokenAvailability = {};

  for (const [displayIndex, compactV2] of Object.entries(
    compactVerse.v?.brenton || {},
  )) {
    const numericDisplayIndex = Number(displayIndex);

    if (
      !Number.isInteger(numericDisplayIndex) ||
      brentonCompactV2Owner(compactVerse, numericDisplayIndex) !==
        readerRecordId
    ) {
      continue;
    }

    const expanded = expandCompactV2Route(
      "lxx",
      compactVerse,
      compactV2,
    );
    const routes = expanded.route.sourceRoutes;
    const exactLexicalSingle =
      expanded.route.mode === "exact-single" &&
      routes.length === 1 &&
      routes[0]?.kind === "lexical" &&
      expanded.sourceTokens.length === 1 &&
      /^word:lxx:L\d+$/.test(
        expanded.sourceTokens[0]?.entityId || "",
      );
    const sourceToken = exactLexicalSingle
      ? expanded.sourceTokens[0]
      : undefined;

    available[displayIndex] = {
      entityId:
        sourceToken?.entityId ||
        syntheticBrentonReaderV2RouteEntityId(
          readerRecordId,
          numericDisplayIndex,
        ),
      source: "lxx",
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
      readerOwnership: v2ReaderOwnership(
        "lxx",
        numericDisplayIndex,
        expanded.route,
      ),
    };
  }

  return available;
}

export async function findCanonicalHit({
  origin,
  book,
  chapter,
  verse,
  translation,
  displayTokenIndex,
  readerRecordId,
}: {
  origin: string;
  book: string;
  chapter: number;
  verse: number;
  translation: string;
  displayTokenIndex?: number;
  readerRecordId?: string;
}): Promise<CanonicalHit | null> {
  if (displayTokenIndex == null || displayTokenIndex < 0) return null;

  const translationKey = safeTranslation(translation);

  if (translationKey === "brenton" && readerRecordId) {
    const recordSpecific = await resolveBrentonReaderRecordHit({
      origin,
      readerRecordId,
      displayTokenIndex,
    });

    if (recordSpecific.recordScoped) {
      return recordSpecific.hit;
    }
  }
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

  if (translationKey === "web" || translationKey === "kjv") {
    const resolved = resolveCompactReaderOwnershipAtToken({
      corpus,
      translationKey,
      compactVerse,
      book,
      chapter,
      verse,
      displayTokenIndex,
    });

    return resolved?.hit || null;
  }

  if (translationKey === "brenton") {
    const brentonV2Hit = resolveOwnedBrentonCompactV2Hit(
      compactVerse,
      readerRecordId,
      displayTokenIndex,
    );

    /*
     * Record-scoped Brenton routes returned above are authoritative.
     * Without a record-specific overlay, exact owned V2 may lead;
     * legacy exact ownership then beats contextual V2.
     */
    if (brentonV2Hit?.v2Route?.mode !== "segment-context") {
      if (brentonV2Hit) return brentonV2Hit;
    }

    const legacy = resolveLegacyCompactReaderOwnership(
      corpus,
      translationKey,
      compactVerse,
      displayTokenIndex,
    );

    if (legacy) return legacy.hit;
    if (brentonV2Hit) return brentonV2Hit;

    return null;
  }

  const legacy = resolveLegacyCompactReaderOwnership(
    corpus,
    translationKey,
    compactVerse,
    displayTokenIndex,
  );

  return legacy?.hit || null;
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
  readerVerses,
}: {
  origin: string;
  book: string;
  chapter: number;
  translation: string;
  readerVerses?: Array<{
    id: string;
    tokenAvailabilityKey: string | null;
  }>;
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

  if (runtimeBook) {
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

      const candidateDisplayIndexes = new Set<string>([
        ...Object.keys(compactVerse.a?.[translationKey] || {}),
        ...(translationKey === "web"
          ? Object.keys(compactVerse.v?.web || {})
          : []),
      ]);

      for (const displayIndex of candidateDisplayIndexes) {
        const numericDisplayIndex = Number(displayIndex);
        if (!Number.isInteger(numericDisplayIndex) || numericDisplayIndex < 0) {
          continue;
        }

        const resolved = resolveCompactReaderOwnershipAtToken({
          corpus,
          translationKey,
          compactVerse,
          book,
          chapter: verseChapter,
          verse: verseNumber,
          displayTokenIndex: numericDisplayIndex,
        });

        if (resolved) {
          available[displayIndex] = resolved.availability;
        }
      }

      if (Object.keys(available).length > 0) {
        result[String(verseNumber)] = available;
      }
    }
  }

  if (translationKey !== "brenton" || !readerVerses) {
    return result;
  }

  const overlay = await loadBrentonReaderRecordOverlay(origin);

  // The Brenton reader uses reader-record identity after this integration.
  // If the sealed overlay is unavailable, return no Brenton availability
  // rather than exposing ambiguous numeric-verse taps.
  if (!overlay) {
    return {};
  }

  const recordScoped: BibleIQChapterTokenAvailability = {};

  for (const readerVerse of readerVerses) {
    if (!readerVerse?.id) continue;

    const overlayRecord = overlay.records?.[readerVerse.id];

    if (overlayRecord) {
      const availability = await buildBrentonReaderRecordAvailability(
        origin,
        overlay,
        readerVerse.id,
      );

      if (availability && Object.keys(availability).length > 0) {
        recordScoped[readerVerse.id] = availability;
      }

      continue;
    }

    const numericKey = readerVerse.tokenAvailabilityKey;
    const available: BibleIQVerseTokenAvailability = {
      ...(numericKey && result[numericKey]
        ? result[numericKey]
        : {}),
    };

    if (numericKey && runtimeBook) {
      const compactVerse =
        runtimeBook.verses?.[chapter + ":" + Number(numericKey)];

      if (compactVerse) {
        const v2Availability = buildOwnedBrentonCompactV2Availability(
          compactVerse,
          readerVerse.id,
        );

        for (const [displayIndex, candidate] of Object.entries(v2Availability)) {
          const existing = available[displayIndex];

          if (
            !existing ||
            candidate.readerOwnership?.kind === "exact"
          ) {
            available[displayIndex] = candidate;
          }
        }
      }
    }

    if (Object.keys(available).length > 0) {
      recordScoped[readerVerse.id] = available;
    }
  }

  return recordScoped;
}
