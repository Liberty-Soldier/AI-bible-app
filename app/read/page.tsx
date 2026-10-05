"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { bookCatalog } from "@/app/data/scripture/bookCatalog";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import {
  AVAILABLE_TRANSLATION_OPTIONS,
  getPreferredTranslation,
  setPreferredTranslation,
  type TranslationPreference,
} from "@/app/lib/translationPreference";
import { parseScriptureReference } from "@/app/lib/scriptureSearch";

type Translation = TranslationPreference;

type Section =
  | "torah"
  | "history"
  | "wisdom"
  | "prophets"
  | "septuagint"
  | "new";

type BookInfo = {
  book: string;
  chapters: number;
};

const torahBooks = new Set([
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
]);

const historyBooks = new Set([
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
]);

const wisdomBooks = new Set([
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Songs",
]);

const prophetsBooks = new Set([
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
]);

const septuagintBooks = new Set([
  "Tobit",
  "Judith",
  "Esther Greek",
  "Wisdom",
  "Sirach",
  "Baruch",
  "Letter of Jeremiah",
  "Susanna",
  "Bel and the Dragon",
  "1 Maccabees",
  "2 Maccabees",
  "1 Esdras",
  "Prayer of Manasseh",
  "3 Maccabees",
  "4 Maccabees",
  "Daniel Greek",
]);

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

function getBooksFromScripture(): BookInfo[] {
  return bookCatalog;
}

function getSection(book: string): Section {
  if (torahBooks.has(book)) return "torah";
  if (historyBooks.has(book)) return "history";
  if (wisdomBooks.has(book)) return "wisdom";
  if (prophetsBooks.has(book)) return "prophets";
  if (septuagintBooks.has(book)) return "septuagint";
  if (newTestamentBooks.has(book)) return "new";

  return "septuagint";
}

export default function ReadPage() {
  const router = useRouter();

  const books = useMemo(() => getBooksFromScripture(), []);

  const [translation, setTranslation] = useState<Translation>("web");
  const [quickJump, setQuickJump] = useState("");
  const [quickJumpError, setQuickJumpError] = useState("");

  useEffect(() => {
    // Read the device-only preference after hydration; SSR intentionally uses WEB.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTranslation(getPreferredTranslation());
  }, []);

  function handleQuickJump() {
    const value = quickJump.trim();
    if (!value) return;

    const parsed = parseScriptureReference(
      value,
      books.map((item) => item.book),
    );
    const found = parsed
      ? books.find((item) => item.book === parsed.book)
      : null;

    if (!parsed || !found || parsed.chapter > found.chapters) {
      setQuickJumpError("Enter a valid book, chapter, or verse.");
      return;
    }

    setQuickJumpError("");

    router.push(
      `/read/${encodeURIComponent(found.book)}/${parsed.chapter}?translation=${translation}${
        parsed.verseLabel ? `&verse=${encodeURIComponent(parsed.verseLabel)}` : ""
      }`
    );
  }

return (
  <main className="min-h-screen bg-[var(--background)] px-5 pb-24 pt-5 text-[var(--foreground)]">
    <section className="mx-auto max-w-2xl">
      <div className="mb-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
          Read
        </p>
        <h1 className="text-[2.35rem] font-bold leading-tight tracking-[-0.035em]">Open Scripture</h1>
        <p className="mt-2 text-[0.95rem] leading-6 text-[var(--muted)]">
          Jump straight to a passage or tap through Scripture.
        </p>
      </div>

      <div className="mb-5">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          Go to Scripture
        </label>

        <div className="flex gap-2">
<input
  value={quickJump}
  onChange={(event) => {
    setQuickJump(event.target.value);
    if (quickJumpError) setQuickJumpError("");
  }}
  onKeyDown={(event) => {
    if (event.key === "Enter") handleQuickJump();
  }}
  placeholder="Book, chapter, or verse"
  className="w-full rounded-2xl border border-[var(--border)] bg-transparent px-4 py-3.5 text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
/>

          <button
            type="button"
            onClick={handleQuickJump}
            className="rounded-2xl bg-[var(--foreground)] px-5 py-3.5 font-semibold text-[var(--background)] transition active:scale-[0.98]"
          >
            Go
          </button>
        </div>
        {quickJumpError ? (
          <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
            {quickJumpError}
          </p>
        ) : null}
      </div>

      <div className="mb-5 flex items-center gap-6 overflow-x-auto border-b border-[var(--border)]">
        {AVAILABLE_TRANSLATION_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              const next = setPreferredTranslation(option.id);
              setTranslation(next);
            }}
            className={`border-b-2 px-0.5 pb-2.5 pt-1 text-sm font-semibold transition ${
              translation === option.id
                ? "border-[var(--foreground)] text-[var(--foreground)]"
                : "border-transparent text-[var(--muted)]"
            }`}
          >
            {option.shortLabel}
          </button>
        ))}
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-[var(--muted)]">Choose passage</p>
            <h2 className="text-lg font-bold tracking-[-0.015em]">Section</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
          {([
            ["torah", "Torah", "Genesis–Deuteronomy"],
            ["history", "History", "Joshua–Nehemiah"],
            ["wisdom", "Wisdom", "Job–Song"],
            ["prophets", "Prophets", "Isaiah–Malachi"],
            ["septuagint", "Septuagint", "Greek books"],
            ["new", "New Testament", "Matthew–Revelation"],
          ] as const).map(([value, label, helper]) => {
            const sectionBooks = books.filter(
              (item) => getSection(item.book) === value,
            );

            return (
              <details
                key={value}
                className="group border-b border-[var(--border)]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-left active:opacity-70 [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="block font-semibold">{label}</span>
                    <span className="mt-1 block text-sm text-[var(--muted)]">
                      {helper}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-lg text-[var(--muted)] transition-transform group-open:rotate-90"
                  >
                    ›
                  </span>
                </summary>

                <div className="grid grid-cols-2 gap-x-4 border-t border-[var(--border)] pb-3 sm:grid-cols-3">
                  {sectionBooks.map((item) => (
                    <Link
                      key={item.book}
                      href={`/read/${encodeURIComponent(
                        item.book,
                      )}?translation=${translation}`}
                      className="flex min-h-16 items-center justify-between gap-2 border-b border-[var(--border)] py-3 text-left transition active:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {item.book}
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          {item.chapters} chapters
                        </span>
                      </span>
                      <span aria-hidden="true" className="shrink-0 text-[var(--muted)]">
                        ›
                      </span>
                    </Link>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </section>

    <MobileBottomNav />
  </main>
);
}
