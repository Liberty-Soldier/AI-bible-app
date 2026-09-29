"use client";

import { useEffect, useMemo, useState } from "react";

import ScriptureText from "@/app/components/ScriptureText";
import WordStudySheet from "@/app/components/WordStudySheet";

import type {
  SourceBreakdownCorpus,
  SourceBreakdownOccurrence,
  SourceBreakdownResult,
  SourceBreakdownSourceVerse,
} from "@/app/data/bibleiq/SourceBreakdownRuntime";

type SourceBreakdownSheetProps = {
  data: SourceBreakdownResult;
  verseText: string;
  onClose: () => void;
};

type SelectedEntityDetails = {
  resolved?: boolean;
  entity?: {
    simple?: {
      meaning?: string;
    };
    entityEvidence?: {
      renderings?: {
        translations?: Array<{
          translation?: string;
          forms?: Array<{
            text?: string;
            count?: number;
            translation?: string;
          }>;
        }>;
      };
    };
    evidence?: {
      originalLanguage?: {
        transliteration?: string;
        lemma?: string;
        lemmaId?: string;
        strong?: string;
        partOfSpeech?: string;
        morph?: string;
      };
      definitions?: {
        short?: string;
        usage?: string;
      };
    };
  };
};

type EntityDetailMap = Record<
  string,
  SelectedEntityDetails | null
>;

function corpusTitle(
  corpus: SourceBreakdownResult["corpus"],
) {
  if (corpus === "hebrew") {
    return "Hebrew Source";
  }

  if (corpus === "greek-nt") {
    return "Greek New Testament";
  }

  return "Greek Septuagint";
}

function translationTitle(
  translation: SourceBreakdownResult["translation"],
) {
  if (translation === "web") {
    return "WEB";
  }

  if (translation === "kjv") {
    return "KJV";
  }

  return "Brenton";
}

function lexicalLabel(
  occurrence: SourceBreakdownOccurrence,
) {
  const lexicalId =
    occurrence.lexicalId?.trim();

  if (!lexicalId) {
    return null;
  }

  if (/^[HG]\d+/i.test(lexicalId)) {
    return `Strong's ${lexicalId}`;
  }

  return `Lexical ${lexicalId}`;
}

function occurrenceMorphology(
  occurrence: SourceBreakdownOccurrence,
) {
  return (
    occurrence.morphologyEnglish ||
    occurrence.morphology ||
    null
  );
}

function canOpenWordOverview(
  occurrence: SourceBreakdownOccurrence,
) {
  return Boolean(
    occurrence.lexicalId &&
      occurrence.entityId &&
      !occurrence.grammarOnly,
  );
}

function displaySourceSurface(
  occurrence: SourceBreakdownOccurrence,
  corpus: SourceBreakdownCorpus,
) {
  const surface =
    String(occurrence.surface || "").trim();

  if (corpus !== "hebrew") {
    return surface;
  }

  return surface
    .replace(/[\/\\]+/gu, "")
    .replace(/\u2060/gu, "")
    .trim();
}

function safeOccurrenceMeaning(
  occurrence: SourceBreakdownOccurrence,
) {
  const value =
    occurrence.meaning?.trim();

  if (!value) {
    return null;
  }

  if (
    /^[A-Z]{1,4}[A-Za-z0-9]{2,}$/u.test(
      value,
    ) &&
    !/\s/u.test(value)
  ) {
    return null;
  }

  return value;
}

function translationRendering(
  detail: SelectedEntityDetails | null,
  translation: SourceBreakdownResult["translation"],
) {
  const groups =
    detail?.entity?.entityEvidence
      ?.renderings?.translations || [];

  const wanted =
    String(translation).toLowerCase();

  const exact =
    groups.find(
      (group) =>
        String(
          group.translation || "",
        ).toLowerCase() === wanted,
    ) ||
    null;

  const exactText =
    exact?.forms
      ?.map((form) =>
        String(form.text || "").trim(),
      )
      .find(Boolean) ||
    null;

  if (exactText) {
    return exactText;
  }

  return (
    groups
      .flatMap((group) =>
        group.forms || [],
      )
      .map((form) =>
        String(form.text || "").trim(),
      )
      .find(Boolean) ||
    null
  );
}

