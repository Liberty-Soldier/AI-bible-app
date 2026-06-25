"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MobileBottomNav from "@/app/components/MobileBottomNav";

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

  useEffect(() => {
    const saved = localStorage.getItem("lastReadingPosition");

    if (!saved) return;

    try {
      setLastReading(JSON.parse(saved));
    } catch {
      setLastReading(null);
    }
  }, []);

  function goToAsk() {
    const finalQuery = search.trim();

    if (!finalQuery) {
      router.push("/ask");
      return;
    }

    router.push(`/ask?q=${encodeURIComponent(finalQuery)}`);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-5 pb-24 pt-16 text-[var(--foreground)]">
      <section className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-xl flex-col justify-center">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-semibold tracking-tight">BibleIQ</h1>
          <p className="mt-3 text-base text-[var(--muted)]">
            Search the Scriptures.
          </p>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)]/60 px-5 py-3">
            <input
              type="text"
              placeholder="Ask Scripture..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") goToAsk();
              }}
              className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-neutral-600"
            />

            <button
              type="button"
              onClick={goToAsk}
              className="ml-3 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
            >
              Ask
            </button>
          </div>

          {lastReading ? (
            <Link
              href={`/read/${encodeURIComponent(lastReading.book)}/${
                lastReading.chapter
              }?translation=${lastReading.translation}`}
              className="mt-8 block border-t border-neutral-900 pt-5"
            >
              <p className="text-xs uppercase tracking-[0.25em] text-neutral-600">
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

                <span className="text-sm font-medium text-neutral-300">
                  Resume →
                </span>
              </div>
            </Link>
          ) : null}
        </div>
      </section>

      <MobileBottomNav />
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomePage />
    </Suspense>
  );
}