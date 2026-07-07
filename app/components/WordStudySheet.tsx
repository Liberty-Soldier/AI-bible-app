"use client";

import Link from "next/link";
import {
  PointerEvent,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

type SheetSnap = "compact" | "expanded";

const INITIAL_OCCURRENCE_COUNT = 8;
const OCCURRENCE_INCREMENT = 8;

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

function cleanList(values: string[] | undefined) {
  return (values || []).map((value) => String(value).trim()).filter(Boolean);
}

function hasAny(values: string[] | undefined) {
  return cleanList(values).length > 0;
}

function getTranslationLabel(value?: string) {
  if (!value) return "";
  const normalized = value.toLowerCase();

  if (normalized === "web") return "WEB";
  if (normalized === "kjv") return "KJV";
  if (normalized === "brenton") return "Brenton LXX";
  if (normalized === "lxx") return "Greek LXX";
  if (normalized === "hebrew") return "Hebrew";
  if (normalized === "gnt") return "Greek NT";

  return value.toUpperCase();
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
  const [snap, setSnap] = useState<SheetSnap>("compact");
  const [visibleOccurrenceCount, setVisibleOccurrenceCount] = useState(
    INITIAL_OCCURRENCE_COUNT
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragStartYRef = useRef<number | null>(null);

  const pathname = usePathname();
  const searchParams = useSearchParams();

  const expanded = snap === "expanded";
  const sheetKey = `${word || ""}-${data?.entity?.id || "loading"}`;

  const returnTo = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!word) return;

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
  }, [word]);

  useLayoutEffect(() => {
    setVisibleOccurrenceCount(INITIAL_OCCURRENCE_COUNT);
    setSnap("compact");

    const node = scrollRef.current;
    if (node) {
      node.scrollTop = 0;
    }
  }, [word, data?.entity?.id]);

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
  const definitions = entity?.evidence.definitions;
  const context = entity?.contextConnections;
  const occurrences = entity?.evidence.occurrences || [];

  const uniqueOccurrences = occurrences.filter(
    (occurrence, index, list) =>
      list.findIndex((item) => item.reference === occurrence.reference) === index
  );

  const visibleOccurrences = uniqueOccurrences.slice(0, visibleOccurrenceCount);
  const hasMoreOccurrences =
    visibleOccurrenceCount < uniqueOccurrences.length;

  const hasContextConnections =
    hasAny(context?.people) ||
    hasAny(context?.places) ||
    hasAny(context?.events) ||
    hasAny(context?.concepts) ||
    hasAny(context?.themes) ||
    hasAny(context?.laterReferences);

  const hasOriginalLanguage =
    original?.source ||
    original?.word ||
    original?.transliteration ||
    original?.pronunciation ||
    original?.strong ||
    original?.partOfSpeech ||
    original?.forms?.length;

  const hasEvidence =
    entity?.evidence.firstMention ||
    entity?.evidence.keyReferences?.length ||
    definitions?.short ||
    definitions?.usage ||
    definitions?.sources?.length;

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    dragStartYRef.current = event.clientY;
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    const startY = dragStartYRef.current;
    dragStartYRef.current = null;

    if (startY === null) {
      setSnap((value) => (value === "expanded" ? "compact" : "expanded"));
      return;
    }

    const delta = event.clientY - startY;

    if (delta < -24) {
      setSnap("expanded");
      return;
    }

    if (delta > 24) {
      setSnap("compact");
      return;
    }

    setSnap((value) => (value === "expanded" ? "compact" : "expanded"));
  }

