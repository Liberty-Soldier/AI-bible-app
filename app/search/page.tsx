"use client";

import Link from "next/link";
import {
  FormEvent,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import { bookCatalog } from "@/app/data/scripture/bookCatalog";
import {
  buildSearchResultHref,
  getSearchTranslationLabel,
  loadScriptureSearchIndex,
  searchScripture,
  type ScriptureSearchIndex,
  type SearchTextMode,
} from "@/app/lib/scriptureSearch";
import {
  AVAILABLE_TRANSLATION_OPTIONS,
  getPreferredTranslation,
  getTranslationShortLabel,
  isTranslationPreference,
  setPreferredTranslation,
  type TranslationPreference,
} from "@/app/lib/translationPreference";

const SEARCH_SESSION_KEY = "emet-scripture-search-state-v1";
const INITIAL_VISIBLE_RESULTS = 50;

type StoredSearchState = {
  query: string;
  translation: TranslationPreference;
  textMode: SearchTextMode;
  scrollY: number;
  visibleCount: number;
};

function readStoredState(): StoredSearchState | null {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(SEARCH_SESSION_KEY) || "null",
    ) as Partial<StoredSearchState> | null;

    if (
      !parsed ||
      typeof parsed.query !== "string" ||
      !isTranslationPreference(parsed.translation)
    ) {
      return null;
    }

    return {
      query: parsed.query,
      translation: parsed.translation,
      textMode: parsed.textMode === "all" ? "all" : "exact",
      scrollY:
        typeof parsed.scrollY === "number" ? parsed.scrollY : 0,
      visibleCount:
        typeof parsed.visibleCount === "number"
          ? Math.max(INITIAL_VISIBLE_RESULTS, parsed.visibleCount)
          : INITIAL_VISIBLE_RESULTS,
    };
  } catch {
    return null;
  }
}

