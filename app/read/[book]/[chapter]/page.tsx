import Link from "next/link";
import generatedWEB from "@/app/data/scripture/generatedWEB.json";
import generatedKJV from "@/app/data/scripture/generatedKJV.json";
import generatedBrenton from "@/app/data/scripture/generatedBrenton.json";
import ScriptureText from "@/app/components/ScriptureText";
import SacredNameToggle from "@/app/components/SacredNameToggle";
import { notFound } from "next/navigation";
import AppNav from "@/app/components/AppNav";
import ReaderSelector from "@/app/components/ReaderSelector";

type Translation = "web" | "kjv" | "brenton";

type ReaderVerse = {
  id: string;
  book: string;
  chapter: number;
  verse: number;
  reference: string;
  sources: {
    sourceName: string;
    text: string;
  }[];
};

const datasets: Record<Translation, ReaderVerse[]> = {
  web: generatedWEB as ReaderVerse[],
  kjv: generatedKJV as ReaderVerse[],
  brenton: generatedBrenton as ReaderVerse[],
};

function getTranslationLabel(translation: Translation) {
  if (translation === "kjv") return "King James Version";
  if (translation === "brenton") return "Brenton Septuagint";
  return "World English Bible";
}

function getAvailableBooks() {
  const allVerses = [
    ...datasets.web,
    ...datasets.kjv,
    ...datasets.brenton,
  ];

  return Array.from(new Set(allVerses.map((v) => v.book)));
}

function getMaxChapter(book: string) {
  const allVerses = [
    ...datasets.web,
    ...datasets.kjv,
    ...datasets.brenton,
  ];

  return Math.max(
    ...allVerses.filter((v) => v.book === book).map((v) => v.chapter)
  );
}

function getChapterVerses(
  book: string,
  chapter: number,
  translation: Translation
) {
  return datasets[translation]
    .filter((v) => v.book === book && v.chapter === chapter)
    .sort((a, b) => a.verse - b.verse);
}

function getBestTranslation(
  book: string,
  chapter: number,
  requested: Translation
): Translation {
  if (getChapterVerses(book, chapter, requested).length) return requested;
  if (getChapterVerses(book, chapter, "web").length) return "web";
  if (getChapterVerses(book, chapter, "kjv").length) return "kjv";
  if (getChapterVerses(book, chapter, "brenton").length) return "brenton";
  return requested;
}

export default async function ReadChapterPage({
  params,
  searchParams,
}: {
  params: Promise<{ book: string; chapter: string }>;
  searchParams: Promise<{ verse?: string; translation?: string }>;
}) {
  const { book, chapter } = await params;
  const { verse, translation } = await searchParams;

  const decodedBook = decodeURIComponent(book);
  const chapterNumber = Number(chapter);
  const highlightedVerse = verse ? Number(verse) : null;

  const requestedTranslation: Translation =
    translation === "kjv" || translation === "brenton" || translation === "web"
      ? translation
      : "web";

  const activeTranslation = getBestTranslation(
    decodedBook,
    chapterNumber,
    requestedTranslation
  );

  const chapterVerses = getChapterVerses(
    decodedBook,
    chapterNumber,
    activeTranslation
  );

  if (!chapterVerses.length) {
    notFound();
  }

  const books = getAvailableBooks();
  const maxChapter = getMaxChapter(decodedBook);
  const translationLabel = getTranslationLabel(activeTranslation);

  const previousChapterHref =
    chapterNumber > 1
      ? `/read/${encodeURIComponent(decodedBook)}/${chapterNumber - 1}?translation=${activeTranslation}`
      : null;

  const nextChapterHref = `/read/${encodeURIComponent(decodedBook)}/${chapterNumber + 1}?translation=${activeTranslation}`;

  return (
    <main className="min-h-screen bg-neutral-950 text-white px-6 py-8">
      <section className="mx-auto max-w-3xl">
        <AppNav />

        <div className="mb-6">
          <SacredNameToggle />
        </div>

        <ReaderSelector
          books={books}
          currentBook={decodedBook}
          currentChapter={chapterNumber}
          maxChapter={maxChapter}
          currentTranslation={activeTranslation}
        />

        <div className="mb-10 flex items-center justify-between gap-4">
          {previousChapterHref ? (
            <Link href={previousChapterHref} className="text-neutral-400 hover:text-white">
              ← Previous
            </Link>
          ) : (
            <span />
          )}

          <div className="text-center">
            <h1 className="text-4xl font-bold">
              {decodedBook} {chapterNumber}
            </h1>
            <p className="mt-2 text-sm text-neutral-500">{translationLabel}</p>
          </div>

          <Link href={nextChapterHref} className="text-neutral-400 hover:text-white">
            Next →
          </Link>
        </div>

        <article className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6 sm:p-8">
          <div className="space-y-4 text-lg leading-8 text-neutral-200">
            {chapterVerses.map((v) => {
              const isHighlighted = highlightedVerse === v.verse;
              const selectedText = v.sources[0]?.text || "";

              return (
                <Link
                  key={`${v.id}-${activeTranslation}`}
                  href={`/verse/${v.id}`}
                  className={`block rounded-lg px-2 py-1 transition ${
                    isHighlighted
                      ? "bg-amber-500/15 text-white"
                      : "hover:bg-neutral-800/70"
                  }`}
                >
                  <sup className="mr-2 text-xs text-neutral-500">
                    {v.verse}
                  </sup>
                  <ScriptureText text={selectedText} />
                </Link>
              );
            })}
          </div>
        </article>
      </section>
    </main>
  );
}