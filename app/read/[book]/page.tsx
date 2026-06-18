import Link from "next/link";
import generatedWEB from "@/app/data/scripture/generatedWEB.json";
import generatedKJV from "@/app/data/scripture/generatedKJV.json";
import generatedBrenton from "@/app/data/scripture/generatedBrenton.json";
import { notFound } from "next/navigation";
import AppNav from "@/app/components/AppNav";
import ChapterSwipe from "../components/ChapterSwipe";

type Translation = "web" | "kjv" | "brenton";

type ReaderVerse = {
  book: string;
  chapter: number;
};

const datasets: Record<Translation, ReaderVerse[]> = {
  web: generatedWEB as ReaderVerse[],
  kjv: generatedKJV as ReaderVerse[],
  brenton: generatedBrenton as ReaderVerse[],
};

function getActiveTranslation(value?: string): Translation {
  if (value === "kjv" || value === "brenton" || value === "web") {
    return value;
  }

  return "web";
}

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ book: string }>;
  searchParams: Promise<{ translation?: string }>;
}) {
  const { book } = await params;
  const { translation } = await searchParams;

  const decodedBook = decodeURIComponent(book);
  const activeTranslation = getActiveTranslation(translation);

  const selectedDataset = datasets[activeTranslation];

  let chapters = Array.from(
    new Set(
      selectedDataset
        .filter((v) => v.book === decodedBook)
        .map((v) => v.chapter)
    )
  ).sort((a, b) => a - b);

  let finalTranslation = activeTranslation;

  if (!chapters.length) {
    const fallbackOrder: Translation[] = ["web", "kjv", "brenton"];

    for (const fallback of fallbackOrder) {
      const fallbackChapters = Array.from(
        new Set(
          datasets[fallback]
            .filter((v) => v.book === decodedBook)
            .map((v) => v.chapter)
        )
      ).sort((a, b) => a - b);

      if (fallbackChapters.length) {
        chapters = fallbackChapters;
        finalTranslation = fallback;
        break;
      }
    }
  }

  if (!chapters.length) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white px-6 py-8">
      <section className="mx-auto max-w-5xl">
        <AppNav />

        <Link
          href="/read"
          className="text-neutral-400 hover:text-white"
        >
          ← Choose another book
        </Link>

        <div className="mt-8 mb-10">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-neutral-500">
            Choose Chapter
          </p>

          <h1 className="text-5xl font-bold">{decodedBook}</h1>

          <p className="mt-3 text-sm text-neutral-500">
            Translation: {finalTranslation.toUpperCase()}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
          {chapters.map((chapter) => (
            <Link
              key={chapter}
              href={`/read/${encodeURIComponent(
                decodedBook
              )}/${chapter}?translation=${finalTranslation}`}
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