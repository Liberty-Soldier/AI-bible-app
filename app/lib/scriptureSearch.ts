import { bookAliasMap } from "@/app/data/bookAliases";
import type { TranslationPreference } from "@/app/lib/translationPreference";

export type ScriptureSearchRecord = [
  book: string,
  chapter: number,
  verseLabel: string,
  text: string,
];

export type ScriptureSearchIndex = {
  schemaVersion: 1;
  translation: TranslationPreference;
  verseCount: number;
  books: string[];
  sourceFingerprint: string;
  records: ScriptureSearchRecord[];
};

export type ParsedScriptureReference = {
  book: string;
  chapter: number;
  verseLabel: string | null;
};

export type ScriptureSearchResult = {
  book: string;
  chapter: number;
  verseLabel: string;
  text: string;
  reference: string;
};

export type SearchTextMode = "exact" | "all";

export type ScriptureSearchOutcome = {
  mode: "reference" | "phrase" | "word" | "terms";
  parsedReference: ParsedScriptureReference | null;
  results: ScriptureSearchResult[];
  totalMatches: number;
};

const SPECIAL_BOOK_EQUIVALENTS: Record<string, string[]> = {
  "song of solomon": ["song of songs"],
  "song of songs": ["song of solomon"],
  daniel: ["daniel greek"],
  esther: ["esther greek"],
};

function compactBookKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function resolveActualBook(
  candidate: string,
  books: string[],
): string | null {
  const actualByKey = new Map(
    books.map((book) => [compactBookKey(book), book]),
  );
  const direct = actualByKey.get(compactBookKey(candidate));

  if (direct) return direct;

  const equivalents =
    SPECIAL_BOOK_EQUIVALENTS[String(candidate || "").toLowerCase()] || [];

  for (const equivalent of equivalents) {
    const resolved = actualByKey.get(compactBookKey(equivalent));
    if (resolved) return resolved;
  }

  return null;
}

export function normalizeSearchText(value: string) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function getSearchTranslationLabel(
  translation: TranslationPreference,
) {
  if (translation === "kjv") return "King James Version";
  if (translation === "brenton") return "Brenton Septuagint";
  return "World English Bible";
}

export async function loadScriptureSearchIndex(
  translation: TranslationPreference,
  signal?: AbortSignal,
): Promise<ScriptureSearchIndex> {
  const response = await fetch(`/scripture/search/${translation}.json`, {
    cache: "force-cache",
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `Search index unavailable for ${getSearchTranslationLabel(translation)}.`,
    );
  }

  const value = (await response.json()) as Partial<ScriptureSearchIndex>;

  if (
    value.schemaVersion !== 1 ||
    value.translation !== translation ||
    !Array.isArray(value.records) ||
    !Array.isArray(value.books) ||
    value.verseCount !== value.records.length
  ) {
    throw new Error(
      `Search index validation failed for ${getSearchTranslationLabel(translation)}.`,
    );
  }

  return value as ScriptureSearchIndex;
}

export function parseScriptureReference(
  query: string,
  books: string[],
): ParsedScriptureReference | null {
  const trimmed = String(query || "").trim();

  if (!trimmed || /^["“].+["”]$/.test(trimmed)) return null;

  const match = trimmed.match(
    /^(.+?)\s+(\d+)(?:(?::|\s+)(\d+[a-z]?))?$/i,
  );

  if (!match) return null;

  const rawBook = match[1].trim();
  const chapter = Number(match[2]);
  const verseLabel = match[3] || null;

  if (!Number.isInteger(chapter) || chapter < 1) return null;

  const aliasEntries = Object.entries(bookAliasMap);
  let mappedBook: string | null = null;
  const rawKey = compactBookKey(rawBook);

  for (const [alias, canonical] of aliasEntries) {
    if (compactBookKey(alias) === rawKey) {
      mappedBook = canonical;
      break;
    }
  }

  const resolved =
    resolveActualBook(mappedBook || rawBook, books) ||
    resolveActualBook(rawBook, books);

  if (!resolved) return null;

  return {
    book: resolved,
    chapter,
    verseLabel,
  };
}

function toResult(record: ScriptureSearchRecord): ScriptureSearchResult {
  const [book, chapter, verseLabel, text] = record;

  return {
    book,
    chapter,
    verseLabel,
    text,
    reference: `${book} ${chapter}:${verseLabel}`,
  };
}

export function searchScripture(
  index: ScriptureSearchIndex,
  query: string,
  referenceBooks: string[] = index.books,
  resultLimit = 500,
  textMode: SearchTextMode = "exact",
): ScriptureSearchOutcome {
  const trimmed = String(query || "").trim();
  const parsedReference = parseScriptureReference(
    trimmed,
    Array.from(new Set([...referenceBooks, ...index.books])),
  );

  if (parsedReference) {
    const matching = index.records.filter(([book, chapter, verseLabel]) => {
      if (
        compactBookKey(book) !== compactBookKey(parsedReference.book) ||
        chapter !== parsedReference.chapter
      ) {
        return false;
      }

      return parsedReference.verseLabel
        ? String(verseLabel).toLowerCase() ===
            parsedReference.verseLabel.toLowerCase()
        : true;
    });

    return {
      mode: "reference",
      parsedReference,
      results: matching.slice(0, resultLimit).map(toResult),
      totalMatches: matching.length,
    };
  }

  const unquoted = trimmed.replace(/^["“]|["”]$/g, "").trim();
  const normalized = normalizeSearchText(unquoted);
  const terms = normalized.split(" ").filter(Boolean);
  const phrase = terms.length > 1 && textMode === "exact"
    ? normalized
    : "";
  const mode: ScriptureSearchOutcome["mode"] = phrase
    ? "phrase"
    : terms.length <= 1
      ? "word"
      : "terms";

  let totalMatches = 0;
  const results: ScriptureSearchResult[] = [];

  for (const record of index.records) {
    const normalizedVerse = normalizeSearchText(record[3]);
    let matched = false;

    if (phrase) {
      matched = normalizedVerse.includes(phrase);
    } else if (terms.length === 1) {
      matched = ` ${normalizedVerse} `.includes(` ${terms[0]} `);
    } else if (terms.length > 1) {
      matched = terms.every((term) =>
        ` ${normalizedVerse} `.includes(` ${term} `),
      );
    }

    if (!matched) continue;

    totalMatches += 1;

    if (results.length < resultLimit) {
      results.push(toResult(record));
    }
  }

  return {
    mode,
    parsedReference: null,
    results,
    totalMatches,
  };
}

export function buildSearchReturnPath(
  query: string,
  translation: TranslationPreference,
  textMode: SearchTextMode = "exact",
) {
  const params = new URLSearchParams({
    q: query,
    translation,
    mode: textMode,
  });

  return `/search?${params.toString()}`;
}

export function buildSearchResultHref({
  book,
  chapter,
  verseLabel,
  translation,
  query,
  textMode = "exact",
}: {
  book: string;
  chapter: number;
  verseLabel?: string | null;
  translation: TranslationPreference;
  query: string;
  textMode?: SearchTextMode;
}) {
  const returnTo = buildSearchReturnPath(
    query,
    translation,
    textMode,
  );
  const params = new URLSearchParams({
    translation,
    returnTo,
    returnLabel: "Search results",
  });

  if (verseLabel) {
    params.set("verse", verseLabel);
  }

  return `/read/${encodeURIComponent(book)}/${chapter}?${params.toString()}`;
}
