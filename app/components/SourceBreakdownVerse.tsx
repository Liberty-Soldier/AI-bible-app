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
  prominent?: boolean;
};

function parseDisplayedReference(
  reference: string,
  fallbackVerse: number,
) {
  const dotMatch =
    reference.match(
      /^(.+)\.(\d+)\.([^.]+)$/,
    );

  if (dotMatch) {
    return {
      book: dotMatch[1],
      chapter:
        Number(dotMatch[2]),
      verse: dotMatch[3],
    };
  }

  const humanMatch =
    reference.match(
      /^(.+?)\s+(\d+):(.+)$/,
    );

  if (humanMatch) {
    return {
      book: humanMatch[1],
      chapter:
        Number(humanMatch[2]),
      verse: humanMatch[3],
    };
  }

  return {
    book: "",
    chapter: 0,
    verse:
      String(fallbackVerse),
  };
}

export default function SourceBreakdownVerse({
  reference,
  verse,
  translation,
  verseText,
  prominent = false,
}: SourceBreakdownVerseProps) {
  const [
    breakdown,
    setBreakdown,
  ] =
    useState<SourceBreakdownResult | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

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
      !Number.isFinite(
        parsed.chapter,
      ) ||
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
            String(
              parsed.chapter,
            ),
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
    <div className="contents">
      <button
        type="button"
        onClick={() => {
          void openBreakdown();
        }}
        disabled={loading}
        aria-busy={loading}
        className={
          prominent
            ? "col-span-full flex min-h-14 w-full items-center justify-between rounded-2xl border border-[color:var(--border)] bg-[var(--canvas)] px-4 text-left shadow-[var(--shadow-sm)] transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
            : "min-h-11 rounded-xl bg-[var(--surface)] px-3 text-center text-xs font-semibold text-[var(--foreground)] active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
        }
      >
        {prominent ? (
          <>
            <span>
              <span className="block text-sm font-bold text-[var(--foreground)]">
                {loading ? "Loading Source Text..." : "Source Text"}
              </span>
              <span className="mt-0.5 block text-[0.7rem] font-medium text-[var(--muted)]">
                Read the original-language text
              </span>
            </span>
            <span aria-hidden="true" className="text-lg text-[var(--brand-strong)]">
              →
            </span>
          </>
        ) : loading ? (
          "Loading..."
        ) : (
          "Source Text"
        )}
      </button>

      {error ? (
        <div
          role="status"
          className="col-span-2 rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]"
        >
          {error}
        </div>
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
    </div>
  );
}
