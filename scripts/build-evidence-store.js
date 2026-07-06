const fs = require("fs");
const path = require("path");

const root = process.cwd();

const inputPath = path.join(
  root,
  "app",
  "data",
  "word-study",
  "generatedWordStudyApi.json"
);

const evidenceRoot = path.join(root, ".private", "evidence");

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

function safeStrong(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function buildEntity(entry, source) {
  const strong = safeStrong(entry.strong);

  const occurrences = Array.isArray(entry.occurrences)
    ? entry.occurrences.slice(0, 80).map((occurrence) => ({
        reference:
          occurrence.reference ||
          `${occurrence.book || ""}.${occurrence.chapter || ""}.${occurrence.verse || ""}`,
        book: occurrence.book || "",
        chapter: Number(occurrence.chapter || 0),
        verse: Number(occurrence.verse || 0),
        englishText: occurrence.englishText || occurrence.text || "",
        sourceWord: occurrence.word || occurrence.surface || entry.lemma || "",
        source,
      }))
    : [];

  return {
    id: `word:${source}:${strong}`,
    type: "word",
    title: entry.lemma || entry.transliteration || entry.gloss || strong,
    subtitle: strong ? `Original language word • ${strong}` : "Original language word",

    simple: {
      meaning:
        entry.shortDefinition ||
        entry.definition ||
        entry.gloss ||
        "Meaning pending.",
      inThisVerse:
        "This word is connected to the original-language evidence for the selected verse.",
      whyItMatters:
        "BibleIQ uses source-language evidence to explain how this word is used in Scripture.",
      summary:
        "This is a generated BibleIQ evidence entry. It gives a simple meaning first, with source evidence underneath.",
    },

    evidence: {
      originalLanguage: {
        source,
        word: entry.lemma || "",
        transliteration: entry.transliteration || undefined,
        strong,
        lemmaId: `${source}:${strong}`,
      },

      firstMention: occurrences[0]?.reference,
      keyReferences: occurrences.slice(0, 5).map((item) => item.reference),

      related: {
        people: [],
        places: [],
        concepts: [],
        events: [],
      },

      occurrences,
    },
  };
}

function main() {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Missing input file: ${inputPath}`);
  }

  const wordStudy = readJson(inputPath);
  const byStrong = wordStudy.byStrong || {};

  let entityCount = 0;

const resolvers = {
  hebrew: {},
  lxx: {},
  "greek-nt": {},
};

  for (const [strong, entries] of Object.entries(byStrong)) {
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      const source = sourceFromCorpus(entry.corpus || entry.language);
      const cleanStrong = safeStrong(strong || entry.strong);

      if (!cleanStrong) continue;

      const entity = buildEntity(
        {
          ...entry,
          strong: cleanStrong,
        },
        source
      );

      const outDir = path.join(evidenceRoot, "entities", source);
      const outPath = path.join(outDir, `${cleanStrong}.json`);

      ensureDir(outDir);
      fs.writeFileSync(outPath, JSON.stringify(entity), "utf8");

      entityCount += 1;
      for (const occurrence of entry.occurrences || []) {
  if (!occurrence.book || !occurrence.chapter || !occurrence.verse) continue;

const words = new Set(
  [
    occurrence.word,
    occurrence.surface,
    entry.lemma,
    entry.transliteration,
  ]
    .filter(Boolean)
    .map(normalize)
    .filter(Boolean)
);

const englishIndex = wordStudy.englishIndex || {};

for (const [englishWord, refs] of Object.entries(englishIndex)) {
  if (!Array.isArray(refs)) continue;

  const matchesThisStrong = refs.some((ref) => {
    return safeStrong(ref.strong) === cleanStrong;
  });

  if (matchesThisStrong) {
    words.add(normalize(englishWord));
  }
}

  for (const word of words) {
    const key = `${occurrence.book}:${occurrence.chapter}:${occurrence.verse}:${word}`;

    if (!resolvers[source][key]) {
      resolvers[source][key] = {
        strong: cleanStrong,
        entityPath: `entities/${source}/${cleanStrong}.json`,
        sourceWord: occurrence.word || occurrence.surface || entry.lemma || "",
      };
    }
  }
}
    }
  }

for (const [source, resolver] of Object.entries(resolvers)) {
  const sourceResolverDir = path.join(evidenceRoot, "resolver", source);
  ensureDir(sourceResolverDir);

  const byBook = {};

  for (const [key, value] of Object.entries(resolver)) {
    const [book] = key.split(":");

    if (!book) continue;

    if (!byBook[book]) byBook[book] = {};
    byBook[book][key] = value;
  }

  for (const [book, bookResolver] of Object.entries(byBook)) {
    fs.writeFileSync(
      path.join(sourceResolverDir, `${book}.json`),
      JSON.stringify(bookResolver),
      "utf8"
    );
  }
}

  console.log("Built split Evidence Store entities");
  console.log(`Entities: ${entityCount}`);
  console.log(path.join(evidenceRoot, "entities"));
}

main();