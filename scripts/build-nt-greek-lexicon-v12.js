const fs = require("fs");
const path = require("path");

const root = process.cwd();

const mounceFile = path.join(
  root,
  "sources",
  "open-gnt",
  "OpenGNT-master",
  "Lexicons",
  "MounceGithubTouched.csv"
);

const strongFile = path.join(
  root,
  "sources",
  "open-gnt",
  "OpenGNT-master",
  "mapping_BGB",
  "Strong_lexicalDefinition.tsv"
);

const occurrenceFile = path.join(
  root,
  "app",
  "data",
  "scripture",
  "generatedGreekNTOccurrences.json"
);

const outputFile = path.join(
  root,
  "app",
  "data",
  "lexicon",
  "generatedNTGreekLexiconV12.json"
);

function normalizeStrong(value) {
  const raw = String(value || "").trim().toUpperCase();
  const match = raw.match(/[GH]?\d+/);
  if (!match) return "";
  const num = match[0].replace(/[GH]/g, "");
 return `G${String(Number(num)).padStart(4, "0")}`;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function readStrongDefinitions() {
  const map = {};

  const lines = fs.readFileSync(strongFile, "utf8").split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;

    const [strong, ...rest] = line.split(/\t/);
    const definition = rest.join(" ").trim();

    const normalizedStrong = normalizeStrong(strong);
    if (!normalizedStrong) continue;

    map[normalizedStrong] = definition;
  }

  return map;
}

function readMounceEntries() {
  const map = {};

  const lines = fs.readFileSync(mounceFile, "utf8").split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;

    const parts = line.split(/\t+/);
    const sort = parts[0]?.trim();
    const normalizedLemma = parts[1]?.trim();
    const jsonish = parts.slice(2).join(" ").trim();

    if (!jsonish) continue;

    try {
      const fixed = `{ ${jsonish} }`;
      const parsed = Function(`"use strict"; return (${fixed});`)();

      const strongs = Array.isArray(parsed.strongs) ? parsed.strongs : [];

      for (const strongNumber of strongs) {
        const strong = normalizeStrong(`G${strongNumber}`);
        const unpaddedStrong = `G${Number(strongNumber)}`;
        if (!strong) continue;

        map[strong] = {
          sort,
          normalizedLemma,
          gk: parsed.gk,
          strong,
          lemma: parsed.lemma,
          transliteration: parsed.transliteration,
          frequencyCount: parsed.frequencyCount,
          mounceDefinition: parsed.definition,
        };
      }
    } catch (error) {
      // skip malformed lines safely
    }
  }

  return map;
}

const strongDefinitions = readStrongDefinitions();
const mounceEntries = readMounceEntries();
const occurrences = JSON.parse(fs.readFileSync(occurrenceFile, "utf8"));

const allStrongNumbers = unique([
  ...Object.keys(strongDefinitions),
  ...Object.keys(mounceEntries),
  ...Object.keys(occurrences),
]);

const entries = allStrongNumbers.map((strong) => {
  const mounce = mounceEntries[strong];
  const occurrenceEntry = occurrences[strong];

  return {
    id: `nt-greek:${strong}`,
    language: "greek",
    corpus: "nt-greek",

    strong,
    gk: mounce?.gk,
    lemma: mounce?.lemma || occurrenceEntry?.strong || strong,
    normalizedLemma: mounce?.normalizedLemma || "",
    transliteration: mounce?.transliteration,

    gloss: occurrenceEntry?.gloss || "",
    shortDefinition: strongDefinitions[strong] || "",
    fullDefinition: mounce?.mounceDefinition || strongDefinitions[strong] || "",

    frequencyCount:
      mounce?.frequencyCount ||
      occurrenceEntry?.occurrences?.length ||
      0,

    forms: occurrenceEntry?.words || [],

    occurrences: occurrenceEntry?.occurrences || [],

    sources: unique([
      mounce ? "Mounce" : "",
      strongDefinitions[strong] ? "Strong lexical definition" : "",
      occurrenceEntry ? "OpenGNT occurrences" : "",
    ]),
  };
});

fs.writeFileSync(outputFile, JSON.stringify(entries, null, 2), "utf8");

console.log(`Built ${entries.length} NT Greek V12 lexicon entries`);
console.log(`Saved to ${outputFile}`);