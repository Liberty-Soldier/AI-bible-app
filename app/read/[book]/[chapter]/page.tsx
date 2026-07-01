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
import ImmersiveReaderShell from "@/app/components/ImmersiveReaderShell";
import VerseActionController from "@/app/components/VerseActionController";
import ReaderStickyHeader from "@/app/components/ReaderStickyHeader";

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
    <main className="min-h-screen bg-[var(--background)] px-4 pb-20 text-[var(--foreground)] sm:px-6">
      <section className="mx-auto max-w-2xl">
        <VerseScroller verse={highlightedVerse} />

        <ReaderWordStudyController
  book={decodedBook}
  chapter={chapterNumber}
  translation={activeTranslation}
/>

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

<ReaderStickyHeader>
  <div className="flex items-center gap-3">
    <div className="min-w-0 flex-1">
      <CollapsibleReaderHeader title={`${decodedBook} ${chapterNumber}`}>
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

    <div className="shrink-0 rounded-full bg-[var(--surface)] p-1 text-xs font-semibold">
      <Link
        href={readModeHref}
        className={`inline-block rounded-full px-3 py-1.5 ${
          !studyMode
            ? "bg-[var(--foreground)] text-[var(--background)]"
            : "text-[var(--muted)]"
        }`}
      >
        Read
      </Link>

      <Link
        href={studyModeHref}
        className={`inline-block rounded-full px-3 py-1.5 ${
          studyMode
            ? "bg-[var(--foreground)] text-[var(--background)]"
            : "text-[var(--muted)]"
        }`}
      >
        Study
      </Link>
    </div>
  </div>
</ReaderStickyHeader>

        <ChapterSwipe
          previousChapterHref={previousChapterHref}
          nextChapterHref={nextChapterHref}
        >
          <article className="pt-24">
            {returnTo ? (
  <Link
    href={returnTo}
    className="mb-6 inline-flex rounded-full border border-neutral-800 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-600 hover:text-white"
  >
    ← Back to Word Study
  </Link>
) : null}
            <div className="mb-10">
              <p className="mb-2 text-xs uppercase tracking-[0.28em] text-[var(--muted)]">
                {translationLabel}
              </p>

              <h1 className="text-4xl font-semibold tracking-tight text-[var(--foreground)]">
                {decodedBook} {chapterNumber}
              </h1>
            </div>

<VerseActionController
  verses={chapterVerses}
  studyMode={studyMode}
  activeTranslation={activeTranslation}
  highlightedVerse={highlightedVerse}
/>
          </article>
        </ChapterSwipe>

        <div className="mt-12 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-6">
          {previousChapterHref ? (
            <Link
              href={previousChapterHref}
              className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}

          {nextChapterHref ? (
            <Link
              href={nextChapterHref}
              className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      </section>

      <MobileBottomNav autoHide />
    </main>
  );
}