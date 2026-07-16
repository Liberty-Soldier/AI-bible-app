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
  BibleIQEmet,
  BibleIQEntityEvidence,
  BibleIQKnowledgeExample,
  BibleIQOccurrence,
  BibleIQReference,
  BibleIQRenderingForm,
  BibleIQResponse,
  BibleIQSeeKnowledge,
  BibleIQSourceAlignment,
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
type StudyView =
  | "overview"
  | "lexicon"
  | "renderings"
  | "references"
  | "occurrences"
  | "connections"
  | "technical";

const OCCURRENCE_PAGE_SIZE = 40;
const SOURCE_FORM_LIMIT = 10;
const TECHNICAL_SOURCE_FORM_LIMIT = 40;
const CONNECTION_LIMIT = 12;

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
  α: "a",
  β: "b",
  γ: "g",
  δ: "d",
  ε: "e",
  ζ: "z",
  η: "ē",
  θ: "th",
  ι: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x",
  ο: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  υ: "y",
  φ: "ph",
  χ: "ch",
  ψ: "ps",
  ω: "ō",
};

const HEBREW_CONSONANTS: Record<string, string> = {
  א: "",
  ב: "b",
  ג: "g",
  ד: "d",
  ה: "h",
  ו: "v",
  ז: "z",
  ח: "ch",
  ט: "t",
  י: "y",
  כ: "kh",
  ך: "kh",
  ל: "l",
  מ: "m",
  ם: "m",
  נ: "n",
  ן: "n",
  ס: "s",
  ע: "",
  פ: "f",
  ף: "f",
  צ: "ts",
  ץ: "ts",
  ק: "q",
  ר: "r",
  ש: "sh",
  ת: "t",
};

