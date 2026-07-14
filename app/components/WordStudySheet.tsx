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
import { usePathname, useSearchParams } from "next/navigation";
import { normalizeBookName } from "@/app/data/bookAliases";
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
  if (normalized === "gnt" || normalized === "greek-nt") return "Greek NT";

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
    if (node) node.scrollTop = 0;
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

if (!response.ok) {
  throw new Error(`Word study request failed: ${response.status}`);
}

const json = (await response.json()) as BibleIQResponse;

if (!cancelled) {
  setData(json);
}

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
const original = entity?.evidence?.originalLanguage;
const context = entity?.contextConnections;
const occurrences = entity?.evidence?.occurrences || [];
const see = entity?.see;
const alignment = entity?.alignment;
const emet = entity?.emet;

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

      <section
        className={`absolute bottom-0 left-1/2 flex w-full max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-t-[2rem] border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] shadow-2xl ${
          snap === "expanded" ? "h-[88dvh]" : "h-[72dvh]"
        }`}
      >
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--background)] px-5 py-4">
          <button
            type="button"
            aria-label="Resize BibleIQ panel"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            className="mx-auto mb-4 block h-1.5 w-12 rounded-full bg-[var(--border)]"
          />

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

            <p className="mt-3 max-w-[34ch] text-[0.95rem] leading-6 text-[var(--muted)]">
              {entity?.subtitle || "Scripture evidence"}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <MetaPill>
                {book} {chapter}
                {verse ? `:${verse}` : ""}
              </MetaPill>
              <MetaPill>{getTranslationLabel(translation)}</MetaPill>
              {alignment?.source ? <MetaPill>{alignment.source}</MetaPill> : null}
              {alignment?.strong ? <MetaPill>{alignment.strong}</MetaPill> : null}
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
                <EmetPanel
                  status={emet?.status}
                  explanation={emet?.explanation}
                  citations={emet?.citations}
                />

                {see ? <SeeEvidencePanel see={see} /> : null}

                {alignment ? (
                  <SourceAlignmentPanel alignment={alignment} original={original} />
                ) : null}

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
                      <ConnectionGroup
                        label="Concepts"
                        values={context?.concepts}
                      />
                      <ConnectionGroup label="Themes" values={context?.themes} />
                      <ConnectionGroup
                        label="Later References"
                        values={context?.laterReferences}
                      />
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

function EmetPanel({
  status,
  explanation,
  citations,
}: {
  status?: string;
  explanation?: string;
  citations?: string[];
}) {
  const ready = status === "complete" && explanation;

  return (
    <Panel>
      <SectionHeading
        eyebrow="EMET"
        title={ready ? "Explanation" : "Evidence-ready explanation"}
      />

      {ready ? (
        <p className="mt-5 text-[1.05rem] leading-8 text-[var(--foreground)]">
          {explanation}
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          <p className="text-[1.05rem] leading-8 text-[var(--foreground)]">
            EMET will explain this word from the SEE evidence packet. The AI
            will not create evidence; it will only interpret the structured
            evidence already compiled from Scripture.
          </p>

          <p className="rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-semibold leading-6 text-[var(--muted)]">
            Status: {status || "pending"}
          </p>
        </div>
      )}

      {citations?.length ? (
        <div className="mt-5">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
            Evidence References
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {citations.map((citation) => (
              <span
                key={citation}
                className="rounded-full border border-[var(--border)] bg-[var(--background)] px-3.5 py-2 text-sm font-semibold"
              >
                {citation}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function SeeEvidencePanel({
  see,
}: {
  see: {
    evidenceId: string;
    countId: string;
    occurrenceCount: number;
    firstOccurrence?: string;
    lastOccurrence?: string;
    relationshipCount: number;
    eventCount: number;
    themeCount: number;
  };
}) {
  return (
    <Panel>
      <SectionHeading eyebrow="SEE Evidence" title="Structured Scripture data" />

      <div className="mt-5 grid grid-cols-2 gap-3">
        <EvidenceStat label="Occurrences" value={see.occurrenceCount} />
        <EvidenceStat label="Relationships" value={see.relationshipCount} />
        <EvidenceStat label="Events" value={see.eventCount} />
        <EvidenceStat label="Themes" value={see.themeCount} />
      </div>

      <div className="mt-5 space-y-3">
        <InfoRow label="First Occurrence" value={see.firstOccurrence} />
        <InfoRow label="Last Occurrence" value={see.lastOccurrence} />
        <InfoRow label="SEE ID" value={see.evidenceId} />
        <InfoRow label="Count ID" value={see.countId} />
      </div>
    </Panel>
  );
}

function EvidenceStat({
  label,
  value,
}: {
  label: string;
  value?: number;
}) {
  return (
    <div className="rounded-[1.15rem] border border-[var(--border)] bg-[var(--background)] p-4">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tracking-[-0.04em]">
        {(value ?? 0).toLocaleString()}
      </p>
    </div>
  );
}

function SourceAlignmentPanel({
  alignment,
  original,
}: {
  alignment: {
    selectedEnglish?: string;
    sourceWord?: string;
    source?: string;
    strong?: string;
    lemma?: string;
    morph?: string;
    entityId?: string;
    seeEvidenceId?: string;
  };
  original:
    | {
        word?: string;
      }
    | undefined;
}) {
  return (
    <Panel>
      <SectionHeading eyebrow="Source Alignment" title="English to source text" />

      <div className="mt-5 rounded-[1.35rem] border border-[var(--border)] bg-[var(--background)] p-5">
        <div className="grid grid-cols-1 gap-3">
          <InfoRow label="Selected English" value={alignment.selectedEnglish} />
          <InfoRow
            label="Source Word"
            value={alignment.sourceWord || original?.word}
          />
          <InfoRow label="Lemma" value={alignment.lemma} />
          <InfoRow label="Strong" value={alignment.strong} />
          <InfoRow label="Morphology" value={alignment.morph} />
          <InfoRow label="Source" value={alignment.source} />
          <InfoRow label="Entity ID" value={alignment.entityId} />
        </div>
      </div>
    </Panel>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
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