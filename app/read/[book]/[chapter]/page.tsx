import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import SacredNameToggle from "@/app/components/SacredNameToggle";
import ReaderSelector from "@/app/components/ReaderSelector";
import SaveReadingPosition from "@/app/components/SaveReadingPosition";
import ReaderVerseScroller from "@/app/components/ReaderVerseScroller";
import ChapterSwipe from "@/app/components/ChapterSwipe";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import CollapsibleReaderHeader from "@/app/components/CollapsibleReaderHeader";
import SaveBibleIQContext from "@/app/components/SaveBibleIQContext";
import ReaderWordStudyController from "@/app/components/ReaderWordStudyController";
import VerseActionController from "@/app/components/VerseActionController";
import ReaderStickyHeader from "@/app/components/ReaderStickyHeader";
import { bookCatalog } from "../../../data/scripture/bookCatalog";
import { getCanonicalChapterTokenAvailability } from "@/app/data/scripture/CanonicalVerseStore";
import {
  normalizeReaderChapter,
  type ReaderChapter,
} from "@/app/data/scripture/ReaderVerseAdapter";

export const dynamic = "force-dynamic";

type Translation = "web" | "kjv" | "brenton";

function safeBook(book: string) {
  return String(book || "")
    .replace(/[^1-3A-Za-z ]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

async function getBaseUrl() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");

  if (!host) {
    return process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
  }

  const proto =
    requestHeaders.get("x-forwarded-proto") ||
    (host.includes("localhost") ? "http" : "https");

  return `${proto}://${host}`;
}

async function loadChapter(
  translation: Translation,
  book: string,
  chapter: number,
): Promise<ReaderChapter> {
  const baseUrl = await getBaseUrl();
  const fileUrl = `${baseUrl}/scripture/runtime/${translation}/${safeBook(
    book,
  )}/${chapter}.json`;

  try {
    const response = await fetch(fileUrl, {
      cache: "force-cache",
    });

    if (!response.ok) return { verses: [], superscriptions: [] };
    return normalizeReaderChapter(await response.json());
  } catch {
    return { verses: [], superscriptions: [] };
  }
}

function getTranslationLabel(translation: Translation) {
  if (translation === "kjv") return "King James Version";
  if (translation === "brenton") return "Brenton Septuagint";
  return "World English Bible";
}

function getAvailableBooks() {
  return bookCatalog.map((item) => item.book);
}

function getMaxChapter(book: string) {
  return (
    bookCatalog.find((item) => item.book === book)?.chapters || 1
  );
}

async function getBestTranslation(
  book: string,
  chapter: number,
  requested: Translation,
): Promise<Translation> {
  if ((await loadChapter(requested, book, chapter)).verses.length) {
    return requested;
  }
  if ((await loadChapter("web", book, chapter)).verses.length) return "web";
  if ((await loadChapter("kjv", book, chapter)).verses.length) return "kjv";
  if ((await loadChapter("brenton", book, chapter)).verses.length) {
    return "brenton";
  }
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
    returnTo?: string;
    returnLabel?: string;
    focusToken?: string;
  }>;
}) {
  const { book, chapter } = await params;
  const {
    verse,
    translation,
    returnTo,
    returnLabel,
    focusToken,
  } = await searchParams;

  const decodedBook = decodeURIComponent(book);
  const chapterNumber = Number(chapter);
  const highlightedVerse = verse || null;
  const focusedTokenIndex =
    focusToken !== undefined && Number(focusToken) >= 0
      ? Number(focusToken)
      : null;

  const requestedTranslation: Translation =
    translation === "kjv" ||
    translation === "brenton" ||
    translation === "web"
      ? translation
      : "web";

  const activeTranslation = await getBestTranslation(
    decodedBook,
    chapterNumber,
    requestedTranslation,
  );

  const chapterData = await loadChapter(
    activeTranslation,
    decodedBook,
    chapterNumber,
  );
  const chapterVerses = chapterData.verses;
  const chapterSuperscriptions = chapterData.superscriptions;

  const tokenAvailabilityByVerse =
    await getCanonicalChapterTokenAvailability({
      origin: await getBaseUrl(),
      translation: activeTranslation,
      book: decodedBook,
      chapter: chapterNumber,
    });

  if (!chapterVerses.length) {
    notFound();
  }

  const books = getAvailableBooks();
  const maxChapter = getMaxChapter(decodedBook);
  const translationLabel = getTranslationLabel(activeTranslation);

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
    <main className="min-h-screen bg-[var(--background)] px-4 pb-20 text-[var(--foreground)] sm:px-6">
      <section className="mx-auto max-w-2xl">
        <ReaderVerseScroller verseLabel={highlightedVerse} />

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
        />

        <SaveReadingPosition
          book={decodedBook}
          chapter={chapterNumber}
          translation={activeTranslation}
        />

        <ReaderStickyHeader>
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
                verseOptions={chapterVerses.map((item) => item.verseLabel)}
              />
            </div>
          </CollapsibleReaderHeader>
        </ReaderStickyHeader>

        <ChapterSwipe
          previousChapterHref={previousChapterHref}
          nextChapterHref={nextChapterHref}
        >
          <article className="pt-24">
            {returnTo ? (
              <Link
                href={returnTo}
                className="mb-6 inline-flex rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                ← Back to {returnLabel || "where you were reading"}
              </Link>
            ) : null}

            <div className="mb-10">
              <p className="mb-2 text-xs uppercase tracking-[0.28em] text-[var(--muted)]">
                {translationLabel}
              </p>

              <h1 className="text-4xl font-semibold tracking-tight text-[var(--foreground)]">
                {decodedBook} {chapterNumber}
              </h1>

              <p className="mt-3 text-sm font-medium text-[var(--muted)]">
                Tap an underlined word for its source-based explanation.
                Tap a verse number for highlights, notes, bookmarks,
                copy, and share.
              </p>
            </div>

            <VerseActionController
              verses={chapterVerses}
              superscriptions={chapterSuperscriptions}
              activeTranslation={activeTranslation}
              highlightedVerse={highlightedVerse}
              focusedTokenIndex={focusedTokenIndex}
              tokenAvailabilityByVerse={tokenAvailabilityByVerse}
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
