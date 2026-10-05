"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  compareVerseLabels,
  normalizeReaderChapter,
} from "@/app/data/scripture/ReaderVerseAdapter";

type Translation = "web" | "kjv" | "brenton";

type Props = {
  book: string;
  chapterCount: number;
  translation: Translation;
};

function safeBook(book: string) {
  return String(book || "")
    .replace(/[^1-3A-Za-z ]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

function translationLabel(translation: Translation) {
  if (translation === "kjv") return "KJV";
  if (translation === "brenton") return "Brenton";
  return "WEB";
}

export default function BookPassageSelector({
  book,
  chapterCount,
  translation,
}: Props) {
  const chapters = useMemo(
    () => Array.from({ length: chapterCount }, (_, index) => index + 1),
    [chapterCount],
  );
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [verseOptions, setVerseOptions] = useState<string[]>([]);
  const [resolvedTranslation, setResolvedTranslation] =
    useState<Translation>(translation);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const versePanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!selectedChapter) return;
    versePanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [selectedChapter]);

  useEffect(() => {
    if (!selectedChapter) return;

    const controller = new AbortController();
    const candidates = Array.from(
      new Set<Translation>([translation, "web", "kjv", "brenton"]),
    );

    async function loadVerses() {
      setLoading(true);
      setUnavailable(false);
      setVerseOptions([]);
      setResolvedTranslation(translation);

      for (const candidate of candidates) {
        try {
          const response = await fetch(
            `/scripture/runtime/${candidate}/${safeBook(book)}/${selectedChapter}.json`,
            { cache: "force-cache", signal: controller.signal },
          );
          if (!response.ok) continue;

          const chapter = normalizeReaderChapter(await response.json());
          const labels = Array.from(
            new Set(chapter.verses.map((verse) => verse.verseLabel)),
          ).sort(compareVerseLabels);
          if (!labels.length) continue;

          setVerseOptions(labels);
          setResolvedTranslation(candidate);
          setLoading(false);
          return;
        } catch (error) {
          if (controller.signal.aborted) return;
          console.error("Reader verse selection could not load a chapter.", error);
        }
      }

      setUnavailable(true);
      setLoading(false);
    }

    void loadVerses();
    return () => controller.abort();
  }, [book, selectedChapter, translation]);

  const chapterHref = selectedChapter
    ? `/read/${encodeURIComponent(book)}/${selectedChapter}?translation=${resolvedTranslation}`
    : "";

  return (
    <div>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
        {chapters.map((chapter) => (
          <button
            key={chapter}
            type="button"
            aria-pressed={selectedChapter === chapter}
            onClick={() => setSelectedChapter(chapter)}
            className={`grid min-h-12 place-items-center rounded-xl border text-base font-semibold transition active:scale-[0.97] ${
              selectedChapter === chapter
                ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                : "border-[var(--border)] bg-[var(--surface)] active:bg-[var(--surface-strong)]"
            }`}
          >
            {chapter}
          </button>
        ))}
      </div>

      {selectedChapter ? (
        <section
          ref={versePanelRef}
          className="mt-7 scroll-mt-4 border-t border-[var(--border)] pt-5"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
            Choose verse
          </p>
          <div className="mt-2 flex items-end justify-between gap-4 border-b border-[var(--border)] pb-4">
            <div>
              <h2 className="text-xl font-bold">
                {book} {selectedChapter}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Select a verse or begin with the whole chapter.
              </p>
            </div>
            <Link
              href={chapterHref}
              className="shrink-0 border-b border-[var(--foreground)] pb-0.5 text-sm font-semibold"
            >
              Read chapter →
            </Link>
          </div>

          {loading ? (
            <p className="py-5 text-sm text-[var(--muted)]">Loading verses…</p>
          ) : unavailable ? (
            <p role="alert" className="py-5 text-sm text-[var(--muted)]">
              Verse selection is unavailable for this chapter. You can still open the chapter.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8">
              {verseOptions.map((verseLabel) => (
                <Link
                  key={verseLabel}
                  href={`${chapterHref}&verse=${encodeURIComponent(verseLabel)}`}
                  aria-label={`${book} ${selectedChapter}:${verseLabel}`}
                  className="grid min-h-11 place-items-center border-b border-[var(--border)] text-sm font-semibold transition active:bg-[var(--surface)]"
                >
                  {verseLabel}
                </Link>
              ))}
            </div>
          )}

          {resolvedTranslation !== translation && !loading && !unavailable ? (
            <p className="mt-4 text-xs text-[var(--muted)]">
              Available in {translationLabel(resolvedTranslation)}.
            </p>
          ) : null}
        </section>
      ) : (
        <p className="mt-5 text-sm text-[var(--muted)]">
          Select a chapter to choose a verse.
        </p>
      )}
    </div>
  );
}
