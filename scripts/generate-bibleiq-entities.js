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

const outputPath = path.join(
  root,
  "app",
  "data",
  "lexicon",
  "generatedBibleIQEntities.json"
);

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

function entityIdFromEntry(entry) {
  const source = sourceFromCorpus(entry.corpus || entry.language);
  const strong = String(entry.strong || "").trim();

  if (strong) return `word:${source}:${strong}`;

  const lemma = normalize(entry.lemma || entry.transliteration || entry.gloss);
  return `word:${source}:${lemma}`;
}

function buildReference(occurrence) {
  if (occurrence.reference) {
    return String(occurrence.reference).replaceAll(".", " ");
  }

  if (occurrence.book && occurrence.chapter && occurrence.verse) {
    return `${occurrence.book} ${occurrence.chapter}:${occurrence.verse}`;
  }

  return "Reference pending";
}

function parseReference(occurrence) {
  if (occurrence.book && occurrence.chapter) {
    return {
      book: occurrence.book,
      chapter: Number(occurrence.chapter),
      verse: Number(occurrence.verse || 0),
    };
  }

  const ref = String(occurrence.reference || "");
  const parts = ref.split(".");

  return {
    book: parts[0] || "",
    chapter: Number(parts[1] || 0),
    verse: Number(parts[2] || 0),
  };
}

function occurrenceToBibleIQOccurrence(occurrence, source) {
  const parsed = parseReference(occurrence);

  return {
    reference: buildReference(occurrence),
    book: parsed.book,
    chapter: parsed.chapter,
    verse: parsed.verse,
    englishText: occurrence.englishText || occurrence.text || "",
    sourceWord: occurrence.word || occurrence.surface || occurrence.sourceWord || "",
    source,
  };
}

function buildEntity(entry) {
  const source = sourceFromCorpus(entry.corpus || entry.language);
  const title =
    entry.lemma ||
    entry.transliteration ||
    entry.gloss ||
    entry.strong ||
    "Unknown word";

  const meaning =
    entry.shortDefinition ||
    entry.definition ||
    entry.gloss ||
    "Meaning pending.";

  const occurrences = Array.isArray(entry.occurrences)
    ? entry.occurrences
        .slice(0, 100)
        .map((occurrence) => occurrenceToBibleIQOccurrence(occurrence, source))
    : [];

  const firstOccurrence = occurrences[0]?.reference;

  return {
    id: entityIdFromEntry(entry),
    type: "word",
    title,
    subtitle: entry.strong ? `Original language word • ${entry.strong}` : "Original language word",

    simple: {
      meaning,
      inThisVerse:
        "This word is connected to the original-language evidence for the selected verse.",
      whyItMatters:
        "BibleIQ uses the Hebrew, Greek, or Septuagint source data to help explain how this word is used in Scripture.",
      summary:
        "This is a generated BibleIQ entry. It gives a simple meaning first, with source evidence available underneath.",
    },

    evidence: {
      originalLanguage: {
        source,
        word: entry.lemma || title,
        transliteration: entry.transliteration || undefined,
        strong: entry.strong || undefined,
        lemmaId: entry.strong ? `${source}:${entry.strong}` : undefined,
      },

      firstMention: firstOccurrence,
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

  const apiData = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const entities = {};

  const byStrong = apiData.byStrong || {};

  for (const matches of Object.values(byStrong)) {
    if (!Array.isArray(matches)) continue;

    for (const entry of matches) {
      const entity = buildEntity(entry);
      entities[entity.id] = entity;
    }
  }

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    entityCount: Object.keys(entities).length,
    entities,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`Generated ${output.entityCount} BibleIQ entities`);
  console.log(outputPath);
}

main();