"use client";

import { useRouter } from "next/navigation";
import {
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
};

const translations: { value: Translation; label: string }[] = [
  { value: "web", label: "WEB" },
  { value: "kjv", label: "KJV" },
  { value: "brenton", label: "Brenton" },
];

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
}: Props) {
  const router = useRouter();
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
    const verseParam = verse
      ? `&verse=${encodeURIComponent(verse)}`
      : "";

    const preferredTranslation = setPreferredTranslation(translation);

    router.push(
      `/read/${encodeURIComponent(
        book
      )}/${chapter}?translation=${preferredTranslation}${verseParam}`
    );
  }

return (
  <div className="space-y-5">
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
        Translation
      </p>

      <div className="flex gap-5 border-b border-[var(--border)]">
        {translations.map((translation) => (
          <button
            key={translation.value}
            type="button"
            onClick={() =>
              goTo(currentBook, currentChapter, translation.value)
            }
            className={`border-b-2 px-0.5 pb-2.5 pt-1 text-sm font-semibold transition ${
              currentTranslation === translation.value
                ? "border-[var(--foreground)] text-[var(--foreground)]"
                : "border-transparent text-[var(--muted)]"
            }`}
          >
            {translation.label}
          </button>
        ))}
      </div>
    </div>

    <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
      <label>
        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
          Book
        </span>

        <select
          aria-label="Book"
          value={currentBook}
          onChange={(e) => goTo(e.target.value, 1, currentTranslation)}
          className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--foreground)] outline-none"
        >
          {bookGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.books.map((book) => (
                <option key={book} value={book}>
                  {book}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label>
        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
          Chapter
        </span>

        <select
          aria-label="Chapter"
          value={currentChapter}
          onChange={(e) =>
            goTo(currentBook, Number(e.target.value), currentTranslation)
          }
          className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--foreground)] outline-none"
        >
          {Array.from({ length: maxChapter }, (_, i) => i + 1).map(
            (chapter) => (
              <option key={chapter} value={chapter}>
                {chapter}
              </option>
            )
          )}
        </select>
      </label>
    </div>

    <label>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
        Verse
      </span>

      <select
        aria-label="Verse"
        value={currentVerse || ""}
        onChange={(e) =>
          goTo(
            currentBook,
            currentChapter,
            currentTranslation,
            e.target.value || null
          )
        }
        className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--foreground)] outline-none"
      >
        <option value="">Start of Chapter</option>

        {verseOptions.map((verseLabel) => (
          <option key={verseLabel} value={verseLabel}>
            Verse {verseLabel}
          </option>
        ))}
      </select>
    </label>
  </div>
);
}
