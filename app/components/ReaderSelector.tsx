"use client";

import { useState } from "react";
import BookPassageSelector from "@/app/components/BookPassageSelector";
import { bookCatalog } from "@/app/data/scripture/bookCatalog";
import { useRouter } from "next/navigation";
import {
  AVAILABLE_TRANSLATION_OPTIONS,
  setPreferredTranslation,
  type TranslationPreference,
} from "@/app/lib/translationPreference";

type Translation = TranslationPreference;

type Props = {
  books: string[];
  currentBook: string;
  currentChapter: number;
  maxChapter: number;
  currentTranslation: Translation;
  currentVerse?: string | null;
  verseOptions: string[];
  mode?: "passage" | "translation";
  strictCitation?: boolean;
  returnTo?: string;
  returnLabel?: string;
};

const newTestamentBooks = new Set([
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "1 John",
  "2 John",
  "3 John",
  "Jude",
  "Revelation",
]);

const septuagintOnlyBooks = new Set([
  "Tobit",
  "Judith",
  "Wisdom",
  "Sirach",
  "Baruch",
  "1 Maccabees",
  "2 Maccabees",
  "3 Maccabees",
  "4 Maccabees",
]);

export default function ReaderSelector({
  books,
  currentBook,
  currentChapter,
  maxChapter,
  currentTranslation,
  currentVerse,
  verseOptions,
  mode = "passage",
  strictCitation = false,
  returnTo,
  returnLabel,
}: Props) {
  const router = useRouter();
  const [selectedBook, setSelectedBook] = useState(currentBook);
  const bookGroups = [
    {
      label: "Old Testament",
      books: books.filter(
        (book) =>
          !newTestamentBooks.has(book) && !septuagintOnlyBooks.has(book),
      ),
    },
    {
      label: "New Testament",
      books: books.filter((book) => newTestamentBooks.has(book)),
    },
    {
      label: "Septuagint / Deuterocanonical",
      books: books.filter((book) => septuagintOnlyBooks.has(book)),
    },
  ].filter((group) => group.books.length > 0);

  function goTo(
    book: string,
    chapter: number,
    translation: Translation,
    verse?: string | null
  ) {
    const preferredTranslation = setPreferredTranslation(translation);
    const params = new URLSearchParams({ translation: preferredTranslation });
    if (verse) params.set("verse", verse);
    if (strictCitation) params.set("citation", "1");
    if (returnTo) params.set("returnTo", returnTo);
    if (returnLabel) params.set("returnLabel", returnLabel);
    router.push(`/read/${encodeURIComponent(book)}/${chapter}?${params.toString()}`);
  }

  if (mode === "translation") {
    return (
      <div className="space-y-1" aria-label="Translation selection">
        {AVAILABLE_TRANSLATION_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={currentTranslation === option.id}
            onClick={() => goTo(currentBook, currentChapter, option.id, currentVerse)}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
          >
            <span>{option.label}</span>
            <span className="font-semibold">{option.shortLabel}{currentTranslation === option.id ? " ✓" : ""}</span>
          </button>
        ))}
      </div>
    );
  }

  const chapterCount = bookCatalog.find((item) => item.book === selectedBook)?.chapters || maxChapter;
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-2 block text-sm font-medium">Book</span>
        <select
          aria-label="Book"
          value={selectedBook}
          onChange={(event) => setSelectedBook(event.target.value)}
          className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
        >
          {bookGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.books.map((book) => <option key={book} value={book}>{book}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <div>
        <p className="mb-2 text-sm font-medium">Chapter</p>
        <BookPassageSelector
          key={selectedBook}
          book={selectedBook}
          chapterCount={chapterCount}
          translation={currentTranslation}
          currentChapter={selectedBook === currentBook ? currentChapter : undefined}
        />
      </div>
      {selectedBook === currentBook ? (
        <details className="border-t border-[var(--border)]">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Go to verse (optional)</summary>
          <label className="block pb-2">
            <span className="sr-only">Verse in {currentBook} {currentChapter}</span>
            <select
              aria-label="Verse"
              value={currentVerse || ""}
              onChange={(event) => goTo(currentBook, currentChapter, currentTranslation, event.target.value || null)}
              className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base"
            >
              <option value="">Start of chapter</option>
              {verseOptions.map((label) => <option key={label} value={label}>Verse {label}</option>)}
            </select>
          </label>
        </details>
      ) : null}
    </div>
  );
}
