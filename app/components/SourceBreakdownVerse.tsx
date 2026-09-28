"use client";

import { useState } from "react";

import SourceBreakdownSheet from "@/app/components/SourceBreakdownSheet";

import type {
  SourceBreakdownResult,
  SourceBreakdownTranslation,
} from "@/app/data/bibleiq/SourceBreakdownRuntime";

type SourceBreakdownVerseProps = {
  reference: string;
  verse: number;
  translation: SourceBreakdownTranslation;
  verseText: string;
};

function parseDisplayedReference(
  reference: string,
  fallbackVerse: number,
) {
  const dotMatch =
    reference.match(/^(.+)\.(\d+)\.([^.]+)$/);

  if (dotMatch) {
    return {
      book: dotMatch[1],
      chapter: Number(dotMatch[2]),
      verse: dotMatch[3],
    };
  }

  const humanMatch =
    reference.match(/^(.+?)\s+(\d+):(.+)$/);

  if (humanMatch) {
    return {
      book: humanMatch[1],
      chapter: Number(humanMatch[2]),
      verse: humanMatch[3],
    };
  }

  return {
    book: "",
    chapter: 0,
    verse: String(fallbackVerse),
  };
}

export default function SourceBreakdownVerse({
  reference,
  verse,
  translation,
  verseText,
}: SourceBreakdownVerseProps) {
  const [breakdown, setBreakdown] =
    useState<SourceBreakdownResult | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  async function openBreakdown() {
    if (loading) {
      return;
    }

    const parsed =
      parseDisplayedReference(
        reference,
        verse,
      );

    if (
      !parsed.book ||
      !Number.isFinite(parsed.chapter) ||
      parsed.chapter < 1
    ) {
      setError(
        "Source Text unavailable for this reference.",
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const query =
        new URLSearchParams({
          translation,
          book: parsed.book,
          chapter:
            String(parsed.chapter),
          verse:
            String(parsed.verse),
        });

      const response =
        await fetch(
          `/api/source-breakdown?${query.toString()}`,
          {
            cache: "no-store",
          },
        );

      const json =
        (await response.json()) as
          | SourceBreakdownResult
          | {
              resolved?: false;
              error?: string;
            };

      if (
        !response.ok ||
        !("resolved" in json) ||
        json.resolved !== true
      ) {
        throw new Error(
          "error" in json &&
            json.error
            ? json.error
            : "Source Text unavailable.",
        );
      }

      setBreakdown(json);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Source Text unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void openBreakdown();
        }}
        disabled={loading}
        aria-busy={loading}
        aria-label={`Open source text for ${reference}`}
        className="ml-2 inline-flex align-baseline text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--muted)] opacity-55 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/40 disabled:cursor-wait"
      >
        Source
      </button>

      {error ? (
        <span
          role="status"
          className="ml-2 text-[10px] text-[var(--muted)]"
        >
          {error}
        </span>
      ) : null}

      {breakdown ? (
        <SourceBreakdownSheet
          data={breakdown}
          verseText={verseText}
          onClose={() =>
            setBreakdown(null)
          }
        />
      ) : null}
    </>
  );
}