function englishRendering(
  occurrence: SourceBreakdownOccurrence,
  detail: SelectedEntityDetails | null,
  translation: SourceBreakdownResult["translation"],
  corpus: SourceBreakdownCorpus,
) {
  // Hebrew occurrence.meaning can contain MorphHB codes.
  // Never present that legacy slot as reader English.
  const occurrenceMeaning =
    corpus === "hebrew"
      ? null
      : safeOccurrenceMeaning(occurrence);

  return (
    occurrenceMeaning ||
    translationRendering(
      detail,
      translation,
    ) ||
    detail?.entity?.evidence?.definitions?.short?.trim() ||
    detail?.entity?.simple?.meaning?.trim() ||
    null
  );
}

function SelectedWordDetails({
  occurrence,
  corpus,
  translation,
  detail,
  detailLoading,
  onOpenWordOverview,
}: {
  occurrence: SourceBreakdownOccurrence;
  corpus: SourceBreakdownCorpus;
  translation: SourceBreakdownResult["translation"];
  detail: SelectedEntityDetails | null;
  detailLoading: boolean;
  onOpenWordOverview: (
    occurrence: SourceBreakdownOccurrence,
  ) => void;
}) {
  const sourceDetail =
    detail?.entity?.evidence?.originalLanguage;

  const meaning =
    englishRendering(
      occurrence,
      detail,
      translation,
      corpus,
    );

  const transliteration =
    occurrence.transliteration ||
    sourceDetail?.transliteration ||
    null;

  const lemma =
    occurrence.lemma ||
    sourceDetail?.lemma ||
    null;

  const lexical =
    lexicalLabel(occurrence) ||
    sourceDetail?.strong ||
    sourceDetail?.lemmaId ||
    null;

  const morphology =
    occurrenceMorphology(occurrence) ||
    sourceDetail?.morph ||
    null;

  const partOfSpeech =
    occurrence.partOfSpeech ||
    sourceDetail?.partOfSpeech ||
    null;

  const hasFullWordOverview =
    canOpenWordOverview(occurrence);

  return (
    <div
      className="emet-source-word-detail mt-5 border-t border-[var(--border)] pt-5"
      aria-live="polite"
    >
      <div
        dir={
          corpus === "hebrew"
            ? "rtl"
            : "ltr"
        }
        className="text-3xl font-semibold leading-tight text-[var(--foreground)]"
      >
        {displaySourceSurface(
          occurrence,
          corpus,
        )}
      </div>

      {transliteration ? (
        <div className="mt-1 text-sm italic text-[var(--muted)]">
          {transliteration}
        </div>
      ) : null}

      {meaning ? (
        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            English rendering
          </div>
          <div className="mt-1 text-base font-medium leading-relaxed text-[var(--foreground)]">
            {meaning}
          </div>
        </div>
      ) : detailLoading ? (
        <div className="mt-4 text-sm text-[var(--muted)]">
          Loading English rendering...
        </div>
      ) : null}

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm leading-relaxed">
        {lemma ? (
          <>
            <dt className="font-semibold text-[var(--muted)]">
              Lemma
            </dt>
            <dd className="min-w-0 text-[var(--foreground)]">
              {lemma}
            </dd>
          </>
        ) : null}

        {lexical ? (
          <>
            <dt className="font-semibold text-[var(--muted)]">
              Lexical
            </dt>
            <dd className="min-w-0 text-[var(--foreground)]">
              {lexical}
            </dd>
          </>
        ) : null}

        {partOfSpeech ? (
          <>
            <dt className="font-semibold text-[var(--muted)]">
              Part of speech
            </dt>
            <dd className="min-w-0 text-[var(--foreground)]">
              {partOfSpeech}
            </dd>
          </>
        ) : null}

        {morphology ? (
          <>
            <dt className="font-semibold text-[var(--muted)]">
              Morphology
            </dt>
            <dd className="min-w-0 text-[var(--foreground)]">
              {morphology}
            </dd>
          </>
        ) : null}
      </dl>

      {!hasFullWordOverview &&
      occurrence.grammarOnly ? (
        <div className="mt-4 text-sm text-[var(--muted)]">
          This grammatical form has no standalone lexical entry.
        </div>
      ) : null}

      {hasFullWordOverview ? (
        <button
          type="button"
          onClick={() =>
            onOpenWordOverview(occurrence)
          }
          className="mt-5 inline-flex items-center gap-1 border-b border-current pb-0.5 text-sm font-semibold text-[var(--foreground)] transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
        >
          View full Word Overview
          <span aria-hidden="true">
            &rarr;
          </span>
        </button>
      ) : null}
    </div>
  );
}

