"use client";

import { useRouter } from "next/navigation";

type Translation = "web" | "kjv" | "brenton";

type Props = {
  books: string[];
  currentBook: string;
  currentChapter: number;
  maxChapter: number;
  currentTranslation: Translation;
  currentVerse?: number | null;
  maxVerse: number;
};

const translations: { value: Translation; label: string }[] = [
  { value: "web", label: "WEB" },
  { value: "kjv", label: "KJV" },
  { value: "brenton", label: "Brenton" },
];

export default function ReaderSelector({
  books,
  currentBook,
  currentChapter,
  maxChapter,
  currentTranslation,
  currentVerse,
  maxVerse,
}: Props) {
  const router = useRouter();

  function goTo(
    book: string,
    chapter: number,
    translation: Translation,
    verse?: number | null
  ) {
    const verseParam = verse ? `&verse=${verse}` : "";

    router.push(
      `/read/${encodeURIComponent(
        book
      )}/${chapter}?translation=${translation}${verseParam}`
    );
  }

  return (
    <div className="sticky top-0 z-50 mb-8 border-b border-neutral-800 bg-neutral-950/95 py-3 backdrop-blur">
      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-2 sm:grid-cols-4">
        <select
          aria-label="Translation"
          value={currentTranslation}
          onChange={(e) =>
            goTo(currentBook, currentChapter, e.target.value as Translation)
          }
          className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white"
        >
          {translations.map((translation) => (
            <option key={translation.value} value={translation.value}>
              {translation.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Book"
          value={currentBook}
          onChange={(e) => goTo(e.target.value, 1, currentTranslation)}
          className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white"
        >
          {books.map((book) => (
            <option key={book} value={book}>
              {book}
            </option>
          ))}
        </select>

        <select
          aria-label="Chapter"
          value={currentChapter}
          onChange={(e) =>
            goTo(currentBook, Number(e.target.value), currentTranslation)
          }
          className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white"
        >
          {Array.from({ length: maxChapter }, (_, i) => i + 1).map(
            (chapter) => (
              <option key={chapter} value={chapter}>
                Ch. {chapter}
              </option>
            )
          )}
        </select>

        <select
          aria-label="Verse"
          value={currentVerse || ""}
          onChange={(e) =>
            goTo(
              currentBook,
              currentChapter,
              currentTranslation,
              e.target.value ? Number(e.target.value) : null
            )
          }
          className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white"
        >
          <option value="">Verse</option>
          {Array.from({ length: maxVerse }, (_, i) => i + 1).map((verse) => (
            <option key={verse} value={verse}>
              Verse {verse}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}