"use client";

import { useEffect, useMemo, useState } from "react";

import ScriptureText from "@/app/components/ScriptureText";
import WordStudySheet from "@/app/components/WordStudySheet";
import type {
  SourceBreakdownCorpus,
  SourceBreakdownOccurrence,
  SourceBreakdownResult,
  SourceBreakdownTranslation,
} from "@/app/data/bibleiq/SourceBreakdownRuntime";
import type { BibleIQVerseTokenAvailability } from "@/app/data/lexicon/BibleIQTypes";

type ReaderVerseStudyProps = {
  reference: string;
  verse: number;
  translation: SourceBreakdownTranslation;
  verseText: string;
  tokenAvailability?: BibleIQVerseTokenAvailability;
  displayVerseText?: boolean;
  compactTrigger?: boolean;
};

type EntityDetails = {
  resolved?: boolean;
  entity?: {
    simple?: { meaning?: string };
    entityEvidence?: {
      renderings?: {
        translations?: Array<{
          translation?: string;
          forms?: Array<{ text?: string }>;
        }>;
      };
    };
    evidence?: {
      originalLanguage?: {
        transliteration?: string;
      };
      definitions?: {
        short?: string;
      };
    };
  };
};

type EntityDetailMap = Record<string, EntityDetails | null>;

function parseDisplayedReference(reference: string, fallbackVerse: number) {
  const dotMatch = reference.match(/^(.+)\.(\d+)\.([^.]+)$/);

  if (dotMatch) {
    return {
      book: dotMatch[1],
      chapter: Number(dotMatch[2]),
      verse: dotMatch[3],
    };
  }

  const humanMatch = reference.match(/^(.+?)\s+(\d+):(.+)$/);

  if (humanMatch) {
    return {
      book: humanMatch[1],
      chapter: Number(humanMatch[2]),
      verse: humanMatch[3],
    };
  }

  return { book: "", chapter: 0, verse: String(fallbackVerse) };
}

function displaySourceSurface(
  occurrence: SourceBreakdownOccurrence,
  corpus: SourceBreakdownCorpus,
) {
  const surface = String(occurrence.surface || "").trim();

  return corpus === "hebrew"
    ? surface.replace(/[\/\\]+/gu, "").replace(/\u2060/gu, "").trim()
    : surface;
}

function safeOccurrenceMeaning(occurrence: SourceBreakdownOccurrence) {
  const value = occurrence.meaning?.trim();

  if (!value) return null;
  if (/^[A-Z]{1,4}[A-Za-z0-9]{2,}$/u.test(value) && !/\s/u.test(value)) {
    return null;
  }

  return value;
}

function detailRendering(
  detail: EntityDetails | null,
  translation: SourceBreakdownTranslation,
) {
  const groups = detail?.entity?.entityEvidence?.renderings?.translations || [];
  const wanted = translation.toLowerCase();
  const exact =
    groups.find(
      (group) => String(group.translation || "").toLowerCase() === wanted,
    ) || null;

  return (
    exact?.forms?.map((form) => form.text?.trim()).find(Boolean) ||
    groups
      .flatMap((group) => group.forms || [])
      .map((form) => form.text?.trim())
      .find(Boolean) ||
    detail?.entity?.evidence?.definitions?.short?.trim() ||
    detail?.entity?.simple?.meaning?.trim() ||
    null
  );
}

function lexicalGloss(
  occurrence: SourceBreakdownOccurrence,
  corpus: SourceBreakdownCorpus,
  translation: SourceBreakdownTranslation,
  detail: EntityDetails | null,
) {
  return (
    (corpus === "hebrew" ? null : safeOccurrenceMeaning(occurrence)) ||
    detailRendering(detail, translation)
  );
}

function sourceTitle(corpus: SourceBreakdownCorpus) {
  if (corpus === "hebrew") return "Hebrew";
  if (corpus === "lxx") return "LXX";
  return "Greek";
}

