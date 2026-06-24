import Link from "next/link";
import generatedWEB from "@/app/data/scripture/generatedWEB.json";
import generatedKJV from "@/app/data/scripture/generatedKJV.json";
import generatedBrenton from "@/app/data/scripture/generatedBrenton.json";
import ScriptureText from "@/app/components/ScriptureText";
import SacredNameToggle from "@/app/components/SacredNameToggle";
import { notFound } from "next/navigation";
import AppNav from "@/app/components/AppNav";
import ReaderSelector from "@/app/components/ReaderSelector";
import SaveReadingPosition from "@/app/components/SaveReadingPosition";
import VerseScroller from "@/app/components/VerseScroller";
import ChapterSwipe from "@/app/components/ChapterSwipe";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import CollapsibleReaderHeader from "@/app/components/CollapsibleReaderHeader";

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
  const allVerses = [...datasets.web, ...datasets.kjv, ...datasets.brenton];
  return Array.from(new Set(allVerses.map((v) => v.book)));
}

function getMaxChapter(book: string) {
  const allVerses = [...datasets.web, ...datasets.kjv, ...datasets.brenton];

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
  searchParams: Promise<{ verse?: string; translation?: string; study?: string }>;
}) {
  const { book, chapter } = await params;
  const { verse, translation, study } = await searchParams;

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

  const studyMode = study === "true";

const baseHref = `/read/${encodeURIComponent(decodedBook)}/${chapterNumber}?translation=${activeTranslation}${
  highlightedVerse ? `&verse=${highlightedVerse}` : ""
}`;

const readModeHref = baseHref;
const studyModeHref = `${baseHref}&study=true`;

  const previousChapterHref =
    chapterNumber > 1
      ? `/read/${encodeURIComponent(decodedBook)}/${
          chapterNumber - 1
        }?translation=${activeTranslation}`
      : null;

  const nextChapterHref =
    chapterNumber < maxChapter
      ? `/read/${encodeURIComponent(decodedBook)}/${
          chapterNumber + 1
        }?translation=${activeTranslation}`
      : null;

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-8 pb-28 text-white">
      <section className="mx-auto max-w-3xl">
        <AppNav />

        <VerseScroller verse={highlightedVerse} />

        <SaveReadingPosition
          book={decodedBook}
          chapter={chapterNumber}
          translation={activeTranslation}
        />

        <div className="mb-6">
          <SacredNameToggle />
        </div>

        <CollapsibleReaderHeader
          title={`${activeTranslation.toUpperCase()} • ${decodedBook} ${chapterNumber}`}
        >
          <ReaderSelector
            books={books}
            currentBook={decodedBook}
            currentChapter={chapterNumber}
            maxChapter={maxChapter}
            currentTranslation={activeTranslation}
            currentVerse={highlightedVerse}
            maxVerse={chapterVerses.length}
          />
        </CollapsibleReaderHeader>

        <div className="mb-4 flex justify-center">
  <div className="rounded-full border border-neutral-800 bg-neutral-900 p-1 text-sm">
    <Link
      href={readModeHref}
      className={`inline-block rounded-full px-4 py-2 ${
        !studyMode ? "bg-white text-black" : "text-neutral-400"
      }`}
    >
      Read
    </Link>

    <Link
      href={studyModeHref}
      className={`inline-block rounded-full px-4 py-2 ${
        studyMode ? "bg-white text-black" : "text-neutral-400"
      }`}
    >
      Study
    </Link>
  </div>
</div>

        <ChapterSwipe
          previousChapterHref={previousChapterHref}
          nextChapterHref={nextChapterHref}
        >
          <article className="rounded-3xl border border-neutral-800 bg-neutral-950/60 px-5 py-8 shadow-2xl shadow-black/20 sm:px-10 sm:py-12">
            <div className="mb-10 text-center">
              <p className="mb-3 text-xs uppercase tracking-[0.35em] text-neutral-500">
                {translationLabel}
              </p>

              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
                {decodedBook} {chapterNumber}
              </h2>
            </div>

            <div className="space-y-5 text-[1.12rem] leading-9 text-neutral-200 sm:text-xl sm:leading-10">
              {chapterVerses.map((v) => {
                const isHighlighted = highlightedVerse === v.verse;
                const selectedText = v.sources[0]?.text || "";

const verseClassName = `group block rounded-xl px-3 py-2 transition ${
  isHighlighted
    ? "bg-amber-500/15 text-white ring-1 ring-amber-400/30"
    : "hover:bg-neutral-900"
}`;

const verseContent = (
  <>
    <span className="mr-3 align-super text-xs font-semibold text-neutral-500 group-hover:text-neutral-300">
      {v.verse}
    </span>

    <ScriptureText text={selectedText} studyMode={studyMode} />
  </>
);

if (studyMode) {
  return (
    <div
      id={`verse-${v.verse}`}
      key={`${v.id}-${activeTranslation}`}
      className={verseClassName}
    >
      {verseContent}
    </div>
  );
}

return (
  <Link
    id={`verse-${v.verse}`}
    key={`${v.id}-${activeTranslation}`}
    href={`/verse/${encodeURIComponent(v.reference)}`}
    className={verseClassName}
  >
    {verseContent}
  </Link>
);
              })}
            </div>
          </article>
        </ChapterSwipe>

        <div className="mt-8 flex items-center justify-between">
          {previousChapterHref ? (
            <Link
              href={previousChapterHref}
              className="rounded-xl border border-neutral-800 bg-neutral-900 px-5 py-3 hover:border-neutral-600"
            >
              ← Previous Chapter
            </Link>
          ) : (
            <span />
          )}

          {nextChapterHref ? (
            <Link
              href={nextChapterHref}
              className="rounded-xl border border-neutral-800 bg-neutral-900 px-5 py-3 hover:border-neutral-600"
            >
              Next Chapter →
            </Link>
          ) : (
            <span />
          )}
        </div>
      </section>

      <MobileBottomNav />
    </main>
  );
}