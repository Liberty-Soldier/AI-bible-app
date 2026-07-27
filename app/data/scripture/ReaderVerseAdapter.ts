export type ReaderVerseLabel = string;

export type ReaderTranslation = "web" | "kjv" | "brenton";

export type ReaderVerseSource = {
  sourceName?: string;
  language?: string;
  text: string;
};

export type ReaderSourceIdentity = {
  bookId: string;
  book: string;
  chapter: number;
  verseLabel: string;
  numericVerse: number;
  reference: string;
  sourceFile?: string;
  sourceLine?: number;
};

export type ReaderLxxOwnership = {
  sourceId: string;
  sourceReference: string;
  classification: string;
  eligibility: string;
  authoritativeOwnershipKey: string | null;
  directLxxCoordinate: string | null;
  directLxxCoordinateExists: boolean;
  entityRoutingEligible: boolean;
  exclusionReason: string | null;
};

export type ReaderStandardNavigation = {
  sourceId: string;
  sourceReference: string;
  segmentType: string;
  status: string;
  targets: string[];
  basis: string | null;
  sourceTypes: string[];
  actions: string[];
  tests: string[];
};

export type ReaderLegacyCompatibility = {
  sourceId: string;
  sourceReference: string;
  legacyBook: string;
  legacyChapter: number;
  legacyVerse: number;
  legacyReference: string;
  mappingType: string;
  confidence: number;
  headingContaminationRemoved: boolean;
};

export type ReaderVerse = {
  id: string;
  book: string;
  chapter: number;
  verse: number;
  verseLabel: ReaderVerseLabel;
  reference: string;
  sources: ReaderVerseSource[];
  sourceIdentity?: ReaderSourceIdentity;
  lxxOwnership?: ReaderLxxOwnership;
  standardNavigation?: ReaderStandardNavigation;
  legacyCompatibility?: ReaderLegacyCompatibility;
  /**
   * Existing numeric display-token runtimes are keyed by verse number.
   * A null value deliberately disables word taps until a rebuilt alignment
   * explicitly owns this reader record.
   */
  tokenAvailabilityKey: string | null;
};

export type ReaderSuperscription = {
  id: string;
  source: ReaderSourceIdentity;
  text: string;
  wordCount?: number;
  attachBeforeVisibleSourceId: string | null;
};

export type ReaderChapter = {
  verses: ReaderVerse[];
  superscriptions: ReaderSuperscription[];
};

export type ReaderChapterItem =
  | { type: "verse"; value: ReaderVerse }
  | { type: "superscription"; value: ReaderSuperscription };

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object"
    ? (value as UnknownRecord)
    : {};
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonEmptyString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

export function verseSortKey(label: string): {
  number: number;
  suffix: string;
} {
  const match = /^(\d+)([A-Za-z]*)$/.exec(String(label || ""));

  return {
    number: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
    suffix: match ? match[2] : String(label || ""),
  };
}

export function compareVerseLabels(left: string, right: string): number {
  const a = verseSortKey(left);
  const b = verseSortKey(right);

  return a.number - b.number || a.suffix.localeCompare(b.suffix);
}

export function compareReaderVerses(
  left: Pick<ReaderVerse, "verseLabel">,
  right: Pick<ReaderVerse, "verseLabel">,
): number {
  return compareVerseLabels(left.verseLabel, right.verseLabel);
}

export function readerVerseAnchorId(label: string): string {
  return `verse-${String(label || "").replace(/[^0-9A-Za-z_-]+/g, "-")}`;
}

export function readerVerseQueryValue(
  verse: Pick<ReaderVerse, "verseLabel" | "verse">,
): string {
  return verse.verseLabel || String(verse.verse);
}

export function readerMemoryVerseLabel(verse: {
  verse: number;
  verseLabel?: string;
}): string {
  return verse.verseLabel || String(verse.verse);
}

export function readerVerseTokenAvailabilityKey(
  verse: Pick<ReaderVerse, "tokenAvailabilityKey">,
): string | null {
  return verse.tokenAvailabilityKey;
}

function normalizeSources(raw: UnknownRecord, text: string): ReaderVerseSource[] {
  const sources = Array.isArray(raw.sources) ? raw.sources : [];

  if (sources.length) {
    return sources.map((source) => {
      const record = asRecord(source);

      return {
        sourceName:
          nonEmptyString(record.sourceName) ||
          nonEmptyString(record.label) ||
          undefined,
        language: nonEmptyString(record.language) || undefined,
        text: String(record.text ?? ""),
      };
    });
  }

  return [{ sourceName: undefined, language: "english", text }];
}