function SourceVerseBlock({
  sourceVerse,
  index,
  total,
  translation,
  entityDetails,
  selectedOccurrence,
  onOccurrence,
  onOpenWordOverview,
}: {
  sourceVerse: SourceBreakdownSourceVerse;
  index: number;
  total: number;
  translation: SourceBreakdownResult["translation"];
  entityDetails: EntityDetailMap;
  selectedOccurrence: SourceBreakdownOccurrence | null;
  onOccurrence: (
    occurrence: SourceBreakdownOccurrence,
  ) => void;
  onOpenWordOverview: (
    occurrence: SourceBreakdownOccurrence,
  ) => void;
}) {
  const isHebrew =
    sourceVerse.source === "hebrew";

  const selectedHere =
    selectedOccurrence &&
    sourceVerse.occurrences.some(
      (occurrence) =>
        occurrence.id ===
        selectedOccurrence.id,
    )
      ? selectedOccurrence
      : null;

  const selectedEntityId =
    selectedHere?.entityId || "";

  const selectedDetail =
    selectedEntityId
      ? entityDetails[selectedEntityId] ??
        null
      : null;

  const selectedDetailLoading =
    Boolean(
      selectedEntityId &&
        !Object.prototype.hasOwnProperty.call(
          entityDetails,
          selectedEntityId,
        ),
    );

  return (
    <section className="border-t border-[var(--border)] py-6 first:border-t-0 first:pt-0">
      <div className="mb-4">
        {total > 1 ? (
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            Source verse {index + 1}
          </div>
        ) : null}

        <div className="text-sm font-semibold text-[var(--foreground)]">
          {sourceVerse.reference}
        </div>

        <div className="mt-1 text-xs text-[var(--muted)]">
          {sourceVerse.witness}
        </div>
      </div>

      <div
        dir={isHebrew ? "rtl" : "ltr"}
        lang={isHebrew ? "he" : "grc"}
        className={
          "flex flex-wrap items-start gap-x-3 gap-y-4 " +
          (isHebrew
            ? "justify-start text-right"
            : "justify-start text-left")
        }
      >
        {sourceVerse.occurrences.map(
          (occurrence, occurrenceIndex) => {
            const selected =
              selectedOccurrence?.id ===
              occurrence.id;

            const entityId =
              occurrence.entityId || "";

            const detail =
              entityId
                ? entityDetails[entityId] ??
                  null
                : null;

            const detailLoaded =
              Boolean(
                entityId &&
                  Object.prototype.hasOwnProperty.call(
                    entityDetails,
                    entityId,
                  ),
              );

            const rendering =
              englishRendering(
                occurrence,
                detail,
                translation,
                sourceVerse.source,
              );

            return (
              <button
                type="button"
                key={occurrence.id}
                data-source-word="true"
                aria-pressed={
                  selected
                    ? "true"
                    : undefined
                }
                onClick={() =>
                  onOccurrence(
                    occurrence,
                  )
                }
                className={
                  "emet-source-word-reveal inline-flex min-w-[2.25rem] max-w-[8.5rem] flex-col items-center rounded-lg px-1.5 py-1 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/45 " +
                  (selected
                    ? "emet-source-word-selected bg-amber-500/15 ring-1 ring-amber-500/30"
                    : "hover:bg-amber-500/10")
                }
                style={{
                  animationDelay:
                    `${Math.min(
                      occurrenceIndex * 14,
                      140,
                    )}ms`,
                }}
              >
                <span
                  dir={
                    isHebrew
                      ? "rtl"
                      : "ltr"
                  }
                  className="text-[1.48rem] font-medium leading-tight text-[var(--foreground)]"
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
                  {rendering ||
                    (entityId &&
                    !detailLoaded
                      ? "..."
                      : "â€”")}
                </span>
              </button>
            );
          },
        )}
      </div>

      {selectedHere ? (
        <SelectedWordDetails
          occurrence={selectedHere}
          corpus={sourceVerse.source}
          translation={translation}
          detail={selectedDetail}
          detailLoading={
            selectedDetailLoading
          }
          onOpenWordOverview={
            onOpenWordOverview
          }
        />
      ) : null}
    </section>
  );
}