export default function ReaderVerseStudy({
  reference,
  verse,
  translation,
  verseText,
  tokenAvailability,
  displayVerseText = true,
  compactTrigger = false,
}: ReaderVerseStudyProps) {
  const [expanded, setExpanded] = useState(false);
  const [breakdown, setBreakdown] = useState<SourceBreakdownResult | null>(null);
  const [sourceCache, setSourceCache] = useState<
    Partial<Record<SourceBreakdownCorpus, SourceBreakdownResult>>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entityDetails, setEntityDetails] = useState<EntityDetailMap>({});
  const [wordOverview, setWordOverview] =
    useState<SourceBreakdownOccurrence | null>(null);

  const parsed = useMemo(
    () => parseDisplayedReference(reference, verse),
    [reference, verse],
  );

  async function loadBreakdown(source?: SourceBreakdownCorpus) {
    if (loading) return;

    if (source) setWordOverview(null);

    if (!parsed.book || !Number.isFinite(parsed.chapter) || parsed.chapter < 1) {
      setError("Original-language text is unavailable for this reference.");
      return;
    }

    if (source && sourceCache[source]) {
      setEntityDetails({});
      setBreakdown(sourceCache[source] || null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({
        translation,
        book: parsed.book,
        chapter: String(parsed.chapter),
        verse: String(parsed.verse),
      });

      if (source) query.set("source", source);

      const response = await fetch(`/api/source-breakdown?${query.toString()}`, {
        cache: "no-store",
      });
      const json = (await response.json()) as
        | SourceBreakdownResult
        | { resolved?: false; error?: string };

      if (!response.ok || !("resolved" in json) || json.resolved !== true) {
        throw new Error(
          "error" in json && json.error
            ? json.error
            : "Original-language text is unavailable.",
        );
      }

      setEntityDetails({});
      setBreakdown(json);
      setSourceCache((current) => ({ ...current, [json.corpus]: json }));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Original-language text is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleStudy() {
    if (expanded) {
      setExpanded(false);
      setWordOverview(null);
      return;
    }

    setExpanded(true);
    if (!breakdown) void loadBreakdown();
  }

  useEffect(() => {
    if (!expanded) return;

    const scrollY = window.scrollY;
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.width = originalWidth;
      window.scrollTo(0, scrollY);
    };
  }, [expanded]);

  const uniqueEntityOccurrences = useMemo(() => {
    const byEntity = new Map<string, SourceBreakdownOccurrence>();

    for (const sourceVerse of breakdown?.sourceVerses || []) {
      for (const occurrence of sourceVerse.occurrences) {
        if (
          occurrence.entityId &&
          occurrence.lexicalId &&
          !occurrence.grammarOnly &&
          !byEntity.has(occurrence.entityId)
        ) {
          byEntity.set(occurrence.entityId, occurrence);
        }
      }
    }

    return Array.from(byEntity.values());
  }, [breakdown]);

  useEffect(() => {
    if (!breakdown || uniqueEntityOccurrences.length === 0) return;

    const controller = new AbortController();
    async function loadEntityDetails() {
      const results = await Promise.all(
        uniqueEntityOccurrences.map(async (occurrence) => {
          const entityId = occurrence.entityId || "";
          const surface = displaySourceSurface(occurrence, breakdown!.corpus);
          const query = new URLSearchParams({
            entityId,
            displayWord: occurrence.lexicalId || entityId,
            book: breakdown!.displayedReference.book,
            chapter: String(breakdown!.displayedReference.chapter),
            verse: String(breakdown!.displayedReference.verse),
            translation: breakdown!.translation,
            selectedText: surface,
            originalWord: surface,
            verseText,
          });

          try {
            const response = await fetch(`/api/word-study?${query.toString()}`, {
              cache: "no-store",
              signal: controller.signal,
            });

            if (!response.ok) return [entityId, null] as const;
            const detail = (await response.json()) as EntityDetails;
            return [entityId, detail.resolved === false ? null : detail] as const;
          } catch (cause) {
            if (cause instanceof DOMException && cause.name === "AbortError") {
              return null;
            }
            return [entityId, null] as const;
          }
        }),
      );

      if (controller.signal.aborted) return;

      const next: EntityDetailMap = {};
      for (const result of results) {
        if (result) next[result[0]] = result[1];
      }
      setEntityDetails(next);
    }

    void loadEntityDetails();
    return () => controller.abort();
  }, [breakdown, uniqueEntityOccurrences, verseText]);

  const showOldTestamentSources = breakdown?.corpus === "hebrew" ||
    (breakdown?.corpus === "lxx" && translation !== "brenton");

  const highlightRange = useMemo(() => {
    if (!wordOverview || !tokenAvailability) return null;

    const spans = new Map<
      string,
      { startTokenIndex: number; endTokenIndex: number }
    >();

    for (const availability of Object.values(tokenAvailability)) {
      const ownership = availability.readerOwnership;

      if (
        ownership?.kind !== "exact" ||
        !ownership.sourceOccurrenceIds.includes(wordOverview.id) ||
        !Number.isInteger(ownership.startTokenIndex) ||
        !Number.isInteger(ownership.endTokenIndex) ||
        ownership.startTokenIndex < 0 ||
        ownership.endTokenIndex < ownership.startTokenIndex
      ) {
        continue;
      }

      spans.set(`${ownership.startTokenIndex}:${ownership.endTokenIndex}`, {
        startTokenIndex: ownership.startTokenIndex,
        endTokenIndex: ownership.endTokenIndex,
      });
    }

    return spans.size === 1 ? Array.from(spans.values())[0] : null;
  }, [tokenAvailability, wordOverview]);

  return (
    <>
      {displayVerseText ? (
        <ScriptureText
          text={verseText}
          reference={reference}
          highlightRange={highlightRange}
        />
      ) : null}

      <div
        className={
          compactTrigger ? "contents" : "mt-1 pl-10 text-base leading-normal"
        }
      >
        <button
          type="button"
          data-verse-study-control="true"
          aria-expanded={expanded}
          onClick={toggleStudy}
          className={
            compactTrigger
              ? "min-h-9 rounded-xl bg-[var(--surface)] px-2 text-center text-[0.7rem] font-semibold text-[var(--foreground)] active:scale-[0.98] disabled:opacity-60"
              : "rounded px-1 py-0.5 text-xs font-semibold tracking-wide text-[var(--muted)] transition hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/45"
          }
        >
          {loading ? "Loading…" : compactTrigger ? "Source" : expanded ? "Hide study" : "Study \u203a"}
        </button>

        {expanded ? (
          <div className="fixed inset-0 z-[60] overflow-hidden">
            <button
              type="button"
              aria-label="Close source study"
              onClick={toggleStudy}
              className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            />

            <section className="absolute bottom-0 left-1/2 flex max-h-[90dvh] w-full max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-t-[2rem] border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] shadow-2xl">
              <div className="flex shrink-0 justify-center pb-1 pt-3">
                <div className="h-1.5 w-11 rounded-full bg-[var(--border)]" />
              </div>

              <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-5 pb-4 pt-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                    Original language
                  </div>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    {parsed.book} {parsed.chapter}:{parsed.verse}
                  </h2>
                </div>

                <button
                  type="button"
                  aria-label="Close source study"
                  onClick={toggleStudy}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-lg text-[var(--muted)]"
                >
                  &times;
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 pb-20">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Original language
            </div>

            {showOldTestamentSources ? (
              <div
                className="inline-flex rounded-lg border border-[var(--border)] p-0.5 text-xs"
                aria-label="Original-language source"
              >
                {(["hebrew", "lxx"] as const).map((source) => (
                  <button
                    key={source}
                    type="button"
                    aria-pressed={breakdown?.corpus === source}
                    disabled={loading}
                    onClick={() => void loadBreakdown(source)}
                    className={
                      "rounded-md px-2.5 py-1 font-semibold transition " +
                      (breakdown?.corpus === source
                        ? "bg-[var(--background)] text-[var(--foreground)] shadow-sm"
                        : "text-[var(--muted)] hover:text-[var(--foreground)]")
                    }
                  >
                    {source === "hebrew" ? "Hebrew" : "LXX"}
                  </button>
                ))}
              </div>
            ) : breakdown ? (
              <div className="text-xs font-semibold text-[var(--muted)]">
                {sourceTitle(breakdown.corpus)}
              </div>
            ) : null}
          </div>

          <p className="mb-3 text-xs leading-5 text-[var(--muted)]">
            Lexical gloss appears beneath each source word; it is not
            necessarily the exact wording used in this translation.
            Transliteration follows below.
          </p>

          {loading && !breakdown ? (
            <div role="status" className="text-sm text-[var(--muted)]">
              Loading original-language text…
            </div>
          ) : null}

          {error ? (
            <div role="status" className="text-sm text-[var(--muted)]">
              {error}
            </div>
          ) : null}

          {breakdown ? (
            <div className="space-y-4">
              {breakdown.sourceVerses.map((sourceVerse, sourceVerseIndex) => {
                const isHebrew = sourceVerse.source === "hebrew";

                return (
                  <div key={sourceVerse.sourceKey || sourceVerse.reference}>
                    {breakdown.sourceVerses.length > 1 ? (
                      <div className="mb-2 text-xs text-[var(--muted)]">
                        {sourceVerse.reference}
                      </div>
                    ) : null}

                    <div
                      dir={isHebrew ? "rtl" : "ltr"}
                      lang={isHebrew ? "he" : "grc"}
                      className="flex flex-wrap items-start gap-x-2 gap-y-3"
                    >
                      {sourceVerse.occurrences.map((occurrence) => {
                        const entityId = occurrence.entityId || "";
                        const detail = entityId
                          ? entityDetails[entityId] ?? null
                          : null;
                        const detailLoaded = Boolean(
                          entityId &&
                            Object.prototype.hasOwnProperty.call(
                              entityDetails,
                              entityId,
                            ),
                        );
                        const gloss = lexicalGloss(
                          occurrence,
                          sourceVerse.source,
                          breakdown.translation,
                          detail,
                        );
                        const transliteration =
                          occurrence.transliteration ||
                          detail?.entity?.evidence?.originalLanguage
                            ?.transliteration ||
                          null;
                        const lexical = Boolean(
                          occurrence.lexicalId &&
                            occurrence.entityId &&
                            !occurrence.grammarOnly,
                        );
                        const content = (
                          <>
                            <span
                              dir={isHebrew ? "rtl" : "ltr"}
                              className="text-xl font-medium leading-tight text-[var(--foreground)]"
                            >
                              {displaySourceSurface(
                                occurrence,
                                sourceVerse.source,
                              )}
                            </span>
                            <span
                              dir="ltr"
                              className="mt-1 max-w-full text-[11px] font-medium leading-tight text-[var(--muted)]"
                            >
                              {gloss ||
                                (entityId && !detailLoaded
                                  ? "Loading gloss…"
                                  : "Gloss unavailable")}
                            </span>
                            <span
                              dir="ltr"
                              className="mt-0.5 max-w-full text-[10px] italic leading-tight text-[var(--muted)]/85"
                            >
                              {transliteration ||
                                (entityId && !detailLoaded
                                  ? "Loading transliteration…"
                                  : "Transliteration unavailable")}
                            </span>
                          </>
                        );

                        return lexical ? (
                          <button
                            type="button"
                            key={`${sourceVerseIndex}-${occurrence.id}`}
                            data-source-word="true"
                            aria-label={`Open Word Overview for ${displaySourceSurface(
                              occurrence,
                              sourceVerse.source,
                            )}`}
                            onClick={() => setWordOverview(occurrence)}
                            aria-pressed={wordOverview?.id === occurrence.id}
                            className={`inline-flex min-w-[3rem] max-w-[9rem] flex-col items-center rounded-lg px-1.5 py-1 text-center transition hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/45 ${
                              wordOverview?.id === occurrence.id
                                ? "bg-amber-500/10 ring-2 ring-amber-500/35"
                                : ""
                            }`}
                          >
                            {content}
                          </button>
                        ) : (
                          <span
                            key={`${sourceVerseIndex}-${occurrence.id}`}
                            className="inline-flex min-w-[3rem] max-w-[9rem] flex-col items-center px-1.5 py-1 text-center"
                          >
                            {content}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

              </div>
            </section>
          </div>
        ) : null}
      </div>

      {wordOverview && breakdown ? (
        <WordStudySheet
          entityId={wordOverview.entityId || undefined}
          word={displaySourceSurface(wordOverview, breakdown.corpus)}
          book={breakdown.displayedReference.book}
          chapter={breakdown.displayedReference.chapter}
          verse={Number(breakdown.displayedReference.verse)}
          translation={breakdown.translation}
          selectedText={displaySourceSurface(wordOverview, breakdown.corpus)}
          originalWord={displaySourceSurface(wordOverview, breakdown.corpus)}
          verseText={verseText}
          sourceOccurrenceId={
            wordOverview.lexicalId && wordOverview.entityId
              ? wordOverview.id
              : undefined
          }
          sourceLexicalId={
            wordOverview.lexicalId && wordOverview.entityId
              ? wordOverview.lexicalId || undefined
              : undefined
          }
          sourceCorpus={
            wordOverview.lexicalId && wordOverview.entityId
              ? breakdown.corpus
              : undefined
          }
          sourceResolutionAuthority={
            wordOverview.lexicalResolution?.status === "resolved"
              ? wordOverview.lexicalResolution.authority
              : wordOverview.lexicalId && wordOverview.entityId
                ? "canonical-source-breakdown-occurrence"
                : undefined
          }
          sourceResolutionMethod={
            wordOverview.lexicalResolution?.status === "resolved"
              ? wordOverview.lexicalResolution.method
              : wordOverview.lexicalId && wordOverview.entityId
                ? "exact-source-occurrence"
                : undefined
          }
          onClose={() => setWordOverview(null)}
        />
      ) : null}
    </>
  );
}
