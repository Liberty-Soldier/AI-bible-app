"use client";

import { useState } from "react";

import ScriptureText from "@/app/components/ScriptureText";
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
  fallbackVerse: number
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
        verse
      );

    if (
      !parsed.book ||
      !Number.isFinite(parsed.chapter) ||
      parsed.chapter < 1
    ) {
      setError(
        "Source Breakdown unavailable for this reference."
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
          }
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
            : "Source Breakdown unavailable."
        );
      }

      setBreakdown(json);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Source Breakdown unavailable."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openBreakdown}
        disabled={loading}
        aria-busy={loading}
        aria-label={`Open source breakdown for ${reference}`}
        className="inline cursor-pointer text-left align-baseline text-inherit disabled:cursor-wait disabled:opacity-70"
      >
        <ScriptureText
          text={verseText}
          reference={reference}
          verseNumber={verse}
          interactionMode="plain"
        />
      </button>

      {error ? (
        <span
          role="status"
          className="ml-2 text-xs text-[var(--muted)]"
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
