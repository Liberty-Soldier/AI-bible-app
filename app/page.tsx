"use client";

import Link from "next/link";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { allScripture as sampleVerses } from "./data/scripture/allScripture";
import { renderSacredNames } from "./data/renderSacredNames";
import { useSacredNames } from "./data/useSacredNames";
import { normalizeReference } from "./data/normalizeReference";
import MobileBottomNav from "@/app/components/MobileBottomNav";

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
    <main className="min-h-screen bg-neutral-950 px-5 pb-28 pt-8 text-white sm:px-6 sm:py-10">
      <section className="mx-auto max-w-6xl">
        <section className="mb-6">
  <div className="mb-4">
    <p className="mb-2 text-xs uppercase tracking-[0.3em] text-neutral-500">
      Source-First Scripture Study
    </p>

    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
      Scripture Search
    </h1>

    <p className="mt-2 text-sm leading-relaxed text-neutral-400 sm:text-base">
      Search Scripture, enter a reference, or ask a question from the text.
    </p>
  </div>

  <div className="rounded-3xl border border-neutral-800 bg-neutral-900/70 p-4 shadow-xl shadow-black/20">
    <input
      type="text"
      placeholder="Search Scripture or ask a question..."
      value={search}
      onChange={(e) => {
        setSearch(e.target.value);
        setVisibleCount(25);
      }}
      className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-5 py-4 text-lg text-white outline-none transition placeholder:text-neutral-600 focus:border-neutral-400"
    />

    <div className="mt-4 flex flex-wrap gap-2">
      {["Genesis 1:1", "What is sin?", "Sabbath", "Kingdom of God"].map(
        (suggestion) => (
          <button
            key={suggestion}
            onClick={() => {
              setSearch(suggestion);
              setVisibleCount(25);
            }}
            className="rounded-full border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-500 hover:text-white"
          >
            {suggestion}
          </button>
        )
      )}
    </div>

    <label className="mt-4 flex items-center gap-2 text-sm text-neutral-300">
      <input
        type="checkbox"
        checked={sacredNames}
        onChange={(e) => setSacredNames(e.target.checked)}
      />
      Sacred Name Rendering
    </label>
  </div>
</section>

        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link
            href="/read"
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 transition hover:border-neutral-600"
          >
            <p className="text-lg font-bold">Read</p>
            <p className="mt-2 text-sm text-neutral-400">Books and chapters</p>
          </Link>

          <a
            href="#search"
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 transition hover:border-neutral-600"
          >
            <p className="text-lg font-bold">Search</p>
            <p className="mt-2 text-sm text-neutral-400">Words and phrases</p>
          </a>

          <Link
            href="/ask"
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 transition hover:border-neutral-600"
          >
            <p className="text-lg font-bold">Ask</p>
            <p className="mt-2 text-sm text-neutral-400">Coming soon</p>
          </Link>

          <Link
            href="/study"
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 transition hover:border-neutral-600"
          >
            <p className="text-lg font-bold">Study</p>
            <p className="mt-2 text-sm text-neutral-400">Tools and witnesses</p>
          </Link>
        </section>

        {lastReading && (
          <section className="mb-6 rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6">
            <p className="mb-2 text-xs uppercase tracking-[0.25em] text-amber-300/80">
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

        <section className="mb-6 rounded-3xl border border-neutral-800 bg-neutral-900/50 p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
            Evidence Order
          </p>
          <p className="mt-3 text-lg leading-relaxed text-neutral-300">
            Original Language Source → Translation Witnesses → Cross References
            → AI Explanation
          </p>
        </section>

       {hasSearch && (
  <section id="search" className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6 sm:p-8">
    <p className="mb-4 text-neutral-400">
      {totalResults} results found
      {totalResults > visibleCount && ` (showing first ${visibleCount})`}
    </p>

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

          <p className="mt-4 text-sm text-neutral-500">Open chapter →</p>
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
)}
      </section>

      <MobileBottomNav />
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