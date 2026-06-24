const fs = require("fs");
const path = require("path");

const lexiconDir = path.join(process.cwd(), "app", "data", "lexicon");

const outputPath = path.join(lexiconDir, "generatedEnglishGlossIndex.json");

const files = [
  "generatedHebrewLexiconV12.json",
  "generatedNTGreekLexiconV12.json",
  "generatedLXXGreekLexiconV12.json",
];

const stopWords = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "by",
  "for",
  "from",
  "with",
  "as",
  "is",
  "be",
  "being",
  "used",
  "properly",
  "figuratively",
  "literally",
  "hence",
  "i",
  "e",
  "ie",
]);

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

function add(index, key, entry, weight) {
  const clean = normalize(key);

  if (!clean || clean.length < 2 || stopWords.has(clean)) return;

  if (!index[clean]) index[clean] = [];

  const existing = index[clean].find(
    (item) => item.strong === entry.strong && item.corpus === entry.corpus
  );

  if (existing) {
    existing.weight += weight;
    return;
  }

  index[clean].push({
    strong: entry.strong || "",
    lemma: entry.lemma || "",
    transliteration: entry.transliteration || "",
    gloss: entry.gloss || "",
    definition: entry.shortDefinition || entry.fullDefinition || "",
    occurrenceCount: entry.occurrenceCount || 0,
    language: entry.language || "",
    corpus: entry.corpus || "",
    weight,
  });
}

const index = {};

for (const file of files) {
  const entries = readJson(file);

  for (const entry of entries) {
    const gloss = normalize(entry.gloss);

    if (!gloss) continue;

    // exact full gloss phrase
    add(index, gloss, entry, 1000);

    // individual gloss words only, not full definitions
    for (const word of gloss.split(/\s+/)) {
      add(index, word, entry, 500);
    }

    // transliteration exact
    if (entry.transliteration) {
      add(index, entry.transliteration, entry, 700);
    }
  }
}

for (const key of Object.keys(index)) {
  index[key] = index[key]
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return (b.occurrenceCount || 0) - (a.occurrenceCount || 0);
    })
    .slice(0, 12);
}

fs.writeFileSync(outputPath, JSON.stringify(index, null, 2), "utf8");

console.log(`Built English gloss index with ${Object.keys(index).length} keys`);
console.log(`Saved to ${outputPath}`);