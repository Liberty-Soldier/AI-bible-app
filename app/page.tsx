"use client";

import Link from "next/link";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { allScripture as sampleVerses } from "./data/scripture/allScripture";
import { renderSacredNames } from "./data/renderSacredNames";
import { useSacredNames } from "./data/useSacredNames";
import { normalizeReference } from "./data/normalizeReference";

function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [visibleCount, setVisibleCount] = useState(25);
  const { sacredNames, setSacredNames } = useSacredNames();

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
        <label className="flex items-center gap-2 mb-6 text-sm text-neutral-300">
  <input
    type="checkbox"
    checked={sacredNames}
    onChange={(e) => setSacredNames(e.target.checked)}
  />
  Sacred Name Rendering
</label>

        <div className="space-y-8">
          {displayedResults.map((verse, index) => (
            <Link
              key={`${verse.id}-${index}`}
              href={`/verse/${verse.id}?q=${encodeURIComponent(search)}`}
             className="block border-b border-neutral-800 py-6 hover:bg-neutral-900/60 transition px-2"
            >
<h2 className="text-xl font-bold mb-2 text-white">
  {verse.reference}
</h2>

<p className="text-sm text-neutral-500 mb-3">
  {verse.sources[0]?.sourceName}
</p>

<p className="text-neutral-300 leading-relaxed">
 {sacredNames
  ? renderSacredNames(verse.sources[0]?.text || "")
  : verse.sources[0]?.text || ""}
</p>

<p className="mt-4 text-sm text-neutral-500">
  Open verse study →
</p>
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