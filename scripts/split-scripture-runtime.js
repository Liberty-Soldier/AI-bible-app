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

for (const [translation, fileName] of translations) {
  const inputFile = path.join(root, "app", "data", "scripture", fileName);

  const outputRoot = path.join(
    root,
    "public",
    "scripture",
    "runtime",
    translation
  );

  cleanOutputDir(outputRoot);

  const verses = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  const byBookChapter = {};

  for (const verse of verses) {
    if (!verse?.book || !verse?.chapter) continue;

    const bookKey = safeBook(verse.book);
    const chapterKey = String(verse.chapter);

    if (!byBookChapter[bookKey]) byBookChapter[bookKey] = {};
    if (!byBookChapter[bookKey][chapterKey]) {
      byBookChapter[bookKey][chapterKey] = [];
    }

    byBookChapter[bookKey][chapterKey].push(verse);
  }

  for (const [bookKey, chapters] of Object.entries(byBookChapter)) {
    const bookDir = path.join(outputRoot, bookKey);
    ensureDir(bookDir);

    for (const [chapterKey, chapterVerses] of Object.entries(chapters)) {
      chapterVerses.sort((a, b) => a.verse - b.verse);

      fs.writeFileSync(
        path.join(bookDir, `${chapterKey}.json`),
        JSON.stringify(chapterVerses),
        "utf8"
      );
    }
  }

  console.log(`Split ${translation}: ${Object.keys(byBookChapter).length} books`);
}