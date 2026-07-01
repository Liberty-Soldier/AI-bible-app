"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { normalizeBookName } from "@/app/data/bookAliases";
import { usePathname, useSearchParams } from "next/navigation";

type WordStudySheetProps = {
  word: string | null;
  onClose: () => void;
};

type BibleIQMatch = {
  strong?: string;
  lemma?: string;
  transliteration?: string;
  language?: string;
  corpus?: string;
  gloss?: string;
  shortDefinition?: string;
  occurrenceCount?: number;
  weight?: number;
  occurrences?: BibleIQOccurrence[];
};

type BibleIQOccurrence = {
  book?: string;
  chapter?: number;
  verse?: number;
  reference?: string;
  word?: string;
  surface?: string;
};

type BibleIQEntry = BibleIQMatch & {
  displayWord?: string;
  meaning?: string;
  firstOccurrence?: BibleIQOccurrence | null;
  relatedWords?: string[];
  relatedConcepts?: string[];
  evidence?: string[];
  sources?: string[];
};

type BibleIQResponse = {
  query: string;
  concept?: string | null;
  strongs?: string[];
  matches?: BibleIQMatch[];
  entries?: BibleIQEntry[];
};

function parseOccurrenceReference(occurrence: {
  book?: string;
  chapter?: number;
  verse?: number;
  reference?: string;
}) {
  if (occurrence.book && occurrence.chapter) {
    return {
      book: occurrence.book,
      chapter: occurrence.chapter,
      verse: occurrence.verse || null,
    };
  }

  if (!occurrence.reference) return null;

  const parts = occurrence.reference.split(".");
  if (parts.length < 3) return null;

  const book = occurrence.book || parts[0];
  const chapter = Number(parts[1]);
  const verse = Number(parts[2]);

  if (!book || !Number.isFinite(chapter)) return null;

  return {
    book,
    chapter,
    verse: Number.isFinite(verse) ? verse : null,
  };
}

function getOccurrenceTranslation(book: string) {
  const brentonOnlyBooks = [
    "Tobit",
    "Judith",
    "Wisdom",
    "Sirach",
    "Baruch",
    "1 Maccabees",
    "2 Maccabees",
  ];

  return brentonOnlyBooks.includes(book) ? "brenton" : "web";
}

function buildOccurrenceHref(
  occurrence: BibleIQOccurrence | null | undefined,
  returnTo: string
) {
  if (!occurrence) return null;

  const parsedOccurrence = parseOccurrenceReference(occurrence);
  if (!parsedOccurrence) return null;

  const rawBook = parsedOccurrence.book || "";
  const normalizedBook = normalizeBookName(rawBook) || rawBook;

  if (!normalizedBook) return null;

  const occurrenceTranslation = getOccurrenceTranslation(normalizedBook);

  const safeVerse =
    parsedOccurrence.verse !== null && parsedOccurrence.verse !== undefined
      ? parsedOccurrence.verse
      : null;

  return `/read/${encodeURIComponent(normalizedBook)}/${
    parsedOccurrence.chapter
  }?translation=${occurrenceTranslation}${
    safeVerse ? `&verse=${safeVerse}` : ""
  }&study=true&returnTo=${encodeURIComponent(returnTo)}`;
}

