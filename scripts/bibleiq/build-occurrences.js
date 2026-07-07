const fs = require("fs");
const path = require("path");
const { formatReference, parseReference } = require("./text-utils");

const root = process.cwd();

const WEB_PATH = path.join(
  root,
  "app",
  "data",
  "scripture",
  "generatedWEB.json"
);

const KJV_PATH = path.join(
  root,
  "app",
  "data",
  "scripture",
  "generatedKJV.json"
);

const CANONICAL_BOOK_ORDER = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
];

const BOOK_ALIASES = {
  Gen: "Genesis",
  Exod: "Exodus",
  Exo: "Exodus",
  Lev: "Leviticus",
  Num: "Numbers",
  Deut: "Deuteronomy",
  Deu: "Deuteronomy",
  Josh: "Joshua",
  Jos: "Joshua",
  Judg: "Judges",
  Jdg: "Judges",
  Ruth: "Ruth",
  "1Sam": "1 Samuel",
  "1 Sam": "1 Samuel",
  "2Sam": "2 Samuel",
  "2 Sam": "2 Samuel",
  "1Kgs": "1 Kings",
  "1 Kgs": "1 Kings",
  "1Kin": "1 Kings",
  "1 Kings": "1 Kings",
  "2Kgs": "2 Kings",
  "2 Kgs": "2 Kings",
  "2Kin": "2 Kings",
  "2 Kings": "2 Kings",
  "1Chr": "1 Chronicles",
  "1 Chr": "1 Chronicles",
  "1 Chronicles": "1 Chronicles",
  "2Chr": "2 Chronicles",
  "2 Chr": "2 Chronicles",
  "2 Chronicles": "2 Chronicles",
  Ezra: "Ezra",
  Neh: "Nehemiah",
  Nehemiah: "Nehemiah",
  Esth: "Esther",
  Esther: "Esther",
  Job: "Job",
  Ps: "Psalms",
  Psa: "Psalms",
  Psalm: "Psalms",
  Psalms: "Psalms",
  Prov: "Proverbs",
  Pro: "Proverbs",
  Proverbs: "Proverbs",
  Eccl: "Ecclesiastes",
  Ecc: "Ecclesiastes",
  Ecclesiastes: "Ecclesiastes",
  Song: "Song of Solomon",
  "Song of Songs": "Song of Solomon",
  "Song of Solomon": "Song of Solomon",
  Isa: "Isaiah",
  Isaiah: "Isaiah",
  Jer: "Jeremiah",
  Jeremiah: "Jeremiah",
  Lam: "Lamentations",
  Lamentations: "Lamentations",
  Ezek: "Ezekiel",
  Eze: "Ezekiel",
  Ezekiel: "Ezekiel",
  Dan: "Daniel",
  Daniel: "Daniel",
  Hos: "Hosea",
  Hosea: "Hosea",
  Joel: "Joel",
  Amos: "Amos",
  Obad: "Obadiah",
  Obadiah: "Obadiah",
  Jonah: "Jonah",
  Jon: "Jonah",
  Mic: "Micah",
  Micah: "Micah",
  Nah: "Nahum",
  Nahum: "Nahum",
  Hab: "Habakkuk",
  Habakkuk: "Habakkuk",
  Zeph: "Zephaniah",
  Zephaniah: "Zephaniah",
  Hag: "Haggai",
  Haggai: "Haggai",
  Zech: "Zechariah",
  Zechariah: "Zechariah",
  Mal: "Malachi",
  Malachi: "Malachi",
};

const BOOK_INDEX = new Map(
  CANONICAL_BOOK_ORDER.map((book, index) => [book, index])
);

let verseTextByReferenceCache = null;

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeBook(book) {
  const value = String(book || "").trim();
  return BOOK_ALIASES[value] || value;
}

function normalizeReference(value) {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  const parsed = parseReference(raw);

  if (!parsed.book || !parsed.chapter || !parsed.verse) {
    return raw;
  }

  const book = normalizeBook(parsed.book);

  return `${book} ${parsed.chapter}:${parsed.verse}`;
}

function extractVerseText(verse) {
  if (!verse) return "";

  if (typeof verse.text === "string") return verse.text;

  if (Array.isArray(verse.sources)) {
    const englishSource =
      verse.sources.find((source) => source?.language === "english") ||
      verse.sources[0];

    return String(englishSource?.text || "").trim();
  }

  return "";
}

function buildVerseTextByReference() {
  if (verseTextByReferenceCache) return verseTextByReferenceCache;

  const map = new Map();

  for (const filePath of [WEB_PATH, KJV_PATH]) {
    const verses = readJsonIfExists(filePath);

    if (!Array.isArray(verses)) continue;

    for (const verse of verses) {
      const reference = normalizeReference(verse.reference);

      if (!reference || map.has(reference)) continue;

      const text = extractVerseText(verse);
      if (!text) continue;

      map.set(reference, text);
    }
  }

  verseTextByReferenceCache = map;
  return map;
}

function getVerseText(reference) {
  const map = buildVerseTextByReference();
  const normalizedReference = normalizeReference(reference);

  return map.get(normalizedReference) || "";
}

function canonicalSortKey(occurrence) {
  const parsed = parseReference(occurrence.reference);
  const book = normalizeBook(parsed.book || occurrence.book || "");
  const bookIndex = BOOK_INDEX.has(book) ? BOOK_INDEX.get(book) : 999;

  return {
    bookIndex,
    chapter: Number(parsed.chapter || occurrence.chapter || 999),
    verse: Number(parsed.verse || occurrence.verse || 999),
    reference: normalizeReference(occurrence.reference),
  };
}

function compareOccurrences(a, b) {
  const left = canonicalSortKey(a);
  const right = canonicalSortKey(b);

  return (
    left.bookIndex - right.bookIndex ||
    left.chapter - right.chapter ||
    left.verse - right.verse ||
    left.reference.localeCompare(right.reference)
  );
}

function buildOccurrences(lemmaEntry) {
  const rawOccurrences = Array.isArray(lemmaEntry?.occurrences)
    ? lemmaEntry.occurrences
    : [];

  const sortedOccurrences = [...rawOccurrences].sort(compareOccurrences);

  return sortedOccurrences.slice(0, 100).map((occurrence) => {
    const parsed = parseReference(occurrence.reference);
    const formattedReference = normalizeReference(formatReference(occurrence.reference));
    const normalizedBook = normalizeBook(parsed.book || occurrence.book || "");

    return {
      reference: formattedReference,
      book: normalizedBook,
      chapter: parsed.chapter,
      verse: parsed.verse,
      englishText: getVerseText(formattedReference),
      sourceWord: occurrence.surface || "",
      source: "hebrew",
      morph: occurrence.morph || undefined,
    };
  });
}

module.exports = { buildOccurrences };