function writeStoredState(state: StoredSearchState) {
  try {
    sessionStorage.setItem(SEARCH_SESSION_KEY, JSON.stringify(state));
  } catch {
    // Search remains usable when session storage is unavailable.
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedPreview({
  text,
  query,
  mode,
}: {
  text: string;
  query: string;
  mode: "reference" | "phrase" | "word" | "terms";
}) {
  if (mode === "reference") return <>{text}</>;

  const clean = query.trim().replace(/^["“]|["”]$/g, "").trim();
  if (!clean) return <>{text}</>;

  const stopWords = new Set([
    "a",
    "an",
    "and",
    "at",
    "by",
    "for",
    "from",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
  ]);
  const highlights =
    mode === "phrase"
      ? [clean]
      : clean
          .split(/\s+/)
          .map((item) => item.trim())
          .filter(
            (item) =>
              item.length >= 2 &&
              (mode !== "terms" ||
                !stopWords.has(item.toLowerCase())),
          )
          .sort((a, b) => b.length - a.length);

  if (!highlights.length) return <>{text}</>;

  const pattern = new RegExp(
    `(${highlights.map(escapeRegExp).join("|")})`,
    "gi",
  );
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, index) =>
        highlights.some(
          (item) => item.toLowerCase() === part.toLowerCase(),
        ) ? (
          <mark
            key={`${part}-${index}`}
            className="rounded bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-500/25"
          >
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const restoredScroll = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [textMode, setTextMode] =
    useState<SearchTextMode>("exact");
  const [translation, setTranslation] =
    useState<TranslationPreference>("web");
  const [index, setIndex] = useState<ScriptureSearchIndex | null>(
    null,
  );
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [indexError, setIndexError] = useState("");
  const [visibleCount, setVisibleCount] = useState(
    INITIAL_VISIBLE_RESULTS,
  );
  const [storedScrollY, setStoredScrollY] = useState(0);

  useEffect(() => {
    const stored = readStoredState();
    const queryFromUrl = searchParams.get("q") || "";
    const translationFromUrl = searchParams.get("translation");
    const modeFromUrl = searchParams.get("mode");
    const initialMode: SearchTextMode =
      modeFromUrl === "all"
        ? "all"
        : stored?.textMode || "exact";
    const initialTranslation = isTranslationPreference(
      translationFromUrl,
    )
      ? translationFromUrl
      : stored?.translation || getPreferredTranslation();
    const initialQuery = queryFromUrl || stored?.query || "";

    setTranslation(initialTranslation);
    setTextMode(initialMode);
    setInput(initialQuery);
    setSubmittedQuery(initialQuery);
    setVisibleCount(
      stored?.query === initialQuery &&
        stored.translation === initialTranslation &&
        stored.textMode === initialMode
        ? stored.visibleCount
        : INITIAL_VISIBLE_RESULTS,
    );
    setStoredScrollY(
      stored?.query === initialQuery &&
        stored.translation === initialTranslation &&
        stored.textMode === initialMode
        ? stored.scrollY
        : 0,
    );
  }, [searchParams]);

  useEffect(() => {
    const controller = new AbortController();

    setLoadingIndex(true);
    setIndexError("");
    setIndex(null);

    loadScriptureSearchIndex(translation, controller.signal)
      .then((loaded) => {
        setIndex(loaded);
        setLoadingIndex(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setIndexError(
          error instanceof Error
            ? error.message
            : "The Scripture Search index could not be loaded.",
        );
        setLoadingIndex(false);
      });

    return () => controller.abort();
  }, [translation]);

  const knownBooks = useMemo(
    () => bookCatalog.map((item) => item.book),
    [],
  );

  const outcome = useMemo(() => {
    if (!index || !submittedQuery.trim()) return null;

    return searchScripture(
      index,
      submittedQuery,
      knownBooks,
      500,
      textMode,
    );
  }, [index, knownBooks, submittedQuery, textMode]);

  useEffect(() => {
    if (
      restoredScroll.current ||
      loadingIndex ||
      !outcome ||
      storedScrollY <= 0
    ) {
      return;
    }

    restoredScroll.current = true;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({
          top: storedScrollY,
          behavior: "auto",
        });
      });
    });
  }, [loadingIndex, outcome, storedScrollY]);

  function rememberSearchState() {
    writeStoredState({
      query: submittedQuery,
      translation,
      textMode,
      scrollY: window.scrollY,
      visibleCount,
    });
  }

  function submitSearch(event?: FormEvent) {
    event?.preventDefault();

    const finalQuery = input.trim();
    if (!finalQuery) return;

    restoredScroll.current = true;
    setSubmittedQuery(finalQuery);
    setVisibleCount(INITIAL_VISIBLE_RESULTS);
    setStoredScrollY(0);

    writeStoredState({
      query: finalQuery,
      translation,
      textMode,
      scrollY: 0,
      visibleCount: INITIAL_VISIBLE_RESULTS,
    });

    const params = new URLSearchParams({
      q: finalQuery,
      translation,
      mode: textMode,
    });

    router.replace(`/search?${params.toString()}`, {
      scroll: false,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearSearch() {
    setInput("");
    setSubmittedQuery("");
    setVisibleCount(INITIAL_VISIBLE_RESULTS);
    setStoredScrollY(0);
    restoredScroll.current = true;

    try {
      sessionStorage.removeItem(SEARCH_SESSION_KEY);
    } catch {
      // Search remains usable when session storage is unavailable.
    }

    const params = new URLSearchParams({
      translation,
      mode: textMode,
    });

    router.replace(`/search?${params.toString()}`, {
      scroll: false,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function chooseTranslation(value: TranslationPreference) {
    const next = setPreferredTranslation(value);

    setTranslation(next);
    setVisibleCount(INITIAL_VISIBLE_RESULTS);
    setStoredScrollY(0);
    restoredScroll.current = true;

    writeStoredState({
      query: submittedQuery,
      translation: next,
      textMode,
      scrollY: 0,
      visibleCount: INITIAL_VISIBLE_RESULTS,
    });

    if (submittedQuery) {
      const params = new URLSearchParams({
        q: submittedQuery,
        translation: next,
        mode: textMode,
      });

      router.replace(`/search?${params.toString()}`, {
        scroll: false,
      });
    }
  }

  function chooseTextMode(nextMode: SearchTextMode) {
    setTextMode(nextMode);
    setVisibleCount(INITIAL_VISIBLE_RESULTS);
    setStoredScrollY(0);
    restoredScroll.current = true;

    writeStoredState({
      query: submittedQuery,
      translation,
      textMode: nextMode,
      scrollY: 0,
      visibleCount: INITIAL_VISIBLE_RESULTS,
    });

    if (submittedQuery) {
      const params = new URLSearchParams({
        q: submittedQuery,
        translation,
        mode: nextMode,
      });

      router.replace(`/search?${params.toString()}`, {
        scroll: false,
      });
    }
  }

  const visibleResults =
    outcome?.results.slice(0, visibleCount) || [];
  const remainingLoaded =
    (outcome?.results.length || 0) - visibleResults.length;
  const reference = outcome?.parsedReference || null;
  const referenceOpenHref = reference
    ? buildSearchResultHref({
        book: reference.book,
        chapter: reference.chapter,
        verseLabel: reference.verseLabel,
        translation,
        query: submittedQuery,
        textMode,
      })
    : null;

  const translationShortLabel = getTranslationShortLabel(translation);
  const resultModeLabel =
    outcome?.mode === "phrase"
      ? "Exact phrase"
      : outcome?.mode === "terms"
        ? "All words"
        : outcome?.mode === "reference"
          ? "Scripture reference"
          : "Word";

  return (
    <main className="min-h-screen bg-[var(--background)] px-5 pb-28 pt-5 text-[var(--foreground)]">
      <section className="mx-auto max-w-2xl">
        {!submittedQuery ? (
          <header className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">
              Find Scripture
            </h1>
          </header>
        ) : null}

        <form onSubmit={submitSearch}>
          <label htmlFor="scripture-search" className="sr-only">
            Search Scripture
          </label>

          <div className="relative">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]"
            >
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m15.5 15.5 5 5" />
            </svg>

            <input
              ref={searchInputRef}
              id="scripture-search"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Search a word, phrase, or reference"
              autoComplete="off"
              enterKeyHint="search"
              className="min-h-14 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] py-3 pl-12 pr-24 text-base shadow-[var(--shadow-sm)] outline-none transition focus:border-[var(--accent)]"
            />

            {input ? (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute right-12 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-xl leading-none text-[var(--muted)] transition active:scale-95"
              >
                ×
              </button>
            ) : null}

            <button
              type="submit"
              aria-label="Search Scripture"
              disabled={!input.trim()}
              className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-[var(--foreground)] transition active:scale-95 disabled:opacity-35"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m15.5 15.5 5 5" />
              </svg>
            </button>
          </div>

          <div className="mt-4 flex items-end justify-between gap-4 border-b border-[var(--border)]">
            <div className="flex min-w-0 gap-6">
              {(
                [
                  ["exact", "Exact phrase"],
                  ["all", "All words"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => chooseTextMode(value)}
                  aria-pressed={textMode === value}
                  className={`border-b-2 pb-3 text-sm font-semibold transition ${
                    textMode === value
                      ? "border-[var(--accent)] text-[var(--foreground)]"
                      : "border-transparent text-[var(--muted)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <label htmlFor="search-translation" className="sr-only">
              Search translation
            </label>
            <select
              id="search-translation"
              value={translation}
              onChange={(event) =>
                chooseTranslation(
                  event.target.value as TranslationPreference,
                )
              }
              className="mb-2 max-w-[8.5rem] bg-transparent py-1 text-right text-sm font-semibold text-[var(--muted)] outline-none"
            >
              {AVAILABLE_TRANSLATION_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.shortLabel}
                </option>
              ))}
            </select>
          </div>
        </form>

        {loadingIndex ? (
          <p className="mt-7 text-sm text-[var(--muted)]">
            Loading {getSearchTranslationLabel(translation)}…
          </p>
        ) : null}

        {indexError ? (
          <div className="mt-7 border-y border-red-300 py-5 text-sm leading-6 text-red-800 dark:border-red-900 dark:text-red-200">
            {indexError}
          </div>
        ) : null}

        {!loadingIndex && !indexError && outcome ? (
          <section className="mt-7">
            <div className="flex items-baseline justify-between gap-4 pb-3">
              <p className="text-sm font-semibold text-[var(--muted)]">
                {translationShortLabel} · {resultModeLabel}
              </p>
              <h2 className="text-sm font-bold">
                {outcome.totalMatches.toLocaleString()} {" "}
                {outcome.totalMatches === 1 ? "result" : "results"}
              </h2>
            </div>

            {reference && referenceOpenHref ? (
              <Link
                href={referenceOpenHref}
                onClick={rememberSearchState}
                className="flex items-center justify-between gap-4 border-y border-[var(--accent)] py-5 transition active:bg-[var(--surface)]"
              >
                <div>
                  <p className="font-bold">
                    Open {reference.book} {reference.chapter}
                    {reference.verseLabel
                      ? `:${reference.verseLabel}`
                      : ""}
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {translationShortLabel}
                  </p>
                </div>
                <span aria-hidden="true" className="text-xl text-[var(--muted)]">
                  ›
                </span>
              </Link>
            ) : null}

            {visibleResults.length ? (
              <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {visibleResults.map((result) => (
                  <Link
                    key={`${result.book}-${result.chapter}-${result.verseLabel}`}
                    href={buildSearchResultHref({
                      book: result.book,
                      chapter: result.chapter,
                      verseLabel: result.verseLabel,
                      translation,
                      query: submittedQuery,
                      textMode,
                    })}
                    onClick={rememberSearchState}
                    className="block py-5 transition active:bg-[var(--surface)]"
                  >
                    <p className="font-bold">{result.reference}</p>
                    <p className="mt-2 text-base leading-7">
                      <HighlightedPreview
                        text={result.text}
                        query={submittedQuery}
                        mode={outcome.mode}
                      />
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="border-y border-[var(--border)] py-7">
                <p className="font-semibold">
                  No results in {translationShortLabel}.
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                  Check the spelling or choose another translation.
                </p>
                {outcome.mode === "phrase" ? (
                  <button
                    type="button"
                    onClick={() => chooseTextMode("all")}
                    className="mt-4 border-b border-[var(--foreground)] pb-1 text-sm font-bold"
                  >
                    Search all words instead
                  </button>
                ) : null}
              </div>
            )}

            {remainingLoaded > 0 ? (
              <button
                type="button"
                onClick={() => {
                  const next = visibleCount + 50;
                  setVisibleCount(next);
                  writeStoredState({
                    query: submittedQuery,
                    translation,
                    textMode,
                    scrollY: window.scrollY,
                    visibleCount: next,
                  });
                }}
                className="mt-2 w-full border-t border-[var(--border)] py-4 text-sm font-bold"
              >
                Show 50 more
              </button>
            ) : null}

            {outcome.totalMatches > outcome.results.length ? (
              <p className="mt-3 text-center text-xs leading-5 text-[var(--muted)]">
                Showing the first {outcome.results.length.toLocaleString()} {" "}
                matches. Add another word to narrow the search.
              </p>
            ) : null}
          </section>
        ) : null}
      </section>

      <MobileBottomNav />
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageContent />
    </Suspense>
  );
}
