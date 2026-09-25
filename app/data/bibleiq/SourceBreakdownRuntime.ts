export type SourceBreakdownTranslation = "web" | "kjv" | "brenton";
export type SourceBreakdownCorpus = "hebrew" | "greek-nt" | "lxx";

export type SourceBreakdownOccurrence = {
  id: string;
  sourceOrder?: number;
  sourceSlotOrder?: number;
  slotId?: string | null;
  readingBranch?: string | null;
  readingOrder?: number | null;
  legacyFlatOrder?: number | null;
  surface: string;
  lemma?: string | null;
  transliteration?: string | null;
  lexicalId?: string | null;
  entityId?: string | null;
  morphology?: string | null;
  morphologyEnglish?: string | null;
  partOfSpeech?: string | null;
  meaning?: string | null;
  grammarOnly?: boolean;
};

export type SourceBreakdownSourceVerse = {
  source: SourceBreakdownCorpus;
  witness: string;
  reference: string;
  sourceReference?: string;
  book: string;
  chapter: number;
  verse: string | number;
  orderAuthority: string;
  occurrences: SourceBreakdownOccurrence[];
  sourceKey?: string;
};

type DisplayIndexEntry = {
  translation: SourceBreakdownTranslation;
  displayedBook: string;
  displayedChapter: number;
  displayedVerse: string | number;
  corpus: SourceBreakdownCorpus;
  sourceVerses: Array<{
    book: string;
    chapter: number;
    verse: string | number;
    sourceKey: string;
  }>;
};

type DisplayRuntime = {
  displayIndex: Record<string, DisplayIndexEntry>;
};

type RuntimeManifest = {
  sourceIndex: Record<
    string,
    {
      file: string;
      key: string;
    }
  >;
};

type SourceShard = {
  verses: Record<string, SourceBreakdownSourceVerse>;
};

export type SourceBreakdownResult = {
  resolved: true;
  translation: SourceBreakdownTranslation;
  displayedReference: {
    book: string;
    chapter: number;
    verse: string;
  };
  corpus: SourceBreakdownCorpus;
  sourceVerses: SourceBreakdownSourceVerse[];
  sourceVerseCount: number;
  occurrenceCount: number;
  policy: {
    interaction: "verse-first";
    englishWordOwnershipRequired: false;
  };
};

const BASE = "/data/bibleiq/source-breakdown/runtime";

let manifestPromise: Promise<RuntimeManifest> | null = null;
let displayPromise: Promise<DisplayRuntime> | null = null;
let lookupPromise: Promise<Map<string, DisplayIndexEntry>> | null = null;

const shardPromises = new Map<string, Promise<SourceShard>>();

function normalizeBook(value: string) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function displayKey(args: {
  translation: SourceBreakdownTranslation;
  book: string;
  chapter: number;
  verse: string | number;
}) {
  return [
    args.translation,
    normalizeBook(args.book),
    Number(args.chapter),
    String(args.verse),
  ].join(":");
}

function url(origin: string, relative: string) {
  return (
    origin.replace(/\/+$/, "") +
    BASE +
    "/" +
    relative.replace(/^\/+/, "")
  );
}

async function loadJson<T>(target: string): Promise<T> {
  const response = await fetch(target, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Source Breakdown runtime fetch failed: ${response.status} ${target}`
    );
  }

  return (await response.json()) as T;
}

async function getManifest(origin: string) {
  if (!manifestPromise) {
    manifestPromise = loadJson<RuntimeManifest>(
      url(origin, "manifest.json")
    ).catch((error) => {
      manifestPromise = null;
      throw error;
    });
  }

  return manifestPromise;
}

async function getDisplay(origin: string) {
  if (!displayPromise) {
    displayPromise = loadJson<DisplayRuntime>(
      url(origin, "display-index.json")
    ).catch((error) => {
      displayPromise = null;
      throw error;
    });
  }

  return displayPromise;
}

async function getLookup(origin: string) {
  if (!lookupPromise) {
    lookupPromise = (async () => {
      const runtime = await getDisplay(origin);
      const lookup = new Map<string, DisplayIndexEntry>();

      for (const entry of Object.values(runtime.displayIndex || {})) {
        const key = displayKey({
          translation: entry.translation,
          book: entry.displayedBook,
          chapter: entry.displayedChapter,
          verse: entry.displayedVerse,
        });

        const existing = lookup.get(key);

        if (existing) {
          if (
            existing.corpus !== entry.corpus ||
            JSON.stringify(existing.sourceVerses) !==
              JSON.stringify(entry.sourceVerses)
          ) {
            throw new Error(
              `Conflicting Source Breakdown display ownership: ${key}`
            );
          }

          continue;
        }

        lookup.set(key, entry);
      }

      return lookup;
    })().catch((error) => {
      lookupPromise = null;
      throw error;
    });
  }

  return lookupPromise;
}

async function getShard(origin: string, relative: string) {
  const target = url(origin, relative);

  let promise = shardPromises.get(target);

  if (!promise) {
    promise = loadJson<SourceShard>(target).catch((error) => {
      shardPromises.delete(target);
      throw error;
    });

    shardPromises.set(target, promise);
  }

  return promise;
}

export function isSourceBreakdownTranslation(
  value: string | null | undefined
): value is SourceBreakdownTranslation {
  return value === "web" || value === "kjv" || value === "brenton";
}

export async function resolveSourceBreakdown(args: {
  origin: string;
  translation: SourceBreakdownTranslation;
  book: string;
  chapter: number;
  verse: string | number;
}): Promise<SourceBreakdownResult | null> {
  const chapter = Number(args.chapter);

  if (
    !args.book ||
    !Number.isFinite(chapter) ||
    chapter < 1 ||
    !String(args.verse).trim()
  ) {
    return null;
  }

  const [manifest, lookup] = await Promise.all([
    getManifest(args.origin),
    getLookup(args.origin),
  ]);

  const key = displayKey({
    translation: args.translation,
    book: args.book,
    chapter,
    verse: args.verse,
  });

  const display = lookup.get(key);

  if (!display) {
    return null;
  }

  const sourceVerses: SourceBreakdownSourceVerse[] = [];

  // Preserve sourceVerses[] ownership order exactly.
  // This naturally supports Brenton multi-source verses.
  for (const owner of display.sourceVerses) {
    const location = manifest.sourceIndex[owner.sourceKey];

    if (!location) {
      throw new Error(
        `Source Breakdown sourceIndex missing ${owner.sourceKey}`
      );
    }

    const shard = await getShard(args.origin, location.file);
    const verse = shard.verses?.[location.key];

    if (!verse) {
      throw new Error(
        `Source Breakdown shard ${location.file} missing ${location.key}`
      );
    }

    sourceVerses.push({
      ...verse,
      sourceKey: owner.sourceKey,
    });
  }

  const occurrenceCount = sourceVerses.reduce(
    (sum, verse) => sum + verse.occurrences.length,
    0
  );

  return {
    resolved: true,
    translation: args.translation,
    displayedReference: {
      book: args.book,
      chapter,
      verse: String(args.verse),
    },
    corpus: display.corpus,
    sourceVerses,
    sourceVerseCount: sourceVerses.length,
    occurrenceCount,
    policy: {
      interaction: "verse-first",
      englishWordOwnershipRequired: false,
    },
  };
}
