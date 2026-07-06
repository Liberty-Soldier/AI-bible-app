const fs = require("fs");
const path = require("path");

const root = process.cwd();

const lexiconPath = path.join(
  root,
  "app",
  "data",
  "word-study",
  "generatedWordStudyApi.json"
);

const outputPath = path.join(
  root,
  "app",
  "data",
  "lexicon",
  "generatedVerseContextIndex.json"
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function sourceFromCorpus(corpus) {
  const value = normalize(corpus);

  if (value.includes("hebrew")) return "hebrew";
  if (value.includes("septuagint")) return "lxx";
  if (value.includes("greek")) return "greek-nt";

  return "hebrew";
}

function buildReferenceKey(source, occurrence) {
  const book = occurrence.book || "";
  const chapter = occurrence.chapter || "";
  const verse = occurrence.verse || "";

  if (!book || !chapter || !verse) return null;

  return `${source}:${book}:${chapter}:${verse}`;
}

function addToken(index, key, token) {
  if (!key) return;

  if (!index[key]) index[key] = [];

  const dedupeKey = [
    token.display,
    token.sourceWord,
    token.strong,
    token.lemmaId,
  ].join("|");

  const exists = index[key].some((item) => {
    return [item.display, item.sourceWord, item.strong, item.lemmaId].join("|") === dedupeKey;
  });

  if (!exists) index[key].push(token);
}

function buildDisplayCandidates(entry, occurrence) {
  return [
    occurrence.word,
    occurrence.surface,
    entry.lemma,
    entry.transliteration,
    entry.gloss,
  ]
    .filter(Boolean)
    .map(String);
}

function main() {
  const apiData = readJson(lexiconPath);
  const index = {};

  for (const matches of Object.values(apiData.byStrong || {})) {
    if (!Array.isArray(matches)) continue;

    for (const entry of matches) {
      const source = sourceFromCorpus(entry.corpus || entry.language);
      const strong = entry.strong || "";
      const lemmaId = strong ? `${source}:${strong}` : "";

      for (const occurrence of entry.occurrences || []) {
        const key = buildReferenceKey(source, occurrence);
        if (!key) continue;

        const displayCandidates = buildDisplayCandidates(entry, occurrence);

        for (const display of displayCandidates) {
          addToken(index, key, {
            display,
            displayNorm: normalize(display),
            sourceWord: occurrence.word || occurrence.surface || entry.lemma || "",
            lemma: entry.lemma || "",
            transliteration: entry.transliteration || "",
            strong,
            lemmaId,
            source,
          });
        }
      }
    }
  }

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    verseCount: Object.keys(index).length,
    index,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");

  console.log(`Generated verse context index for ${output.verseCount} verses`);
  console.log(outputPath);
}

main();