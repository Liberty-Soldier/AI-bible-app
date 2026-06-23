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

function searchLexicon(query) {
  const search = normalize(query);

  return allEntries.filter((entry) => {
    return [
      entry.strong,
      entry.lemma,
      entry.normalizedLemma,
      entry.transliteration,
      entry.gloss,
      entry.shortDefinition,
    ]
      .filter(Boolean)
      .some((value) => normalize(value).includes(search));
  });
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