return (
  <div className="fixed inset-0 z-[70] overflow-hidden">
    <button
      aria-label="Close BibleIQ"
      className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      onClick={onClose}
    />

    <section className="absolute bottom-0 left-1/2 flex h-[88dvh] w-full max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-t-[2rem] border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] shadow-2xl">
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--background)] px-5 py-4">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[var(--border)]" />

        <div className="flex items-center justify-between gap-4">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.34em] text-[var(--muted)]">
            BibleIQ
          </p>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--muted)]"
          >
            Close
          </button>
        </div>
      </div>

      <div
        key={sheetKey}
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 pb-24"
      >
        <header className="mb-7">
          <h2 className="break-words text-[2.35rem] font-bold leading-[1.02] tracking-[-0.045em]">
            {entity?.title || word}
          </h2>

          {entity?.subtitle ? (
            <p className="mt-3 max-w-[32ch] text-[0.95rem] leading-6 text-[var(--muted)]">
              {entity.subtitle}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-2">
            <MetaPill>
              {book} {chapter}
              {verse ? `:${verse}` : ""}
            </MetaPill>
            <MetaPill>{getTranslationLabel(translation)}</MetaPill>
            {original?.source ? <MetaPill>{original.source}</MetaPill> : null}
          </div>
        </header>

        <main className="space-y-5">
          {loading ? (
            <Panel>
              <p className="text-sm font-semibold text-[var(--muted)]">
                Loading BibleIQ...
              </p>
            </Panel>
          ) : entity ? (
            <>
              <Panel>
                <div className="space-y-7">
                  <SectionText
                    label="Simple Meaning"
                    text={entity.simple.meaning || entity.title}
                    prominent
                  />

                  <SectionText
                    label="Biblical Background"
                    text={entity.simple.biblicalBackground}
                  />

                  <SectionText
                    label="In This Verse"
                    text={entity.simple.inThisVerse}
                  />

                  <SectionText
                    label="Why It Matters"
                    text={entity.simple.whyItMatters}
                  />

                  <SectionText
                    label="Summary"
                    text={entity.simple.summary}
                    muted
                  />
                </div>
              </Panel>

              {hasContextConnections ? (
                <Panel>
                  <SectionHeading
                    eyebrow="Context Connections"
                    title="Where this word connects"
                  />

                  <div className="mt-5 space-y-5">
                    <ConnectionGroup label="People" values={context?.people} />
                    <ConnectionGroup label="Places" values={context?.places} />
                    <ConnectionGroup label="Events" values={context?.events} />
                    <ConnectionGroup label="Concepts" values={context?.concepts} />
                    <ConnectionGroup label="Themes" values={context?.themes} />
                    <ConnectionGroup
                      label="Later References"
                      values={context?.laterReferences}
                    />
                  </div>
                </Panel>
              ) : null}

              {hasOriginalLanguage ? (
                <OriginalLanguagePanel original={original} />
              ) : null}

              {hasEvidence ? (
                <Panel>
                  <SectionHeading
                    eyebrow="Evidence"
                    title="Source-level support"
                  />

                  <div className="mt-5 space-y-4">
                    {entity.evidence.firstMention ? (
                      <EvidenceTimelineItem
                        label="First Mention"
                        value={entity.evidence.firstMention}
                      />
                    ) : null}

                    {entity.evidence.keyReferences?.length ? (
                      <EvidenceTimelineItem
                        label="Key References"
                        value={entity.evidence.keyReferences.join(", ")}
                      />
                    ) : null}

                    {definitions?.short ? (
                      <EvidenceTimelineItem
                        label="Short Definition"
                        value={definitions.short}
                      />
                    ) : null}

                    {definitions?.usage ? (
                      <EvidenceTimelineItem
                        label="Usage"
                        value={definitions.usage}
                      />
                    ) : null}

                    {definitions?.sources?.length ? (
                      <EvidenceTimelineItem
                        label="Sources"
                        value={definitions.sources.join(", ")}
                        last
                      />
                    ) : null}
                  </div>
                </Panel>
              ) : null}

              {uniqueOccurrences.length ? (
                <Panel>
                  <SectionHeading
                    eyebrow="Occurrences"
                    title={`${uniqueOccurrences.length} listed occurrence${
                      uniqueOccurrences.length === 1 ? "" : "s"
                    }`}
                  />

                  <div className="mt-5 space-y-3">
                    {visibleOccurrences.map((occurrence, index) => (
                      <OccurrenceCard
                        key={`${occurrence.reference}-${index}`}
                        occurrence={occurrence}
                        returnTo={returnTo}
                      />
                    ))}
                  </div>

                  {hasMoreOccurrences ? (
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleOccurrenceCount(
                          (count) => count + OCCURRENCE_INCREMENT
                        )
                      }
                      className="mt-5 w-full rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-bold text-[var(--muted)]"
                    >
                      Load More Occurrences
                    </button>
                  ) : null}
                </Panel>
              ) : null}
            </>
          ) : (
            <Panel>
              <SectionHeading eyebrow="BibleIQ" title="No explanation loaded yet" />
              <p className="mt-4 text-base leading-7 text-[var(--muted)]">
                {data?.message ||
                  "This word still needs source-level evidence mapping."}
              </p>
            </Panel>
          )}
        </main>
      </div>
    </section>
  </div>
);
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-[1.55rem] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
      {children}
    </section>
  );
}

function MetaPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--muted)]">
      {children}
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title?: string;
}) {
  return (
    <div>
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.28em] text-[var(--muted)]">
        {eyebrow}
      </p>
      {title ? (
        <h3 className="mt-2 text-xl font-bold leading-tight tracking-[-0.02em]">
          {title}
        </h3>
      ) : null}
    </div>
  );
}

