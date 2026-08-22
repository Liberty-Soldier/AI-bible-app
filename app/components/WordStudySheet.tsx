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
  BibleIQSourceComponentEvidence,
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


function renderingSpanFromVerse(
  verseText: string | undefined,
  alignment: BibleIQSourceAlignment | undefined,
  fallback: string,
) {
  const explicit = String((alignment as BibleIQSourceAlignment & {
    renderingText?: string;
  } | undefined)?.renderingText || "").trim();
  if (explicit) return explicit;

  const start = alignment?.sourceSegment?.renderingStartTokenIndex;
  const end = alignment?.sourceSegment?.renderingEndTokenIndex;
  const tokens = String(verseText || "")
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter((token) => token && /[\p{L}\p{N}]/u.test(token));

  if (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    Number(start) >= 0 &&
    Number(end) >= Number(start) &&
    Number(end) < tokens.length
  ) {
    const span = cleanRendering(
      tokens.slice(Number(start), Number(end) + 1).join(" "),
    );
    if (span) return span;
  }

  return fallback;
}

function uniqueLexicalSourceRoutes(alignment?: BibleIQSourceAlignment) {
  const routes = (alignment?.sourceRoutes || []).filter(
    (route) => route.kind === "lexical",
  );
  const seen = new Set<string>();
  return routes.filter((route) => {
    const key = String(route.entityId || route.lexicalId || route.sourceTokenId || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function getEntityOwnedRenderings(
  evidence: BibleIQEntityEvidence | undefined,
  translation?: string,
) {
  const translationKey = String(translation || "").trim().toLowerCase();

  const translationBucket = translationKey
    ? (evidence?.renderings?.translations || []).find(
        (bucket) =>
          String(bucket.translation || "").trim().toLowerCase() ===
          translationKey,
      )
    : undefined;

  const forms = translationBucket
    ? translationBucket.forms
    : evidence?.renderings?.mostCommon || [];

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

  const seen = new Set<string>();

  return cleaned.filter((form) => {
    const key = `${normalizeEnglish(form.text)}|${form.translation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getPrincipalRenderings(
  evidence: BibleIQEntityEvidence | undefined,
  _selectedWord: string,
  translation?: string,
) {
  return getEntityOwnedRenderings(evidence, translation).slice(0, 5);
}

function getAllCleanRenderings(
  evidence: BibleIQEntityEvidence | undefined,
  _selectedWord: string,
  translation?: string,
) {
  return getEntityOwnedRenderings(evidence, translation);
}

function isReaderReadyLexicalMeaning(value?: string) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) return false;
  if (clean.length > 120) return false;
  if (/[;:]/.test(clean)) return false;
  if (
    /\b(symbolical|properly|figuratively|by implication|abstractly|literally|etymologically|apparently|perhaps|contracted|denominative|causative|intensive|from its|from an unused root|a primitive root|compare|proper name|name of|symbolical name|capital city|city of|town of|region of|country of|inhabitant|patronymic)\b/i.test(
      clean,
    )
  ) {
    return false;
  }
  return true;
}

function getPrimaryLexicalMeaning(
  evidence: BibleIQEntityEvidence | undefined,
) {
  const values = [
    ...(evidence?.lexical.shortDefinitions || []),
    ...(evidence?.lexical.glosses || []),
  ];

  for (const value of values) {
    const clean = String(value || "")
      .replace(/\s+/g, " ")
      .trim();

    if (clean) return clean;
  }

  return "";
}


function firstReaderSentence(value?: string) {
  const clean = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return "";

  const match = clean.match(/^(.+?[.!?])(?:\s|$)/u);
  return (match?.[1] || clean).trim();
}

function capitalizeReaderMeaning(value: string) {
  const clean = String(value || "").trim();
  if (!clean) return "";

  const firstLetter = clean.search(/[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]/u);
  if (firstLetter < 0) return clean;

  return (
    clean.slice(0, firstLetter) +
    clean[firstLetter].toLocaleUpperCase() +
    clean.slice(firstLetter + 1)
  );
}

function deriveReaderFirstMeaning({
  lexicalMeaning,
  lexicalMeaningIsRaw,
  emetExplanation,
  meaningHere,
  principalRenderings,
  selectedEnglish,
}: {
  lexicalMeaning: string;
  lexicalMeaningIsRaw: boolean;
  emetExplanation?: string;
  meaningHere: string;
  principalRenderings: BibleIQRenderingForm[];
  selectedEnglish: string;
}) {
  if (lexicalMeaning && !lexicalMeaningIsRaw) return lexicalMeaning;

  const emetSentence = firstReaderSentence(emetExplanation);
  if (emetSentence) {
    const directMeaning = emetSentence.match(
      /^(?:[\p{L}\p{M}'’ʼ.\-]+(?:\s+[\p{L}\p{M}'’ʼ.\-]+){0,3})\s+(?:means|can\s+mean|refers\s+to|can\s+refer\s+to|names|can\s+name|is|can\s+be)\s+(.+)$/iu,
    );

    if (directMeaning?.[1]) {
      return capitalizeReaderMeaning(directMeaning[1]);
    }

    if (emetSentence.length <= 170) return emetSentence;
  }

  if (meaningHere && isReaderReadyStatement(meaningHere)) {
    return meaningHere;
  }

  const renderings = principalRenderings
    .map((form) => cleanRendering(form.text))
    .filter(Boolean)
    .filter((value, index, values) => {
      const key = normalizeEnglish(value);
      return values.findIndex((item) => normalizeEnglish(item) === key) === index;
    })
    .slice(0, 3);

  const distinctRenderings = renderings.filter(
    (value) => englishStem(value) !== englishStem(selectedEnglish),
  );

  if (distinctRenderings.length) {
    return distinctRenderings.join(" · ");
  }

  return lexicalMeaning;
}

function formatReaderCitation(value: string) {
  const clean = String(value || "").trim();

  return clean.replace(
    /^((?:[1-3]\s*)?[A-Za-z]+):(\d+):(\d+)$/u,
    "$1 $2:$3",
  );
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

  return `${source} is rendered “${selectedEnglish}” here.${
    !same && rendered
      ? ` A common English rendering is “${rendered}.”`
      : ""
  }`;
}

function summarizeRenderings(forms: BibleIQRenderingForm[]) {
  if (!forms.length) return "See how this word is rendered";

  const seen = new Set<string>();
  const labels = forms
    .map((form) => cleanRendering(form.text))
    .filter((text) => {
      const key = normalizeEnglish(text);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);

  return labels.length ? labels.join(" · ") : "See how this word is rendered";
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
  const [sourceEntityId, setSourceEntityId] = useState<string | null>(null);
  const [sourceEntityLabel, setSourceEntityLabel] = useState<string>("");
  const [sourceEntityData, setSourceEntityData] = useState<BibleIQResponse | null>(null);
  const [sourceEntityLoading, setSourceEntityLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragStartYRef = useRef<number | null>(null);

  const pathname = usePathname();
  const searchParams = useSearchParams();

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
    setSourceEntityId(null);
    setSourceEntityLabel("");
    setSourceEntityData(null);
    setSourceEntityLoading(false);
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

  useEffect(() => {
    if (!sourceEntityId) {
      setSourceEntityData(null);
      setSourceEntityLoading(false);
      return;
    }

    const activeEntityId = sourceEntityId;
    let cancelled = false;

    async function loadSourceEntity() {
      setSourceEntityLoading(true);
      setSourceEntityData(null);

      try {
        const response = await fetch(
          `/api/word-study?${new URLSearchParams({
            entityId: activeEntityId,
            displayWord: sourceEntityLabel || activeEntityId,
            book,
            chapter: String(chapter),
            verse: String(verse ?? ""),
            translation,
            verseText: verseText ?? "",
          }).toString()}`,
        );

        if (!response.ok) {
          throw new Error(`Source entity request failed: ${response.status}`);
        }

        const json = (await response.json()) as BibleIQResponse;
        if (!cancelled) setSourceEntityData(json);
      } catch {
        if (!cancelled) {
          setSourceEntityData({
            resolved: false,
            resolutionType: "unresolved",
            query: sourceEntityLabel || activeEntityId,
            message: "EMETSEES could not load this lexical source entity.",
          });
        }
      } finally {
        if (!cancelled) setSourceEntityLoading(false);
      }
    }

    loadSourceEntity();

    return () => {
      cancelled = true;
    };
  }, [
    sourceEntityId,
    sourceEntityLabel,
    book,
    chapter,
    verse,
    translation,
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
  const lexicalSourceRoutes = uniqueLexicalSourceRoutes(alignment);
  const primaryLexicalRoute =
    lexicalSourceRoutes.length === 1 ? lexicalSourceRoutes[0] : undefined;
  const sourceDisplay = alignment?.noForcedSingleSourceIdentity
    ? primaryLexicalRoute?.lemma || primaryLexicalRoute?.sourceWord
    : alignment?.lemma || alignment?.sourceWord || original?.word;
  const transliteration = sourceDisplay
    ? original?.transliteration ||
      lexical?.transliteration ||
      deriveReaderTransliteration(
        sourceDisplay,
        alignment?.source,
        alignment?.lexicalId,
      )
    : undefined;
  const pronunciation = original?.pronunciation || lexical?.pronunciation;
  const principalRenderings = getPrincipalRenderings(entityEvidence, word, translation);
  const allCleanRenderings = getAllCleanRenderings(entityEvidence, word, translation);
  const rawPrimaryLexicalMeaning = getPrimaryLexicalMeaning(entityEvidence);
  const primaryLexicalMeaning = isReaderReadyLexicalMeaning(
    rawPrimaryLexicalMeaning,
  )
    ? rawPrimaryLexicalMeaning
    : "";
  const overviewLexicalMeaning =
    primaryLexicalMeaning || rawPrimaryLexicalMeaning;
  const overviewLexicalMeaningIsRaw =
    Boolean(rawPrimaryLexicalMeaning) && !primaryLexicalMeaning;
  const occurrenceMeaningIsReaderReady = isReaderReadyStatement(
    meaningInVerse?.statement,
  );
  const readerMeaningLabel = occurrenceMeaningIsReaderReady
    ? "Meaning here"
    : "In this verse";
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
          snap === "expanded" ? "h-[96dvh]" : "h-[86dvh]"
        }`}
      >
        <div className="shrink-0 border-b border-[var(--border)] bg-[var(--background)] px-5 py-3">
          <button
            type="button"
            aria-label="Resize EMETSEES word study panel"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            className="mx-auto mb-3 block h-1.5 w-11 rounded-full bg-[var(--border)]"
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
              Done
            </button>
          </div>
        </div>

        <div
          key={sheetKey}
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 pb-20"
        >
          {sourceEntityId ? (
            <SourceEntityDrilldown
              label={sourceEntityLabel || sourceEntityId}
              data={sourceEntityData}
              loading={sourceEntityLoading}
              translation={translation}
              backLabel={
                alignment?.noForcedSingleSourceIdentity
                  ? "source construction"
                  : "source occurrence"
              }
              onBack={() => {
                setSourceEntityId(null);
                setSourceEntityLabel("");
                setSourceEntityData(null);
                requestAnimationFrame(() => {
                  if (scrollRef.current) scrollRef.current.scrollTop = 0;
                });
              }}
            />
          ) : loading ? (
            <div className="animate-pulse py-2">
              <p className="text-sm font-semibold text-[var(--muted)]">
                Loading word evidence...
              </p>
              <div className="mt-5 h-6 w-3/4 rounded bg-[var(--surface)]" />
              <div className="mt-3 h-4 w-full rounded bg-[var(--surface)]" />
              <div className="mt-2 h-4 w-5/6 rounded bg-[var(--surface)]" />
              <div className="mt-6 border-t border-[var(--border)] pt-5">
                <div className="h-5 w-2/5 rounded bg-[var(--surface)]" />
                <div className="mt-3 h-16 w-full rounded bg-[var(--surface)]" />
              </div>
            </div>
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
              readerMeaningLabel={readerMeaningLabel}
              overviewLexicalMeaning={overviewLexicalMeaning}
              overviewLexicalMeaningIsRaw={overviewLexicalMeaningIsRaw}
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
              onOpenSourceEntity={(entityId, label) => {
                setSourceEntityId(entityId);
                setSourceEntityLabel(label);
                setSourceEntityData(null);
                requestAnimationFrame(() => {
                  if (scrollRef.current) scrollRef.current.scrollTop = 0;
                });
              }}
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
              principalRenderings={principalRenderings}
              onRenderings={() => changeView("renderings")}
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
  readerMeaningLabel,
  overviewLexicalMeaning,
  overviewLexicalMeaningIsRaw,
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
  onOpenSourceEntity,
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
  readerMeaningLabel: string;
  overviewLexicalMeaning: string;
  overviewLexicalMeaningIsRaw: boolean;
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
  onOpenSourceEntity: (entityId: string, label: string) => void;
  onClose: () => void;
}) {
  const sourceLanguageLabel = getSourceLabel(alignment?.source);
  const meaningHere = readerMeaning;
  const readerFirstMeaning = deriveReaderFirstMeaning({
    lexicalMeaning: overviewLexicalMeaning,
    lexicalMeaningIsRaw: overviewLexicalMeaningIsRaw,
    emetExplanation:
      emet?.status === "complete" ? emet.explanation : undefined,
    meaningHere,
    principalRenderings,
    selectedEnglish: word,
  });
  const renderingText = renderingSpanFromVerse(verseText, alignment, word);
  const isSpanRendering = Boolean(alignment?.noForcedSingleSourceIdentity);
  const emetReady = emet?.status === "complete" && Boolean(emet.explanation);
  const emetScopeLabel =
    emet?.scope === "lexical-source" ? "EMET · source word" : "EMET explanation";
  const lexicalRoutes = uniqueLexicalSourceRoutes(alignment);
  const sourceComponents = alignment?.sourceComponentEvidence || [];
  const hasAmbiguousLexicalSpan =
    isSpanRendering && lexicalRoutes.length !== 1;
  const sourceSegmentText = (alignment?.sourceRoutes || [])
    .map((route) => route.sourceWord)
    .filter(Boolean)
    .join(" ");
  const exactSingleRoute =
    !isSpanRendering && alignment?.sourceRoutes?.length === 1
      ? alignment.sourceRoutes[0]
      : undefined;
  const occurrenceSurface =
    exactSingleRoute?.sourceWord || alignment?.sourceWord;
  const showOccurrenceSurface =
    Boolean(occurrenceSurface && sourceDisplay) &&
    String(occurrenceSurface).trim() !== String(sourceDisplay).trim();
  const overviewSourceComponents: BibleIQSourceComponentEvidence[] =
    sourceComponents.length
      ? sourceComponents
      : sourceDisplay && alignment?.entityId
        ? [
            {
              kind: "lexical",
              sourceWord: occurrenceSurface || sourceDisplay,
              lemma: sourceDisplay,
              strong: alignment.strong,
              lexicalId: alignment.lexicalId,
              morph: alignment.morph,
              entityId: alignment.entityId,
              transliteration,
              pronunciation,
              shortDefinition: overviewLexicalMeaning || undefined,
              uniqueVerseCount,
              firstOccurrence,
              commonRenderings: principalRenderings,
            },
          ]
        : [];
  const lexicalComponents = overviewSourceComponents.filter(
    (component) => component.kind === "lexical",
  );
  const acrossScriptureLexicalComponents = (() => {
    const seen = new Set<string>();
    return lexicalComponents.filter((component, index) => {
      const key = String(
        component.entityId ||
          component.lexicalId ||
          component.sourceTokenId ||
          `component-${index}`,
      );
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();
  const spanEvidenceMeaning = hasAmbiguousLexicalSpan
    ? `The ${getTranslationLabel(translation)} rendering “${renderingText}” is supported by a source segment with multiple lexical or grammatical components. The alignment does not safely assign “${word}” to one source word by itself, so EMETSEES keeps the components distinct rather than forcing a one-to-one match. Their individual lexical evidence and Scripture usage are shown below.`
    : "";

  return (
    <div>
      <header className="pb-4">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.25em] text-[var(--muted)]">
          Selected word
        </p>
        <h2 className="mt-2 break-words text-[2.05rem] font-bold leading-[1.04] tracking-[-0.04em]">
          {word}
        </h2>
        <p className="mt-2 text-sm font-semibold text-[var(--muted)]">
          {book} {chapter}
          {verse ? `:${verse}` : ""} · {getTranslationLabel(translation)}
        </p>
      </header>

      <section className="border-t border-[var(--border)] py-5">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
          {emetReady ? emetScopeLabel : "Meaning"}
        </p>

        {emetReady ? (
          <>
            <h3 className="mt-2 text-[1.42rem] font-bold leading-8 tracking-[-0.025em]">
              {emet?.headline || "What this word means"}
            </h3>
            <p className="mt-3 text-[1.04rem] leading-7">{emet?.explanation}</p>
            {emet?.scope === "lexical-source" && isSpanRendering ? (
              <p className="mt-3 rounded-xl bg-[var(--surface)] px-3 py-2 text-sm leading-6 text-[var(--muted)]">
                EMET is explaining the lexical source word inside this Hebrew segment. WEB may use several English words to render the whole segment, shown below.
              </p>
            ) : null}
            {emet?.citations?.length ? (
              <p className="mt-3 text-xs font-semibold leading-5 text-[var(--muted)]">
                Evidence references · {emet.citations
                  .slice(0, 4)
                  .map(formatReaderCitation)
                  .join(" · ")}
              </p>
            ) : null}
          </>
        ) : spanEvidenceMeaning || readerFirstMeaning ? (
          <>
            <h3 className="mt-2 text-[1.38rem] font-bold leading-8 tracking-[-0.025em]">
              {hasAmbiguousLexicalSpan
                ? "What this source construction shows"
                : "What the available evidence supports"}
            </h3>
            <p className="mt-3 text-[1.04rem] leading-7">
              {spanEvidenceMeaning || readerFirstMeaning}
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              {hasAmbiguousLexicalSpan
                ? "This is a source-segment explanation, not a claim that one English word equals one source word."
                : "This summary stays with the lexical and alignment evidence available for this source context."}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            This source context is mapped, but there is not yet enough approved explanatory evidence to summarize its meaning without overclaiming.
          </p>
        )}
      </section>

      <section className="border-t border-[var(--border)] py-5">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
          In this verse
        </p>
        <h3 className="mt-2 text-xl font-bold tracking-[-0.02em]">
          How the English relates to the source
        </h3>

        <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="grid gap-3 text-sm leading-6">
            <div>
              <p className="text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                You tapped
              </p>
              <p className="mt-1 font-bold text-[var(--foreground)]">“{word}”</p>
            </div>

            {renderingText ? (
              <div>
                <p className="text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Rendered here
                </p>
                <p className="mt-1 font-semibold text-[var(--foreground)]">“{renderingText}”</p>
              </div>
            ) : null}

            {showOccurrenceSurface && occurrenceSurface ? (
              <div>
                <p className="text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                  {sourceLanguageLabel || "Source"} occurrence
                </p>
                <p
                  dir={alignment?.source === "hebrew" ? "rtl" : "ltr"}
                  className="mt-1 break-words text-[1.08rem] font-bold text-[var(--foreground)]"
                >
                  {occurrenceSurface}
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  The occurrence form preserves attached grammatical material. The lexical entry below identifies the source lemma without pretending those attached components are separate English words.
                </p>
              </div>
            ) : null}

            {isSpanRendering && sourceSegmentText ? (
              <div>
                <p className="text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Source segment
                </p>
                <p
                  dir={alignment?.source === "hebrew" ? "rtl" : "ltr"}
                  className="mt-1 break-words font-semibold text-[var(--foreground)]"
                >
                  {sourceSegmentText}
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  Phrase-to-segment alignment. The English words may jointly render lexical and grammatical source components.
                </p>
              </div>
            ) : null}

            {overviewSourceComponents.length ? (
              <div>
                <p className="text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                  {overviewSourceComponents.length === 1 ? "Source component" : "Source components"}
                </p>
                <div className="mt-2 space-y-2">
                  {overviewSourceComponents.map((component, index) => {
                    const componentWord =
                      (isSpanRendering
                        ? component.sourceWord || component.lemma
                        : component.lemma || sourceDisplay || component.sourceWord) ||
                      component.lexicalId ||
                      component.grammarId ||
                      `Component ${index + 1}`;
                    const componentTransliteration =
                      component.kind === "lexical"
                        ? component.transliteration ||
                          deriveReaderTransliteration(
                            component.sourceWord || component.lemma,
                            alignment?.source,
                            component.lexicalId,
                          )
                        : undefined;
                    const componentIdentity = [
                      component.strong || component.lexicalId,
                      component.partsOfSpeech?.[0],
                      component.morph && !component.partsOfSpeech?.length
                        ? component.morph
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const canOpenLexicalEvidence =
                      component.kind === "lexical" &&
                      /^word:(?:hebrew|greek-nt|lxx):[^:]+$/.test(
                        String(component.entityId || ""),
                      );
                    const lexicalLabel =
                      component.lemma ||
                      component.transliteration ||
                      component.strong ||
                      component.lexicalId ||
                      componentWord;

                    return (
                      <button
                        type="button"
                        key={`${
                          component.componentId ||
                          component.sourceTokenId ||
                          component.entityId ||
                          component.lexicalId ||
                          component.kind
                        }-${index}`}
                        onClick={() => {
                          if (canOpenLexicalEvidence && component.entityId) {
                            onOpenSourceEntity(component.entityId, lexicalLabel);
                          } else if (component.kind === "grammar") {
                            onView("technical");
                          }
                        }}
                        disabled={
                          !canOpenLexicalEvidence && component.kind !== "grammar"
                        }
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-left transition enabled:active:scale-[0.995] disabled:cursor-default"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <span
                                dir={alignment?.source === "hebrew" ? "rtl" : "ltr"}
                                className="break-words text-[1.02rem] font-bold"
                              >
                                {componentWord}
                              </span>
                              {componentTransliteration ? (
                                <span className="text-sm font-medium italic text-[var(--muted)]">
                                  {componentTransliteration}
                                </span>
                              ) : null}
                            </div>
                            {component.shortDefinition ? (
                              <p className="mt-1 text-sm leading-5 text-[var(--foreground)]">
                                {component.shortDefinition}
                              </p>
                            ) : null}
                            {componentIdentity ? (
                              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                                {componentIdentity}
                              </p>
                            ) : component.kind === "grammar" && component.morph ? (
                              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                                {component.morph}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
                            <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                              {component.kind === "lexical"
                                ? "Lexical source"
                                : "Grammar source"}
                            </span>
                            {canOpenLexicalEvidence || component.kind === "grammar" ? (
                              <Chevron />
                            ) : null}
                          </div>
                        </div>
                        {canOpenLexicalEvidence ? (
                          <p className="mt-2 text-xs font-semibold text-[var(--muted)]">
                            Open lexical evidence
                          </p>
                        ) : component.kind === "grammar" ? (
                          <p className="mt-2 text-xs font-semibold text-[var(--muted)]">
                            Open grammatical source record
                          </p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {meaningHere && !hasAmbiguousLexicalSpan ? (
          <p className="mt-3 text-[0.96rem] leading-7 text-[var(--muted)]">
            {meaningHere}
          </p>
        ) : null}

        {verseText ? (
          <blockquote className="mt-3 border-l-2 border-[var(--border)] pl-3 text-[0.9rem] italic leading-6 text-[var(--muted)]">
            “{verseText}”
          </blockquote>
        ) : null}
      </section>

      <section className="border-t border-[var(--border)] py-5">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
          Across Scripture
        </p>
        <h3 className="mt-2 text-xl font-bold tracking-[-0.02em]">
          {acrossScriptureLexicalComponents.length === 1
            ? "Explore the source word"
            : "Explore the source words"}
        </h3>

        {acrossScriptureLexicalComponents.length ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm leading-6 text-[var(--muted)]">
              {acrossScriptureLexicalComponents.length === 1
                ? "This source word keeps its own lexical identity, occurrence count, and rendering evidence. Open it for the full lexical record."
                : "This English rendering spans more than one lexical source word. Each source word keeps its own lexical identity and occurrence record; English subword ownership is not inferred from the phrase."}
            </p>

            {acrossScriptureLexicalComponents.length === 1 ? (
              <div className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
                <ExploreButtonRow
                  label="Common English renderings"
                  summary={
                    principalRenderings.length
                      ? summarizeRenderings(principalRenderings)
                      : "No reliable English rendering summary is available yet"
                  }
                  onClick={() => onView("renderings")}
                  disabled={!principalRenderings.length}
                />
              </div>
            ) : null}

            {acrossScriptureLexicalComponents.map((component, index) => {
              const componentWord =
                component.lemma ||
                component.sourceWord ||
                component.lexicalId ||
                `Source word ${index + 1}`;
              const componentTransliteration =
                component.transliteration ||
                deriveReaderTransliteration(
                  component.lemma || component.sourceWord,
                  alignment?.source,
                  component.lexicalId,
                );
              const countSummary = component.uniqueVerseCount
                ? `${component.uniqueVerseCount.toLocaleString()} verse${
                    component.uniqueVerseCount === 1 ? "" : "s"
                  }`
                : component.occurrenceCount
                  ? `${component.occurrenceCount.toLocaleString()} source occurrence${
                      component.occurrenceCount === 1 ? "" : "s"
                    }`
                  : "Occurrence count unavailable";
              const canOpenLexicalEvidence =
                component.kind === "lexical" &&
                /^word:(?:hebrew|greek-nt|lxx):[^:]+$/.test(
                  String(component.entityId || ""),
                );
              const lexicalLabel =
                component.lemma ||
                component.transliteration ||
                component.strong ||
                component.lexicalId ||
                componentWord;

              return (
                <button
                  type="button"
                  key={`${
                    component.entityId ||
                    component.componentId ||
                    component.sourceTokenId ||
                    component.lexicalId ||
                    "lexical-component"
                  }-${index}`}
                  onClick={() => {
                    if (canOpenLexicalEvidence && component.entityId) {
                      onOpenSourceEntity(component.entityId, lexicalLabel);
                    }
                  }}
                  disabled={!canOpenLexicalEvidence}
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition enabled:active:scale-[0.995] disabled:cursor-default"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span
                        dir={alignment?.source === "hebrew" ? "rtl" : "ltr"}
                        className="text-lg font-bold"
                      >
                        {componentWord}
                      </span>
                      {componentTransliteration ? (
                        <span className="text-sm font-medium italic text-[var(--muted)]">
                          {componentTransliteration}
                        </span>
                      ) : null}
                      {component.strong || component.lexicalId ? (
                        <span className="text-xs font-semibold text-[var(--muted)]">
                          {component.strong || component.lexicalId}
                        </span>
                      ) : null}
                    </div>
                    {canOpenLexicalEvidence ? <Chevron /> : null}
                  </div>
                  <p className="mt-2 text-xs font-semibold leading-5 text-[var(--muted)]">
                    {countSummary}
                    {component.firstOccurrence
                      ? ` · first: ${component.firstOccurrence.reference}`
                      : ""}
                  </p>
                  {canOpenLexicalEvidence ? (
                    <p className="mt-2 text-xs font-semibold text-[var(--muted)]">
                      Open full lexical evidence
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            This source context does not yet expose a safe lexical occurrence summary.
          </p>
        )}
      </section>

      <section className="border-t border-[var(--border)] py-5">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
          Evidence
        </p>
        <h3 className="mt-2 text-xl font-bold tracking-[-0.02em]">
          {emetReady ? "Verify the explanation" : "Inspect the evidence"}
        </h3>

        <div className="mt-3 divide-y divide-[var(--border)]">
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
            label="Related evidence"
            summary={
              hasConnections
                ? "Relationships, events, and themes"
                : "No reader-ready related evidence yet"
            }
            onClick={() => onView("connections")}
            disabled={!hasConnections}
          />
          {!isSpanRendering && alignment?.entityId ? (
            <ExploreButtonRow
              label="Source dictionary wording"
              summary={
                alignment.source === "lxx"
                  ? "LXX lexical ID and source dictionary evidence"
                  : `${alignment.lexicalId || alignment.strong || "Strong's"} · Strong's / lexicon evidence`
              }
              onClick={() => onView("lexicon")}
            />
          ) : null}
          <ExploreButtonRow
            label="Technical source record"
            summary="Alignment route, source forms, counts, and provenance"
            onClick={() => onView("technical")}
          />
        </div>
      </section>

      <p className="border-t border-[var(--border)] py-4 text-xs leading-5 text-[var(--muted)]">
        EMET explains. SEE and the source witnesses provide the evidence. English is treated as a rendering, not as the source text.
      </p>

      <button
        type="button"
        onClick={onClose}
        className="mb-2 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-bold"
      >
        Back to reading
      </button>
    </div>
  );

}


function SourceEntityDrilldown({
  label,
  data,
  loading,
  translation,
  backLabel,
  onBack,
}: {
  label: string;
  data: BibleIQResponse | null;
  loading: boolean;
  translation: string;
  backLabel: string;
  onBack: () => void;
}) {
  if (loading) {
    return (
      <div className="animate-pulse py-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-semibold text-[var(--muted)]"
        >
          ← Back to {backLabel}
        </button>
        <p className="mt-5 text-sm font-semibold text-[var(--muted)]">
          Loading lexical evidence...
        </p>
      </div>
    );
  }

  const entity = data?.entity;
  if (!entity) {
    return (
      <Panel>
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-semibold text-[var(--muted)]"
        >
          ← Back to {backLabel}
        </button>
        <SectionHeading
          eyebrow="Source component"
          title="Lexical evidence is not available"
        />
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          {data?.message ||
            "This source component does not currently resolve to a lexical runtime entity."}
        </p>
      </Panel>
    );
  }

  const evidence = entity.entityEvidence;
  const lexical = evidence?.lexical;
  const alignment = entity.alignment;
  const lemma =
    lexical?.lemma ||
    lexical?.normalizedLemma ||
    alignment?.lemma ||
    entity.evidence.originalLanguage?.lemma ||
    label;
  const transliteration =
    lexical?.transliteration ||
    entity.evidence.originalLanguage?.transliteration;
  const pronunciation =
    lexical?.pronunciation ||
    entity.evidence.originalLanguage?.pronunciation;
  const strong =
    lexical?.strong ||
    alignment?.strong ||
    entity.evidence.originalLanguage?.strong ||
    lexical?.lexicalId;
  const uniqueText = (values: Array<string | undefined>) =>
    Array.from(
      new Set(
        values
          .map((value) => String(value || "").replace(/\s+/g, " ").trim())
          .filter(Boolean),
      ),
    );
  const definitions = uniqueText([
    ...(lexical?.shortDefinitions || []),
    ...(lexical?.glosses || []),
  ]).slice(0, 6);
  const partsOfSpeech = uniqueText(lexical?.partsOfSpeech || []);
  const morphology = uniqueText([
    ...(lexical?.morphologyEnglish || []),
    ...(lexical?.morphology || []),
  ]).slice(0, 6);
  const principal = getPrincipalRenderings(evidence, label, translation);
  const uniqueVerseCount = evidence?.occurrenceSummary.uniqueVerseCount || 0;
  const firstOccurrence = evidence?.chronology.firstOccurrence?.reference;
  const witnesses = uniqueText(lexical?.witnesses || []);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-semibold text-[var(--muted)] transition active:scale-[0.98]"
      >
        ← Back to {backLabel}
      </button>

      <header className="pb-4">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.25em] text-[var(--muted)]">
          Lexical source
        </p>
        <h2
          dir={alignment?.source === "hebrew" ? "rtl" : "ltr"}
          className="mt-2 break-words text-[2rem] font-bold leading-[1.05] tracking-[-0.035em]"
        >
          {lemma}
        </h2>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-[var(--muted)]">
          {transliteration ? (
            <span className="font-semibold italic text-[var(--foreground)]">
              {transliteration}
            </span>
          ) : null}
          {strong ? <span>{strong}</span> : null}
          <span>{getSourceLabel(alignment?.source)}</span>
        </div>
      </header>

      <section className="border-t border-[var(--border)] py-5">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
          Lexical evidence
        </p>
        <h3 className="mt-2 text-xl font-bold tracking-[-0.02em]">
          Source identity and lexicon
        </h3>

        <div className="mt-4 space-y-3">
          {pronunciation ? (
            <InfoRow label="Pronunciation" value={pronunciation} />
          ) : null}
          {strong ? <InfoRow label="Lexical ID" value={strong} /> : null}
          {partsOfSpeech.length ? (
            <InfoRow label="Part of speech" value={partsOfSpeech.join(" · ")} />
          ) : null}
          {morphology.length ? (
            <InfoRow label="Morphology evidence" value={morphology.join(" · ")} />
          ) : null}
        </div>

        {definitions.length ? (
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-[0.66rem] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
              Lexicon wording
            </p>
            <p className="mt-2 text-[0.96rem] leading-7">
              {definitions[0]}
            </p>
            {definitions.length > 1 ? (
              <details className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-bold text-[var(--muted)]">
                  <span>Raw lexicon glosses and usage</span>
                  <Chevron />
                </summary>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-[var(--muted)]">
                  {definitions.slice(1).map((definition) => (
                    <li key={definition} className="break-words [overflow-wrap:anywhere]">
                      {definition}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="border-t border-[var(--border)] py-5">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
          Across Scripture
        </p>
        <h3 className="mt-2 text-xl font-bold tracking-[-0.02em]">
          Entity-owned lexical usage
        </h3>
        <div className="mt-3 space-y-2 text-sm leading-6">
          <InfoRow
            label="Occurrences"
            value={
              uniqueVerseCount
                ? `${uniqueVerseCount.toLocaleString()} verse${
                    uniqueVerseCount === 1 ? "" : "s"
                  }`
                : "No verse count available"
            }
          />
          {firstOccurrence ? (
            <InfoRow label="First occurrence" value={firstOccurrence} />
          ) : null}
          <InfoRow
            label={`${getTranslationLabel(translation)} renderings`}
            value={
              principal.length
                ? summarizeRenderings(principal)
                : "No entity-owned rendering summary available"
            }
          />
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
          These counts and rendering forms come from this lexical entity’s runtime record. Phrase/segment alignments remain phrase/segment evidence; EMETSEES does not convert them into one-to-one English subword ownership.
        </p>
      </section>

      {witnesses.length ? (
        <section className="border-t border-[var(--border)] py-5">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
            Source witnesses
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {witnesses.join(" · ")}
          </p>
        </section>
      ) : null}
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
  principalRenderings,
  onRenderings,
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
  principalRenderings: BibleIQRenderingForm[];
  onRenderings: () => void;
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
  const sourceLanguageLabel =
    alignment?.source === "hebrew" ? "Hebrew" : "Greek";
  const englishSummary = summarizeRenderings(principalRenderings);

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

      {principalRenderings.length ? (
        <Panel>
          <SectionHeading
            eyebrow="In English"
            title="How this word is expressed in English"
          />
          <p className="mt-3 text-[1rem] leading-7">
            {englishSummary}
          </p>
          <div className="mt-3 divide-y divide-[var(--border)]">
            {principalRenderings.slice(0, 6).map((form) => (
              <button
                key={`${form.translation}-${form.text}`}
                type="button"
                onClick={onRenderings}
                className="flex w-full items-center justify-between gap-4 py-3 text-left transition active:opacity-70"
              >
                <span className="text-sm font-bold">{form.text}</span>
                <span className="shrink-0 text-xs text-[var(--muted)]">
                  {form.count.toLocaleString()} use
                  {form.count === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onRenderings}
            className="mt-3 text-sm font-bold text-amber-700 dark:text-amber-300"
          >
            See all English renderings ›
          </button>
        </Panel>
      ) : null}

      {definitions.length ? (
        <Panel>
          <SectionHeading
            eyebrow="Lexicon meaning"
            title="Source dictionary wording"
          />
          <p className="mt-4 text-[1.02rem] leading-7">
            {definitions[0]}
          </p>
          {definitions.length > 1 ? (
            <details className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-[var(--muted)]">
                <span>Raw lexicon glosses and usage</span>
                <Chevron />
              </summary>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
                {definitions.slice(1).map((definition) => (
                  <li key={definition} className="flex min-w-0 gap-2">
                    <span aria-hidden="true" className="shrink-0 text-[var(--brand)]">•</span>
                    <span className="min-w-0 break-words [overflow-wrap:anywhere]">{definition}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Panel>
      ) : null}

      {sourceForms.length ? (
        <Panel>
          <details>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
              <span>
                <span className="block text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                  Optional original-language detail
                </span>
                <span className="mt-1 block text-xl font-bold">
                  {sourceLanguageLabel} forms in Scripture
                </span>
              </span>
              <Chevron />
            </summary>

            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
              These are different written forms of the same {sourceLanguageLabel}
              word. You do not need to read {sourceLanguageLabel} to use this
              study—the English meanings and renderings are shown above.
            </p>

            <div className="mt-4 space-y-2">
              {sourceForms.map((form) => (
                <div
                  key={`${form.surface}-${form.count}`}
                  className="flex items-center justify-between gap-4 border-b border-[var(--border)] py-3"
                >
                  <span className="min-w-0 break-words text-base font-bold">
                    {form.surface}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">
                    {form.count.toLocaleString()} occurrence
                    {form.count === 1 ? "" : "s"}
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
          </details>
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
      <ViewTitle eyebrow="Renderings" title="How this word is expressed in English" />

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
                className="flex items-center justify-between gap-4 border-b border-[var(--border)] py-3"
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

function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="border-t border-[var(--border)] py-5">
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
    <header className="mb-4">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.25em] text-[var(--muted)]">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-[1.65rem] font-bold leading-tight tracking-[-0.035em]">
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
      className="w-full rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-800 dark:text-amber-200"
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
    <article className="border-b border-[var(--border)] py-4 transition active:opacity-70">
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
    <article className="border-b border-[var(--border)] py-4 transition active:opacity-70">
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
    <article className="border-b border-[var(--border)] py-4">
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
    <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
      <p className="shrink-0 text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
        {label}
      </p>
      <div className="min-w-0 w-full break-words text-left text-sm font-bold leading-6 [overflow-wrap:anywhere] sm:w-auto sm:text-right">
        {value}
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="border-l-2 border-[var(--border)] pl-4 text-sm leading-6 text-[var(--muted)]">
      {children}
    </div>
  );
}
