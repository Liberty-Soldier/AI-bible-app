const fs = require("fs");
const path = require("path");

const root = process.cwd();

const translations = [
  ["web", "generatedWEB.json"],
  ["kjv", "generatedKJV.json"],
  ["brenton", "generatedBrenton.json"],
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeBook(book) {
  return String(book || "")
    .replace(/[^1-3A-Za-z ]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

function cleanOutputDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  ensureDir(dir);
}

function verseSortKey(label) {
  const match = /^(\d+)([A-Za-z]*)$/.exec(String(label || ""));

  return {
    number: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
    suffix: match ? match[2] : String(label || ""),
  };
}

function compareVerseLabels(left, right) {
  const a = verseSortKey(left);
  const b = verseSortKey(right);

  return a.number - b.number || a.suffix.localeCompare(b.suffix);
}

function normalizeRuntimeVerse(verse) {
  const book = String(verse?.book ?? verse?.display?.book ?? "");
  const chapter = Number(
    verse?.chapter ?? verse?.display?.chapter ?? 0,
  );
  const verseLabel = String(
    verse?.verseLabel ?? verse?.display?.verseLabel ?? verse?.verse ?? "",
  );
  const numericVerse = Number(
    verse?.verse ??
      verse?.display?.numericVerse ??
      verseSortKey(verseLabel).number,
  );

  return {
    ...verse,
    book,
    chapter,
    verse: Number.isFinite(numericVerse) ? numericVerse : 0,
    verseLabel,
  };
}

function unwrapTranslationDocument(document) {
  if (Array.isArray(document)) {
    return {
      verses: document,
      superscriptions: [],
      structured: false,
    };
  }

  if (
    document &&
    typeof document === "object" &&
    Array.isArray(document.verses)
  ) {
    return {
      verses: document.verses,
      superscriptions: Array.isArray(document.superscriptions)
        ? document.superscriptions
        : [],
      structured: true,
    };
  }

  throw new Error("Translation document must be an array or a structured reader object.");
}

for (const [translation, fileName] of translations) {
  const inputFile = path.join(root, "app", "data", "scripture", fileName);
  const outputRoot = path.join(
    root,
    "public",
    "scripture",
    "runtime",
    translation,
  );

  cleanOutputDir(outputRoot);

  const sourceDocument = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  const { verses, superscriptions, structured } =
    unwrapTranslationDocument(sourceDocument);
  const byBookChapter = {};
  const titlesByBookChapter = {};

  for (const rawVerse of verses) {
    const verse = normalizeRuntimeVerse(rawVerse);

    if (!verse.book || !verse.chapter || !verse.verseLabel) continue;

    const bookKey = safeBook(verse.book);
    const chapterKey = String(verse.chapter);

    if (!byBookChapter[bookKey]) byBookChapter[bookKey] = {};
    if (!byBookChapter[bookKey][chapterKey]) {
      byBookChapter[bookKey][chapterKey] = [];
    }

    byBookChapter[bookKey][chapterKey].push(verse);
  }

  for (const title of superscriptions) {
    const book = String(title?.source?.book || "");
    const chapter = Number(title?.source?.chapter || 0);

    if (!book || !chapter) continue;

    const bookKey = safeBook(book);
    const chapterKey = String(chapter);

    if (!titlesByBookChapter[bookKey]) {
      titlesByBookChapter[bookKey] = {};
    }
    if (!titlesByBookChapter[bookKey][chapterKey]) {
      titlesByBookChapter[bookKey][chapterKey] = [];
    }

    titlesByBookChapter[bookKey][chapterKey].push(title);
  }

  const bookKeys = new Set([
    ...Object.keys(byBookChapter),
    ...Object.keys(titlesByBookChapter),
  ]);

  for (const bookKey of [...bookKeys].sort()) {
    const chapters = byBookChapter[bookKey] || {};
    const titleChapters = titlesByBookChapter[bookKey] || {};
    const bookDir = path.join(outputRoot, bookKey);
    ensureDir(bookDir);

    const chapterKeys = new Set([
      ...Object.keys(chapters),
      ...Object.keys(titleChapters),
    ]);

    for (const chapterKey of [...chapterKeys].sort(
      (left, right) => Number(left) - Number(right),
    )) {
      const chapterVerses = chapters[chapterKey] || [];
      const chapterTitles = titleChapters[chapterKey] || [];

      chapterVerses.sort((left, right) =>
        compareVerseLabels(left.verseLabel, right.verseLabel),
      );

      const payload =
        structured || chapterTitles.length
          ? {
              verses: chapterVerses,
              superscriptions: chapterTitles,
            }
          : chapterVerses;

      fs.writeFileSync(
        path.join(bookDir, `${chapterKey}.json`),
        JSON.stringify(payload),
        "utf8",
      );
    }
  }

  console.log(`Split ${translation}: ${bookKeys.size} books`);
}
