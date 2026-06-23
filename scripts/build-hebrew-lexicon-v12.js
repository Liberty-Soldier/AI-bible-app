const fs = require("fs");
const path = require("path");

const root = process.cwd();

const lemmaIndexFile = path.join(
  root,
  "app",
  "data",
  "lexicon",
  "generatedHebrewLemmaIndex.json"
);

const strongFile = path.join(
  root,
  "sources",
  "hebrew-lexicon",
  "HebrewLexicon-master",
  "sinri",
  "json",
  "StrongHebrewDictionary.json"
);

const bdbFile = path.join(
  root,
  "sources",
  "bdb-hebrew",
  "unabridged-BDB-Hebrew-lexicon-master",
  "DictBDB.json"
);

const outputFile = path.join(
  root,
  "app",
  "data",
  "lexicon",
  "generatedHebrewLexiconV12.json"
);

function normalizeStrong(value) {
  const raw = String(value || "").trim().toUpperCase();
  const num = raw.replace(/[^\d]/g, "");
  if (!num) return "";
  return `H${Number(num)}`;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x200E;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

const lemmaIndex = JSON.parse(fs.readFileSync(lemmaIndexFile, "utf8"));
const strongJson = JSON.parse(fs.readFileSync(strongFile, "utf8"));
const bdbJson = JSON.parse(fs.readFileSync(bdbFile, "utf8"));

const strongDict = strongJson.dict || {};

const bdbByStrong = {};
for (const entry of bdbJson) {
  if (!entry || !entry.top || !String(entry.top).startsWith("H")) continue;
  bdbByStrong[normalizeStrong(entry.top)] = entry;
}

const entries = lemmaIndex.map((entry) => {
  const strong = normalizeStrong(entry.lemma);
  const strongEntry = strongDict[strong];
  const bdbEntry = bdbByStrong[strong];

  const hebrewWord = strongEntry?.w?.w || "";
  const transliteration = strongEntry?.w?.xlit || "";
  const pronunciation = strongEntry?.w?.pron || "";
  const partOfSpeech = strongEntry?.w?.pos || "";

  const strongMeaning = stripHtml(strongEntry?.meaning || "");
  const strongUsage = stripHtml(strongEntry?.usage || "");
  const strongSource = stripHtml(strongEntry?.source || "");
  const bdbDefinition = stripHtml(bdbEntry?.def || "");

  return {
    id: `hebrew:${strong}`,
    language: "hebrew",
    corpus: "hebrew-bible",

    strong,
    lemma: hebrewWord || entry.lemma,
    normalizedLemma: entry.lemma,

    transliteration,
    pronunciation,
    partOfSpeech,

    gloss: strongMeaning,
    shortDefinition: strongMeaning || strongUsage,
    fullDefinition: bdbDefinition || strongMeaning || strongUsage,

    sourceRootNote: strongSource,
    usage: strongUsage,

    occurrenceCount: entry.occurrenceCount,
    forms: entry.surfaces || [],
    morphs: entry.morphs || [],
    occurrences: entry.occurrences || [],

    sources: unique([
      "MorphHB occurrences",
      strongEntry ? "Strong Hebrew Dictionary" : "",
      bdbEntry ? "Brown-Driver-Briggs" : "",
    ]),
  };
});

fs.writeFileSync(outputFile, JSON.stringify(entries, null, 2), "utf8");

console.log(`Built ${entries.length} Hebrew V12 lexicon entries`);
console.log(`Saved to ${outputFile}`);