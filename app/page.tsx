"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import { getReaderMemory, type ReaderMemory } from "@/app/lib/readerMemory";

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
  const router = useRouter();
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

  function goToAsk() {
    const finalQuery = search.trim();

    if (!finalQuery) {
      router.push("/ask");
      return;
    }

    router.push(`/ask?q=${encodeURIComponent(finalQuery)}`);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-5 pb-24 pt-10 text-[var(--foreground)]">
      <section className="mx-auto max-w-xl">
        <div className="mb-8 pt-8 text-center">
          <h1 className="text-4xl font-semibold tracking-tight">BibleIQ</h1>
          <p className="mt-3 text-base text-[var(--muted)]">
            Read Scripture. Study words. Ask Scripture.
          </p>
        </div>

        <div className="flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)]/60 px-5 py-3">
          <input
            type="text"
            placeholder="Ask Scripture..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") goToAsk();
            }}
            className="min-w-0 flex-1 bg-transparent text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
          />

          <button
            type="button"
            onClick={goToAsk}
            className="ml-3 rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-[var(--background)]"
          >
            Ask
          </button>
        </div>

        {lastReading ? (
          <Link
            href={`/read/${encodeURIComponent(lastReading.book)}/${
              lastReading.chapter
            }?translation=${lastReading.translation}`}
            className="mt-8 block rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5"
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

          <div className="grid grid-cols-3 gap-3">
            <LibraryStat label="Bookmarks" value={memory.bookmarks.length} />
            <LibraryStat label="Highlights" value={memory.highlights.length} />
            <LibraryStat label="Notes" value={memory.notes.length} />
          </div>

          {recentBookmarks.length > 0 ? (
            <div className="mt-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
                Recent Bookmarks
              </p>

              <div className="mt-4 space-y-3">
                {recentBookmarks.map((bookmark) => (
                  <Link
                    key={`${bookmark.id}-${bookmark.savedAt}`}
                    href={`/read/${encodeURIComponent(bookmark.book)}/${
                      bookmark.chapter
                    }?verse=${bookmark.verse}`}
                    className="block rounded-2xl bg-[var(--background)] p-3"
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
            <div className="mt-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">
                Recent Notes
              </p>

              <div className="mt-4 space-y-3">
                {recentNotes.map((note) => {
                  const firstVerse = note.verses[0];

                  if (!firstVerse) return null;

                  return (
                    <Link
                      key={note.id}
                      href={`/read/${encodeURIComponent(firstVerse.book)}/${
                        firstVerse.chapter
                      }?verse=${firstVerse.verse}`}
                      className="block rounded-2xl bg-[var(--background)] p-3"
                    >
                      <p className="text-sm font-semibold">
                        {note.verses.length === 1
                          ? firstVerse.reference
                          : `${firstVerse.book} ${firstVerse.chapter}:${firstVerse.verse}-${
                              note.verses[note.verses.length - 1]?.verse
                            }`}
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

function LibraryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{label}</p>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomePage />
    </Suspense>
  );
}