const HEBREW_VOWELS: Record<string, string> = {
  "\u05B0": "e",
  "\u05B1": "e",
  "\u05B2": "a",
  "\u05B3": "o",
  "\u05B4": "i",
  "\u05B5": "e",
  "\u05B6": "e",
  "\u05B7": "a",
  "\u05B8": "a",
  "\u05B9": "o",
  "\u05BA": "o",
  "\u05BB": "u",
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

function normalizeEnglish(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/[^a-zA-Z0-9']+/g, " ")
    .toLowerCase()
    .trim();
}

function englishStem(value: string) {
  let normalized = normalizeEnglish(value)
    .replace(/^the\s+/, "")
    .replace(/'s$/, "")
    .replace(/s'$/, "s")
    .trim();

  if (normalized.endsWith("ies") && normalized.length > 4) {
    normalized = `${normalized.slice(0, -3)}y`;
  } else if (
    normalized.endsWith("es") &&
    normalized.length > 4 &&
    !normalized.endsWith("ses")
  ) {
    normalized = normalized.slice(0, -2);
  } else if (
    normalized.endsWith("s") &&
    normalized.length > 3 &&
    !normalized.endsWith("ss")
  ) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

function cleanRendering(value: string) {
  return String(value || "")
    .replace(/[§¶]/g, "")
    .replace(/^[\s'“”"]+|[\s'“”".,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function uniqueOccurrences(occurrences: BibleIQOccurrence[]) {
  const seen = new Set<string>();

  return occurrences.filter((occurrence) => {
    const key = `${occurrence.source}|${occurrence.book}|${occurrence.chapter}|${occurrence.verse}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
    if (cluster.base === "כ" || cluster.base === "ך") {
      consonant = hasDagesh ? "k" : "kh";
    }
    if (cluster.base === "פ" || cluster.base === "ף") {
      consonant = hasDagesh ? "p" : "f";
    }
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
    if (cluster.base === "א" || cluster.base === "ע") consonant = "";

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

function buildReadingReturnTo({
  pathname,
  searchParams,
  verse,
  displayTokenIndex,
}: {
  pathname: string;
  searchParams: URLSearchParams;
  verse?: number;
  displayTokenIndex?: number;
}) {
  const params = new URLSearchParams(searchParams.toString());

  for (const key of [
    "study",
    "word",
    "selectedText",
    "originalWord",
    "displayTokenIndex",
    "verseText",
    "wordOccurrence",
    "returnTo",
    "returnLabel",
  ]) {
    params.delete(key);
  }

  if (verse) params.set("verse", String(verse));
  if (displayTokenIndex !== undefined && displayTokenIndex >= 0) {
    params.set("focusToken", String(displayTokenIndex));
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function buildReferenceHref(
  reference: BibleIQReference | BibleIQOccurrence | null | undefined,
  returnTo: string,
  returnLabel: string,
) {
  if (!reference?.book || !reference.chapter) return null;

  const normalizedBook = normalizeBookName(reference.book) || reference.book;
  if (!normalizedBook) return null;

  const params = new URLSearchParams({
    translation: reference.routeTranslation,
    returnTo,
    returnLabel,
  });

  if (reference.verse) {
    params.set("verse", String(reference.verse));
  }

  return `/read/${encodeURIComponent(normalizedBook)}/${
    reference.chapter
  }?${params.toString()}`;
}

function isReaderReadyStatement(value?: string) {
  if (!value) return false;
  return !/(aligned to|grammatical form|belongs to|marked\s+[A-Z-]+|compact P05|entity record|source text)/i.test(
    value,
  );
}

function getPrincipalRenderings(
  evidence: BibleIQEntityEvidence | undefined,
  selectedWord: string,
) {
  const forms = evidence?.renderings?.mostCommon || [];
  if (!forms.length) return [];

  const selectedStem = englishStem(selectedWord);
  const lexicalTerms = [
    ...(evidence?.lexical.shortDefinitions || []),
    ...(evidence?.lexical.glosses || []),
  ]
    .flatMap((value) => String(value).split(/[;,/|]/g))
    .map((value) => englishStem(value))
    .filter(Boolean);

  const cleaned = forms
    .map((form) => ({
      ...form,
      text: cleanRendering(form.text),
    }))
    .filter(
      (form) =>
        form.text &&
        !/[<>\[\]{}§¶]/.test(form.text) &&
        normalizeEnglish(form.text).length > 1,
    );

  const direct = cleaned.filter((form) => {
    const stem = englishStem(form.text);
    return (
      stem === selectedStem ||
      lexicalTerms.includes(stem) ||
      lexicalTerms.some(
        (term) => term && stem && (term.includes(stem) || stem.includes(term)),
      )
    );
  });

  const seed = direct.length ? direct : cleaned.slice(0, 1);
  const seedStems = new Set(seed.map((form) => englishStem(form.text)));
  const family = cleaned.filter((form) => seedStems.has(englishStem(form.text)));
  const candidates = direct.length ? direct : family;

  const seen = new Set<string>();
  return candidates
    .filter((form) => {
      const key = `${normalizeEnglish(form.text)}|${form.translation}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

function getAllCleanRenderings(
  evidence: BibleIQEntityEvidence | undefined,
  selectedWord: string,
) {
  const forms = evidence?.renderings?.mostCommon || [];
  const selectedStem = englishStem(selectedWord);
  const lexicalTerms = [
    ...(evidence?.lexical.shortDefinitions || []),
    ...(evidence?.lexical.glosses || []),
  ]
    .flatMap((value) => String(value).split(/[;,/|]/g))
    .map((value) => englishStem(value))
    .filter(Boolean);

  const cleaned = forms
    .map((form) => ({
      ...form,
      text: cleanRendering(form.text),
    }))
    .filter(
      (form) =>
        form.text &&
        !/[<>\[\]{}§¶]/.test(form.text) &&
        normalizeEnglish(form.text).length > 1,
    );

  const topStem = englishStem(cleaned[0]?.text || selectedWord);
  const seen = new Set<string>();

  return cleaned.filter((form) => {
    const stem = englishStem(form.text);
    const direct =
      stem === selectedStem ||
      stem === topStem ||
      lexicalTerms.includes(stem) ||
      lexicalTerms.some(
        (term) => term && stem && (term.includes(stem) || stem.includes(term)),
      );

    if (!direct) return false;

    const key = `${normalizeEnglish(form.text)}|${form.translation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function humanizeMorphology(
  morph?: string,
  source?: string,
  fallback?: string[],
) {
  const value = String(morph || "").trim();
  if (!value) return fallback?.[0];

  if (source === "greek-nt" || source === "lxx") {
    const parts = value.split("-");
    const type = parts[0];
    const code = parts.slice(1).join("");
    const labels: string[] = [];

    const typeMap: Record<string, string> = {
      N: "Noun",
      V: "Verb",
      A: "Adjective",
      P: "Pronoun",
      R: "Preposition",
      C: "Conjunction",
      D: "Adverb",
      T: "Article",
      I: "Interjection",
    };
    if (typeMap[type]) labels.push(typeMap[type]);

    const caseMap: Record<string, string> = {
      N: "nominative",
      G: "genitive",
      D: "dative",
      A: "accusative",
      V: "vocative",
    };
    const numberMap: Record<string, string> = {
      S: "singular",
      P: "plural",
    };
    const genderMap: Record<string, string> = {
      M: "masculine",
      F: "feminine",
      N: "neuter",
    };

    if (caseMap[code[0]]) labels.push(caseMap[code[0]]);
    if (numberMap[code[1]]) labels.push(numberMap[code[1]]);
    if (genderMap[code[2]]) labels.push(genderMap[code[2]]);

    if (labels.length) return labels.join(" · ");
  }

  if (source === "hebrew") {
    let lexicalCode = value.split("/").at(-1) || value;
    if (/^H[ANPV]/.test(lexicalCode)) {
      lexicalCode = lexicalCode.slice(1);
    }

    const labels: string[] = [];

    if (lexicalCode.startsWith("N")) {
      labels.push("Noun");
      if (lexicalCode[1] === "c") labels.push("common");
      if (lexicalCode[1] === "p") labels.push("proper");
      if (lexicalCode[2] === "m") labels.push("masculine");
      if (lexicalCode[2] === "f") labels.push("feminine");
      if (lexicalCode[3] === "s") labels.push("singular");
      if (lexicalCode[3] === "p") labels.push("plural");
      if (lexicalCode[3] === "d") labels.push("dual");
      if (lexicalCode[4] === "a") labels.push("absolute");
      if (lexicalCode[4] === "c") labels.push("construct");
    } else if (lexicalCode.startsWith("A")) {
      labels.push("Adjective");
    } else if (lexicalCode.startsWith("P")) {
      labels.push("Pronoun");
    } else if (lexicalCode.startsWith("V")) {
      labels.push("Verb");
    }

    if (labels.length) return labels.join(" · ");
  }

  return fallback?.[0] || value;
}

function readerReadyConnections(knowledge?: BibleIQSeeKnowledge) {
  if (!knowledge?.available) return [];

  const all = [
    ...knowledge.relationships.map((item) => ({ ...item, group: "Relationship" })),
    ...knowledge.events.map((item) => ({ ...item, group: "Event" })),
    ...knowledge.themes.map((item) => ({ ...item, group: "Theme" })),
  ];

  const seen = new Set<string>();

  return all
    .filter((item) => {
      if (String(item.confidence || "").toLowerCase() === "low") return false;
      if (/\b(?:hebrew|greek-nt|lxx):[HGL]?\d+/i.test(item.label)) return false;
      if (item.details && /\b(?:hebrew|greek-nt|lxx):[HGL]?\d+/i.test(item.details)) {
        return false;
      }
      const key = `${item.group}|${item.label}|${item.reference?.reference || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, CONNECTION_LIMIT);
}

function buildReaderMeaning({
  statement,
  reference,
  sourceWord,
  selectedEnglish,
  principalRenderings,
}: {
  statement?: string;
  reference: string;
  sourceWord?: string;
  selectedEnglish: string;
  principalRenderings: BibleIQRenderingForm[];
}) {
  if (isReaderReadyStatement(statement)) return statement || "";

  const rendered = principalRenderings[0]?.text || selectedEnglish;
  const source = sourceWord ? `The source word ${sourceWord}` : "This source word";
  const same = englishStem(rendered) === englishStem(selectedEnglish);

  return `${source} is rendered “${selectedEnglish}” in ${reference}.${
    !same && rendered
      ? ` Its principal English sense is “${rendered}.”`
      : ""
  }`;
}

function summarizeRenderings(forms: BibleIQRenderingForm[]) {
  if (!forms.length) return "See how this word is rendered";
  return forms.map((form) => form.text).join(" · ");
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
  const [view, setView] = useState<StudyView>("overview");
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [selectedRendering, setSelectedRendering] = useState<string | null>(null);
  const [visibleOccurrenceCount, setVisibleOccurrenceCount] = useState(
    OCCURRENCE_PAGE_SIZE,
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragStartYRef = useRef<number | null>(null);

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { requestUpgrade } = usePremiumAccess();

  const sheetKey = `${word || ""}-${data?.entity?.id || "loading"}`;

  const readingReturnTo = useMemo(
    () =>
      buildReadingReturnTo({
        pathname,
        searchParams: new URLSearchParams(searchParams.toString()),
        verse,
        displayTokenIndex,
      }),
    [pathname, searchParams, verse, displayTokenIndex],
  );

  const readingLabel = `${book} ${chapter}${verse ? `:${verse}` : ""}`;

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
    setView("overview");
    setSelectedBook(null);
    setSelectedRendering(null);
    setVisibleOccurrenceCount(OCCURRENCE_PAGE_SIZE);
    setSnap("compact");

    if (scrollRef.current) scrollRef.current.scrollTop = 0;
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
          throw new Error(`Word study request failed: ${response.status}`);
        }

        const json = (await response.json()) as BibleIQResponse;
        if (!cancelled) setData(json);
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
  const alignment = entity?.alignment;
  const emet = entity?.emet;
  const meaningInVerse = entity?.meaningInVerse;
  const entityEvidence = entity?.entityEvidence;
  const seeKnowledge = entity?.seeKnowledge;
  const keyReferences = entity?.keyReferences || [];
  const lexical = entityEvidence?.lexical;
  const occurrences = uniqueOccurrences(entity?.evidence?.occurrences || []);
  const sourceDisplay = alignment?.lemma || alignment?.sourceWord || original?.word;
  const transliteration =
    original?.transliteration ||
    lexical?.transliteration ||
    deriveReaderTransliteration(
      sourceDisplay,
      alignment?.source,
      alignment?.lexicalId,
    );
  const pronunciation = original?.pronunciation || lexical?.pronunciation;
  const principalRenderings = getPrincipalRenderings(entityEvidence, word);
  const allCleanRenderings = getAllCleanRenderings(entityEvidence, word);
  const readableMorphology = humanizeMorphology(
    alignment?.morph,
    alignment?.source,
    lexical?.morphologyEnglish,
  );
  const readerConnections = readerReadyConnections(seeKnowledge);
  const firstOccurrence = entityEvidence?.chronology.firstOccurrence;
  const uniqueVerseCount =
    entityEvidence?.occurrenceSummary.uniqueVerseCount || occurrences.length;
  const readerMeaning = buildReaderMeaning({
    statement: meaningInVerse?.statement,
    reference: meaningInVerse?.reference || readingLabel,
    sourceWord: alignment?.sourceWord || sourceDisplay,
    selectedEnglish: word,
    principalRenderings,
  });

  const groupedOccurrences = new Map<string, BibleIQOccurrence[]>();

  for (const occurrence of occurrences) {
    const renderingMatches = selectedRendering
      ? (occurrence.renderings || []).some(
          (rendering) =>
            englishStem(rendering) === englishStem(selectedRendering),
        )
      : true;
    if (!renderingMatches) continue;

    const existing = groupedOccurrences.get(occurrence.book) || [];
    groupedOccurrences.set(occurrence.book, [...existing, occurrence]);
  }

  const occurrenceBookGroups = [...groupedOccurrences.entries()].sort(
    (left, right) => {
      const countDifference = right[1].length - left[1].length;
      return countDifference || left[0].localeCompare(right[0]);
    },
  );

  const selectedBookOccurrences = selectedBook
    ? occurrenceBookGroups.find(([bookName]) => bookName === selectedBook)?.[1] || []
    : [];
  const visibleOccurrences = selectedBookOccurrences.slice(
    0,
    visibleOccurrenceCount,
  );

  function changeView(nextView: StudyView) {
    setView(nextView);
    setSelectedBook(null);
    setVisibleOccurrenceCount(OCCURRENCE_PAGE_SIZE);
    if (nextView !== "occurrences") setSelectedRendering(null);
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    });
  }

  function handleBack() {
    if (view === "occurrences" && selectedBook) {
      setSelectedBook(null);
      setVisibleOccurrenceCount(OCCURRENCE_PAGE_SIZE);
      return;
    }
    changeView("overview");
  }

  function openRenderingOccurrences(rendering: string) {
    setSelectedRendering(rendering);
    setSelectedBook(null);
    setVisibleOccurrenceCount(OCCURRENCE_PAGE_SIZE);
    setView("occurrences");
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    });
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    dragStartYRef.current = event.clientY;
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    const startY = dragStartYRef.current;
    dragStartYRef.current = null;

    if (startY === null) {
      setSnap((current) => (current === "expanded" ? "compact" : "expanded"));
      return;
    }

    const delta = event.clientY - startY;
    if (delta < -24) setSnap("expanded");
    else if (delta > 24) setSnap("compact");
    else setSnap((current) => (current === "expanded" ? "compact" : "expanded"));
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
          snap === "expanded" ? "h-[92dvh]" : "h-[78dvh]"
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
            {view === "overview" ? (
              <EmetseesWordmark compact />
            ) : (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-2 rounded-full px-2 py-2 text-sm font-bold text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              >
                <span aria-hidden="true">←</span>
                {view === "occurrences" && selectedBook
                  ? "All books"
                  : "Word overview"}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--muted)]"
            >
              Back to reading
            </button>
          </div>
        </div>

        <div
          key={sheetKey}
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 pb-24"
        >
          {loading ? (
            <Panel>
              <p className="text-sm font-semibold text-[var(--muted)]">
                Loading source evidence...
              </p>
            </Panel>
          ) : !entity ? (
            <Panel>
              <SectionHeading eyebrow="EMETSEES" title="This word is not mapped yet" />
              <p className="mt-4 text-base leading-7 text-[var(--muted)]">
                {data?.message ||
                  "This English word does not currently have a source-language entity."}
              </p>
              <BackToReadingButton label={readingLabel} onClick={onClose} />
            </Panel>
          ) : view === "overview" ? (
            <OverviewView
              word={word}
              book={book}
              chapter={chapter}
              verse={verse}
              translation={translation}
              alignment={alignment}
              sourceDisplay={sourceDisplay}
              transliteration={transliteration}
              pronunciation={pronunciation}
              readerMeaning={readerMeaning}
              verseText={meaningInVerse?.verseText || verseText}
              emet={emet}
              firstOccurrence={firstOccurrence}
              keyReferences={keyReferences}
              principalRenderings={principalRenderings}
              uniqueVerseCount={uniqueVerseCount}
              hasConnections={Boolean(seeKnowledge?.available)}
              readableMorphology={readableMorphology}
              returnTo={readingReturnTo}
              returnLabel={readingLabel}
              onView={changeView}
              onAsk={() =>
                requestUpgrade(
                  "ask-emet",
                  `${word} • ${book} ${chapter}${verse ? `:${verse}` : ""}`,
                )
              }
              onDeepStudy={() =>
                requestUpgrade(
                  "deep-word-study",
                  `${word} • ${getSourceLabel(alignment?.source)}`,
                )
              }
              onClose={onClose}
            />
          ) : view === "lexicon" ? (
            <LexiconView
              word={word}
              alignment={alignment}
              evidence={entityEvidence}
              transliteration={transliteration}
              pronunciation={pronunciation}
              readableMorphology={readableMorphology}
              onTechnical={() => changeView("technical")}
              readingLabel={readingLabel}
              onClose={onClose}
            />
          ) : view === "renderings" ? (
            <RenderingsView
              principal={principalRenderings}
              all={allCleanRenderings}
              onSelect={openRenderingOccurrences}
              readingLabel={readingLabel}
              onClose={onClose}
            />
          ) : view === "references" ? (
            <ReferencesView
              references={keyReferences}
              returnTo={readingReturnTo}
              returnLabel={readingLabel}
              readingLabel={readingLabel}
              onClose={onClose}
            />
          ) : view === "occurrences" ? (
            <OccurrencesView
              selectedRendering={selectedRendering}
              selectedBook={selectedBook}
              bookGroups={occurrenceBookGroups}
              visibleOccurrences={visibleOccurrences}
              totalInSelectedBook={
                selectedBook
                  ? occurrenceBookGroups.find(([name]) => name === selectedBook)?.[1]
                      .length || 0
                  : 0
              }
              onSelectBook={(bookName) => {
                setSelectedBook(bookName);
                setVisibleOccurrenceCount(OCCURRENCE_PAGE_SIZE);
                requestAnimationFrame(() => {
                  if (scrollRef.current) scrollRef.current.scrollTop = 0;
                });
              }}
              onLoadMore={() =>
                setVisibleOccurrenceCount(
                  (current) => current + OCCURRENCE_PAGE_SIZE,
                )
              }
              returnTo={readingReturnTo}
              returnLabel={readingLabel}
              readingLabel={readingLabel}
              onClose={onClose}
            />
          ) : view === "connections" ? (
            <ConnectionsView
              knowledge={seeKnowledge}
              readerConnections={readerConnections}
              returnTo={readingReturnTo}
              returnLabel={readingLabel}
              readingLabel={readingLabel}
              onClose={onClose}
            />
          ) : (
            <TechnicalView
              entityId={entity.id}
              alignment={alignment}
              evidence={entityEvidence}
              sourceForms={lexical?.sourceForms || []}
              readingLabel={readingLabel}
              onClose={onClose}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function OverviewView({
  word,
  book,
  chapter,
  verse,
  translation,
  alignment,
  sourceDisplay,
  transliteration,
  pronunciation,
  readerMeaning,
  verseText,
  emet,
  firstOccurrence,
  keyReferences,
  principalRenderings,
  uniqueVerseCount,
  hasConnections,
  readableMorphology,
  returnTo,
  returnLabel,
  onView,
  onAsk,
  onDeepStudy,
  onClose,
}: {
  word: string;
  book: string;
  chapter: number;
  verse?: number;
  translation: string;
  alignment?: BibleIQSourceAlignment;
  sourceDisplay?: string;
  transliteration?: string;
  pronunciation?: string;
  readerMeaning: string;
  verseText?: string;
  emet?: BibleIQEmet;
  firstOccurrence?: BibleIQReference;
  keyReferences: BibleIQReference[];
  principalRenderings: BibleIQRenderingForm[];
  uniqueVerseCount: number;
  hasConnections: boolean;
  readableMorphology?: string;
  returnTo: string;
  returnLabel: string;
  onView: (view: StudyView) => void;
  onAsk: () => void;
  onDeepStudy: () => void;
  onClose: () => void;
}) {
  const firstHref = buildReferenceHref(firstOccurrence, returnTo, returnLabel);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.25em] text-[var(--muted)]">
          Selected word
        </p>
        <h2 className="mt-2 break-words text-[2.35rem] font-bold leading-[1.02] tracking-[-0.045em]">
          {word}
        </h2>

        {sourceDisplay ? (
          <button
            type="button"
            onClick={() => onView("lexicon")}
            className="mt-4 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-left transition hover:border-amber-500/35 active:scale-[0.995]"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="break-words text-2xl font-bold leading-tight">
                  {sourceDisplay}
                </p>
                {transliteration ? (
                  <p className="mt-2 break-words text-sm font-semibold text-[var(--muted)]">
                    Transliteration:{" "}
                    <span className="text-base font-bold text-[var(--foreground)]">
                      {transliteration}
                    </span>
                  </p>
                ) : null}
                {pronunciation ? (
                  <p className="mt-1 break-words text-sm font-semibold text-[var(--muted)]">
                    Pronounced:{" "}
                    <span className="font-bold text-[var(--foreground)]">
                      {pronunciation}
                    </span>
                  </p>
                ) : null}
                {alignment?.sourceWord && alignment.sourceWord !== alignment.lemma ? (
                  <p className="mt-2 break-words text-sm font-semibold text-[var(--muted)]">
                    Form in this verse: {alignment.sourceWord}
                  </p>
                ) : null}
              </div>
              <Chevron />
            </div>
          </button>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <MetaPill>
            {book} {chapter}
            {verse ? `:${verse}` : ""}
          </MetaPill>
          <MetaPill>{getTranslationLabel(translation)}</MetaPill>
          {alignment?.source ? (
            <MetaPill>{getSourceLabel(alignment.source)}</MetaPill>
          ) : null}
          {alignment?.lexicalId ? (
            <button type="button" onClick={() => onView("lexicon")}>
              <MetaPill interactive>{alignment.lexicalId} ›</MetaPill>
            </button>
          ) : null}
        </div>
      </header>

      <Panel>
        <SectionHeading eyebrow="What it means here" title={returnLabel} />
        <p className="mt-4 text-[1.02rem] leading-7">{readerMeaning}</p>
        {verseText ? (
          <blockquote className="mt-4 border-l-2 border-amber-500/35 pl-4 text-[0.96rem] italic leading-7 text-[var(--muted)]">
            “{verseText}”
          </blockquote>
        ) : null}
      </Panel>

      {emet?.status === "complete" && emet.explanation ? (
        <Panel>
          <SectionHeading
            eyebrow="Across Scripture"
            title={emet.headline || "EMET explains"}
          />
          <p className="mt-4 text-[1.02rem] leading-7">{emet.explanation}</p>
          {emet.citations?.length ? (
            <p className="mt-4 text-xs font-semibold text-[var(--muted)]">
              Supported by {emet.citations.slice(0, 4).join(" · ")}
            </p>
          ) : null}
        </Panel>
      ) : null}

      <Panel>
        <SectionHeading eyebrow="Explore" title="SEE Evidence is one tap away" />
        <div className="mt-4 divide-y divide-[var(--border)]">
          {firstOccurrence && firstHref ? (
            <ExploreLinkRow
              href={firstHref}
              label="First occurrence"
              summary={firstOccurrence.reference}
            />
          ) : null}
          <ExploreButtonRow
            label="Key passages"
            summary={
              keyReferences.length
                ? `${keyReferences.length} selected passages`
                : "Representative Scripture references"
            }
            onClick={() => onView("references")}
            disabled={!keyReferences.length}
          />
          <ExploreButtonRow
            label="Principal renderings"
            summary={summarizeRenderings(principalRenderings)}
            onClick={() => onView("renderings")}
            disabled={!principalRenderings.length}
          />
          <ExploreButtonRow
            label="Occurrences"
            summary={`${uniqueVerseCount.toLocaleString()} verse${
              uniqueVerseCount === 1 ? "" : "s"
            }`}
            onClick={() => onView("occurrences")}
            disabled={uniqueVerseCount === 0}
          />
          <ExploreButtonRow
            label="SEE connections"
            summary="Relationships, events, and themes"
            onClick={() => onView("connections")}
            disabled={!hasConnections}
          />
          <ExploreButtonRow
            label={
              alignment?.source === "lxx"
                ? "LXX lexicon and grammar"
                : "Strong's definition and lexicon"
            }
            summary={
              readableMorphology ||
              (alignment?.lexicalId
                ? `Source entry ${alignment.lexicalId}`
                : "Source forms and grammar")
            }
            onClick={() => onView("lexicon")}
          />
          <ExploreButtonRow
            label="Technical details"
            summary="Alignment, raw codes, and evidence health"
            onClick={() => onView("technical")}
            quiet
          />
        </div>
      </Panel>

      <PremiumStudyPanel onAsk={onAsk} onDeepStudy={onDeepStudy} />
      <BackToReadingButton label={returnLabel} onClick={onClose} />
    </div>
  );
}

function LexiconView({
  word,
  alignment,
  evidence,
  transliteration,
  pronunciation,
  readableMorphology,
  onTechnical,
  readingLabel,
  onClose,
}: {
  word: string;
  alignment?: BibleIQSourceAlignment;
  evidence?: BibleIQEntityEvidence;
  transliteration?: string;
  pronunciation?: string;
  readableMorphology?: string;
  onTechnical: () => void;
  readingLabel: string;
  onClose: () => void;
}) {
  const lexical = evidence?.lexical;
  const definitions = (() => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of [
      ...(lexical?.shortDefinitions || []),
      ...(lexical?.glosses || []),
    ]) {
      const clean = String(value || "")
        .replace(/\s+/g, " ")
        .trim();
      const key = clean
        .toLocaleLowerCase()
        .replace(/[\s.,;:]+$/g, "");

      if (!clean || seen.has(key)) continue;
      seen.add(key);
      result.push(clean);
    }

    return result;
  })();
  const sourceForms = lexical?.sourceForms.slice(0, SOURCE_FORM_LIMIT) || [];

  return (
    <div className="space-y-5">
      <ViewTitle eyebrow="Lexicon" title={alignment?.lexicalId || word} />

      <Panel>
        <div className="text-center">
          <p className="break-words text-3xl font-bold">
            {alignment?.lemma || alignment?.sourceWord || word}
          </p>
          {transliteration ? (
            <p className="mt-2 text-sm font-semibold text-[var(--muted)]">
              Transliteration:{" "}
              <span className="text-lg font-bold text-[var(--foreground)]">
                {transliteration}
              </span>
            </p>
          ) : null}
          {pronunciation ? (
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
              Pronounced:{" "}
              <span className="font-bold text-[var(--foreground)]">
                {pronunciation}
              </span>
            </p>
          ) : null}
        </div>

        <div className="mt-5 space-y-3">
          <InfoRow label="Selected English" value={word} />
          <InfoRow label="Lemma" value={alignment?.lemma} />
          <InfoRow
            label={alignment?.source === "lxx" ? "LXX lexical ID" : "Strong's number"}
            value={alignment?.lexicalId}
          />
          <InfoRow label="Language" value={lexical?.language} />
          <InfoRow label="Grammar here" value={readableMorphology} />
        </div>
      </Panel>

      {definitions.length ? (
        <Panel>
          <SectionHeading
            eyebrow={
              alignment?.source === "lxx"
                ? "Lexical meaning"
                : "Strong's definition"
            }
            title={
              alignment?.source === "lxx"
                ? "What this entry means"
                : `${alignment?.lexicalId || "Strong's"} definition`
            }
          />
          <p className="mt-4 text-[1.02rem] leading-7">
            {definitions[0]}
          </p>
          {definitions.length > 1 ? (
            <div className="mt-4">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                Additional glosses and usage
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {definitions.slice(1, 7).map((definition) => (
                  <span
                    key={definition}
                    className="rounded-full border border-[var(--border)] bg-[var(--background)] px-3.5 py-2 text-sm font-semibold"
                  >
                    {definition}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {sourceForms.length ? (
        <Panel>
          <SectionHeading eyebrow="Source forms" title="Common forms in Scripture" />
          <div className="mt-4 space-y-2">
            {sourceForms.map((form) => (
              <div
                key={`${form.surface}-${form.count}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3"
              >
                <span className="min-w-0 break-words text-base font-bold">
                  {form.surface}
                </span>
                <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">
                  {form.count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          {lexical && lexical.sourceForms.length > SOURCE_FORM_LIMIT ? (
            <button
              type="button"
              onClick={onTechnical}
              className="mt-4 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-bold text-[var(--muted)]"
            >
              View all technical forms ›
            </button>
          ) : null}
        </Panel>
      ) : null}

      <Panel>
        <ExploreButtonRow
          label="Technical details"
          summary="Raw morphology, entity ID, and evidence health"
          onClick={onTechnical}
          quiet
        />
      </Panel>

      <BackToReadingButton label={readingLabel} onClick={onClose} />
    </div>
  );
}

function RenderingsView({
  principal,
  all,
  onSelect,
  readingLabel,
  onClose,
}: {
  principal: BibleIQRenderingForm[];
  all: BibleIQRenderingForm[];
  onSelect: (rendering: string) => void;
  readingLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="space-y-5">
      <ViewTitle eyebrow="Renderings" title="How translations express this word" />

      {principal.length ? (
        <Panel>
          <SectionHeading eyebrow="Principal" title="Most direct renderings" />
          <div className="mt-4 space-y-2">
            {principal.map((form, index) => (
              <ExploreButtonRow
                key={`${form.translation}-${form.text}-${index}`}
                label={form.text}
                summary={`${form.count.toLocaleString()} · ${getTranslationLabel(
                  form.translation,
                )}`}
                onClick={() => onSelect(form.text)}
              />
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel>
        <SectionHeading
          eyebrow="Aligned forms"
          title="Additional translation evidence"
        />
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          These forms come from source alignment. Select one to see its supporting passages.
        </p>
        <div className="mt-4 divide-y divide-[var(--border)]">
          {all.slice(0, 24).map((form, index) => (
            <ExploreButtonRow
              key={`${form.translation}-${form.text}-${index}`}
              label={form.text}
              summary={`${form.count.toLocaleString()} · ${getTranslationLabel(
                form.translation,
              )}`}
              onClick={() => onSelect(form.text)}
            />
          ))}
        </div>
      </Panel>

      <BackToReadingButton label={readingLabel} onClick={onClose} />
    </div>
  );
}

function ReferencesView({
  references,
  returnTo,
  returnLabel,
  readingLabel,
  onClose,
}: {
  references: BibleIQReference[];
  returnTo: string;
  returnLabel: string;
  readingLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="space-y-5">
      <ViewTitle eyebrow="Key passages" title="Scripture that helps explain this word" />
      <Panel>
        <div className="space-y-3">
          {references.length ? (
            references.map((reference, index) => (
              <ReferenceCard
                key={`${reference.source}-${reference.reference}-${index}`}
                reference={reference}
                returnTo={returnTo}
                returnLabel={returnLabel}
              />
            ))
          ) : (
            <EmptyState>
              Representative references are not available for this entry yet.
            </EmptyState>
          )}
        </div>
      </Panel>
      <BackToReadingButton label={readingLabel} onClick={onClose} />
    </div>
  );
}

function OccurrencesView({
  selectedRendering,
  selectedBook,
  bookGroups,
  visibleOccurrences,
  totalInSelectedBook,
  onSelectBook,
  onLoadMore,
  returnTo,
  returnLabel,
  readingLabel,
  onClose,
}: {
  selectedRendering: string | null;
  selectedBook: string | null;
  bookGroups: [string, BibleIQOccurrence[]][];
  visibleOccurrences: BibleIQOccurrence[];
  totalInSelectedBook: number;
  onSelectBook: (book: string) => void;
  onLoadMore: () => void;
  returnTo: string;
  returnLabel: string;
  readingLabel: string;
  onClose: () => void;
}) {
  if (!selectedBook) {
    const total = bookGroups.reduce((sum, [, values]) => sum + values.length, 0);

    return (
      <div className="space-y-5">
        <ViewTitle
          eyebrow="Occurrences"
          title={
            selectedRendering
              ? `Passages rendered “${selectedRendering}”`
              : "Browse passages by book"
          }
        />
        <Panel>
          <p className="text-sm leading-6 text-[var(--muted)]">
            {total.toLocaleString()} representative verse{total === 1 ? "" : "s"} are available in this runtime. Choose a book to continue.
          </p>
          <div className="mt-4 divide-y divide-[var(--border)]">
            {bookGroups.map(([bookName, values]) => (
              <ExploreButtonRow
                key={bookName}
                label={bookName}
                summary={`${values.length.toLocaleString()} verse${
                  values.length === 1 ? "" : "s"
                }`}
                onClick={() => onSelectBook(bookName)}
              />
            ))}
          </div>
        </Panel>
        <BackToReadingButton label={readingLabel} onClick={onClose} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ViewTitle
        eyebrow="Occurrences"
        title={`${selectedBook}${selectedRendering ? ` · “${selectedRendering}”` : ""}`}
      />
      <Panel>
        <div className="space-y-3">
          {visibleOccurrences.map((occurrence, index) => (
            <OccurrenceCard
              key={`${occurrence.source}-${occurrence.reference}-${index}`}
              occurrence={occurrence}
              returnTo={returnTo}
              returnLabel={returnLabel}
            />
          ))}
        </div>

        {visibleOccurrences.length < totalInSelectedBook ? (
          <button
            type="button"
            onClick={onLoadMore}
            className="mt-5 w-full rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-bold text-[var(--muted)]"
          >
            Load more passages
          </button>
        ) : null}
      </Panel>
      <BackToReadingButton label={readingLabel} onClick={onClose} />
    </div>
  );
}

function ConnectionsView({
  knowledge,
  readerConnections,
  returnTo,
  returnLabel,
  readingLabel,
  onClose,
}: {
  knowledge?: BibleIQSeeKnowledge;
  readerConnections: (BibleIQKnowledgeExample & { group: string })[];
  returnTo: string;
  returnLabel: string;
  readingLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="space-y-5">
      <ViewTitle eyebrow="SEE connections" title="Relationships across Scripture" />
      <Panel>
        <p className="text-sm leading-6 text-[var(--muted)]">
          SEE indexes relationships, events, and themes behind this word. Only reader-ready connections are shown here; raw or low-confidence graph edges stay hidden.
        </p>

        {readerConnections.length ? (
          <div className="mt-4 space-y-3">
            {readerConnections.map((connection, index) => (
              <ConnectionCard
                key={`${connection.group}-${connection.label}-${index}`}
                connection={connection}
                returnTo={returnTo}
                returnLabel={returnLabel}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState>
              SEE has indexed supporting connections for this entity, but none have passed the reader-ready confidence filter yet.
            </EmptyState>
          </div>
        )}

        {knowledge?.available ? (
          <p className="mt-4 text-xs font-semibold text-[var(--muted)]">
            Additional evidence remains available for future Deep Word Study tools.
          </p>
        ) : null}
      </Panel>
      <BackToReadingButton label={readingLabel} onClick={onClose} />
    </div>
  );
}

function TechnicalView({
  entityId,
  alignment,
  evidence,
  sourceForms,
  readingLabel,
  onClose,
}: {
  entityId: string;
  alignment?: BibleIQSourceAlignment;
  evidence?: BibleIQEntityEvidence;
  sourceForms: { surface: string; count: number }[];
  readingLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="space-y-5">
      <ViewTitle eyebrow="Technical details" title="Source and runtime evidence" />
      <Panel>
        <div className="space-y-3">
          <InfoRow label="Entity ID" value={entityId} />
          <InfoRow label="Corpus" value={getSourceLabel(alignment?.source)} />
          <InfoRow label="Lexical ID" value={alignment?.lexicalId} />
          <InfoRow label="Raw morphology" value={alignment?.morph} />
          <InfoRow label="Evidence health" value={evidence?.health.status} />
          <InfoRow
            label="Alignment coverage"
            value={
              Number.isFinite(evidence?.health.alignmentCoverage)
                ? `${((evidence?.health.alignmentCoverage || 0) * 100).toFixed(1)}%`
                : undefined
            }
          />
        </div>
      </Panel>

      {sourceForms.length ? (
        <Panel>
          <SectionHeading eyebrow="Raw forms" title="Retained source-token forms" />
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {sourceForms.slice(0, TECHNICAL_SOURCE_FORM_LIMIT).map((form) => (
              <div
                key={`${form.surface}-${form.count}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2"
              >
                <span className="min-w-0 break-words text-sm font-bold">
                  {form.surface}
                </span>
                <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">
                  {form.count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <BackToReadingButton label={readingLabel} onClick={onClose} />
    </div>
  );
}

function PremiumStudyPanel({
  onAsk,
  onDeepStudy,
}: {
  onAsk: () => void;
  onDeepStudy: () => void;
}) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-4">
        <SectionHeading eyebrow="Go deeper" title="Guided study tools" />
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[0.62rem] font-black uppercase tracking-[0.14em] text-amber-600 dark:text-amber-400">
          Paid
        </span>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onAsk}
          className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 text-left"
        >
          <p className="text-sm font-black">Ask EMET</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Ask a live question grounded in this word and verse.
          </p>
        </button>
        <button
          type="button"
          onClick={onDeepStudy}
          className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 text-left"
        >
          <p className="text-sm font-black">Deep Word Study</p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Build a guided study from the complete SEE evidence.
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

function MetaPill({
  children,
  interactive = false,
}: {
  children: ReactNode;
  interactive?: boolean;
}) {
  return (
    <span
      className={`inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--muted)] ${
        interactive ? "transition hover:border-amber-500/40 hover:text-[var(--foreground)]" : ""
      }`}
    >
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

function ViewTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="mb-6">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.25em] text-[var(--muted)]">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-3xl font-bold leading-tight tracking-[-0.04em]">
        {title}
      </h2>
    </header>
  );
}

function ExploreButtonRow({
  label,
  summary,
  onClick,
  disabled = false,
  quiet = false,
}: {
  label: string;
  summary: string;
  onClick: () => void;
  disabled?: boolean;
  quiet?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-between gap-4 py-4 text-left transition first:pt-0 last:pb-0 disabled:cursor-default disabled:opacity-45 ${
        quiet ? "text-[var(--muted)]" : ""
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-black">{label}</span>
        <span className="mt-1 block truncate text-xs font-semibold text-[var(--muted)]">
          {summary}
        </span>
      </span>
      <Chevron />
    </button>
  );
}

function ExploreLinkRow({
  href,
  label,
  summary,
}: {
  href: string;
  label: string;
  summary: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 py-4 text-left transition first:pt-0 last:pb-0"
    >
      <span className="min-w-0">
        <span className="block text-sm font-black">{label}</span>
        <span className="mt-1 block truncate text-xs font-semibold text-[var(--muted)]">
          {summary}
        </span>
      </span>
      <Chevron />
    </Link>
  );
}

function Chevron() {
  return (
    <span aria-hidden="true" className="shrink-0 text-xl font-semibold text-[var(--muted)]">
      ›
    </span>
  );
}

function BackToReadingButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-sm font-black text-amber-800 dark:text-amber-200"
    >
      Back to reading at {label}
    </button>
  );
}

function ReferenceCard({
  reference,
  returnTo,
  returnLabel,
}: {
  reference: BibleIQReference;
  returnTo: string;
  returnLabel: string;
}) {
  const href = buildReferenceHref(reference, returnTo, returnLabel);
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
        <p className="mt-3 text-sm font-semibold text-[var(--muted)]">
          {reference.renderings.slice(0, 3).join(" · ")}
        </p>
      ) : null}
      {href ? (
        <p className="mt-3 text-xs font-bold text-amber-700 dark:text-amber-300">
          Open passage ›
        </p>
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

function OccurrenceCard({
  occurrence,
  returnTo,
  returnLabel,
}: {
  occurrence: BibleIQOccurrence;
  returnTo: string;
  returnLabel: string;
}) {
  const href = buildReferenceHref(occurrence, returnTo, returnLabel);
  const content = (
    <article className="rounded-[1.2rem] border border-[var(--border)] bg-[var(--background)] p-4 transition active:scale-[0.99]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-lg font-bold tracking-[-0.02em]">
          {occurrence.reference}
        </p>
        <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
          {getTranslationLabel(occurrence.routeTranslation)}
        </span>
      </div>
      {occurrence.englishText ? (
        <p className="mt-3 line-clamp-4 text-[0.96rem] italic leading-7">
          “{occurrence.englishText}”
        </p>
      ) : null}
      {href ? (
        <p className="mt-3 text-xs font-bold text-amber-700 dark:text-amber-300">
          Open passage ›
        </p>
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

function ConnectionCard({
  connection,
  returnTo,
  returnLabel,
}: {
  connection: BibleIQKnowledgeExample & { group: string };
  returnTo: string;
  returnLabel: string;
}) {
  const href = buildReferenceHref(connection.reference, returnTo, returnLabel);
  const content = (
    <article className="rounded-[1.2rem] border border-[var(--border)] bg-[var(--background)] p-4">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
        {connection.group}
      </p>
      <p className="mt-2 text-base font-bold">{connection.label}</p>
      {connection.details ? (
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          {connection.details}
        </p>
      ) : null}
      {connection.reference ? (
        <p className="mt-3 text-xs font-bold text-amber-700 dark:text-amber-300">
          {connection.reference.reference} ›
        </p>
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
  if (value === undefined || value === null || value === "") return null;

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

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--background)] p-4 text-sm leading-6 text-[var(--muted)]">
      {children}
    </div>
  );
}
