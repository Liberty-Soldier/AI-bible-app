import Link from "next/link";
import generatedWEB from "@/app/data/scripture/generatedWEB.json";
import generatedKJV from "@/app/data/scripture/generatedKJV.json";
import generatedBrenton from "@/app/data/scripture/generatedBrenton.json";
import ScriptureText from "@/app/components/ScriptureText";
import SacredNameToggle from "@/app/components/SacredNameToggle";
import { notFound } from "next/navigation";
import ReaderSelector from "@/app/components/ReaderSelector";
import SaveReadingPosition from "@/app/components/SaveReadingPosition";
import VerseScroller from "@/app/components/VerseScroller";
import ChapterSwipe from "@/app/components/ChapterSwipe";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import CollapsibleReaderHeader from "@/app/components/CollapsibleReaderHeader";
import SaveBibleIQContext from "@/app/components/SaveBibleIQContext";
import ReaderWordStudyController from "@/app/components/ReaderWordStudyController";

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
  searchParams: Promise<{
  verse?: string;
  translation?: string;
  study?: string;
  returnTo?: string;
}>;
}) {
  const { book, chapter } = await params;
  const { verse, translation, study, returnTo } = await searchParams;

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
  const studyParam = studyMode ? "&study=true" : "";

  const baseHref = `/read/${encodeURIComponent(
    decodedBook
  )}/${chapterNumber}?translation=${activeTranslation}${
    highlightedVerse ? `&verse=${highlightedVerse}` : ""
  }`;

  const readModeHref = baseHref;
  const studyModeHref = `${baseHref}&study=true`;

  const previousChapterHref =
    chapterNumber > 1
      ? `/read/${encodeURIComponent(decodedBook)}/${
          chapterNumber - 1
        }?translation=${activeTranslation}${studyParam}`
      : null;

  const nextChapterHref =
    chapterNumber < maxChapter
      ? `/read/${encodeURIComponent(decodedBook)}/${
          chapterNumber + 1
        }?translation=${activeTranslation}${studyParam}`
      : null;

  return (
    <main className="min-h-screen bg-neutral-950 px-4 pb-24 text-white sm:px-6">
      <section className="mx-auto max-w-2xl">
        <VerseScroller verse={highlightedVerse} />

        <ReaderWordStudyController />

        <SaveBibleIQContext
  book={decodedBook}
  chapter={chapterNumber}
  verse={highlightedVerse}
  translation={activeTranslation}
  studyMode={studyMode}
/>

        <SaveReadingPosition
          book={decodedBook}
          chapter={chapterNumber}
          translation={activeTranslation}
        />

        <header className="sticky top-0 z-40 -mx-4 border-b border-neutral-900 bg-neutral-950/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <CollapsibleReaderHeader
                title={`${decodedBook} ${chapterNumber}`}
              >
                <div className="space-y-4 pt-3">
                  <SacredNameToggle />

                  <ReaderSelector
                    books={books}
                    currentBook={decodedBook}
                    currentChapter={chapterNumber}
                    maxChapter={maxChapter}
                    currentTranslation={activeTranslation}
                    currentVerse={highlightedVerse}
                    maxVerse={chapterVerses.length}
                  />
                </div>
              </CollapsibleReaderHeader>
            </div>

            <div className="shrink-0 rounded-full bg-neutral-900 p-1 text-xs">
              <Link
                href={readModeHref}
                className={`inline-block rounded-full px-3 py-1.5 ${
                  !studyMode ? "bg-white text-black" : "text-neutral-400"
                }`}
              >
                Read
              </Link>

              <Link
                href={studyModeHref}
                className={`inline-block rounded-full px-3 py-1.5 ${
                  studyMode ? "bg-white text-black" : "text-neutral-400"
                }`}
              >
                Study
              </Link>
            </div>
          </div>
        </header>

        <ChapterSwipe
          previousChapterHref={previousChapterHref}
          nextChapterHref={nextChapterHref}
        >
          <article className="pt-8">
            {returnTo ? (
  <Link
    href={returnTo}
    className="mb-6 inline-flex rounded-full border border-neutral-800 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-600 hover:text-white"
  >
    ← Back to Word Study
  </Link>
) : null}
            <div className="mb-10">
              <p className="mb-2 text-xs uppercase tracking-[0.28em] text-neutral-600">
                {translationLabel}
              </p>

              <h1 className="text-4xl font-semibold tracking-tight text-white">
                {decodedBook} {chapterNumber}
              </h1>
            </div>

            <div className="space-y-5 text-[1.18rem] leading-9 text-neutral-200 sm:text-xl sm:leading-10">
              {chapterVerses.map((v) => {
                const isHighlighted = highlightedVerse === v.verse;
                const selectedText = v.sources[0]?.text || "";

                const verseClassName = `group block rounded-xl py-1 transition ${
                  isHighlighted
                    ? "bg-amber-500/10 px-3 text-white ring-1 ring-amber-400/20"
                    : "hover:text-white"
                }`;

                const verseContent = (
                  <>
                    <span className="mr-3 align-super text-xs font-semibold text-neutral-600 group-hover:text-neutral-400">
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

        <div className="mt-12 flex items-center justify-between gap-4 border-t border-neutral-900 pt-6">
          {previousChapterHref ? (
            <Link
              href={previousChapterHref}
              className="text-sm text-neutral-500 hover:text-white"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}

          {nextChapterHref ? (
            <Link
              href={nextChapterHref}
              className="text-sm text-neutral-500 hover:text-white"
            >
              Next →
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