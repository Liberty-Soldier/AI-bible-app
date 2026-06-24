"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { allScripture as sampleVerses } from "@/app/data/scripture/allScripture";
import {
  understandQuestion,
  scoreVerseForTopic,
} from "@/app/data/askScripture";
import { getConceptEvidence } from "@/app/data/lexicon/getConceptEvidence";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import BibleIQLoader from "@/app/components/BibleIQLoader";

function formatReference(reference: string) {
  return reference.replace(/\./g, " ");
}

function getReferenceHref(verse: {
  book: string;
  chapter: number;
  verse: number;
}) {
  return `/read/${encodeURIComponent(verse.book)}/${verse.chapter}?verse=${
    verse.verse
  }`;
}

function AskContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [search, setSearch] = useState(initialQuery);
  const [submittedSearch, setSubmittedSearch] = useState(initialQuery);
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    setSearch(initialQuery);
    setSubmittedSearch(initialQuery);
  }, [initialQuery]);

function submitSearch(value?: string) {
  const finalQuery = (value || search).trim();

  if (!finalQuery) return;

  setSearch(finalQuery);
  setThinking(true);

  setTimeout(() => {
    setSubmittedSearch(finalQuery);
    setThinking(false);
  }, 800);
}

  const hasSearch = submittedSearch.trim().length > 0;
  const conceptEvidence = hasSearch ? getConceptEvidence(submittedSearch) : null;
  const understood = understandQuestion(submittedSearch);

  const examples = [
    "What is Torah?",
    "What is sin?",
    "What is the Sabbath?",
    "Kingdom of God",
    "What is faith?",
    "What is love?",
  ];

  const fallbackResults =
    hasSearch && !conceptEvidence
      ? sampleVerses
          .map((verse) => {
            const text = verse.sources.map((source) => source.text).join(" ");
            const lowerSearch = submittedSearch.toLowerCase();

            const score = understood.topic
              ? scoreVerseForTopic(text, verse.reference, understood.topic)
              : text.toLowerCase().includes(lowerSearch) ||
                verse.reference.toLowerCase().includes(lowerSearch)
              ? 1
              : 0;

            return { verse, score };
          })
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 25)
      : [];

  return (
    <main className="min-h-screen bg-neutral-950 px-4 pb-24 pt-8 text-white sm:px-6 sm:pt-12">
      <section className="mx-auto max-w-3xl">
        <div className="mb-7">
          <p className="mb-3 text-xs uppercase tracking-[0.35em] text-neutral-500">
            Ask Scripture
          </p>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Search the evidence.
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-neutral-400">
            Ask a question, enter a topic, or search Scripture. Evidence comes
            before explanation.
          </p>
        </div>

        <section className="rounded-[1.75rem] border border-neutral-800 bg-neutral-900/70 p-4 shadow-2xl shadow-black/30">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitSearch();
            }}
            placeholder="What would you like to study?"
            className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-4 text-base text-white outline-none placeholder:text-neutral-600 focus:border-neutral-400"
          />

          <button
            type="button"
            onClick={() => submitSearch()}
            className="mt-3 w-full rounded-2xl bg-white px-5 py-3 font-bold text-black transition hover:bg-neutral-200"
          >
            Ask Scripture
          </button>

          {!hasSearch ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => submitSearch(example)}
                  className="rounded-full border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-500 hover:text-white"
                >
                  {example}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        {thinking ? (
  <section className="mt-5">
    <BibleIQLoader message="Tracing source texts..." />
  </section>
) : null}

        {hasSearch && !thinking ? (
          <section className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900/40 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">
              Query
            </p>
            <p className="mt-2 text-lg font-semibold">{submittedSearch}</p>

            {conceptEvidence ? (
              <p className="mt-2 text-sm text-amber-300">
                Topic recognized: {conceptEvidence.concept.label}
              </p>
            ) : understood.topic ? (
              <p className="mt-2 text-sm text-amber-300">
              Topic recognized: {understood.topic?.label || understood.topic?.id || "Topic"}
              </p>
            ) : (
              <p className="mt-2 text-sm text-neutral-400">
                Searching Scripture text matches.
              </p>
            )}
          </section>
        ) : null}

        {hasSearch && !thinking && conceptEvidence ? (
  <section className="mt-5 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-5">
    <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
      BibleIQ Evidence Summary
    </p>

    <h2 className="mt-3 text-2xl font-bold">
      {conceptEvidence.concept.label}
    </h2>

    <p className="mt-4 leading-relaxed text-neutral-200">
      BibleIQ recognized this topic and gathered source-language evidence.
      Review the source words and passages below to examine the evidence
      directly.
    </p>

    <div className="mt-4 flex flex-wrap gap-2">
      {conceptEvidence.concept.aliases?.slice(0, 6).map((alias) => (
        <span
          key={alias}
          className="rounded-full border border-neutral-700 px-3 py-1 text-sm text-neutral-300"
        >
          {alias}
        </span>
      ))}
    </div>
  </section>
) : null}

        {hasSearch && conceptEvidence ? (
          <section className="mt-5 rounded-3xl border border-amber-500/30 bg-amber-500/10 p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-amber-300/80">
              Source Word Evidence
            </p>

            <h2 className="mt-2 text-3xl font-bold">
              {conceptEvidence.concept.label}
            </h2>

            <div className="mt-5 space-y-4">
              {conceptEvidence.hebrewEvidence.map((entry) => {
                if (!entry) return null;

                return (
                  <div
                    key={entry.lemma}
                    className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-neutral-500">
                          Hebrew Lemma
                        </p>

                        <h3 className="mt-1 text-2xl font-bold">
                          {entry.lemma}
                        </h3>
                      </div>

                      <p className="rounded-full border border-neutral-700 px-3 py-1 text-sm text-neutral-300">
                        {entry.occurrenceCount}x
                      </p>
                    </div>

                    <div className="mt-4">
                      <p className="mb-2 text-sm text-neutral-400">
                        Common forms
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
                      <p className="mb-2 text-sm text-neutral-400">
                        First occurrences
                      </p>

                      <div className="divide-y divide-neutral-800">
                        {entry.occurrences.slice(0, 12).map((occurrence) => {
                          const parts = occurrence.reference.split(".");
                          const chapter = parts[1];
                          const verse = parts[2];

                          return (
                            <Link
                              key={`${entry.lemma}-${occurrence.reference}-${occurrence.surface}`}
                              href={`/read/${encodeURIComponent(
                                occurrence.book
                              )}/${chapter}?verse=${verse}&study=true`}
                              className="block py-3 transition hover:text-white"
                            >
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <p className="font-semibold text-white">
                                    {formatReference(occurrence.reference)}
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
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {hasSearch && !conceptEvidence ? (
          <section className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5">
            <p className="mb-4 text-sm text-neutral-400">
              {fallbackResults.length} evidence result
              {fallbackResults.length === 1 ? "" : "s"} found
            </p>

            {fallbackResults.length ? (
              <div className="divide-y divide-neutral-800">
                {fallbackResults.map(({ verse }, index) => (
                  <Link
                    key={`${verse.id}-${index}`}
                    href={getReferenceHref(verse)}
                    className="block rounded-xl px-3 py-5 transition hover:bg-neutral-950/60"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h3 className="text-xl font-bold text-white">
                        {verse.reference}
                      </h3>

                      <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-400">
                        evidence
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
            ) : (
              <p className="text-neutral-400">
                No evidence found yet. Try a shorter topic or a Scripture
                reference.
              </p>
            )}
          </section>
        ) : null}
      </section>

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