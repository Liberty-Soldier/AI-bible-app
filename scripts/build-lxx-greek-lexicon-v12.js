const fs = require("fs");
const path = require("path");

const root = process.cwd();

const lxxLexiconFile = path.join(
  root,
  "sources",
  "lxx-greek",
  "LXX-Rahlfs-1935-master",
  "11_end-users_files",
  "LXX_lexicon_formatted_for_UniqueBibleAppPlus.csv"
);

const outputFile = path.join(
  root,
  "app",
  "data",
  "lexicon",
  "generatedLXXGreekLexiconV12.json"
);

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x200E;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGreek(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeStrong(value) {
  const raw = String(value || "").trim().toUpperCase();
  const match = raw.match(/G\d+/);
  if (!match) return "";
  const num = match[0].replace(/[^\d]/g, "");
  return `G${String(Number(num)).padStart(4, "0")}`;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseLine(line) {
  const parts = line.split(/\t+/).map((p) => p.trim());

  const id = parts[0] || "";
  const lemma = parts[1] || "";
  const transliterationRaw = parts[2] || "";
  const posRaw = parts[3] || "";
  const gloss = parts[4] || "";
  const details = parts.slice(5).join(" ");

  const strongMatches = Array.from(details.matchAll(/S:(G\d+)/g)).map((m) =>
    normalizeStrong(m[1])
  );

  const forms = Array.from(details.matchAll(/<grk>(.*?)<\/grk>/g)).map((m) =>
    stripHtml(m[1])
  );

  const transliteration =
    transliterationRaw.match(/^([^\[]+)/)?.[1]?.trim() || transliterationRaw;

  const pronunciation =
    transliterationRaw.match(/\[(.*?)\]/)?.[1]?.trim() || "";

  const partOfSpeech =
    posRaw.match(/\[(.*?)\]/)?.[1]?.trim() || stripHtml(posRaw);

  return {
    id: `lxx-greek:${id}`,
    language: "greek",
    corpus: "lxx-greek",

    lxxId: id,
    strong: strongMatches[0] || "",
    strongs: unique(strongMatches),

    lemma,
    normalizedLemma: normalizeGreek(lemma),
    transliteration,
    pronunciation,
    partOfSpeech,

    gloss: stripHtml(gloss),
    shortDefinition: stripHtml(gloss),
    fullDefinition: stripHtml(details),

    forms: unique(forms),

    occurrenceCount: 0,
    occurrences: [],

    sources: ["LXX Rahlfs lexicon"],
  };
}

const lines = fs
  .readFileSync(lxxLexiconFile, "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim());

const entries = lines.map(parseLine);

fs.writeFileSync(outputFile, JSON.stringify(entries, null, 2), "utf8");

console.log(`Built ${entries.length} LXX Greek V12 lexicon entries`);
console.log(`Saved to ${outputFile}`);