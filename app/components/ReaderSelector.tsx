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
  <div className="space-y-4">
    <div>
      <p className="mb-2 text-xs uppercase tracking-[0.25em] text-neutral-600">
        Translation
      </p>

      <div className="grid grid-cols-3 gap-2">
        {translations.map((translation) => (
          <button
            key={translation.value}
            type="button"
            onClick={() =>
              goTo(currentBook, currentChapter, translation.value)
            }
            className={`rounded-full px-3 py-2 text-sm transition ${
              currentTranslation === translation.value
                ? "bg-white text-black"
                : "bg-neutral-900 text-neutral-400 hover:bg-neutral-800"
            }`}
          >
            {translation.label}
          </button>
        ))}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <label>
        <span className="mb-2 block text-xs uppercase tracking-[0.25em] text-neutral-600">
          Book
        </span>

        <select
          aria-label="Book"
          value={currentBook}
          onChange={(e) => goTo(e.target.value, 1, currentTranslation)}
          className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-sm text-white"
        >
          {books.map((book) => (
            <option key={book} value={book}>
              {book}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className="mb-2 block text-xs uppercase tracking-[0.25em] text-neutral-600">
          Chapter
        </span>

        <select
          aria-label="Chapter"
          value={currentChapter}
          onChange={(e) =>
            goTo(currentBook, Number(e.target.value), currentTranslation)
          }
          className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-sm text-white"
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
      <span className="mb-2 block text-xs uppercase tracking-[0.25em] text-neutral-600">
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
            e.target.value ? Number(e.target.value) : null
          )
        }
        className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-sm text-white"
      >
        <option value="">Start of Chapter</option>

        {Array.from({ length: maxVerse }, (_, i) => i + 1).map((verse) => (
          <option key={verse} value={verse}>
            Verse {verse}
          </option>
        ))}
      </select>
    </label>
  </div>
);
}