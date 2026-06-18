"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { allScripture } from "@/app/data/scripture/allScripture";
import TranslationSelector from "@/app/components/TranslationSelector";

type Translation = "web" | "kjv" | "brenton";

type BookInfo = {
  book: string;
  chapters: number;
};

function getBooksFromScripture(): BookInfo[] {
  const bookMap = new Map<string, number>();

  for (const verse of allScripture) {
    const currentMax = bookMap.get(verse.book) || 0;
    bookMap.set(verse.book, Math.max(currentMax, verse.chapter));
  }

  return Array.from(bookMap.entries()).map(([book, chapters]) => ({
    book,
    chapters,
  }));
}

function BookGrid({
  title,
  books,
  translation,
}: {
  title: string;
  books: BookInfo[];
  translation: Translation;
}) {
  if (!books.length) return null;

  return (
    <section className="mb-10">
      <h2 className="mb-4 text-2xl font-bold">{title}</h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {books.map(({ book, chapters }) => (
          <Link
            key={book}
            href={`/read/${encodeURIComponent(book)}?translation=${translation}`}
            className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 hover:border-neutral-600"
          >
            <p className="font-semibold">{book}</p>
            <p className="mt-1 text-sm text-neutral-500">
              {chapters} chapter{chapters === 1 ? "" : "s"}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function ReadPage() {
  const [translation, setTranslation] = useState<Translation>("web");
  const books = getBooksFromScripture();

  useEffect(() => {
    const saved = localStorage.getItem("preferredTranslation");

    if (saved === "web" || saved === "kjv" || saved === "brenton") {
      setTranslation(saved);
    }
  }, []);

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-white">
      <section className="mx-auto max-w-6xl">
        <Link href="/" className="mb-8 inline-block text-neutral-400 hover:text-white">
          ← Home
        </Link>

        <div className="mb-10">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-neutral-500">
            Read Bible
          </p>

          <h1 className="text-5xl font-bold">Choose a Book</h1>

          <p className="mt-4 max-w-2xl text-neutral-300">
            Choose your preferred translation, then select a book.
          </p>
        </div>

        <TranslationSelector onTranslationChange={setTranslation} />

        <BookGrid
          title="Available Books"
          books={books}
          translation={translation}
        />
      </section>
    </main>
  );
}