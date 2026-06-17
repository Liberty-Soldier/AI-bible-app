"use client";

import Link from "next/link";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { allScripture as sampleVerses } from "./data/scripture/allScripture";
import { renderSacredNames } from "./data/renderSacredNames";
import { normalizeReference } from "./data/normalizeReference";

function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [visibleCount, setVisibleCount] = useState(25);

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
    <main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
      <section className="mx-auto max-w-5xl">
        <p className="mb-4 text-sm uppercase tracking-[0.3em] text-neutral-400">
          Seek Truth
        </p>

        <h1 className="text-5xl font-bold mb-4">Scripture Search</h1>

        <p className="text-neutral-300 mb-8">
          Search Scripture. Compare Manuscripts.
        </p>

        <input
          type="text"
          placeholder="Search Scripture... Try Genesis 1:1, Moses, wisdom, Tobit"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisibleCount(25);
          }}
          className="w-full rounded-lg bg-neutral-900 border border-neutral-700 p-4 text-white mb-6"
        />

        {hasSearch && (
          <p className="mb-4 text-neutral-400">
            {totalResults} results found
            {totalResults > visibleCount && ` (showing first ${visibleCount})`}
          </p>
        )}

        <div className="space-y-8">
          {displayedResults.map((verse) => (
            <Link
              key={verse.id}
              href={`/verse/${verse.id}?q=${encodeURIComponent(search)}`}
              className="block rounded-2xl border border-neutral-800 bg-neutral-900 p-6 hover:border-neutral-500 transition"
            >
              <h2 className="text-2xl font-bold mb-6">{verse.reference}</h2>

              <div className="grid gap-4 md:grid-cols-2">
                {verse.sources.map((source) => (
                  <div
                    key={`${verse.id}-${source.tradition}`}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
                  >
                    <p className="text-sm uppercase tracking-wide text-neutral-500 mb-2">
                      {source.label}
                    </p>

                    <p className="text-xs text-neutral-500 mb-4">
                      {source.sourceName}
                    </p>

                    <p className="text-neutral-200 leading-relaxed">
                      {renderSacredNames(source.text)}
                    </p>
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>

        {visibleCount < totalResults && (
          <button
            onClick={() => setVisibleCount(visibleCount + 25)}
            className="mt-8 rounded-xl bg-white text-black px-6 py-3 font-semibold"
          >
            Load More
          </button>
        )}
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