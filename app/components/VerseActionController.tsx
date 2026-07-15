"use client";

import { useEffect, useMemo, useState } from "react";
import ScriptureText from "@/app/components/ScriptureText";
import VerseActionSheet from "@/app/components/VerseActionSheet";
import {
  getReaderMemory,
  type ReaderHighlight,
  type ReaderMemoryVerse,
  type ReaderNote,
} from "@/app/lib/readerMemory";

type ReaderVerse = {
  id: string;
  book: string;
  chapter: number;
  verse: number;
  reference: string;
  sources: {
    sourceName: string;
    text: string;
  }[];
};

export type SelectedVerse = ReaderMemoryVerse;

export default function VerseActionController({
  verses,
  activeTranslation,
  highlightedVerse,
}: {
  verses: ReaderVerse[];
  activeTranslation: string;
  highlightedVerse?: number | null;
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

      return [...current, nextVerse].sort(
        (left, right) => left.verse - right.verse,
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

  return (
    <>
      <div className="space-y-5 text-[1.18rem] leading-9 text-[var(--foreground)] sm:text-xl sm:leading-10">
        {verses.map((verse) => {
          const isHighlightedFromUrl =
            highlightedVerse === verse.verse;
          const isSelected = selectedIds.has(verse.id);
          const selectedText = verse.sources[0]?.text || "";
          const storedHighlight = highlightByVerseId.get(verse.id);
          const isBookmarked = bookmarkedIds.has(verse.id);
          const hasNote =
            (noteByVerseId.get(verse.id) || []).length > 0;

          return (
            <div
              id={`verse-${verse.verse}`}
              key={`${verse.id}-${activeTranslation}`}
              onClick={(event: React.MouseEvent<HTMLDivElement>) => {
                const target = event.target as HTMLElement;

                if (target.closest("[data-word-token='true']")) {
                  return;
                }

                if (window.getSelection()?.toString().trim()) {
                  return;
                }

                toggleVerse(verse);
              }}
              className={`group block w-full cursor-pointer rounded-xl px-2 py-1 text-left transition ${
                isSelected
                  ? "bg-[var(--foreground)]/10 ring-1 ring-[var(--foreground)]/20"
                  : isHighlightedFromUrl
                    ? "bg-amber-500/10 ring-1 ring-amber-400/20"
                    : storedHighlight
                      ? getHighlightClass(storedHighlight.color)
                      : "hover:bg-[var(--surface)]"
              }`}
            >
              <span
                className={`mr-3 align-super text-xs font-semibold ${
                  isSelected
                    ? "text-[var(--foreground)]"
                    : "text-[var(--muted)]"
                }`}
              >
                {verse.verse}
              </span>

              <ScriptureText
                text={selectedText}
                reference={verse.reference}
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
