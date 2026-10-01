"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import EmetseesWordmark from "@/app/components/branding/EmetseesWordmark";
import {
  getReaderMemory,
  getReaderMemoryVerseLabel,
  type ReaderMemory,
} from "@/app/lib/readerMemory";
import { buildReaderHref } from "@/app/lib/translationPreference";

type LastReadingPosition = {
  book: string;
  chapter: number;
  translation: string;
  timestamp: number;
};

function getTranslationLabel(translation: string) {
  if (translation === "kjv") return "King James Version";
  if (translation === "brenton") return "Brenton Septuagint";
  return "World English Bible";
}

function HomePage() {
  const [search, setSearch] = useState("");
  const [lastReading, setLastReading] =
    useState<LastReadingPosition | null>(null);
  const [memory, setMemory] = useState<ReaderMemory>({
    bookmarks: [],
    highlights: [],
    notes: [],
  });

  useEffect(() => {
    const saved = localStorage.getItem("lastReadingPosition");

    if (saved) {
      try {
        setLastReading(JSON.parse(saved));
      } catch {
        setLastReading(null);
      }
    }

    setMemory(getReaderMemory());
  }, []);

  const recentBookmarks = useMemo(
    () => memory.bookmarks.slice(-3).reverse(),
    [memory.bookmarks]
  );

  const recentNotes = useMemo(
    () => memory.notes.slice(0, 3),
    [memory.notes]
  );

  return (
    <main className="min-h-screen bg-[var(--background)] px-5 pb-28 pt-4 text-[var(--foreground)]">
      <section className="mx-auto max-w-xl">
        <div className="mb-4 flex flex-col items-center pt-1 text-center">
          <EmetseesWordmark showDescriptor />
          <p className="mt-2 max-w-sm text-sm leading-5 text-[var(--muted)]">
            Read Scripture, tap any word, and follow the source evidence
            without leaving the reader.
          </p>
        </div>

        <form
          action="/search"
          className="flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-3 shadow-[var(--shadow-sm)]"
        >
          <input
            type="text"
            name="q"
            placeholder="Search Scripture"
            aria-label="Search Scripture"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
          />

          <button
            type="submit"
            className="ml-3 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[var(--accent-text)] transition active:scale-[0.98]"
          >
            Search
          </button>
        </form>

        {lastReading ? (
          <Link
            href={`/read/${encodeURIComponent(lastReading.book)}/${
              lastReading.chapter
            }?translation=${lastReading.translation}`}
            className="mt-8 block border-y border-[var(--border)] py-5 transition active:opacity-70"
          >
            <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
              Continue Reading
            </p>

            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-lg font-semibold">
                  {lastReading.book} {lastReading.chapter}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {getTranslationLabel(lastReading.translation)}
                </p>
              </div>

              <span className="text-sm font-medium text-[var(--muted)]">
                Resume →
              </span>
            </div>
          </Link>
        ) : null}

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Library</h2>
            <p className="text-xs text-[var(--muted)]">
              Saved on this device
            </p>
          </div>

          <div className="grid grid-cols-3 divide-x divide-[var(--border)] border-y border-[var(--border)]">
<LibraryStat href="/library?tab=bookmarks" label="Bookmarks" value={memory.bookmarks.length} />
<LibraryStat href="/library?tab=highlights" label="Highlights" value={memory.highlights.length} />
<LibraryStat href="/library?tab=notes" label="Notes" value={memory.notes.length} />
          </div>

          {recentBookmarks.length > 0 ? (
            <div className="mt-6 border-t border-[var(--border)] pt-5">
              <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
                Recent Bookmarks
              </p>

              <div className="mt-3 divide-y divide-[var(--border)]">
                {recentBookmarks.map((bookmark) => (
                  <Link
                    key={`${bookmark.id}-${bookmark.savedAt}`}
                    href={buildReaderHref({
                      book: bookmark.book,
                      chapter: bookmark.chapter,
                      verse: getReaderMemoryVerseLabel(bookmark),
                      translation: bookmark.translation,
                    })}
                    className="block py-3.5 transition active:opacity-70"
                  >
                    <p className="text-sm font-semibold">
                      {bookmark.reference}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--muted)]">
                      {bookmark.text}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {recentNotes.length > 0 ? (
            <div className="mt-6 border-t border-[var(--border)] pt-5">
              <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
                Recent Notes
              </p>

              <div className="mt-3 divide-y divide-[var(--border)]">
                {recentNotes.map((note) => {
                  const firstVerse = note.verses[0];

                  if (!firstVerse) return null;

                  return (
                    <Link
                      key={note.id}
                      href={`/library?tab=notes&note=${encodeURIComponent(
                        note.id,
                      )}`}
                      className="block py-3.5 transition active:opacity-70"
                    >
                      <p className="text-sm font-semibold">
                        {note.verses.length === 1
                          ? firstVerse.reference
                          : `${firstVerse.book} ${firstVerse.chapter}:${getReaderMemoryVerseLabel(firstVerse)}-${getReaderMemoryVerseLabel(note.verses[note.verses.length - 1] || firstVerse)}`}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--muted)]">
                        {note.note}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      </section>

      <MobileBottomNav />
    </main>
  );
}

function LibraryStat({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="px-2 py-4 text-center transition active:opacity-70"
    >
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{label}</p>
    </Link>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomePage />
    </Suspense>
  );
}
