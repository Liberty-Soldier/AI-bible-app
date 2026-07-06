const fs = require("fs");
const path = require("path");

const root = process.cwd();

const wordStudyPath = path.join(
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
  "generatedBibleIQResolverIndex.json"
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

function normalizeStrong(value) {
  const raw = String(value || "").trim().toUpperCase();
  const num = raw.replace(/[^\d]/g, "");

  if (!num) return raw;
  if (raw.startsWith("H")) return `H${Number(num)}`;
  if (raw.startsWith("G")) return `G${String(Number(num)).padStart(4, "0")}`;

  return raw;
}

function buildVerseKey(source, occurrence, display) {
  if (!occurrence.book || !occurrence.chapter || !occurrence.verse) {
    return null;
  }

  const cleanDisplay = normalize(display);
  if (!cleanDisplay) return null;

  return `${source}:${occurrence.book}:${occurrence.chapter}:${occurrence.verse}:${cleanDisplay}`;
}

function main() {
  const wordStudy = readJson(wordStudyPath);

  const verseWordToEntity = {};
  const entityByStrong = {};

  const byStrong = wordStudy.byStrong || {};

  for (const [rawStrong, entries] of Object.entries(byStrong)) {
    const strong = normalizeStrong(rawStrong);

    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      const source = sourceFromCorpus(entry.corpus || entry.language);
      const entityId = `word:${source}:${strong}`;

      entityByStrong[`${source}:${strong}`] = entityId;

      for (const occurrence of entry.occurrences || []) {
        const displays = [
          occurrence.word,
          occurrence.surface,
          entry.lemma,
          entry.transliteration,
        ].filter(Boolean);

        for (const display of displays) {
          const key = buildVerseKey(source, occurrence, display);
          if (!key) continue;

          if (!verseWordToEntity[key]) {
            verseWordToEntity[key] = {
              entityId,
              strong,
              sourceWord:
                occurrence.word || occurrence.surface || entry.lemma || "",
              lemma: entry.lemma || "",
              transliteration: entry.transliteration || "",
              source,
            };
          }
        }
      }
    }
  }

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    counts: {
      verseWordToEntity: Object.keys(verseWordToEntity).length,
      entityByStrong: Object.keys(entityByStrong).length,
    },
    verseWordToEntity,
    entityByStrong,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output), "utf8");

  console.log("Built BibleIQ resolver index");
  console.log(outputPath);
  console.log(output.counts);
}

main();