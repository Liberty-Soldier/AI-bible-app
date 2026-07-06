"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { normalizeBookName } from "@/app/data/bookAliases";
import { usePathname, useSearchParams } from "next/navigation";
import type {
  BibleIQOccurrence,
  BibleIQResponse,
} from "@/app/data/lexicon/BibleIQTypes";

type WordStudySheetProps = {
  word: string | null;
  book: string;
  chapter: number;
  verse?: number;
  translation: string;
  displayTokenIndex?: number;
  selectedText?: string;
  originalWord?: string;
  verseText?: string;
  onClose: () => void;
};

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
  if (!occurrence?.book || !occurrence.chapter) return null;

  const normalizedBook = normalizeBookName(occurrence.book) || occurrence.book;
  if (!normalizedBook) return null;

  const occurrenceTranslation = getOccurrenceTranslation(normalizedBook);

  return `/read/${encodeURIComponent(normalizedBook)}/${
    occurrence.chapter
  }?translation=${occurrenceTranslation}${
    occurrence.verse ? `&verse=${occurrence.verse}` : ""
  }&study=true&returnTo=${encodeURIComponent(returnTo)}`;
}

export default function WordStudySheet({
  word,
  book,
  chapter,
  verse,
  translation,
  displayTokenIndex,
  selectedText,
  originalWord,
  verseText,
  onClose,
}: WordStudySheetProps) {

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
          `/api/word-study?${new URLSearchParams({
            displayWord: activeWord,
            book,
            chapter: String(chapter),
            verse: String(verse ?? ""),
            translation,
            displayTokenIndex: String(displayTokenIndex ?? -1),
            selectedText: selectedText ?? "",
            originalWord: originalWord ?? "",
            verseText: verseText ?? "",
          }).toString()}`
        );

        const json = (await response.json()) as BibleIQResponse;

        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) {
          setData({
            resolved: false,
            resolutionType: "unresolved",
            query: activeWord,
            message: "BibleIQ could not load this word yet.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadWordStudy();

    return () => {
      cancelled = true;
    };
  }, [
    word,
    book,
    chapter,
    verse,
    translation,
    displayTokenIndex,
    selectedText,
    originalWord,
    verseText,
  ]);

  if (!word) return null;

  const entity = data?.entity;
  const original = entity?.evidence.originalLanguage;
  const occurrences = entity?.evidence.occurrences || [];
  const visibleOccurrences = occurrences.slice(0, visibleOccurrenceCount);
  const hasMoreOccurrences = visibleOccurrenceCount < occurrences.length;

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        aria-label="Close BibleIQ"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <section
        className={`absolute bottom-0 left-0 right-0 rounded-t-[2rem] border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] shadow-2xl ${
          expanded ? "h-[88dvh]" : "h-[62dvh]"
        }`}
      >
        <div className="mx-auto h-full max-w-xl overflow-y-auto overscroll-contain p-5 pb-10">
          <button
            type="button"
            aria-label={expanded ? "Collapse BibleIQ" : "Expand BibleIQ"}
            onClick={() => setExpanded((value) => !value)}
            className="mx-auto mb-4 block h-1.5 w-12 rounded-full bg-[var(--border)]"
          />

          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--muted)]">
                BibleIQ
              </p>

              <h2 className="mt-2 break-words text-3xl font-bold">
                {entity?.title || word}
              </h2>

              {entity?.subtitle ? (
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {entity.subtitle}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-[var(--border)] px-3 py-1 text-sm text-[var(--muted)]"
            >
              Close
            </button>
          </div>

          <div className="space-y-4">
            {loading ? (
              <Card>
                <p className="text-sm text-[var(--muted)]">
                  Loading BibleIQ...
                </p>
              </Card>
            ) : entity ? (
              <>
                <Card>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                        Simple Meaning
                      </p>

                      <h3 className="mt-3 break-words text-2xl font-semibold">
                        {entity.simple.meaning || entity.title}
                      </h3>
                    </div>

                    <div>
                      <p className="text-sm font-semibold">In this verse</p>
                      <p className="mt-1 text-base leading-7">
                        {entity.simple.inThisVerse}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-semibold">Why it matters</p>
                      <p className="mt-1 text-base leading-7">
                        {entity.simple.whyItMatters}
                      </p>
                    </div>

                    <p className="text-base leading-7 text-[var(--muted)]">
                      {entity.simple.summary}
                    </p>
                  </div>
                </Card>

                {expanded ? (
                  <>
                    <Card>
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                        Original Language
                      </p>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <InfoCard label="Source" value={original?.source || "—"} />
                        <InfoCard label="Word" value={original?.word || "—"} />
                        <InfoCard
                          label="Transliteration"
                          value={original?.transliteration || "—"}
                        />
                        <InfoCard label="Strong's" value={original?.strong || "—"} />
                      </div>
                    </Card>

                    <Card>
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--muted)]">
                        Evidence
                      </p>

                      <div className="mt-4 space-y-3">
                        {entity.evidence.firstMention ? (
                          <EvidenceLine
                            label="First mention"
                            value={entity.evidence.firstMention}
                          />
                        ) : null}

                        {entity.evidence.keyReferences.length ? (
                          <EvidenceLine
                            label="Key references"
                            value={entity.evidence.keyReferences.join(", ")}
                          />
                        ) : null}

                        <EvidenceLine
                          label="Related people"
                          value={entity.evidence.related.people.join(", ") || "—"}
                        />

                        <EvidenceLine
                          label="Related concepts"
                          value={
                            entity.evidence.related.concepts.join(", ") || "—"
                          }
                        />
                      </div>
                    </Card>
                  </>
                ) : null}

                {occurrences.length ? (
                  <Card>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--muted)]">
                        Occurrences
                      </p>

                      {!expanded ? (
                        <button
                          type="button"
                          onClick={() => setExpanded(true)}
                          className="text-sm font-semibold text-[var(--foreground)]"
                        >
                          Evidence
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-2">
                      {visibleOccurrences.map((occurrence, index) => {
                        const href = buildOccurrenceHref(occurrence, returnTo);

                        const content = (
                          <>
                            <p className="font-semibold">
                              {occurrence.reference}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                              {occurrence.englishText || "Verse text pending."}
                            </p>
                            {occurrence.sourceWord ? (
                              <p className="mt-1 break-words text-xs text-[var(--muted)]">
                                Source word: {occurrence.sourceWord}
                              </p>
                            ) : null}
                          </>
                        );

                        return href ? (
                          <Link
                            key={`${occurrence.reference}-${index}`}
                            href={href}
                            className="block rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface)]"
                          >
                            {content}
                          </Link>
                        ) : (
                          <div
                            key={`${occurrence.reference}-${index}`}
                            className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                          >
                            {content}
                          </div>
                        );
                      })}
                    </div>

                    {hasMoreOccurrences ? (
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
              </>
            ) : (
              <Card>
                <p className="text-sm text-[var(--muted)]">
                  No BibleIQ explanation yet.
                </p>
                <p className="mt-1 text-sm">
                  {data?.message ||
                    "This word still needs source-level evidence mapping."}
                </p>
              </Card>
            )}

            {!expanded && entity ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="w-full rounded-full border border-[var(--border)] py-3 text-sm font-semibold text-[var(--muted)]"
              >
                Swipe up / tap for evidence
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

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
        {label}
      </p>

      <p className="mt-2 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}

function EvidenceLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}