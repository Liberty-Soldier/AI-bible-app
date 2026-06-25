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
    <main className="min-h-screen bg-neutral-950 px-4 pb-24 pt-8 text-white sm:px-6">
      <section className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-xl flex-col justify-center">
        <div className="mb-8 text-center">
          <p className="mb-3 text-xs uppercase tracking-[0.35em] text-neutral-500">
            Scripture Search
          </p>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Read.
            <br />
            Ask.
            <br />
            Study.
          </h1>

          <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-neutral-400">
            A Scripture-first Bible reader powered by BibleIQ.
          </p>
        </div>

        {lastReading ? (
          <Link
            href={`/read/${encodeURIComponent(lastReading.book)}/${
              lastReading.chapter
            }?translation=${lastReading.translation}`}
            className="mb-4 rounded-3xl border border-amber-500/25 bg-amber-500/10 p-4 transition hover:border-amber-400/50"
          >
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

              <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">
                Resume
              </span>
            </div>
          </Link>
        ) : null}

        <section className="rounded-[2rem] border border-neutral-800 bg-neutral-900/70 p-4 shadow-2xl shadow-black/30">
          <input
            type="text"
            placeholder="Ask Scripture or enter a reference..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") goToAsk();
            }}
            className="w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-4 text-base text-white outline-none transition placeholder:text-neutral-600 focus:border-neutral-400"
          />

          <button
            type="button"
            onClick={() => goToAsk()}
            className="mt-3 w-full rounded-2xl bg-white px-5 py-3 font-bold text-black transition hover:bg-neutral-200"
          >
            Ask Scripture
          </button>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => goToAsk(suggestion)}
                className="rounded-full border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-500 hover:text-white"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-4 grid grid-cols-3 gap-3">
          <Link
            href="/read"
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-center transition hover:border-neutral-600"
          >
            <p className="font-bold">Read</p>
          </Link>

          <Link
            href="/ask"
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-center transition hover:border-neutral-600"
          >
            <p className="font-bold">Ask</p>
          </Link>

          <Link
            href="/study"
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-center transition hover:border-neutral-600"
          >
            <p className="font-bold">Study</p>
          </Link>
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