const fs = require("fs");
const path = require("path");

const lexiconDir = path.join(process.cwd(), "app", "data", "lexicon");

const outputPath = path.join(
  lexiconDir,
  "generatedConceptCandidates.json"
);

const files = {
  hebrew: "generatedHebrewLexiconV12.json",
  ntGreek: "generatedNTGreekLexiconV12.json",
  lxxGreek: "generatedLXXGreekLexiconV12.json",
};

const conceptSeeds = [
  "law",
  "sin",
  "covenant",
  "kingdom",
  "faith",
  "believe",
  "love",
  "mercy",
  "grace",
  "truth",
  "righteousness",
  "holy",
  "spirit",
  "soul",
  "heart",
  "flesh",
  "life",
  "death",
  "wisdom",
  "knowledge",
  "repent",
  "forgive",
  "sacrifice",
  "offering",
  "priest",
  "temple",
  "altar",
  "blood",
  "clean",
  "unclean",
  "sabbath",
  "commandment",
  "judgment",
  "justice",
  "peace",
  "evil",
  "good",
  "light",
  "darkness",
  "glory",
  "worship",
  "serve",
  "fear",
  "hope",
  "salvation",
  "redeem",
  "messiah",
  "christ",
  "son",
  "father",
  "prophet",
  "king",
  "shepherd",
  "bread",
  "water",
  "fire",
  "resurrection",
];

function readJson(name) {
  const filePath = path.join(lexiconDir, name);
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

function score(entry, seed) {
  const search = normalize(seed);

  const gloss = normalize(entry.gloss);
  const definition = normalize(
    `${entry.shortDefinition || ""} ${entry.fullDefinition || ""}`
  );
  const lemma = normalize(entry.lemma);
  const transliteration = normalize(entry.transliteration);

  let total = 0;

  if (gloss === search) total += 1000;
  if (lemma === search) total += 900;
  if (transliteration === search) total += 850;
  if (gloss.includes(search)) total += 400;
  if (definition.includes(search)) total += 200;

  if (entry.occurrenceCount) {
    total += Math.min(entry.occurrenceCount, 300) / 10;
  }

  return total;
}

function clean(entry, scoreValue) {
  return {
    strong: entry.strong || "",
    lemma: entry.lemma || "",
    transliteration: entry.transliteration || "",
    gloss: entry.gloss || "",
    definition: entry.shortDefinition || entry.fullDefinition || "",
    occurrenceCount: entry.occurrenceCount || 0,
    corpus: entry.corpus || "",
    language: entry.language || "",
    score: Number(scoreValue.toFixed(2)),
  };
}

const datasets = {
  hebrew: readJson(files.hebrew),
  ntGreek: readJson(files.ntGreek),
  lxxGreek: readJson(files.lxxGreek),
};

const candidates = conceptSeeds.map((seed) => {
  const group = {
    id: seed.replace(/\s+/g, "-"),
    label: seed.charAt(0).toUpperCase() + seed.slice(1),
    aliases: [seed],
    hebrew: [],
    ntGreek: [],
    lxxGreek: [],
  };

  for (const [name, entries] of Object.entries(datasets)) {
    group[name] = entries
      .map((entry) => ({ entry, score: score(entry, seed) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((item) => clean(item.entry, item.score));
  }

  return group;
});

fs.writeFileSync(outputPath, JSON.stringify(candidates, null, 2), "utf8");

console.log(`Built ${candidates.length} concept candidate groups`);
console.log(`Saved to ${outputPath}`);