export function normalizeReaderVerse(value: unknown): ReaderVerse {
  const raw = asRecord(value);
  const display = asRecord(raw.display);
  const sourceIdentity = asRecord(raw.sourceIdentity || raw.source);
  const lxxOwnership = raw.lxxOwnership
    ? (raw.lxxOwnership as ReaderLxxOwnership)
    : undefined;

  const book =
    nonEmptyString(display.book) ||
    nonEmptyString(raw.book) ||
    nonEmptyString(sourceIdentity.book) ||
    "";

  const chapter = finiteNumber(
    display.chapter ?? raw.chapter ?? sourceIdentity.chapter,
  );

  const verseLabel =
    nonEmptyString(display.verseLabel) ||
    nonEmptyString(raw.verseLabel) ||
    nonEmptyString(sourceIdentity.verseLabel) ||
    String(
      finiteNumber(
        display.numericVerse ?? raw.verse ?? sourceIdentity.numericVerse,
      ),
    );

  const verse = finiteNumber(
    display.numericVerse ??
      raw.verse ??
      sourceIdentity.numericVerse ??
      verseSortKey(verseLabel).number,
  );

  const text =
    nonEmptyString(raw.text) ||
    nonEmptyString(asRecord((raw.sources as unknown[])?.[0]).text) ||
    "";

  const reference =
    nonEmptyString(display.reference) ||
    nonEmptyString(raw.reference) ||
    `${book} ${chapter}:${verseLabel}`;

  const candidateOwnedRecord =
    raw.translationId === "brenton" ||
    Boolean(raw.lxxOwnership);

  const hasExplicitTokenKey = Object.prototype.hasOwnProperty.call(
    raw,
    "tokenAvailabilityKey",
  );
  const explicitTokenKey =
    raw.tokenAvailabilityKey === null
      ? null
      : nonEmptyString(raw.tokenAvailabilityKey);

  return {
    id:
      nonEmptyString(raw.id) ||
      `reader:${book}:${chapter}:${verseLabel}`,
    book,
    chapter,
    verse,
    verseLabel,
    reference,
    sources: normalizeSources(raw, text),
    sourceIdentity:
      Object.keys(sourceIdentity).length > 0
        ? (sourceIdentity as ReaderSourceIdentity)
        : undefined,
    lxxOwnership,
    standardNavigation: raw.standardNavigation
      ? (raw.standardNavigation as ReaderStandardNavigation)
      : undefined,
    legacyCompatibility: raw.legacyCompatibility
      ? (raw.legacyCompatibility as ReaderLegacyCompatibility)
      : undefined,
    tokenAvailabilityKey: hasExplicitTokenKey
      ? explicitTokenKey
      : candidateOwnedRecord
        ? null
        : String(verse),
  };
}

function normalizeSuperscription(value: unknown): ReaderSuperscription {
  const raw = asRecord(value);

  return {
    id: nonEmptyString(raw.id) || `superscription:${cryptoSafeId(raw)}`,
    source: asRecord(raw.source) as ReaderSourceIdentity,
    text: String(raw.text ?? ""),
    wordCount: Number.isFinite(Number(raw.wordCount))
      ? Number(raw.wordCount)
      : undefined,
    attachBeforeVisibleSourceId:
      nonEmptyString(raw.attachBeforeVisibleSourceId) || null,
  };
}

function cryptoSafeId(value: unknown): string {
  return JSON.stringify(value)
    .slice(0, 120)
    .replace(/[^0-9A-Za-z]+/g, "-")
    .replace(/^-+|-+$/g, "") || "record";
}

export function normalizeReaderChapter(value: unknown): ReaderChapter {
  const raw = asRecord(value);
  const rawVerses = Array.isArray(value)
    ? value
    : Array.isArray(raw.verses)
      ? raw.verses
      : [];
  const rawSuperscriptions = Array.isArray(raw.superscriptions)
    ? raw.superscriptions
    : [];

  return {
    verses: rawVerses
      .map(normalizeReaderVerse)
      .sort(compareReaderVerses),
    superscriptions: rawSuperscriptions.map(normalizeSuperscription),
  };
}

export function buildReaderChapterItems(
  verses: ReaderVerse[],
  superscriptions: ReaderSuperscription[],
): ReaderChapterItem[] {
  const titlesByTarget = new Map<string, ReaderSuperscription[]>();

  for (const title of superscriptions) {
    const target = title.attachBeforeVisibleSourceId || "__chapter_end__";
    const current = titlesByTarget.get(target) || [];
    titlesByTarget.set(target, [...current, title]);
  }

  const items: ReaderChapterItem[] = [];

  for (const verse of [...verses].sort(compareReaderVerses)) {
    for (const title of titlesByTarget.get(verse.id) || []) {
      items.push({ type: "superscription", value: title });
    }

    items.push({ type: "verse", value: verse });
  }

  for (const title of titlesByTarget.get("__chapter_end__") || []) {
    items.push({ type: "superscription", value: title });
  }

  return items;
}