export default function SourceBreakdownSheet({
  data,
  verseText,
  onClose,
}: SourceBreakdownSheetProps) {
  const [
    selectedOccurrence,
    setSelectedOccurrence,
  ] =
    useState<SourceBreakdownOccurrence | null>(
      null,
    );

  const [
    wordOverviewOccurrence,
    setWordOverviewOccurrence,
  ] =
    useState<SourceBreakdownOccurrence | null>(
      null,
    );

  const [
    entityDetails,
    setEntityDetails,
  ] =
    useState<EntityDetailMap>({});

  const uniqueEntityOccurrences =
    useMemo(() => {
      const byEntity =
        new Map<
          string,
          SourceBreakdownOccurrence
        >();

      for (const sourceVerse of data.sourceVerses) {
        for (const occurrence of sourceVerse.occurrences) {
          if (
            occurrence.entityId &&
            occurrence.lexicalId &&
            !occurrence.grammarOnly &&
            !byEntity.has(
              occurrence.entityId,
            )
          ) {
            byEntity.set(
              occurrence.entityId,
              occurrence,
            );
          }
        }
      }

      return Array.from(
        byEntity.values(),
      );
    }, [data.sourceVerses]);

  useEffect(() => {
    const scrollY =
      window.scrollY;

    const originalOverflow =
      document.body.style.overflow;

    const originalPosition =
      document.body.style.position;

    const originalTop =
      document.body.style.top;

    const originalWidth =
      document.body.style.width;

    document.body.style.overflow =
      "hidden";

    document.body.style.position =
      "fixed";

    document.body.style.top =
      `-${scrollY}px`;

    document.body.style.width =
      "100%";

    return () => {
      document.body.style.overflow =
        originalOverflow;

      document.body.style.position =
        originalPosition;

      document.body.style.top =
        originalTop;

      document.body.style.width =
        originalWidth;

      window.scrollTo(
        0,
        scrollY,
      );
    };
  }, []);

  useEffect(() => {
    const controller =
      new AbortController();

    setEntityDetails({});

    async function loadEntityDetails() {
      const results =
        await Promise.all(
          uniqueEntityOccurrences.map(
            async (occurrence) => {
              const entityId =
                occurrence.entityId || "";

              const query =
                new URLSearchParams({
                  entityId,
                  displayWord:
                    occurrence.lexicalId ||
                    entityId,
                  book:
                    data.displayedReference.book,
                  chapter:
                    String(
                      data.displayedReference
                        .chapter,
                    ),
                  verse:
                    String(
                      data.displayedReference
                        .verse,
                    ),
                  translation:
                    data.translation,
                  selectedText:
                    displaySourceSurface(
                      occurrence,
                      data.corpus,
                    ),
                  originalWord:
                    occurrence.surface,
                  verseText,
                });

              try {
                const response =
                  await fetch(
                    `/api/word-study?${query.toString()}`,
                    {
                      cache: "no-store",
                      signal:
                        controller.signal,
                    },
                  );

                if (!response.ok) {
                  return [
                    entityId,
                    null,
                  ] as const;
                }

                const json =
                  (await response.json()) as
                    SelectedEntityDetails;

                return [
                  entityId,
                  json.resolved === false
                    ? null
                    : json,
                ] as const;
              } catch (error) {
                if (
                  error instanceof DOMException &&
                  error.name === "AbortError"
                ) {
                  return null;
                }

                return [
                  entityId,
                  null,
                ] as const;
              }
            },
          ),
        );

      if (
        controller.signal.aborted
      ) {
        return;
      }

      const next: EntityDetailMap =
        {};

      for (const result of results) {
        if (!result) {
          continue;
        }

        next[result[0]] =
          result[1];
      }

      setEntityDetails(next);
    }

    void loadEntityDetails();

    return () => {
      controller.abort();
    };
  }, [
    data.corpus,
    data.displayedReference.book,
    data.displayedReference.chapter,
    data.displayedReference.verse,
    data.translation,
    uniqueEntityOccurrences,
    verseText,
  ]);

  if (
    wordOverviewOccurrence &&
    wordOverviewOccurrence.lexicalId
  ) {
    const overviewSurface =
      displaySourceSurface(
        wordOverviewOccurrence,
        data.corpus,
      );

    return (
      <WordStudySheet
        entityId={
          wordOverviewOccurrence.entityId ??
          undefined
        }
        word={
          overviewSurface
        }
        book={
          data.displayedReference.book
        }
        chapter={
          data.displayedReference
            .chapter
        }
        verse={
          Number(
            data.displayedReference
              .verse,
          )
        }
        translation={
          data.translation
        }
        selectedText={
          overviewSurface
        }
        originalWord={
          overviewSurface
        }
        verseText={
          verseText
        }
        onClose={() =>
          setWordOverviewOccurrence(
            null,
          )
        }
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[65] overflow-hidden">
      <button
        type="button"
        aria-label="Close Source Text"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />

      <section className="absolute bottom-0 left-1/2 flex max-h-[90dvh] w-full max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-t-[2rem] border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] shadow-2xl">
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <div className="h-1.5 w-11 rounded-full bg-[var(--border)]" />
        </div>

        <header className="shrink-0 border-b border-[var(--border)] px-5 pb-4 pt-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                Source Text
              </div>

              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                {
                  data.displayedReference
                    .book
                }{" "}
                {
                  data.displayedReference
                    .chapter
                }
                :
                {
                  data.displayedReference
                    .verse
                }
              </h2>

              <div className="mt-1 text-sm text-[var(--muted)]">
                {corpusTitle(
                  data.corpus,
                )}
              </div>
            </div>

            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-lg text-[var(--muted)]"
            >
              &times;
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5 overscroll-contain">
          <section className="pb-6">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              English - {
                translationTitle(
                  data.translation,
                )
              }
            </div>

            <div className="mt-3 text-[1.05rem] leading-8 text-[var(--foreground)]">
              <ScriptureText
                text={verseText}
                reference={`${data.displayedReference.book} ${data.displayedReference.chapter}:${data.displayedReference.verse}`}
                verseNumber={
                  Number(
                    data.displayedReference
                      .verse,
                  )
                }
                interactionMode="plain"
              />
            </div>
          </section>

          <section className="border-t border-[var(--border)] pt-6">
            <div className="mb-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                Original Language
              </div>

              <div className="mt-1 text-sm text-[var(--muted)]">
                English renderings appear under each source word. Tap a source word for lexical details.
              </div>
            </div>

            {data.sourceVerses.map(
              (
                sourceVerse,
                index,
              ) => (
                <SourceVerseBlock
                  key={
                    sourceVerse.sourceKey ||
                    `${sourceVerse.reference}-${index}`
                  }
                  sourceVerse={
                    sourceVerse
                  }
                  index={index}
                  total={
                    data.sourceVerses
                      .length
                  }
                  translation={
                    data.translation
                  }
                  entityDetails={
                    entityDetails
                  }
                  selectedOccurrence={
                    selectedOccurrence
                  }
                  onOccurrence={
                    setSelectedOccurrence
                  }
                  onOpenWordOverview={
                    setWordOverviewOccurrence
                  }
                />
              ),
            )}
          </section>
        </div>
      </section>

      <style>{`
        @keyframes emetSourceWordReveal {
          0% {
            opacity: 0.28;
            filter: blur(1.75px) contrast(0.78);
            text-shadow:
              -1px 0 0 currentColor,
              1px 0 0 currentColor,
              0 0 2px currentColor;
            transform: translateY(1px);
          }
          58% {
            opacity: 0.82;
            filter: blur(0.45px) contrast(0.96);
            text-shadow:
              -0.35px 0 0 currentColor,
              0.35px 0 0 currentColor;
          }
          100% {
            opacity: 1;
            filter: blur(0) contrast(1);
            text-shadow: none;
            transform: translateY(0);
          }
        }

        @keyframes emetSourceWordResolve {
          0% {
            filter: blur(0.9px);
            text-shadow:
              -0.55px 0 0 currentColor,
              0.55px 0 0 currentColor;
          }
          100% {
            filter: blur(0);
            text-shadow: none;
          }
        }

        .emet-source-word-reveal {
          animation:
            emetSourceWordReveal
            340ms
            cubic-bezier(0.2, 0.75, 0.25, 1)
            both;
        }

        .emet-source-word-selected {
          animation:
            emetSourceWordResolve
            240ms
            ease-out
            both;
        }

        .emet-source-word-detail {
          animation:
            emetSourceWordResolve
            240ms
            ease-out
            both;
        }

        @media (prefers-reduced-motion: reduce) {
          .emet-source-word-reveal,
          .emet-source-word-selected,
          .emet-source-word-detail {
            animation: none !important;
            filter: none !important;
            text-shadow: none !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
