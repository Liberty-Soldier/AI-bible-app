const hebrew = require("../app/data/lexicon/generatedHebrewLexiconV12.json");
const ntGreek = require("../app/data/lexicon/generatedNTGreekLexiconV12.json");
const lxxGreek = require("../app/data/lexicon/generatedLXXGreekLexiconV12.json");

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ʼʾʻʿ`'’]/g, "")
    .replace(/ôw/g, "o")
    .replace(/ow/g, "o")
    .replace(/âh/g, "ah")
    .replace(/â/g, "a")
    .replace(/ê/g, "e")
    .replace(/î/g, "i")
    .replace(/û/g, "u")
    .replace(/[^a-zA-Z0-9\u0590-\u05FF\u0370-\u03FF]+/g, "")
    .toLowerCase()
    .trim();
}

const allEntries = [
  ...hebrew,
  ...ntGreek,
  ...lxxGreek,
];

function scoreEntry(entry, search) {
  let score = 0;

  const strong = normalize(entry.strong);
  const lemma = normalize(entry.lemma);
  const transliteration = normalize(entry.transliteration);
  const gloss = normalize(entry.gloss);
  const definition = normalize(entry.shortDefinition);

  if (strong === search) score += 1000;
  if (lemma === search) score += 900;
  if (transliteration === search) score += 850;
  if (gloss === search) score += 800;

  if (strong.includes(search)) score += 300;
  if (lemma.includes(search)) score += 250;
  if (transliteration.includes(search)) score += 225;
  if (gloss.includes(search)) score += 200;
  if (definition.includes(search)) score += 50;

  return score;
}

function searchLexicon(query) {
  const search = normalize(query);

  return allEntries
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, search),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.entry);
}

const query = process.argv[2];

if (!query) {
  console.log("Usage:");
  console.log("node scripts/test-unified-lexicon-v12.js law");
  process.exit(0);
}

const results = searchLexicon(query);

console.log(`Found ${results.length} matches\n`);

for (const entry of results.slice(0, 20)) {
  console.log(
    `${entry.strong || "-"} | ${entry.lemma || "-"} | ${entry.transliteration || "-"}`
  );

  console.log(
    `${entry.language} | ${entry.corpus}`
  );

  console.log(
    entry.shortDefinition || entry.gloss || ""
  );

  console.log("--------------------------------------------------");
}