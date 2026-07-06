const fs = require("fs");
const path = require("path");

const lexiconDir = path.join(process.cwd(), "app", "data", "lexicon");
const outputDir = path.join(process.cwd(), "app", "data", "word-study");
const outputPath = path.join(outputDir, "generatedWordStudyApi.json");

const lexiconFiles = [
  "generatedHebrewLexiconV12.json",
  "generatedNTGreekLexiconV12.json",
  "generatedLXXGreekLexiconV12.json",
];

const englishGlossIndexPath = path.join(
  lexiconDir,
  "generatedEnglishGlossIndex.json"
);

const canonicalBookOrder = [
  "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth",
  "1Sam", "2Sam", "1Kgs", "2Kgs", "1Chr", "2Chr", "Ezra", "Neh",
  "Esth", "Job", "Ps", "Prov", "Eccl", "Song", "Isa", "Jer", "Lam",
  "Ezek", "Dan", "Hos", "Joel", "Amos", "Obad", "Jonah", "Mic",
  "Nah", "Hab", "Zeph", "Hag", "Zech", "Mal",

  "Tob", "Jdt", "Wis", "Sir", "Bar", "1Macc", "2Macc",

  "Matt", "Mark", "Luke", "John", "Acts", "Rom", "1Cor", "2Cor",
  "Gal", "Eph", "Phil", "Col", "1Thess", "2Thess", "1Tim",
  "2Tim", "Titus", "Phlm", "Heb", "Jas", "1Pet", "2Pet",
  "1John", "2John", "3John", "Jude", "Rev",
];

const bookIndex = new Map(
  canonicalBookOrder.map((book, index) => [book, index])
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseReference(occurrence) {
  const reference = String(occurrence.reference || "");
  const parts = reference.split(".");

  const book = occurrence.book || parts[0] || "";
  const chapter = Number(occurrence.chapter || parts[1] || 999);
  const verse = Number(occurrence.verse || parts[2] || 999);

  return {
    book,
    chapter: Number.isFinite(chapter) ? chapter : 999,
    verse: Number.isFinite(verse) ? verse : 999,
  };
}

function sortOccurrences(occurrences) {
  return [...occurrences].sort((a, b) => {
    const aa = parseReference(a);
    const bb = parseReference(b);

    return (
      (bookIndex.get(aa.book) ?? 9999) - (bookIndex.get(bb.book) ?? 9999) ||
      aa.chapter - bb.chapter ||
      aa.verse - bb.verse
    );
  });
}

function compactOccurrence(occurrence) {
  const parsed = parseReference(occurrence);

  return {
    book: parsed.book,
    reference:
      occurrence.reference ||
      `${parsed.book}.${parsed.chapter}.${parsed.verse}`,
    chapter: parsed.chapter === 999 ? null : parsed.chapter,
    verse: parsed.verse === 999 ? null : parsed.verse,
    surface: occurrence.surface || occurrence.word || "",
    word: occurrence.word || "",
  };
}

function compactEntry(entry) {
  const sortedOccurrences = Array.isArray(entry.occurrences)
    ? sortOccurrences(entry.occurrences)
    : [];

  return {
    strong: entry.strong || "",
    lemma: entry.lemma || "",
    transliteration: entry.transliteration || "",
    language: entry.language || "",
    corpus: entry.corpus || "",
    gloss: entry.gloss || "",
    shortDefinition: entry.shortDefinition || entry.fullDefinition || "",
    occurrenceCount: entry.occurrenceCount || sortedOccurrences.length || 0,
    occurrences: sortedOccurrences.slice(0, 80).map(compactOccurrence),
  };
}

const byStrong = {};

for (const file of lexiconFiles) {
  const entries = readJson(path.join(lexiconDir, file));

  for (const entry of entries) {
    if (!entry.strong) continue;

    const compact = compactEntry(entry);

    if (!byStrong[entry.strong]) {
      byStrong[entry.strong] = [];
    }

    byStrong[entry.strong].push(compact);
  }
}

const sourceEnglishIndex = readJson(englishGlossIndexPath);
const englishIndex = {};

for (const key of Object.keys(sourceEnglishIndex)) {
  englishIndex[key] = sourceEnglishIndex[key]
    .slice(0, 12)
    .map((entry) => ({
      strong: entry.strong || "",
      corpus: entry.corpus || "",
      weight: entry.weight || 0,
    }))
    .filter((entry) => entry.strong);
}

fs.mkdirSync(outputDir, { recursive: true });

fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      byStrong,
      englishIndex,
    },
    null,
    0
  ),
  "utf8"
);

console.log("Built compact Word Study API data");
console.log(`Saved to ${outputPath}`);
console.log(`${Object.keys(byStrong).length} Strong's keys`);
console.log(`${Object.keys(englishIndex).length} English keys`);