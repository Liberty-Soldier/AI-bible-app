"use client";

import { type MouseEvent, useEffect, useMemo, useState } from "react";
import ScriptureText from "@/app/components/ScriptureText";
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
import type { BibleIQChapterTokenAvailability } from "@/app/data/lexicon/BibleIQTypes";
import {
  getReaderMemory,
  type ReaderHighlight,
  type ReaderMemoryVerse,
  type ReaderNote,
} from "@/app/lib/readerMemory";

export type SelectedVerse = ReaderMemoryVerse;

export default function VerseActionController({
  verses,
  activeTranslation,
  superscriptions,
  highlightedVerse,
  focusedTokenIndex,
  tokenAvailabilityByVerse,
}: {
  verses: ReaderVerse[];
  superscriptions?: ReaderSuperscription[];
  activeTranslation: string;
  highlightedVerse?: string | null;
  focusedTokenIndex?: number | null;
  tokenAvailabilityByVerse?: BibleIQChapterTokenAvailability;
}) {
  const [selectedVerses, setSelectedVerses] = useState<SelectedVerse[]>([]);
  const [memory, setMemory] = useState(() => getReaderMemory());

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

  return (
    <>
      <div className="space-y-5 text-[1.18rem] leading-9 text-[var(--foreground)] sm:text-xl sm:leading-10">
        {chapterItems.map((item) => {
          if (item.type === "superscription") {
            return (
              <div
                key={item.value.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/55 px-4 py-3"
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
          const availabilityKey =
            readerVerseTokenAvailabilityKey(verse);
          const isHighlightedFromUrl =
            highlightedVerse === verseLabel;
          const hasFocusedWord =
            isHighlightedFromUrl && focusedTokenIndex != null;
          const isSelected = selectedIds.has(verse.id);
          const selectedText = verse.sources[0]?.text || "";
          const storedHighlight = highlightByVerseId.get(verse.id);
          const isBookmarked = bookmarkedIds.has(verse.id);
          const hasNote = (noteByVerseId.get(verse.id) || []).length > 0;

          return (
            <div
              id={readerVerseAnchorId(verseLabel)}
              key={`${verse.id}-${activeTranslation}`}
              className={`group relative block w-full border-l-2 px-2 py-1 text-left transition ${
                isSelected
                  ? "border-amber-500/70 bg-amber-500/10"
                  : isHighlightedFromUrl && !hasFocusedWord
                    ? "border-amber-400/40 bg-amber-500/10"
                    : storedHighlight
                      ? `border-transparent ${getHighlightClass(storedHighlight.color)}`
                      : "border-transparent"
              }`}
            >
              <button
                type="button"
                data-verse-selector="true"
                aria-label={`${isSelected ? "Unselect" : "Select"} ${verse.reference} for highlight, note, copy, or share`}
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  event.preventDefault();
                  event.stopPropagation();
                  toggleVerse(verse);
                }}
                className={`mr-3 inline-flex min-h-7 min-w-7 items-center justify-center rounded-full align-super text-xs font-bold transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/50 ${
                  isSelected
                    ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                    : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                }`}
              >
                {verseLabel}
              </button>

              <ScriptureText
                text={selectedText}
                reference={verse.reference}
                tokenAvailability={
                  availabilityKey
                    ? tokenAvailabilityByVerse?.[availabilityKey]
                    : undefined
                }
                focusedTokenIndex={
                  hasFocusedWord ? focusedTokenIndex : null
                }
              />

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
      />
    </>
  );
}
