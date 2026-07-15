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
import EmetseesWordmark from "@/app/components/branding/EmetseesWordmark";
import { usePremiumAccess } from "@/app/components/premium/PremiumAccessProvider";
import type {
  BibleIQEntityEvidence,
  BibleIQKnowledgeExample,
  BibleIQOccurrence,
  BibleIQReference,
  BibleIQResponse,
  BibleIQSeeKnowledge,
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
const SOURCE_FORM_LIMIT = 16;
const RENDERING_FORM_LIMIT = 12;
const KNOWLEDGE_EXAMPLE_LIMIT = 8;

function buildReferenceHref(
  reference: BibleIQReference | BibleIQOccurrence | null | undefined,
  returnTo: string,
) {
  if (!reference?.book || !reference.chapter) return null;

  const normalizedBook =
    normalizeBookName(reference.book) || reference.book;
  if (!normalizedBook) return null;

  return `/read/${encodeURIComponent(normalizedBook)}/${
    reference.chapter
  }?translation=${reference.routeTranslation}${
    reference.verse ? `&verse=${reference.verse}` : ""
  }&returnTo=${encodeURIComponent(returnTo)}`;
}

function getTranslationLabel(value?: string) {
  if (!value) return "";
  const normalized = value.toLowerCase();

  if (normalized === "web") return "WEB";
  if (normalized === "kjv") return "KJV";
  if (normalized === "brenton") return "Brenton LXX";
  if (normalized === "lxx") return "Greek LXX";
  if (normalized === "hebrew") return "Hebrew";
  if (normalized === "gnt" || normalized === "greek-nt") {
    return "Greek NT";
  }

  return value.toUpperCase();
}

function getSourceLabel(value?: string) {
  if (value === "greek-nt") return "Greek NT";
  if (value === "lxx") return "Greek LXX";
  if (value === "hebrew") return "Hebrew";
  return value || "";
}

function formatPercent(value?: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${((value || 0) * 100).toFixed(1)}%`;
}

function uniqueOccurrences(occurrences: BibleIQOccurrence[]) {
  const seen = new Set<string>();

  return occurrences.filter((occurrence) => {
    const key = `${occurrence.source}|${occurrence.book}|${occurrence.chapter}|${occurrence.verse}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const GREEK_DIGRAPHS: Record<string, string> = {
  αι: "ai",
  ει: "ei",
  οι: "oi",
  ου: "ou",
  αυ: "au",
  ευ: "eu",
  ηυ: "ēu",
  υι: "ui",
};

const GREEK_LETTERS: Record<string, string> = {
  α: "a", β: "b", γ: "g", δ: "d", ε: "e", ζ: "z", η: "ē",
  θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x",
  ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y",
  φ: "ph", χ: "ch", ψ: "ps", ω: "ō",
};

const HEBREW_CONSONANTS: Record<string, string> = {
  א: "", ב: "b", ג: "g", ד: "d", ה: "h", ו: "v", ז: "z",
  ח: "ch", ט: "t", י: "y", כ: "kh", ך: "kh", ל: "l", מ: "m",
  ם: "m", נ: "n", ן: "n", ס: "s", ע: "", פ: "f", ף: "f",
  צ: "ts", ץ: "ts", ק: "q", ר: "r", ש: "sh", ת: "t",
};

const HEBREW_VOWELS: Record<string, string> = {
  "\u05B0": "e", "\u05B1": "e", "\u05B2": "a", "\u05B3": "o",
  "\u05B4": "i", "\u05B5": "e", "\u05B6": "e", "\u05B7": "a",
  "\u05B8": "a", "\u05B9": "o", "\u05BA": "o", "\u05BB": "u",
};

const READER_TRANSLITERATION_OVERRIDES: Record<string, string> = {
  H3068: "YHWH",
  H3050: "Yah",
  H430: "Elohim",
  H8451: "Torah",
  H7676: "Shabbat",
  G2424: "Iēsous",
  G2316: "theos",
  G5547: "Christos",
  G2962: "kyrios",
};

function transliterateGreek(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  let output = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const pair = normalized.slice(index, index + 2);
    if (GREEK_DIGRAPHS[pair]) {
      output += GREEK_DIGRAPHS[pair];
      index += 1;
      continue;
    }
    output += GREEK_LETTERS[normalized[index]] || normalized[index];
  }

  if (/^[Α-ΩἈ-῾]/u.test(value) && output) {
    return output[0].toUpperCase() + output.slice(1);
  }
  return output;
}

function transliterateHebrew(value: string) {
  const characters = Array.from(value.normalize("NFD"));
  const clusters: { base: string; marks: string[] }[] = [];

  for (const character of characters) {
    if (/^[א-ת]$/u.test(character)) {
      clusters.push({ base: character, marks: [] });
    } else if (clusters.length && /^[\u0591-\u05C7]$/u.test(character)) {
      clusters[clusters.length - 1].marks.push(character);
    }
  }

  let output = "";
  let previousHadHiriq = false;

  for (const cluster of clusters) {
    const marks = new Set(cluster.marks);
    const hasDagesh = marks.has("\u05BC");
    const hasHolam = marks.has("\u05B9") || marks.has("\u05BA");
    const hasHiriq = marks.has("\u05B4");

    if (cluster.base === "י" && previousHadHiriq && cluster.marks.length === 0) {
      previousHadHiriq = false;
      continue;
    }

    let consonant = HEBREW_CONSONANTS[cluster.base] || "";
    if (cluster.base === "ב") consonant = hasDagesh ? "b" : "v";
    if (cluster.base === "כ" || cluster.base === "ך") consonant = hasDagesh ? "k" : "kh";
    if (cluster.base === "פ" || cluster.base === "ף") consonant = hasDagesh ? "p" : "f";
    if (cluster.base === "ש" && marks.has("\u05C2")) consonant = "s";
    if (cluster.base === "ו" && hasDagesh && !hasHolam) consonant = "";
    if (cluster.base === "ו" && hasHolam) consonant = "";

    let vowel = "";
    for (const mark of cluster.marks) {
      if (HEBREW_VOWELS[mark]) {
        vowel = HEBREW_VOWELS[mark];
        break;
      }
    }
    if (cluster.base === "ו" && hasDagesh && !vowel) vowel = "u";
    if (cluster.base === "ו" && hasHolam) vowel = "o";
    if (cluster.base === "א" || cluster.base === "ע") {
      consonant = "";
    }

    output += consonant + vowel;
    previousHadHiriq = hasHiriq;
  }

  return output.replace(/[^A-Za-zāēīōūḥṭṣšḵ]+/g, "");
}

function deriveReaderTransliteration(
  value?: string,
  source?: string,
  lexicalId?: string,
) {
  if (lexicalId && READER_TRANSLITERATION_OVERRIDES[lexicalId]) {
    return READER_TRANSLITERATION_OVERRIDES[lexicalId];
  }

  const clean = String(value || "").trim();
  if (!clean) return undefined;
  if (source === "hebrew") return transliterateHebrew(clean) || undefined;
  if (source === "greek-nt" || source === "lxx") {
    return transliterateGreek(clean) || undefined;
  }
  return undefined;
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
  const [visibleOccurrenceCount, setVisibleOccurrenceCount] =
    useState(INITIAL_OCCURRENCE_COUNT);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragStartYRef = useRef<number | null>(null);

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { requestUpgrade } = usePremiumAccess();

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
          }).toString()}`,
        );

        if (!response.ok) {
          throw new Error(
            `Word study request failed: ${response.status}`,
          );
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
            message: "EMETSEES could not load this word yet.",
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
  const occurrences = uniqueOccurrences(
    entity?.evidence?.occurrences || [],
  );
  const alignment = entity?.alignment;
  const emet = entity?.emet;
  const meaningInVerse = entity?.meaningInVerse;
  const entityEvidence = entity?.entityEvidence;
  const seeKnowledge = entity?.seeKnowledge;
  const keyReferences = entity?.keyReferences || [];
  const lexical = entityEvidence?.lexical;
  const sourceDisplay =
    alignment?.lemma || alignment?.sourceWord || original?.word;
  const transliteration =
    original?.transliteration ||
    lexical?.transliteration ||
    deriveReaderTransliteration(
      sourceDisplay,
      alignment?.source,
      alignment?.lexicalId,
    );
  const pronunciation =
    original?.pronunciation || lexical?.pronunciation;

  const visibleOccurrences = occurrences.slice(
    0,
    visibleOccurrenceCount,
  );
  const hasMoreOccurrences =
    visibleOccurrenceCount < occurrences.length;

  function handlePointerDown(
    event: PointerEvent<HTMLButtonElement>,
  ) {
    dragStartYRef.current = event.clientY;
  }

  function handlePointerUp(
    event: PointerEvent<HTMLButtonElement>,
  ) {
    const startY = dragStartYRef.current;
    dragStartYRef.current = null;

    if (startY === null) {
      setSnap((value) =>
        value === "expanded" ? "compact" : "expanded",
      );
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

    setSnap((value) =>
      value === "expanded" ? "compact" : "expanded",
    );
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-hidden">
      <button
        aria-label="Close EMETSEES word study"
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
            aria-label="Resize EMETSEES word study panel"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            className="mx-auto mb-4 block h-1.5 w-12 rounded-full bg-[var(--border)]"
          />

          <div className="flex items-center justify-between gap-4">
            <EmetseesWordmark compact />

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
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.25em] text-[var(--muted)]">
              Selected word
            </p>
            <h2 className="mt-2 break-words text-[2.35rem] font-bold leading-[1.02] tracking-[-0.045em]">
              {word}
            </h2>

            {alignment?.lemma || alignment?.sourceWord ? (
              <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                {alignment?.lemma ? (
                  <p className="break-words text-xl font-bold leading-tight">
                    {alignment.lemma}
                  </p>
                ) : null}
                {transliteration ? (
                  <p className="mt-2 break-words text-base font-bold">
                    {transliteration}
                  </p>
                ) : null}
                {pronunciation ? (
                  <p className="mt-1 break-words text-sm font-semibold text-[var(--muted)]">
                    Pronounced: {pronunciation}
                  </p>
                ) : null}
                {alignment?.sourceWord &&
                alignment.sourceWord !== alignment.lemma ? (
                  <p className="mt-2 break-words text-sm font-semibold text-[var(--muted)]">
                    Source form: {alignment.sourceWord}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 max-w-[34ch] text-[0.95rem] leading-6 text-[var(--muted)]">
                {entity?.subtitle || "Scripture evidence"}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <MetaPill>
                {book} {chapter}
                {verse ? `:${verse}` : ""}
              </MetaPill>
              <MetaPill>{getTranslationLabel(translation)}</MetaPill>
              {alignment?.source ? (
                <MetaPill>
                  {getSourceLabel(alignment.source)}
                </MetaPill>
              ) : null}
              {alignment?.lexicalId ? (
                <MetaPill>{alignment.lexicalId}</MetaPill>
              ) : null}
              {alignment?.strong &&
              alignment.source !== "lxx" &&
              alignment.strong !== alignment.lexicalId ? (
                <MetaPill>{alignment.strong}</MetaPill>
              ) : null}
            </div>
          </header>

          <main className="space-y-5">
            {loading ? (
              <Panel>
                <p className="text-sm font-semibold text-[var(--muted)]">
                  Loading word study...
                </p>
              </Panel>
            ) : entity ? (
              <>
                {emet?.status === "complete" && emet.explanation ? (
                  <EmetPanel
                    status={emet.status}
                    headline={emet.headline}
                    explanation={emet.explanation}
                    citations={emet.citations}
                  />
                ) : null}

                {meaningInVerse ? (
                  <MeaningInVersePanel
                    meaning={meaningInVerse}
                  />
                ) : null}

                {alignment ? (
                  <SourceAlignmentPanel
                    alignment={alignment}
                    original={original}
                    transliteration={transliteration}
                    pronunciation={pronunciation}
                  />
                ) : null}

                {entityEvidence ? (
                  <EntityEvidencePanel
                    evidence={entityEvidence}
                  />
                ) : null}

                {seeKnowledge?.available ? (
                  <SeeKnowledgePanel
                    knowledge={seeKnowledge}
                    returnTo={returnTo}
                  />
                ) : null}

                {keyReferences.length ? (
                  <ReferenceListPanel
                    eyebrow="Key References"
                    title={`${keyReferences.length} evidence reference${
                      keyReferences.length === 1 ? "" : "s"
                    }`}
                    references={keyReferences}
                    returnTo={returnTo}
                  />
                ) : null}

                {occurrences.length ? (
                  <Panel>
                    <SectionHeading
                      eyebrow="Occurrences"
                      title={`${occurrences.length} listed occurrence${
                        occurrences.length === 1 ? "" : "s"
                      }`}
                    />

                    <div className="mt-5 space-y-3">
                      {visibleOccurrences.map(
                        (occurrence, index) => (
                          <OccurrenceCard
                            key={`${occurrence.source}-${occurrence.reference}-${index}`}
                            occurrence={occurrence}
                            returnTo={returnTo}
                          />
                        ),
                      )}
                    </div>

                    {hasMoreOccurrences ? (
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleOccurrenceCount(
                            (count) =>
                              count + OCCURRENCE_INCREMENT,
                          )
                        }
                        className="mt-5 w-full rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-bold text-[var(--muted)]"
                      >
                        Load More Occurrences
                      </button>
                    ) : null}
                  </Panel>
                ) : null}
                <PremiumStudyPanel
                  contextLabel={`${word} • ${book} ${chapter}${
                    verse ? `:${verse}` : ""
                  }`}
                  onAsk={() =>
                    requestUpgrade(
                      "ask-emet",
                      `${word} • ${book} ${chapter}${
                        verse ? `:${verse}` : ""
                      }`,
                    )
                  }
                  onDeepStudy={() =>
                    requestUpgrade(
                      "deep-word-study",
                      `${word} • ${getSourceLabel(
                        alignment?.source,
                      )}`,
                    )
                  }
                />

              </>
            ) : (
              <Panel>
                <SectionHeading
                  eyebrow="EMETSEES"
                  title="No explanation loaded yet"
                />
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

function PremiumStudyPanel({
  contextLabel,
  onAsk,
  onDeepStudy,
}: {
  contextLabel: string;
  onAsk: () => void;
  onDeepStudy: () => void;
}) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-4">
        <SectionHeading
          eyebrow="Paid extensions"
          title="Go deeper without changing readers"
        />
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-[0.14em] text-amber-600 dark:text-amber-400">
          Locked
        </span>
      </div>

      <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
        SEE evidence and approved cached EMET explanations remain free.
        Live reasoning and guided deep study are paid additions.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onAsk}
          className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 text-left"
        >
          <p className="text-sm font-black">Ask EMET</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Ask a live contextual question about {contextLabel}.
          </p>
        </button>

        <button
          type="button"
          onClick={onDeepStudy}
          className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 text-left"
        >
          <p className="text-sm font-black">Deep Word Study</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Build an advanced guided study from this evidence.
          </p>
        </button>
      </div>
    </Panel>
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
  headline,
  explanation,
  citations,
}: {
  status?: string;
  headline?: string;
  explanation?: string;
  citations?: string[];
}) {
  if (status !== "complete" || !explanation) return null;

  return (
    <Panel>
      <SectionHeading
        eyebrow="EMET"
        title={headline || "Reader-first explanation"}
      />

      <p className="mt-5 text-[1.05rem] leading-8 text-[var(--foreground)]">
        {explanation}
      </p>

      {citations?.length ? (
        <div className="mt-5">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
            Scripture References
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

function MeaningInVersePanel({
  meaning,
}: {
  meaning: NonNullable<
    BibleIQResponse["entity"]
  >["meaningInVerse"];
}) {
  if (!meaning) return null;

  return (
    <Panel>
      <SectionHeading
        eyebrow="Meaning in this verse"
        title={meaning.reference}
      />

      <p className="mt-5 text-[1.02rem] leading-8">
        {meaning.statement}
      </p>

      {meaning.verseText ? (
        <blockquote className="mt-5 rounded-[1.2rem] border border-[var(--border)] bg-[var(--background)] px-4 py-4 text-base italic leading-7">
          “{meaning.verseText}”
        </blockquote>
      ) : null}
    </Panel>
  );
}

function SourceAlignmentPanel({
  alignment,
  original,
  transliteration,
  pronunciation,
}: {
  alignment: NonNullable<
    BibleIQResponse["entity"]
  >["alignment"];
  original:
    | {
        word?: string;
        transliteration?: string;
        pronunciation?: string;
      }
    | undefined;
  transliteration?: string;
  pronunciation?: string;
}) {
  if (!alignment) return null;

  return (
    <Panel>
      <SectionHeading
        eyebrow="Source Alignment"
        title="English to source text"
      />

      <div className="mt-5 rounded-[1.35rem] border border-[var(--border)] bg-[var(--background)] p-5">
        <div className="grid grid-cols-1 gap-3">
          <InfoRow
            label="Selected English"
            value={alignment.selectedEnglish}
          />
          <InfoRow
            label="Source Word"
            value={alignment.sourceWord || original?.word}
          />
          <InfoRow label="Lemma" value={alignment.lemma} />
          <InfoRow
            label="Transliteration"
            value={transliteration || original?.transliteration}
          />
          <InfoRow
            label="Pronunciation"
            value={pronunciation || original?.pronunciation}
          />
          <InfoRow
            label="Lexical ID"
            value={alignment.lexicalId}
          />
          {alignment.source !== "lxx" &&
          alignment.strong !== alignment.lexicalId ? (
            <InfoRow
              label="Strong"
              value={alignment.strong}
            />
          ) : null}
          <InfoRow
            label="Morphology"
            value={alignment.morph}
          />
          <InfoRow
            label="Corpus"
            value={getSourceLabel(alignment.source)}
          />
          <InfoRow
            label="Entity ID"
            value={alignment.entityId}
          />
        </div>
      </div>
    </Panel>
  );
}

function EntityEvidencePanel({
  evidence,
}: {
  evidence: BibleIQEntityEvidence;
}) {
  const lexical = evidence.lexical;
  const occurrence = evidence.occurrenceSummary;
  const sourceForms = lexical.sourceForms.slice(
    0,
    SOURCE_FORM_LIMIT,
  );
  const renderingForms = evidence.renderings.mostCommon.slice(
    0,
    RENDERING_FORM_LIMIT,
  );

  return (
    <Panel>
      <SectionHeading
        eyebrow="SEE Evidence"
        title="Usage across this source corpus"
      />

      <div className="mt-5 grid grid-cols-2 gap-3">
        <EvidenceStat
          label="Occurrences"
          value={
            occurrence.corpusOccurrenceCount ||
            occurrence.totalEntityOccurrences
          }
        />
        <EvidenceStat
          label="Verses"
          value={occurrence.uniqueVerseCount}
        />
        <EvidenceStat
          label="Aligned renderings"
          value={evidence.renderings.totalAlignedRenderings}
        />
        <EvidenceStat
          label="Alignment coverage"
          value={formatPercent(
            evidence.health.alignmentCoverage,
          )}
        />
      </div>

      <div className="mt-5 rounded-[1.2rem] border border-[var(--border)] bg-[var(--background)] p-4">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
          Lexical data
        </p>
        <div className="mt-4 space-y-3">
          <InfoRow label="Lemma" value={lexical.lemma} />
          <InfoRow
            label="Normalized lemma"
            value={lexical.normalizedLemma}
          />
          <InfoRow
            label="Lexical ID"
            value={lexical.lexicalId}
          />
          {lexical.strong !== lexical.lexicalId ? (
            <InfoRow label="Strong" value={lexical.strong} />
          ) : null}
          <InfoRow label="Language" value={lexical.language} />
          <InfoRow
            label="Transliteration"
            value={lexical.transliteration}
          />
          <InfoRow
            label="Pronunciation"
            value={lexical.pronunciation}
          />
          <InfoRow
            label="Part of speech"
            value={lexical.partsOfSpeech.join(", ")}
          />
          <InfoRow
            label="Witnesses"
            value={lexical.witnesses.join(", ")}
          />
        </div>
      </div>

      {lexical.shortDefinitions.length ||
      lexical.glosses.length ? (
        <div className="mt-5">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
            Lexical meaning
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              ...lexical.shortDefinitions,
              ...lexical.glosses,
            ]
              .filter(
                (value, index, list) =>
                  list.indexOf(value) === index,
              )
              .map((value) => (
                <span
                  key={value}
                  className="rounded-full border border-[var(--border)] bg-[var(--background)] px-3.5 py-2 text-sm font-semibold"
                >
                  {value}
                </span>
              ))}
          </div>
        </div>
      ) : null}

      {sourceForms.length ? (
        <div className="mt-5">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
            Source forms
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {sourceForms.map((form) => (
              <EvidenceListItem
                key={`${form.surface}-${form.count}`}
                label={form.surface}
                value={form.count.toLocaleString()}
              />
            ))}
          </div>
          {lexical.sourceForms.length > SOURCE_FORM_LIMIT ? (
            <p className="mt-3 text-sm font-semibold text-[var(--muted)]">
              {lexical.sourceForms.length - SOURCE_FORM_LIMIT} more
              source forms are retained in the runtime.
            </p>
          ) : null}
        </div>
      ) : null}

      {renderingForms.length ? (
        <div className="mt-5">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
            English renderings
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {renderingForms.map((form, index) => (
              <EvidenceListItem
                key={`${form.translation}-${form.text}-${index}`}
                label={form.text}
                value={`${form.count.toLocaleString()} • ${getTranslationLabel(
                  form.translation,
                )}`}
              />
            ))}
          </div>
        </div>
      ) : null}

      {lexical.morphologyEnglish.length ||
      lexical.morphology.length ? (
        <div className="mt-5">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
            Morphology observed
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(
              lexical.morphologyEnglish.length
                ? lexical.morphologyEnglish
                : lexical.morphology
            )
              .slice(0, 10)
              .map((value) => (
                <span
                  key={value}
                  className="rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-semibold"
                >
                  {value}
                </span>
              ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 rounded-[1.2rem] border border-[var(--border)] bg-[var(--background)] p-4">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
          Chronology and health
        </p>
        <div className="mt-4 space-y-3">
          <InfoRow
            label="First occurrence"
            value={
              evidence.chronology.firstOccurrence?.reference
            }
          />
          <InfoRow
            label="Last occurrence"
            value={
              evidence.chronology.lastOccurrence?.reference
            }
          />
          <InfoRow
            label="Health"
            value={evidence.health.status}
          />
          <InfoRow
            label="English renderings"
            value={
              evidence.health.hasEnglishRenderings
                ? "Available"
                : "Not available"
            }
          />
          <InfoRow
            label="References"
            value={
              evidence.health.hasReferences
                ? "Available"
                : "Not available"
            }
          />
        </div>
      </div>
    </Panel>
  );
}

function EvidenceStat({
  label,
  value,
}: {
  label: string;
  value?: number | string;
}) {
  return (
    <div className="rounded-[1.15rem] border border-[var(--border)] bg-[var(--background)] p-4">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tracking-[-0.04em]">
        {typeof value === "number"
          ? value.toLocaleString()
          : value || "0"}
      </p>
    </div>
  );
}

function EvidenceListItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2">
      <span className="min-w-0 break-words text-sm font-bold">
        {label}
      </span>
      <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">
        {value}
      </span>
    </div>
  );
}

function SeeKnowledgePanel({
  knowledge,
  returnTo,
}: {
  knowledge: BibleIQSeeKnowledge;
  returnTo: string;
}) {
  return (
    <Panel>
      <SectionHeading
        eyebrow="SEE Connections"
        title="Relationships, events, and themes"
      />

      <div className="mt-5 grid grid-cols-2 gap-3">
        <EvidenceStat
          label="Relationships"
          value={knowledge.relationshipCount}
        />
        <EvidenceStat
          label="Events"
          value={knowledge.eventCount}
        />
        <EvidenceStat
          label="Themes"
          value={knowledge.themeCount}
        />
        <EvidenceStat
          label="Knowledge refs"
          value={knowledge.totalReferenceCount}
        />
      </div>

      <KnowledgeGroup
        title="Relationship examples"
        examples={knowledge.relationships}
        returnTo={returnTo}
      />
      <KnowledgeGroup
        title="Event examples"
        examples={knowledge.events}
        returnTo={returnTo}
      />
      <KnowledgeGroup
        title="Theme examples"
        examples={knowledge.themes}
        returnTo={returnTo}
      />
    </Panel>
  );
}

function KnowledgeGroup({
  title,
  examples,
  returnTo,
}: {
  title: string;
  examples: BibleIQKnowledgeExample[];
  returnTo: string;
}) {
  const visible = examples.slice(0, KNOWLEDGE_EXAMPLE_LIMIT);
  if (!visible.length) return null;

  return (
    <div className="mt-5">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
        {title}
      </p>
      <div className="mt-3 space-y-2">
        {visible.map((example, index) => {
          const href = buildReferenceHref(
            example.reference,
            returnTo,
          );

          const content = (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words text-sm font-bold">
                  {example.label}
                </p>
                {example.reference ? (
                  <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">
                    {example.reference.reference}
                  </span>
                ) : null}
              </div>
              {example.details ? (
                <p className="mt-2 break-words text-xs leading-5 text-[var(--muted)]">
                  {example.details}
                </p>
              ) : null}
              {example.confidence ? (
                <p className="mt-2 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                  {example.confidence} confidence
                </p>
              ) : null}
            </div>
          );

          return href ? (
            <Link
              key={`${example.label}-${index}`}
              href={href}
              className="block"
            >
              {content}
            </Link>
          ) : (
            <div key={`${example.label}-${index}`}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReferenceListPanel({
  eyebrow,
  title,
  references,
  returnTo,
}: {
  eyebrow: string;
  title: string;
  references: BibleIQReference[];
  returnTo: string;
}) {
  return (
    <Panel>
      <SectionHeading eyebrow={eyebrow} title={title} />
      <div className="mt-5 space-y-3">
        {references.map((reference, index) => (
          <ReferenceCard
            key={`${reference.source}-${reference.reference}-${index}`}
            reference={reference}
            returnTo={returnTo}
          />
        ))}
      </div>
    </Panel>
  );
}

function ReferenceCard({
  reference,
  returnTo,
}: {
  reference: BibleIQReference;
  returnTo: string;
}) {
  const href = buildReferenceHref(reference, returnTo);

  const content = (
    <article className="rounded-[1.2rem] border border-[var(--border)] bg-[var(--background)] p-4 transition active:scale-[0.99]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-lg font-bold tracking-[-0.02em]">
          {reference.reference}
        </p>
        <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
          {getTranslationLabel(reference.routeTranslation)}
        </span>
      </div>

      {reference.renderings?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {reference.renderings.map((rendering) => (
            <span
              key={rendering}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold"
            >
              {rendering}
            </span>
          ))}
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

function InfoRow({
  label,
  value,
}: {
  label: string;
  value?: ReactNode;
}) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  return (
    <div className="flex items-start justify-between gap-5 border-t border-[var(--border)] pt-3 first:border-t-0 first:pt-0">
      <p className="shrink-0 text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
        {label}
      </p>
      <div className="min-w-0 break-words text-right text-sm font-bold leading-6">
        {value}
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
  const href = buildReferenceHref(occurrence, returnTo);

  const content = (
    <article className="rounded-[1.2rem] border border-[var(--border)] bg-[var(--background)] p-4 transition active:scale-[0.99]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold tracking-[-0.02em]">
            {occurrence.reference}
          </p>
          {occurrence.occurrenceCount &&
          occurrence.occurrenceCount > 1 ? (
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
              {occurrence.occurrenceCount} source occurrences in
              this verse
            </p>
          ) : null}
        </div>

        <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
          {getTranslationLabel(occurrence.routeTranslation)}
        </span>
      </div>

      {occurrence.englishText ? (
        <p className="mt-3 text-[0.98rem] italic leading-7 text-[var(--foreground)]">
          “{occurrence.englishText}”
        </p>
      ) : null}

      {occurrence.renderings?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {occurrence.renderings.map((rendering) => (
            <span
              key={rendering}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold"
            >
              {rendering}
            </span>
          ))}
        </div>
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
