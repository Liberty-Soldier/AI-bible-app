const fs = require("fs");
const path = require("path");

const lexiconDir = path.join(process.cwd(), "app", "data", "lexicon");
const outputDir = path.join(process.cwd(), "app", "api", "word-study", "data");
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function compactEntry(entry) {
  return {
    strong: entry.strong || "",
    lemma: entry.lemma || "",
    transliteration: entry.transliteration || "",
    language: entry.language || "",
    corpus: entry.corpus || "",
    gloss: entry.gloss || "",
    shortDefinition: entry.shortDefinition || entry.fullDefinition || "",
    occurrenceCount: entry.occurrenceCount || 0,
    occurrences: Array.isArray(entry.occurrences)
      ? entry.occurrences.slice(0, 80).map((occurrence) => ({
          book: occurrence.book || "",
          reference: occurrence.reference || "",
          chapter: occurrence.chapter || null,
          verse: occurrence.verse || null,
          surface: occurrence.surface || occurrence.word || "",
          word: occurrence.word || "",
        }))
      : [],
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

console.log(`Built compact Word Study API data`);
console.log(`Saved to ${outputPath}`);
console.log(`${Object.keys(byStrong).length} Strong's keys`);
console.log(`${Object.keys(englishIndex).length} English keys`);