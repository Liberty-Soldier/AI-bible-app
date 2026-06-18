"use client";

import Link from "next/link";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { allScripture as sampleVerses } from "./data/scripture/allScripture";
import { renderSacredNames } from "./data/renderSacredNames";
import { useSacredNames } from "./data/useSacredNames";
import { normalizeReference } from "./data/normalizeReference";

type LastReadingPosition = {
  book: string;
  chapter: number;
  translation: string;
  timestamp: number;
};

function getTranslationLabel(translation: string) {
  if (translation === "kjv") return "King James Version";
  if (translation === "brenton") return "Brenton Septuagint";
  return "World English Bible";
}

function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [visibleCount, setVisibleCount] = useState(25);
  const [lastReading, setLastReading] =
    useState<LastReadingPosition | null>(null);

  const { sacredNames, setSacredNames } = useSacredNames();

  useEffect(() => {
    const saved = localStorage.getItem("lastReadingPosition");

    if (saved) {
      try {
        setLastReading(JSON.parse(saved));
      } catch {
        setLastReading(null);
      }
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams();

      if (search.trim()) {
        params.set("q", search);
      }

      router.replace(`?${params.toString()}`);
    }, 300);

    return () => clearTimeout(timeout);
  }, [search, router]);

  const normalizedSearch = normalizeReference(search);
  const hasSearch = search.trim().length > 0;

  const results = hasSearch
    ? sampleVerses.filter((verse) => {
        const sourceText = verse.sources
          .map((source) => source.text)
          .join(" ")
          .toLowerCase();

        return (
          verse.reference.toLowerCase().includes(normalizedSearch) ||
          sourceText.includes(search.toLowerCase())
        );
      })
    : [];

  const totalResults = results.length;
  const displayedResults = results.slice(0, visibleCount);

  return (
    <main className="min-h-screen bg-neutral-950 text-white px-6 py-10">
      <section className="mx-auto max-w-6xl">
        <div className="mb-8 rounded-3xl border border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950 p-8 shadow-2xl shadow-black/30 sm:p-12">
          <p className="mb-4 text-sm uppercase tracking-[0.35em] text-neutral-500">
            Source-First Scripture Study
          </p>

          <h1 className="mb-5 text-5xl font-bold tracking-tight sm:text-7xl">
            My Scripture Search
          </h1>

          <p className="mb-8 max-w-2xl text-lg leading-relaxed text-neutral-300">
            Read Scripture, search the text, compare witnesses, and study from
            Hebrew and Greek sources before conclusions are drawn.
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <Link
              href="/read"
              className="rounded-2xl border border-neutral-200 bg-white p-6 text-black transition hover:bg-neutral-200"
            >
              <p className="text-lg font-bold">Read Bible</p>
              <p className="mt-2 text-sm text-neutral-700">
                Choose translation, book, and chapter.
              </p>
            </Link>

            <a
              href="#search"
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 transition hover:border-neutral-600"
            >
              <p className="text-lg font-bold">Search Scripture</p>
              <p className="mt-2 text-sm text-neutral-400">
                Find words, phrases, and references.
              </p>
            </a>

            <Link
              href="/ask"
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 transition hover:border-neutral-600"
            >
              <p className="text-lg font-bold">Ask Scripture</p>
              <p className="mt-2 text-sm text-neutral-400">
                Evidence-first answers. Coming soon.
              </p>
            </Link>
          </div>
        </div>

        {lastReading && (
          <section className="mb-8 rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6 sm:p-7">
            <p className="mb-2 text-sm uppercase tracking-[0.25em] text-amber-300/80">
              Continue Reading
            </p>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  {lastReading.book} {lastReading.chapter}
                </h2>
                <p className="mt-1 text-sm text-neutral-300">
                  {getTranslationLabel(lastReading.translation)}
                </p>
              </div>

              <Link
                href={`/read/${encodeURIComponent(lastReading.book)}/${
                  lastReading.chapter
                }?translation=${lastReading.translation}`}
                className="rounded-xl bg-white px-5 py-3 text-center font-semibold text-black hover:bg-neutral-200"
              >
                Resume Reading →
              </Link>
            </div>
          </section>
        )}

        <div className="mb-8 rounded-3xl border border-neutral-800 bg-neutral-900/50 p-5">
          <p className="text-sm uppercase tracking-[0.25em] text-neutral-500">
            Evidence Order
          </p>
          <p className="mt-2 text-neutral-300">
            Original Language Source → Translation Witnesses → Cross References
            → AI Explanation
          </p>
        </div>

        <section
          id="search"
          className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6 sm:p-8"
        >
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="mb-2 text-sm uppercase tracking-[0.3em] text-neutral-500">
                Search
              </p>
              <h2 className="text-3xl font-bold">Search Scripture</h2>
            </div>

            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={sacredNames}
                onChange={(e) => setSacredNames(e.target.checked)}
              />
              Sacred Name Rendering
            </label>
          </div>

          <input
            type="text"
            placeholder="Try Genesis 1:1, wisdom, light, covenant..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisibleCount(25);
            }}
            className="mb-6 w-full rounded-xl border border-neutral-700 bg-neutral-950 p-4 text-white outline-none transition focus:border-neutral-400"
          />

          {hasSearch && (
            <p className="mb-4 text-neutral-400">
              {totalResults} results found
              {totalResults > visibleCount && ` (showing first ${visibleCount})`}
            </p>
          )}

          <div className="divide-y divide-neutral-800">
            {displayedResults.map((verse, index) => (
              <Link
                key={`${verse.id}-${index}`}
                href={`/read/${encodeURIComponent(verse.book)}/${
                  verse.chapter
                }?verse=${verse.verse}`}
                className="block rounded-xl px-3 py-6 transition hover:bg-neutral-950/60"
              >
                <h3 className="mb-2 text-xl font-bold text-white">
                  {verse.reference}
                </h3>

                <p className="mb-3 text-sm text-neutral-500">
                  {verse.sources[0]?.sourceName}
                </p>

                <p className="leading-relaxed text-neutral-300">
                  {sacredNames
                    ? renderSacredNames(verse.sources[0]?.text || "")
                    : verse.sources[0]?.text || ""}
                </p>

                <p className="mt-4 text-sm text-neutral-500">
                  Open chapter →
                </p>
              </Link>
            ))}
          </div>

          {visibleCount < totalResults && (
            <button
              onClick={() => setVisibleCount(visibleCount + 25)}
              className="mt-8 rounded-xl bg-white px-6 py-3 font-semibold text-black hover:bg-neutral-200"
            >
              Load More
            </button>
          )}
        </section>
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <SearchPage />
    </Suspense>
  );
}