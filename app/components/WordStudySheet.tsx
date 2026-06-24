"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type WordStudySheetProps = {
  word: string | null;
  onClose: () => void;
};

type BibleIQMatch = {
  strong?: string;
  lemma?: string;
  transliteration?: string;
  language?: string;
  corpus?: string;
  gloss?: string;
  shortDefinition?: string;
  occurrenceCount?: number;
  weight?: number;
  forms?: unknown[];
  occurrences?: {
    book?: string;
    chapter?: number;
    verse?: number;
    reference?: string;
    word?: string;
    surface?: string;
  }[];
};

type BibleIQResponse = {
  query: string;
  concept?: string | null;
  strongs?: string[];
  matches: BibleIQMatch[];
};

export default function WordStudySheet({
  word,
  onClose,
}: WordStudySheetProps) {
  const [data, setData] = useState<BibleIQResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [visibleOccurrenceCount, setVisibleOccurrenceCount] = useState(8);

  useEffect(() => {
    setVisibleOccurrenceCount(8);
  }, [word]);

  useEffect(() => {
    if (!word) return;

    let cancelled = false;

    async function loadWordStudy() {
      setLoading(true);
      setData(null);

      try {
        const response = await fetch(
          `/api/word-study?q=${encodeURIComponent(word || "")}`
        );

        const json = (await response.json()) as BibleIQResponse;

        if (!cancelled) {
          setData(json);
        }
      } catch {
        if (!cancelled) {
          setData({
            query: word || "",
            matches: [],
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadWordStudy();

    return () => {
      cancelled = true;
    };
  }, [word]);

  if (!word) return null;

  const matches = data?.matches || [];
  const firstMatch = matches[0];

  const firstOccurrences =
    firstMatch?.occurrences?.slice(0, visibleOccurrenceCount) || [];

  const totalOccurrences = firstMatch?.occurrences?.length || 0;
  const hasMoreOccurrences = visibleOccurrenceCount < totalOccurrences;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60">
      <button
        aria-label="Close word study"
        className="absolute inset-0"
        onClick={onClose}
      />

      <section className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-neutral-800 bg-neutral-950 p-6 text-white shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutral-700" />

        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
              BibleIQ Word Study
            </p>

            <h2 className="mt-2 text-3xl font-bold">{word}</h2>

            {data?.concept ? (
              <p className="mt-1 text-sm text-neutral-400">
                Concept: {data.concept}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-neutral-700 px-3 py-1 text-sm text-neutral-300"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 text-neutral-300">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">Selected Word</p>
            <p className="mt-1 text-xl text-white">{word}</p>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-sm text-neutral-400">
                Loading BibleIQ study...
              </p>
            </div>
          ) : firstMatch ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-sm text-neutral-500">Primary Match</p>

              <p className="mt-2 text-2xl text-white">
                {firstMatch.lemma || word}
              </p>

              {firstMatch.transliteration ? (
                <p className="mt-1 text-sm text-neutral-400">
                  {firstMatch.transliteration}
                </p>
              ) : null}

              <p className="mt-3 text-sm text-neutral-400">
                {firstMatch.language} • {firstMatch.corpus}
              </p>

              {firstMatch.strong ? (
                <p className="mt-1 text-sm text-neutral-400">
                  Strong&apos;s: {firstMatch.strong}
                </p>
              ) : null}

              {firstMatch.shortDefinition || firstMatch.gloss ? (
                <p className="mt-3 text-sm leading-6 text-neutral-300">
                  {firstMatch.shortDefinition || firstMatch.gloss}
                </p>
              ) : null}

{firstMatch.occurrenceCount && firstMatch.occurrenceCount > 0 ? (
  <p className="mt-3 text-sm text-neutral-400">
    Occurrences: {firstMatch.occurrenceCount}
  </p>
) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-sm text-neutral-500">No BibleIQ match yet</p>
              <p className="mt-1">
                This word may need direct lemma mapping or a concept alias.
              </p>
            </div>
          )}

          {matches.length > 1 ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-sm text-neutral-500">Related Matches</p>

              <div className="mt-3 space-y-2">
                {matches
  .slice(1)
  .filter((match) => !("weight" in match) || Number(match.weight) >= 1000)
  .slice(0, 6)
  .map((match, index) => (
                  <div
                    key={`${match.strong || match.lemma || index}-${index}`}
                    className="rounded-xl border border-neutral-800 px-3 py-2"
                  >
                    <p className="text-sm text-white">
                      {match.lemma || "Unknown"}{" "}
                      {match.transliteration
                        ? `• ${match.transliteration}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {match.strong} • {match.language} • {match.corpus}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {firstOccurrences.length > 0 ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-sm text-neutral-500">First Occurrences</p>

              <div className="mt-4 space-y-2">
                {firstOccurrences.map((occurrence, index) => {
                  const label = `${occurrence.reference || "Reference"} — ${
                    occurrence.word || occurrence.surface || ""
                  }`;

                  if (!occurrence.book || !occurrence.chapter) {
                    return (
                      <div
                        key={`${occurrence.reference || index}-${index}`}
                        className="rounded-xl border border-neutral-800 px-3 py-2 text-sm text-neutral-300"
                      >
                        {label}
                      </div>
                    );
                  }

                  const href = `/read/${encodeURIComponent(
                    occurrence.book
                  )}/${occurrence.chapter}?translation=web${
                    occurrence.verse ? `&verse=${occurrence.verse}` : ""
                  }&study=true`;

                  return (
                    <Link
                      key={`${occurrence.reference || index}-${index}`}
                      href={href}
                      onClick={onClose}
                      className="block rounded-xl border border-neutral-800 px-3 py-2 text-sm text-neutral-300 hover:border-neutral-600 hover:text-white"
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>

              {hasMoreOccurrences ? (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleOccurrenceCount((count) => count + 8)
                  }
                  className="mt-4 w-full rounded-xl border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500 hover:text-white"
                >
                  Load More Occurrences
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}