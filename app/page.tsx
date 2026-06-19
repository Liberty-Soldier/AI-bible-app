"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSacredNames } from "./data/useSacredNames";
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

  const { sacredNames, setSacredNames } = useSacredNames();

  useEffect(() => {
    const saved = localStorage.getItem("lastReadingPosition");

    if (saved) {
      try {
        setLastReading(JSON.parse(saved));
      } catch {
        setLastReading(null);
      }
    }
  }, []);

  function goToAsk(query?: string) {
    const finalQuery = (query || search).trim();

    if (!finalQuery) {
      router.push("/ask");
      return;
    }

    router.push(`/ask?q=${encodeURIComponent(finalQuery)}`);
  }

  const suggestions = [
    "What is sin?",
    "What is the Sabbath?",
    "Genesis 1:1",
    "Kingdom of God",
  ];

  return (
    <main className="min-h-screen bg-neutral-950 px-5 pb-28 pt-10 text-white sm:px-6">
      <section className="mx-auto max-w-3xl">
        <div className="mb-10 text-center">
          <p className="mb-3 text-xs uppercase tracking-[0.35em] text-neutral-500">
            Source-First Scripture Study
          </p>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Ask Scripture
          </h1>

          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-neutral-400 sm:text-base">
            Search Scripture, enter a reference, or ask a question from the text.
          </p>
        </div>

        <section className="rounded-[2rem] border border-neutral-800 bg-neutral-900/70 p-4 shadow-2xl shadow-black/30">
          <input
            type="text"
            placeholder="What would you like to study?"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") goToAsk();
            }}
            className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-5 py-4 text-lg text-white outline-none transition placeholder:text-neutral-600 focus:border-neutral-400"
          />

          <button
            onClick={() => goToAsk()}
            className="mt-3 w-full rounded-2xl bg-white px-5 py-3 font-bold text-black transition hover:bg-neutral-200"
          >
            Ask Scripture →
          </button>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => goToAsk(suggestion)}
                className="rounded-full border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-500 hover:text-white"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <label className="mt-4 flex justify-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={sacredNames}
              onChange={(e) => setSacredNames(e.target.checked)}
            />
            Sacred Name Rendering
          </label>
        </section>

        <section className="mt-6 grid grid-cols-3 gap-3">
          <Link
            href="/read"
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-center transition hover:border-neutral-600"
          >
            <p className="font-bold">Read</p>
            <p className="mt-1 text-xs text-neutral-500">Bible</p>
          </Link>

          <Link
            href="/ask"
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-center transition hover:border-neutral-600"
          >
            <p className="font-bold">Ask</p>
            <p className="mt-1 text-xs text-neutral-500">Evidence</p>
          </Link>

          <Link
            href="/study"
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-center transition hover:border-neutral-600"
          >
            <p className="font-bold">Study</p>
            <p className="mt-1 text-xs text-neutral-500">Tools</p>
          </Link>
        </section>

        {lastReading && (
          <section className="mt-6 rounded-3xl border border-amber-500/30 bg-amber-500/10 p-5">
            <p className="mb-2 text-xs uppercase tracking-[0.25em] text-amber-300/80">
              Continue Reading
            </p>

            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">
                  {lastReading.book} {lastReading.chapter}
                </h2>
                <p className="mt-1 text-xs text-neutral-300">
                  {getTranslationLabel(lastReading.translation)}
                </p>
              </div>

              <Link
                href={`/read/${encodeURIComponent(lastReading.book)}/${
                  lastReading.chapter
                }?translation=${lastReading.translation}`}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200"
              >
                Resume →
              </Link>
            </div>
          </section>
        )}

        <section className="mt-6 rounded-3xl border border-neutral-800 bg-neutral-900/40 p-5">
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
            Evidence Order
          </p>
          <p className="mt-3 text-sm leading-relaxed text-neutral-300">
            Original Language Sources → Translation Witnesses → Cross References
            → Explanation
          </p>
        </section>
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