export default function WordStudySheet({ word, onClose }: WordStudySheetProps) {
  const [data, setData] = useState<BibleIQResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [visibleOccurrenceCount, setVisibleOccurrenceCount] = useState(8);

  const pathname = usePathname();
  const searchParams = useSearchParams();

  const returnTo = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    setVisibleOccurrenceCount(8);
    setExpanded(false);
  }, [word]);

  useEffect(() => {
    if (!word) return;
    const activeWord = word;

    let cancelled = false;

    async function loadWordStudy() {
      setLoading(true);
      setData(null);

      try {
        const response = await fetch(
          `/api/word-study?q=${encodeURIComponent(activeWord)}`
        );

        const json = (await response.json()) as BibleIQResponse;

        if (!cancelled) {
          setData(json);
        }
      } catch {
        if (!cancelled) {
          setData({
            query: activeWord,
            matches: [],
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadWordStudy();

    return () => {
      cancelled = true;
    };
  }, [word]);

  if (!word) return null;

const matches: BibleIQEntry[] =
  data?.entries || (data?.matches as BibleIQEntry[]) || [];
const firstMatch = matches[0];

  const relatedMatches = matches
    .slice(1)
    .filter((match) => !("weight" in match) || Number(match.weight) >= 1000)
    .slice(0, 6);

  const occurrenceMatches = matches
    .filter((match) => match.occurrences && match.occurrences.length > 0)
    .slice(0, expanded ? 3 : 1);

  const totalOccurrences = firstMatch?.occurrences?.length || 0;
  const hasMoreOccurrences = visibleOccurrenceCount < totalOccurrences;
  const firstOccurrenceHref = buildOccurrenceHref(
  firstMatch?.firstOccurrence,
  returnTo
);

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        aria-label="Close word study"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <section
        className={`absolute bottom-0 left-0 right-0 rounded-t-[2rem] border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] shadow-2xl ${
          expanded ? "max-h-[88vh]" : "max-h-[62vh]"
        }`}
      >
        <div className="mx-auto max-w-xl overflow-y-auto p-5">
          <button
            type="button"
            aria-label={expanded ? "Collapse word study" : "Expand word study"}
            onClick={() => setExpanded((value) => !value)}
            className="mx-auto mb-4 block h-1.5 w-12 rounded-full bg-[var(--border)]"
          />

          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
<p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">
  BibleIQ
</p>

              <h2 className="mt-2 text-3xl font-bold">{word}</h2>

              {data?.concept ? (
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Concept: {data.concept}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-sm text-[var(--muted)]"
            >
              Close
            </button>
          </div>

          <div className="space-y-4">
{loading ? (
  <Card>
    <p className="text-sm text-[var(--muted)]">
      Loading word study...
    </p>
  </Card>
) : firstMatch ? (
  <>
    <Card>
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
            Meaning
          </p>

          <h3 className="mt-3 text-2xl font-semibold">
            {firstMatch.displayWord || firstMatch.lemma || word}
          </h3>

          {firstMatch.transliteration ? (
            <p className="mt-1 text-base text-[var(--muted)]">
              {firstMatch.transliteration}
            </p>
          ) : null}
        </div>

        <p className="text-base leading-7">
          {firstMatch.meaning ||
            firstMatch.shortDefinition ||
            firstMatch.gloss ||
            "No meaning available yet."}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <InfoCard label="Strong's" value={firstMatch.strong || "—"} />
          <InfoCard label="Language" value={firstMatch.language || "—"} />
          <InfoCard label="Corpus" value={firstMatch.corpus || "—"} />
          <InfoCard
            label="Occurrences"
            value={String(firstMatch.occurrenceCount || 0)}
          />
        </div>
      </div>
    </Card>

    {firstMatch.firstOccurrence ? (
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
              First Occurrence
            </p>

            <p className="mt-3 text-lg font-semibold">
              {firstMatch.firstOccurrence.reference || "Reference"}
            </p>

            <p className="mt-1 text-sm text-[var(--muted)]">
              {firstMatch.firstOccurrence.word ||
                firstMatch.firstOccurrence.surface ||
                firstMatch.displayWord ||
                word}
            </p>
          </div>

          {firstOccurrenceHref ? (
            <Link
              href={firstOccurrenceHref}
              className="shrink-0 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--muted)]"
            >
              Open →
            </Link>
          ) : null}
        </div>
      </Card>
    ) : null}
  </>
) : (
  <Card>
    <p className="text-sm text-[var(--muted)]">
      No word study match yet
    </p>
    <p className="mt-1 text-sm">
      This word may need direct lemma mapping or a concept alias.
    </p>
  </Card>
)}

            {relatedMatches.length > 0 && expanded ? (
              <Card>
                <p className="text-sm text-[var(--muted)]">Related Matches</p>

                <div className="mt-3 space-y-2">
                  {relatedMatches.map((match, index) => (
                    <div
                      key={`${match.strong || match.lemma || index}-${index}`}
                      className="rounded-xl border border-[var(--border)] px-3 py-2"
                    >
                      <p className="text-sm font-semibold">
                        {match.lemma || "Unknown"}{" "}
                        {match.transliteration
                          ? `• ${match.transliteration}`
                          : ""}
                      </p>

                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {[match.strong, match.language, match.corpus]
                          .filter(Boolean)
                          .join(" • ")}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            {occurrenceMatches.length > 0 ? (
              <Card>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-[var(--muted)]">
                    First Occurrences
                  </p>

                  {!expanded ? (
                    <button
                      type="button"
                      onClick={() => setExpanded(true)}
                      className="text-sm font-semibold text-[var(--foreground)]"
                    >
                      More
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 space-y-5">
                  {occurrenceMatches.map((match, matchIndex) => (
                    <div key={`${match.strong || match.lemma || matchIndex}`}>
                      {expanded ? (
                        <p className="mb-2 text-sm font-semibold">
                          {match.lemma || "Source word"}{" "}
                          {match.transliteration
                            ? `• ${match.transliteration}`
                            : ""}
                        </p>
                      ) : null}

                      <div className="space-y-2">
                        {(match.occurrences || [])
                          .slice(0, visibleOccurrenceCount)
                          .map((occurrence, index) => {
                            const label = `${
                              occurrence.reference || "Reference"
                            } — ${occurrence.word || occurrence.surface || ""}`;

                            const parsedOccurrence =
                              parseOccurrenceReference(occurrence);

                            if (!parsedOccurrence) {
                              return (
                                <div
                                  key={`${occurrence.reference || index}-${index}`}
                                  className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                                >
                                  {label}
                                </div>
                              );
                            }

const rawBook = parsedOccurrence.book || "";

const normalizedBook = normalizeBookName(rawBook) || rawBook;

if (!normalizedBook) return null;

const occurrenceTranslation = getOccurrenceTranslation(normalizedBook);

const safeVerse =
  parsedOccurrence.verse !== null && parsedOccurrence.verse !== undefined
    ? parsedOccurrence.verse
    : null;

const href = `/read/${encodeURIComponent(normalizedBook)}/${
  parsedOccurrence.chapter
}?translation=${occurrenceTranslation}${
  safeVerse ? `&verse=${safeVerse}` : ""
}&study=true&returnTo=${encodeURIComponent(returnTo)}`;

                            return (
                              <Link
                                key={`${occurrence.reference || index}-${index}`}
                                href={href}
                                className="block rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface)]"
                              >
                                {label}
                              </Link>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>

                {expanded && hasMoreOccurrences ? (
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleOccurrenceCount((count) => count + 8)
                    }
                    className="mt-4 w-full rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--muted)]"
                  >
                    Load More Occurrences
                  </button>
                ) : null}
              </Card>
            ) : null}

            {!expanded ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="w-full rounded-full border border-[var(--border)] py-3 text-sm font-semibold text-[var(--muted)]"
              >
                Swipe up / tap for deeper study
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      {children}
    </div>
  );
}
function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold">
        {value}
      </p>
    </div>
  );
}
