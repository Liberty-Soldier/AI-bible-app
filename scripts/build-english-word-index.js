const fs = require("fs");
const path = require("path");

const lexiconDir = path.join(process.cwd(), "app", "data", "lexicon");

const outputPath = path.join(
  lexiconDir,
  "generatedEnglishWordIndex.json"
);

const files = [
  "generatedHebrewLexiconV12.json",
  "generatedNTGreekLexiconV12.json",
  "generatedLXXGreekLexiconV12.json",
];

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(lexiconDir, name), "utf8"));
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function addWord(index, word, entry) {
  const clean = normalize(word);

  if (!clean || clean.length < 2) return;

  if (!index[clean]) {
    index[clean] = [];
  }

  if (index[clean].length >= 20) return;

  index[clean].push({
    strong: entry.strong || "",
    lemma: entry.lemma || "",
    transliteration: entry.transliteration || "",
    gloss: entry.gloss || "",
    definition: entry.shortDefinition || entry.fullDefinition || "",
    occurrenceCount: entry.occurrenceCount || 0,
    language: entry.language || "",
    corpus: entry.corpus || "",
  });
}

const index = {};

for (const file of files) {
  const entries = readJson(file);

  for (const entry of entries) {
    addWord(index, entry.gloss, entry);

    const definition = normalize(
      `${entry.shortDefinition || ""} ${entry.fullDefinition || ""}`
    );

    for (const word of definition.split(/\s+/)) {
      addWord(index, word, entry);
    }
  }
}

fs.writeFileSync(outputPath, JSON.stringify(index, null, 2), "utf8");

console.log(`Built English word index with ${Object.keys(index).length} keys`);
console.log(`Saved to ${outputPath}`);