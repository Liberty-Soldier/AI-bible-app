"use client";

import { useRouter } from "next/navigation";

type Translation = "web" | "kjv" | "brenton";

type Props = {
  books: string[];
  currentBook: string;
  currentChapter: number;
  maxChapter: number;
  currentTranslation: Translation;
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
}: Props) {
  const router = useRouter();

  function goTo(book: string, chapter: number, translation: Translation) {
    router.push(
      `/read/${encodeURIComponent(book)}/${chapter}?translation=${translation}`
    );
  }

  return (
    <div className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900/80 p-4">
      <p className="mb-3 text-xs uppercase tracking-[0.25em] text-neutral-500">
        Reader Controls
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <select
          value={currentTranslation}
          onChange={(e) =>
            goTo(currentBook, currentChapter, e.target.value as Translation)
          }
          className="rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-white"
        >
          {translations.map((translation) => (
            <option key={translation.value} value={translation.value}>
              {translation.label}
            </option>
          ))}
        </select>

        <select
          value={currentBook}
          onChange={(e) => goTo(e.target.value, 1, currentTranslation)}
          className="rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-white"
        >
          {books.map((book) => (
            <option key={book} value={book}>
              {book}
            </option>
          ))}
        </select>

        <select
          value={currentChapter}
          onChange={(e) =>
            goTo(currentBook, Number(e.target.value), currentTranslation)
          }
          className="rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-white"
        >
          {Array.from({ length: maxChapter }, (_, i) => i + 1).map(
            (chapter) => (
              <option key={chapter} value={chapter}>
                Chapter {chapter}
              </option>
            )
          )}
        </select>
      </div>
    </div>
  );
}