"use client";

import { useEffect, useState } from "react";

import WordStudySheet from "@/app/components/WordStudySheet";

import type {
  SourceBreakdownOccurrence,
  SourceBreakdownResult,
  SourceBreakdownSourceVerse,
} from "@/app/data/bibleiq/SourceBreakdownRuntime";

type SourceBreakdownSheetProps = {
  data: SourceBreakdownResult;
  verseText: string;
  onClose: () => void;
};

function corpusTitle(
  corpus: SourceBreakdownResult["corpus"]
) {
  if (corpus === "hebrew") {
    return "Hebrew Source";
  }

  if (corpus === "greek-nt") {
    return "Greek New Testament";
  }

  return "Greek Septuagint";
}

function lexicalLabel(
  occurrence: SourceBreakdownOccurrence
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
  occurrence: SourceBreakdownOccurrence
) {
  return (
    occurrence.morphologyEnglish ||
    occurrence.morphology ||
    null
  );
}

function OccurrenceContent({
  occurrence,
}: {
  occurrence: SourceBreakdownOccurrence;
}) {
  const morphology =
    occurrenceMorphology(
      occurrence
    );

  const lexical =
    lexicalLabel(
      occurrence
    );

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div
            dir={
              /[\u0590-\u05FF]/.test(
                occurrence.surface
              )
                ? "rtl"
                : "ltr"
            }
            className="text-2xl font-semibold leading-tight text-[var(--foreground)]"
          >
            {occurrence.surface}
          </div>

          {occurrence.transliteration ? (
            <div className="mt-1 text-sm italic text-[var(--muted)]">
              {occurrence.transliteration}
            </div>
          ) : null}
        </div>

        {lexical ? (
          <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
            {lexical}
          </span>
        ) : occurrence.grammarOnly ? (
          <span className="shrink-0 rounded-full border border-[var(--border)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Grammar
          </span>
        ) : null}
      </div>

      {occurrence.meaning ? (
        <div className="mt-2 text-sm font-medium leading-relaxed text-[var(--foreground)]">
          {occurrence.meaning}
        </div>
      ) : null}

      <div className="mt-2 space-y-1 text-xs leading-relaxed text-[var(--muted)]">
        {occurrence.lemma ? (
          <div>
            <span className="font-semibold">
              Lemma:
            </span>{" "}
            {occurrence.lemma}
          </div>
        ) : null}

        {morphology ? (
          <div>
            <span className="font-semibold">
              Morphology:
            </span>{" "}
            {morphology}
          </div>
        ) : null}

        {occurrence.partOfSpeech ? (
          <div>
            <span className="font-semibold">
              Part of speech:
            </span>{" "}
            {occurrence.partOfSpeech}
          </div>
        ) : null}

        {occurrence.grammarOnly &&
        !occurrence.lexicalId ? (
          <div>
            No standalone lexical ID.
          </div>
        ) : null}
      </div>
    </>
  );
}

function SourceVerseBlock({
  sourceVerse,
  index,
  total,
  onOccurrence,
}: {
  sourceVerse: SourceBreakdownSourceVerse;
  index: number;
  total: number;
  onOccurrence: (
    occurrence: SourceBreakdownOccurrence
  ) => void;
}) {
  return (
    <section className="border-t border-[var(--border)] py-5 first:border-t-0 first:pt-0">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
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

        <div className="max-w-[48%] text-right text-[10px] uppercase tracking-wide text-[var(--muted)]">
          {sourceVerse.orderAuthority}
        </div>
      </div>

      <div className="space-y-2.5">
        {sourceVerse.occurrences.map(
          (occurrence) => {
            const lexical =
              Boolean(
                occurrence.lexicalId &&
                  occurrence.entityId &&
                  !occurrence.grammarOnly
              );

            if (!lexical) {
              return (
                <div
                  key={occurrence.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/55 p-4"
                >
                  <OccurrenceContent
                    occurrence={
                      occurrence
                    }
                  />
                </div>
              );
            }

            return (
              <button
                type="button"
                key={occurrence.id}
                onClick={() =>
                  onOccurrence(
                    occurrence
                  )
                }
                className="block w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)]/70 p-4 text-left transition hover:bg-[var(--surface)] active:scale-[0.995]"
              >
                <OccurrenceContent
                  occurrence={
                    occurrence
                  }
                />

                <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Open Word Overview →
                </div>
              </button>
            );
          }
        )}
      </div>
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
      null
    );

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
        scrollY
      );
    };
  }, []);

  if (
    selectedOccurrence &&
    selectedOccurrence.lexicalId
  ) {
    return (
      <WordStudySheet
        entityId={selectedOccurrence.entityId ?? undefined}
        word={
          selectedOccurrence.lexicalId
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
              .verse
          )
        }
        translation={
          data.translation
        }
        selectedText={
          selectedOccurrence.surface
        }
        originalWord={
          selectedOccurrence.surface
        }
        verseText={
          verseText
        }
        onClose={() =>
          setSelectedOccurrence(
            null
          )
        }
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[65] overflow-hidden">
      <button
        type="button"
        aria-label="Close Source Breakdown"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />

      <section className="absolute bottom-0 left-1/2 flex max-h-[88dvh] w-full max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-t-[2rem] border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] shadow-2xl">
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <div className="h-1.5 w-11 rounded-full bg-[var(--border)]" />
        </div>

        <header className="shrink-0 border-b border-[var(--border)] px-5 pb-4 pt-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                Source Breakdown
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
                  data.corpus
                )}
              </div>
            </div>

            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-lg text-[var(--muted)]"
            >
              ×
            </button>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            Original-language occurrences
            are shown in canonical source
            order. Tap a lexical word for
            Word Overview.
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5 overscroll-contain">
          {data.sourceVerses.map(
            (
              sourceVerse,
              index
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
                onOccurrence={
                  setSelectedOccurrence
                }
              />
            )
          )}
        </div>
      </section>
    </div>
  );
}
