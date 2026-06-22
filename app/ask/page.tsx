"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { allScripture as sampleVerses } from "@/app/data/scripture/allScripture";
import {
  understandQuestion,
  scoreVerseForTopic,
} from "@/app/data/askScripture";
import { getConceptEvidence } from "@/app/data/lexicon/getConceptEvidence";
import MobileBottomNav from "@/app/components/MobileBottomNav";

function AskContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [search, setSearch] = useState(initialQuery);

  const hasSearch = search.trim().length > 0;
  const conceptEvidence = hasSearch ? getConceptEvidence(search) : null;
  const understood = understandQuestion(search);

  const examples = [
    "What is Torah?",
    "What is sin?",
    "What is the Sabbath?",
    "Kingdom of God",
  ];

  const fallbackResults =
    hasSearch && !conceptEvidence
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

        {hasSearch && conceptEvidence && (
          <section className="mt-6 rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6">
            <p className="text-sm uppercase tracking-[0.25em] text-amber-300/80">
              Source Word Evidence
            </p>

            <h2 className="mt-2 text-3xl font-bold">
              {conceptEvidence.concept.label}
            </h2>

            <div className="mt-5 space-y-5">
              {conceptEvidence.hebrewEvidence.map((entry) => {
                if (!entry) return null;

                return (
                  <div
                    key={entry.lemma}
                    className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-5"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm uppercase tracking-[0.25em] text-neutral-500">
                          Hebrew Lemma
                        </p>

                        <h3 className="mt-1 text-2xl font-bold">
                          {entry.lemma}
                        </h3>
                      </div>

                      <p className="rounded-full border border-neutral-700 px-3 py-1 text-sm text-neutral-300">
                        {entry.occurrenceCount} occurrences
                      </p>
                    </div>

                    <div className="mt-4">
                      <p className="mb-2 text-sm text-neutral-400">
                        Common Hebrew forms:
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {entry.surfaces.slice(0, 8).map(([surface, count]) => (
                          <span
                            key={surface}
                            className="rounded-full border border-neutral-700 px-3 py-1 text-sm text-neutral-300"
                          >
                            {surface} · {count}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5">
                      <p className="mb-3 text-sm text-neutral-400">
                        First occurrences:
                      </p>

                      <div className="divide-y divide-neutral-800">
                        {entry.occurrences.slice(0, 25).map((occurrence) => (
                          <Link
                            key={`${entry.lemma}-${occurrence.reference}-${occurrence.surface}`}
                            href={`/read/${encodeURIComponent(
                              occurrence.book
                            )}/${occurrence.reference.split(".")[1]}?verse=${
                              occurrence.reference.split(".")[2]
                            }`}
                            className="block py-3 transition hover:text-white"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="font-semibold text-white">
                                  {occurrence.reference}
                                </p>
                                <p className="mt-1 text-sm text-neutral-400">
                                  {occurrence.surface}
                                </p>
                              </div>

                              <span className="text-sm text-neutral-500">
                                Open →
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {hasSearch && !conceptEvidence && (
          <section className="mt-6 rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
            <p className="mb-4 text-sm text-neutral-400">
              {fallbackResults.length} evidence results found
            </p>

            <div className="divide-y divide-neutral-800">
              {fallbackResults.map(({ verse, score }, index) => (
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
                      text match
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