import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import SacredNameToggle from "@/app/components/SacredNameToggle";
import ReaderAppearanceControls from "@/app/components/ReaderAppearanceControls";
import ReaderSelector from "@/app/components/ReaderSelector";
import SaveReadingPosition from "@/app/components/SaveReadingPosition";
import ReaderVerseScroller from "@/app/components/ReaderVerseScroller";
import ChapterSwipe from "@/app/components/ChapterSwipe";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import CollapsibleReaderHeader from "@/app/components/CollapsibleReaderHeader";
import SaveBibleIQContext from "@/app/components/SaveBibleIQContext";
import VerseActionController from "@/app/components/VerseActionController";
import ReaderStickyHeader from "@/app/components/ReaderStickyHeader";
import { bookCatalog } from "../../../data/scripture/bookCatalog";
import {
  normalizeReaderChapter,
  type ReaderChapter,
} from "@/app/data/scripture/ReaderVerseAdapter";
import ReaderFirstUseTip from "@/app/components/ReaderFirstUseTip";
import RestoredWordStudyNavigation from "@/app/components/RestoredWordStudyNavigation";
import { getCanonicalChapterTokenAvailability } from "@/app/data/scripture/CanonicalVerseStore";
import { getTranslationShortLabel, isTranslationPreference } from "@/app/lib/translationPreference";

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
    const incomingHeaders = await headers();

    const fetchHeaders: Record<string, string> = {};

    const cookie = incomingHeaders.get("cookie");
    const authorization = incomingHeaders.get("authorization");

    if (cookie) {
      fetchHeaders.cookie = cookie;
    }

    if (authorization) {
      fetchHeaders.authorization = authorization;
    }

    const response = await fetch(fileUrl, {
      cache: "no-store",
      headers: fetchHeaders,
    });

    if (!response.ok) {
      return { verses: [], superscriptions: [] };
    }

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

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ book: string; chapter: string }>;
  searchParams: Promise<{
    verse?: string;
    translation?: string;
  }>;
}): Promise<Metadata> {
  const { book, chapter } = await params;
  const { verse, translation } = await searchParams;

  const decodedBook = decodeURIComponent(book);
  const chapterNumber = Number(chapter);
  const requestedTranslation: Translation =
    translation === "kjv" ||
    translation === "brenton" ||
    translation === "web"
      ? translation
      : "web";
  const translationLabel = getTranslationLabel(requestedTranslation);
  const reference = `${decodedBook} ${chapterNumber}${verse ? `:${verse}` : ""}`;
  const canonicalParams = new URLSearchParams();

  canonicalParams.set("translation", requestedTranslation);
  if (verse) canonicalParams.set("verse", verse);

  const canonicalUrl = `/read/${encodeURIComponent(decodedBook)}/${chapterNumber}?${canonicalParams.toString()}`;
  const title = `${reference} — ${translationLabel}`;
  const description = `Read ${reference} in the ${translationLabel}, then trace source-word and Scripture evidence with EMETSEES.`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: "article",
      url: canonicalUrl,
      siteName: "EMETSEES",
      title,
      description,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "EMETSEES — Bible Study & Scripture Evidence",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/twitter-image"],
    },
  };
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
    restoreWordStudy?: string;
    citation?: string;
  }>;
}) {
  const { book, chapter } = await params;
  const {
    verse,
    translation,
    returnTo,
    returnLabel,
    restoreWordStudy,
    citation,
  } = await searchParams;

  const decodedBook = decodeURIComponent(book);
  const chapterNumber = Number(chapter);
  const highlightedVerse = verse || null;
  const requestedTranslation: Translation =
    translation === "kjv" ||
    translation === "brenton" ||
    translation === "web"
      ? translation
      : "web";

  // Evidence links must retain their verified wording. Ordinary reading keeps
  // the existing fallback for books unavailable in the preferred translation.
  const isCitation = citation === "1";
  if (isCitation && !isTranslationPreference(translation)) notFound();
  const activeTranslation = isCitation
    ? requestedTranslation
    : await getBestTranslation(decodedBook, chapterNumber, requestedTranslation);

  const chapterData = await loadChapter(
    activeTranslation,
    decodedBook,
    chapterNumber,
  );
  const chapterVerses = chapterData.verses;
  const chapterSuperscriptions = chapterData.superscriptions;

  if (!chapterVerses.length) {
    if (isCitation) {
      return (
        <main className="min-h-screen bg-[var(--background)] px-5 py-10 text-[var(--foreground)]">
          <section className="mx-auto max-w-2xl">
            <h1 className="text-2xl font-semibold">Citation unavailable</h1>
            <p className="mt-3 text-base leading-7">
              {decodedBook} {chapterNumber}{highlightedVerse ? `:${highlightedVerse}` : ""} could not be loaded in {getTranslationLabel(activeTranslation)}.
              No other translation has been substituted.
            </p>
            <Link href={returnTo || "/emet"} className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold underline">
              Back to {returnLabel || "Ask EMET"}
            </Link>
          </section>
        </main>
      );
    }
    notFound();
  }

  const tokenAvailabilityByVerse = await getCanonicalChapterTokenAvailability({
    origin: await getBaseUrl(),
    book: decodedBook,
    chapter: chapterNumber,
    translation: activeTranslation,
    readerVerses: chapterVerses.map((readerVerse) => ({
      id: readerVerse.id,
      tokenAvailabilityKey: readerVerse.tokenAvailabilityKey,
    })),
  });

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
        <RestoredWordStudyNavigation active={restoreWordStudy === "1"} />

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
            key={`${decodedBook}-${chapterNumber}-${activeTranslation}-${highlightedVerse || ""}`}
            title={`${decodedBook} ${chapterNumber}`}
            translationLabel={getTranslationShortLabel(activeTranslation)}
            passage={
              <ReaderSelector
                books={books}
                currentBook={decodedBook}
                currentChapter={chapterNumber}
                maxChapter={maxChapter}
                currentTranslation={activeTranslation}
                currentVerse={highlightedVerse}
                verseOptions={chapterVerses.map((item) => item.verseLabel)}
                strictCitation={isCitation}
                returnTo={returnTo}
                returnLabel={returnLabel}
              />
            }
            translation={
              <ReaderSelector
                books={books}
                currentBook={decodedBook}
                currentChapter={chapterNumber}
                maxChapter={maxChapter}
                currentTranslation={activeTranslation}
                currentVerse={highlightedVerse}
                verseOptions={chapterVerses.map((item) => item.verseLabel)}
                mode="translation"
                strictCitation={isCitation}
                returnTo={returnTo}
                returnLabel={returnLabel}
              />
            }
          >
            <ReaderAppearanceControls />
            <SacredNameToggle />
          </CollapsibleReaderHeader>
        </ReaderStickyHeader>

        <ChapterSwipe
          previousChapterHref={previousChapterHref}
          nextChapterHref={nextChapterHref}
        >
          <article className="pt-6 sm:pt-8">
            {returnTo ? (
              <Link
                href={returnTo}
                className="mb-6 inline-flex rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                ← Back to {returnLabel || "where you were reading"}
              </Link>
            ) : null}

            <div className="mb-5">
              <p className="mb-1 text-xs text-[var(--muted)]">
                {translationLabel}
              </p>

              <h1 className="reader-serif text-3xl font-medium tracking-tight text-[var(--foreground)]">
                {decodedBook} {chapterNumber}
              </h1>

              <ReaderFirstUseTip />
            </div>

            <VerseActionController
              key={`${decodedBook}-${chapterNumber}-${activeTranslation}`}
              verses={chapterVerses}
              superscriptions={chapterSuperscriptions}
              activeTranslation={activeTranslation}
              highlightedVerse={highlightedVerse}
              tokenAvailabilityByVerse={tokenAvailabilityByVerse}
            />
          </article>
        </ChapterSwipe>

        <div className="mt-12 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-6">
          {previousChapterHref ? (
            <Link
              href={previousChapterHref}
              className="inline-flex min-h-11 items-center text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              ← Previous chapter
            </Link>
          ) : (
            <span />
          )}

          {nextChapterHref ? (
            <Link
              href={nextChapterHref}
              className="inline-flex min-h-11 items-center text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Next chapter →
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
