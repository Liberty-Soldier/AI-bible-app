"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { allScripture as sampleVerses } from "@/app/data/scripture/allScripture";
import {
  understandQuestion,
  scoreVerseForTopic,
} from "@/app/data/askScripture";
import MobileBottomNav from "@/app/components/MobileBottomNav";

function AskContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [search, setSearch] = useState(initialQuery);

  const hasSearch = search.trim().length > 0;
  const understood = understandQuestion(search);

  const examples = [
    "What is sin?",
    "What is the Sabbath?",
    "Kingdom of God",
    "Genesis 1:1",
  ];

  const results = hasSearch
    ? sampleVerses
        .map((verse) => {
          const text = verse.sources.map((source) => source.text).join(" ");

          const score = understood.topic
            ? scoreVerseForTopic(text, verse.reference, understood.topic)
            : text.toLowerCase().includes(search.toLowerCase()) ||
              verse.reference.toLowerCase().includes(search.toLowerCase())
            ? 1
            : 0;

          return { verse, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 25)
    : [];

  return (
    <main className="min-h-screen bg-neutral-950 px-5 pb-28 pt-6 text-white">
      <div className="mx-auto max-w-4xl">
        <nav className="mb-6 flex items-center justify-between text-sm text-neutral-400">
          <Link href="/" className="hover:text-white">
            ← Home
          </Link>

          <div className="flex gap-4">
            <Link href="/read" className="hover:text-white">
              Read
            </Link>
            <Link href="/study" className="hover:text-white">
              Study
            </Link>
          </div>
        </nav>

        <h1 className="mb-3 text-4xl font-bold">Ask Scripture</h1>

        <p className="mb-6 text-neutral-400">
          Search Scripture and examine the evidence before conclusions are drawn.
        </p>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="What would you like to study?"
          className="w-full rounded-2xl border border-neutral-700 bg-neutral-900 px-5 py-4 text-lg text-white outline-none placeholder:text-neutral-500 focus:border-neutral-400"
        />

        {!hasSearch && (
          <div className="mt-4 flex flex-wrap gap-2">
            {examples.map((example) => (
              <button
                key={example}
                onClick={() => setSearch(example)}
                className="rounded-full border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-500 hover:text-white"
              >
                {example}
              </button>
            ))}
          </div>
        )}

        {hasSearch && understood.topic && (
          <section className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5">
            <p className="text-sm uppercase tracking-[0.25em] text-neutral-500">
              Evidence Search
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              {understood.topic.label}
            </h2>

            <p className="mt-3 text-sm text-neutral-400">
              Searching related Scripture terms:
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {understood.terms.map((term) => (
                <span
                  key={term}
                  className="rounded-full border border-neutral-700 px-3 py-1 text-sm text-neutral-300"
                >
                  {term}
                </span>
              ))}
            </div>
          </section>
        )}

        {hasSearch && (
          <section className="mt-6 rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
            <p className="mb-4 text-sm text-neutral-400">
              {results.length} evidence results found
            </p>

            <div className="divide-y divide-neutral-800">
              {results.map(({ verse, score }, index) => (
                <Link
                  key={`${verse.id}-${index}`}
                  href={`/read/${encodeURIComponent(verse.book)}/${
                    verse.chapter
                  }?verse=${verse.verse}`}
                  className="block rounded-xl px-3 py-5 transition hover:bg-neutral-950/60"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-xl font-bold text-white">
                      {verse.reference}
                    </h3>

                    <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-400">
                      score {score}
                    </span>
                  </div>

                  <p className="mb-3 text-sm text-neutral-500">
                    {verse.sources[0]?.sourceName}
                  </p>

                  <p className="leading-relaxed text-neutral-300">
                    {verse.sources[0]?.text || ""}
                  </p>

                  <p className="mt-4 text-sm text-neutral-500">
                    Open chapter →
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      <MobileBottomNav />
    </main>
  );
}

export default function AskPage() {
  return (
    <Suspense fallback={null}>
      <AskContent />
    </Suspense>
  );
}