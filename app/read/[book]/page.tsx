import Link from "next/link";
import generatedWEB from "@/app/data/scripture/generatedWEB.json";
import generatedKJV from "@/app/data/scripture/generatedKJV.json";
import generatedBrenton from "@/app/data/scripture/generatedBrenton.json";
import { notFound } from "next/navigation";
import AppNav from "@/app/components/AppNav";

type ReaderVerse = {
  book: string;
  chapter: number;
};

const allReaderVerses = [
  ...(generatedWEB as ReaderVerse[]),
  ...(generatedKJV as ReaderVerse[]),
  ...(generatedBrenton as ReaderVerse[]),
];

export default async function BookPage({
  params,
}: {
  params: Promise<{ book: string }>;
}) {
  const { book } = await params;
  const decodedBook = decodeURIComponent(book);

  const chapters = Array.from(
    new Set(
      allReaderVerses
        .filter((v) => v.book === decodedBook)
        .map((v) => v.chapter)
    )
  ).sort((a, b) => a - b);

  if (!chapters.length) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white px-6 py-8">
      <section className="mx-auto max-w-5xl">
        <AppNav />

        <Link href="/read" className="text-neutral-400 hover:text-white">
          ← Choose another book
        </Link>

        <div className="mt-8 mb-10">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-neutral-500">
            Choose Chapter
          </p>

          <h1 className="text-5xl font-bold">{decodedBook}</h1>
        </div>

        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
          {chapters.map((chapter) => (
            <Link
              key={chapter}
              href={`/read/${encodeURIComponent(
                decodedBook
              )}/${chapter}?translation=web`}
              className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-center text-lg font-semibold hover:border-neutral-600"
            >
              {chapter}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}