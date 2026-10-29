"use client";

import { type MouseEvent, useEffect, useMemo, useState } from "react";
import ScriptureText from "@/app/components/ScriptureText";
import type { BibleIQChapterTokenAvailability } from "@/app/data/lexicon/BibleIQTypes";
import {
  buildReaderChapterItems,
  compareReaderVerses,
  readerVerseAnchorId,
  readerVerseQueryValue,
  readerVerseTokenAvailabilityKey,
  type ReaderSuperscription,
  type ReaderVerse,
} from "@/app/data/scripture/ReaderVerseAdapter";
import VerseActionSheet from "@/app/components/VerseActionSheet";
import {
  getReaderMemory,
  type ReaderHighlight,
  type ReaderMemoryVerse,
  type ReaderNote,
  type ReaderTranslation,
} from "@/app/lib/readerMemory";
import { useReaderPreferences } from "@/app/lib/readerPreferences";

export type SelectedVerse = ReaderMemoryVerse;

export default function VerseActionController({
  verses,
  activeTranslation,
  superscriptions,
  highlightedVerse,
  tokenAvailabilityByVerse,
}: {
  verses: ReaderVerse[];
  superscriptions?: ReaderSuperscription[];
  activeTranslation: ReaderTranslation;
  highlightedVerse?: string | null;
  tokenAvailabilityByVerse?: BibleIQChapterTokenAvailability;
}) {
  const [selectedVerses, setSelectedVerses] = useState<SelectedVerse[]>([]);
  const [memory, setMemory] = useState(() => getReaderMemory());
  const readerPreferences = useReaderPreferences();

  function refreshReaderMemory() {
    setMemory(getReaderMemory());
  }

  const selectedIds = useMemo(
    () => new Set(selectedVerses.map((verse) => verse.id)),
    [selectedVerses],
  );

  const highlightByVerseId = useMemo(() => {
    const map = new Map<string, ReaderHighlight>();

    memory.highlights.forEach((highlight) => {
      map.set(highlight.id, highlight);
    });

    return map;
  }, [memory]);

  const bookmarkedIds = useMemo(
    () => new Set(memory.bookmarks.map((bookmark) => bookmark.id)),
    [memory.bookmarks],
  );

  const noteByVerseId = useMemo(() => {
    const map = new Map<string, ReaderNote[]>();

    memory.notes.forEach((note) => {
      note.verses.forEach((verse) => {
        const existing = map.get(verse.id) || [];
        map.set(verse.id, [...existing, note]);
      });
    });

    return map;
  }, [memory.notes]);

  useEffect(() => {
    function refreshMemory() {
      setMemory(getReaderMemory());
    }

    refreshMemory();

    window.addEventListener("reader-memory-updated", refreshMemory);
    window.addEventListener("storage", refreshMemory);

    return () => {
      window.removeEventListener("reader-memory-updated", refreshMemory);
      window.removeEventListener("storage", refreshMemory);
    };
  }, []);

  function toSelectedVerse(verse: ReaderVerse): SelectedVerse {
    return {
      id: verse.id,
      reference: verse.reference,
      book: verse.book,
      chapter: verse.chapter,
      verse: verse.verse,
      verseLabel: verse.verseLabel,
      text: verse.sources[0]?.text || "",
      translation: activeTranslation,
    };
  }

  function toggleVerse(verse: ReaderVerse) {
    const nextVerse = toSelectedVerse(verse);

    setSelectedVerses((current) => {
      const exists = current.some((item) => item.id === nextVerse.id);

      if (exists) {
        return current.filter((item) => item.id !== nextVerse.id);
      }

      return [...current, nextVerse].sort((left, right) =>
        compareReaderVerses(
          { verseLabel: left.verseLabel || String(left.verse) },
          { verseLabel: right.verseLabel || String(right.verse) },
        ),
      );
    });
  }

  function clearSelection() {
    setSelectedVerses([]);
  }

  function getHighlightClass(color?: ReaderHighlight["color"]) {
    if (!color) return "";
    if (color === "green") return "bg-emerald-500/15";
    if (color === "blue") return "bg-sky-500/15";
    if (color === "pink") return "bg-pink-500/15";
    if (color === "purple") return "bg-purple-500/15";
    return "bg-amber-400/20";
  }

  const chapterItems = useMemo(
    () => buildReaderChapterItems(verses, superscriptions || []),
    [superscriptions, verses],
  );

  const tokenAvailabilityByReaderVerseId = useMemo(() => {
    if (!tokenAvailabilityByVerse) return undefined;

    return Object.fromEntries(
      verses.flatMap((verse) => {
        const availabilityKey =
          activeTranslation === "brenton"
            ? verse.id
            : readerVerseTokenAvailabilityKey(verse);
        const availability = availabilityKey
          ? tokenAvailabilityByVerse[availabilityKey]
          : undefined;

        return availability ? [[verse.id, availability]] : [];
      }),
    );
  }, [activeTranslation, tokenAvailabilityByVerse, verses]);

  const typefaceClass =
    readerPreferences.fontFamily === "serif" ? "reader-serif" : "font-sans";
  const textSizeClass =
    readerPreferences.textSize === "small"
      ? "text-[1.04rem] sm:text-[1.1rem]"
      : readerPreferences.textSize === "large"
        ? "text-[1.28rem] sm:text-[1.36rem]"
        : "text-[1.16rem] sm:text-[1.22rem]";
  const lineSpacingClass =
    readerPreferences.lineSpacing === "compact"
      ? "leading-[1.62]"
      : readerPreferences.lineSpacing === "relaxed"
        ? "leading-[2.02]"
        : "leading-[1.82]";

  return (
    <>
      <div
        className={`space-y-1 text-[var(--foreground)] ${typefaceClass} ${textSizeClass} ${lineSpacingClass} ${selectedVerses.length ? "pb-28" : ""}`}
      >
        {chapterItems.map((item) => {
          if (item.type === "superscription") {
            return (
              <div
                key={item.value.id}
                className="px-1 py-3"
              >
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Superscription
                </p>
                <p className="mt-2 text-base italic leading-7 text-[var(--muted)]">
                  {item.value.text}
                </p>
              </div>
            );
          }

          const verse = item.value;
          const verseLabel = readerVerseQueryValue(verse);
          const isHighlightedFromUrl =
            highlightedVerse === verseLabel;
          const isSelected = selectedIds.has(verse.id);
          const selectedText = verse.sources[0]?.text || "";
          const storedHighlight = highlightByVerseId.get(verse.id);
          const isBookmarked = bookmarkedIds.has(verse.id);
          const hasNote = (noteByVerseId.get(verse.id) || []).length > 0;
          return (
            <div
              id={readerVerseAnchorId(verseLabel)}
              key={`${verse.id}-${activeTranslation}`}
              className={`group relative block w-full scroll-mt-28 rounded-r-lg border-l-2 px-1 py-0.5 text-left transition-colors ${
                isSelected
                  ? "border-amber-500/70 bg-amber-500/10"
                  : isHighlightedFromUrl
                    ? "border-amber-400/40 bg-amber-500/10"
                    : storedHighlight
                      ? `border-transparent ${getHighlightClass(storedHighlight.color)}`
                      : "border-transparent"
              }`}
            >
              <button
                type="button"
                data-verse-selector="true"
                aria-pressed={isSelected}
                aria-label={`${isSelected ? "Unselect" : "Select"} ${verse.reference} for highlight, note, copy, or share`}
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  event.preventDefault();
                  event.stopPropagation();
                  toggleVerse(verse);
                }}
                className={`mr-1 inline-flex min-h-11 min-w-11 -translate-y-[0.08em] items-center justify-center rounded-lg align-baseline font-sans text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-[var(--brand)] ${
                  isSelected
                    ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                    : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                }`}
              >
                {verseLabel}
              </button>

              <ScriptureText text={selectedText} reference={verse.reference} />


              {isBookmarked || hasNote ? (
                <span className="ml-2 inline-flex align-middle text-xs text-[var(--muted)]">
                  {isBookmarked ? "🔖" : ""}
                  {hasNote ? " 📝" : ""}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <VerseActionSheet
        open={selectedVerses.length > 0}
        verses={selectedVerses}
        onClose={clearSelection}
        onMemoryChange={refreshReaderMemory}
        tokenAvailabilityByVerse={tokenAvailabilityByReaderVerseId}
      />
    </>
  );
}