function SectionText({
  label,
  text,
  prominent,
  muted,
}: {
  label: string;
  text?: string;
  prominent?: boolean;
  muted?: boolean;
}) {
  if (!text) return null;

  return (
    <section>
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.28em] text-[var(--muted)]">
        {label}
      </p>

      <p
        className={`mt-2 leading-8 ${
          prominent
            ? "text-[1.32rem] font-bold tracking-[-0.025em] text-[var(--foreground)]"
            : muted
            ? "text-[1rem] text-[var(--muted)]"
            : "text-[1.03rem] text-[var(--foreground)]"
        }`}
      >
        {text}
      </p>
    </section>
  );
}

function ConnectionGroup({
  label,
  values,
}: {
  label: string;
  values?: string[];
}) {
  const clean = cleanList(values);
  if (!clean.length) return null;

  return (
    <section>
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
        {label}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {clean.map((value) => (
          <span
            key={value}
            className="rounded-full border border-[var(--border)] bg-[var(--background)] px-3.5 py-2 text-sm font-semibold leading-none text-[var(--foreground)]"
          >
            {value}
          </span>
        ))}
      </div>
    </section>
  );
}

function OriginalLanguagePanel({
  original,
}: {
  original:
    | {
        source?: string;
        word?: string;
        transliteration?: string;
        pronunciation?: string;
        strong?: string;
        partOfSpeech?: string;
        forms?: string[];
      }
    | undefined;
}) {
  return (
    <Panel>
      <SectionHeading eyebrow="Original Language" title="Source word panel" />

      <div className="mt-5 rounded-[1.35rem] border border-[var(--border)] bg-[var(--background)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-[var(--muted)]">
              Word
            </p>
            <p className="mt-2 break-words text-[2.1rem] font-bold leading-none tracking-[-0.04em]">
              {original?.word || "—"}
            </p>
          </div>

          {original?.strong ? (
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--muted)]">
              {original.strong}
            </span>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3">
          <LanguageInfoRow label="Source" value={original?.source} />
          <LanguageInfoRow
            label="Transliteration"
            value={original?.transliteration}
          />
          <LanguageInfoRow
            label="Pronunciation"
            value={original?.pronunciation}
          />
          <LanguageInfoRow
            label="Part of Speech"
            value={original?.partOfSpeech}
          />
        </div>

        {original?.forms?.length ? (
          <div className="mt-6">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
              Common Forms
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {original.forms.slice(0, 10).map((form) => (
                <span
                  key={form}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold"
                >
                  {form}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function LanguageInfoRow({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  if (!value) return null;

  return (
    <div className="flex items-start justify-between gap-5 border-t border-[var(--border)] pt-3 first:border-t-0 first:pt-0">
      <p className="shrink-0 text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
        {label}
      </p>
      <p className="min-w-0 break-words text-right text-sm font-bold leading-6">
        {value}
      </p>
    </div>
  );
}

function EvidenceTimelineItem({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div className="relative grid grid-cols-[1.1rem_1fr] gap-3">
      <div className="relative flex justify-center">
        <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-[var(--foreground)]" />
        {!last ? (
          <span className="absolute top-5 h-[calc(100%+0.65rem)] w-px bg-[var(--border)]" />
        ) : null}
      </div>

      <div className="pb-1">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
          {label}
        </p>
        <p className="mt-1 break-words text-[0.98rem] font-semibold leading-7 text-[var(--foreground)]">
          {value}
        </p>
      </div>
    </div>
  );
}

function OccurrenceCard({
  occurrence,
  returnTo,
}: {
  occurrence: BibleIQOccurrence;
  returnTo: string;
}) {
  const href = buildOccurrenceHref(occurrence, returnTo);

  const content = (
    <article className="rounded-[1.2rem] border border-[var(--border)] bg-[var(--background)] p-4 transition active:scale-[0.99]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-lg font-bold tracking-[-0.02em]">
          {occurrence.reference}
        </p>

        {occurrence.book ? (
          <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
            {getOccurrenceTranslation(
              normalizeBookName(occurrence.book) || occurrence.book
            ).toUpperCase()}
          </span>
        ) : null}
      </div>

      {occurrence.englishText ? (
        <p className="mt-3 text-[0.98rem] italic leading-7 text-[var(--foreground)]">
          “{occurrence.englishText}”
        </p>
      ) : null}

      {occurrence.sourceWord ? (
        <div className="mt-4 rounded-xl bg-[var(--surface)] px-3 py-2">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
            Source Word
          </p>
          <p className="mt-1 break-words text-sm font-bold">
            {occurrence.sourceWord}
          </p>
        </div>
      ) : null}
    </article>
  );

  return href ? (
    <Link href={href} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}