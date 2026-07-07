const fs = require("fs");
const path = require("path");

const root = process.cwd();

const hebrewLexiconPath = path.join(
  root,
  "app",
  "data",
  "lexicon",
  "generatedHebrewLexiconV12.json"
);

const hebrewLemmaIndexPath = path.join(
  root,
  "app",
  "data",
  "lexicon",
  "generatedHebrewLemmaIndex.json"
);

const outputPath = path.join(
  root,
  "app",
  "data",
  "lexicon",
  "generatedBibleIQEntities.json"
);

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required build-time file: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function cleanDefinition(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripStrongPrefix(value) {
  return String(value || "").replace(/^H/i, "").trim();
}

function toStrong(value) {
  const num = stripStrongPrefix(value);
  return num ? `H${num}` : "";
}

function formatReference(ref) {
  return String(ref || "").replaceAll(".", " ");
}

function parseReference(ref) {
  const [book = "", chapter = "0", verse = "0"] = String(ref || "").split(".");

  return {
    book,
    chapter: Number(chapter || 0),
    verse: Number(verse || 0),
  };
}

function firstSentence(value) {
  const text = cleanDefinition(value);
  if (!text) return "";

  const match = text.match(/^(.{20,220}?[.!?])\s/);
  return match ? match[1].trim() : text.slice(0, 220).trim();
}

function buildMeaning(lex) {
  return (
    cleanDefinition(lex.shortDefinition) ||
    cleanDefinition(lex.usage) ||
    firstSentence(lex.fullDefinition) ||
    cleanDefinition(lex.gloss) ||
    "Meaning pending."
  );
}

function buildOccurrences(lemmaEntry) {
  const occurrences = Array.isArray(lemmaEntry?.occurrences)
    ? lemmaEntry.occurrences
    : [];

  return occurrences.slice(0, 100).map((occurrence) => {
    const parsed = parseReference(occurrence.reference);

    return {
      reference: formatReference(occurrence.reference),
      book: parsed.book || occurrence.book || "",
      chapter: parsed.chapter,
      verse: parsed.verse,
      englishText: "",
      sourceWord: occurrence.surface || "",
      source: "hebrew",
      morph: occurrence.morph || undefined,
    };
  });
}

function buildEntity(lex, lemmaEntry) {
  const strong = toStrong(lex.strong || lex.normalizedLemma || lemmaEntry?.lemma);
  const lemma = lex.lemma || strong;
  const occurrenceCount =
    Number(lex.occurrenceCount || lemmaEntry?.occurrenceCount || 0) || 0;

  const occurrences = buildOccurrences(lemmaEntry);
  const firstOccurrence = occurrences[0]?.reference;

  const meaning = buildMeaning(lex);
  const partOfSpeech = lex.partOfSpeech ? ` Part of speech: ${lex.partOfSpeech}.` : "";
  const forms = Array.isArray(lex.forms)
    ? lex.forms.slice(0, 5).map(([form]) => form).filter(Boolean)
    : [];

  return {
    id: `word:hebrew:${strong}`,
    type: "word",
    title: lemma,
    subtitle: `${strong} • Hebrew word`,

    simple: {
      meaning,
      inThisVerse:
        `The selected word is tied to ${lemma} (${strong}) in the Hebrew source text.${partOfSpeech}`,
      whyItMatters:
        occurrenceCount > 1
          ? `This word appears ${occurrenceCount} times in the Hebrew Bible, so BibleIQ can compare how Scripture uses it across multiple passages.`
          : "This word is connected to the original Hebrew source text, so BibleIQ can explain it from the underlying word rather than only the English translation.",
      summary:
        `${lemma}${lex.transliteration ? ` (${lex.transliteration})` : ""} means ${meaning}${
          firstOccurrence ? ` First listed occurrence: ${firstOccurrence}.` : ""
        }`,
    },

    evidence: {
      originalLanguage: {
        source: "hebrew",
        word: lemma,
        transliteration: lex.transliteration || undefined,
        pronunciation: lex.pronunciation || undefined,
        strong,
        lemmaId: `hebrew:${strong}`,
        partOfSpeech: lex.partOfSpeech || undefined,
        forms,
        morphs: Array.isArray(lex.morphs) ? lex.morphs.slice(0, 10) : [],
      },

      definitions: {
        short: cleanDefinition(lex.shortDefinition),
        usage: cleanDefinition(lex.usage),
        full: cleanDefinition(lex.fullDefinition),
        rootNote: cleanDefinition(lex.sourceRootNote),
        sources: Array.isArray(lex.sources) ? lex.sources : [],
      },

      firstMention: firstOccurrence,
      keyReferences: occurrences.slice(0, 8).map((item) => item.reference),

      related: {
        people: [],
        places: [],
        concepts: [],
        events: [],
      },

      occurrenceCount,
      occurrences,
    },
  };
}

function main() {
  const hebrewLexicon = readJson(hebrewLexiconPath);
  const hebrewLemmaIndex = readJson(hebrewLemmaIndexPath);

  const lemmaByNumber = new Map();

  for (const item of Array.isArray(hebrewLemmaIndex) ? hebrewLemmaIndex : []) {
    if (!item?.lemma) continue;
    lemmaByNumber.set(String(item.lemma), item);
  }

  const entities = {};

  for (const lex of Object.values(hebrewLexicon || {})) {
    const strong = toStrong(lex.strong || lex.normalizedLemma);
    const lemmaNumber = stripStrongPrefix(strong);

    if (!strong || !lemmaNumber) continue;

    const lemmaEntry = lemmaByNumber.get(lemmaNumber);
    const entity = buildEntity(lex, lemmaEntry);

    entities[entity.id] = entity;
  }

  const output = {
    version: 2,
    generatedAt: new Date().toISOString(),
    sourceFiles: [
      "generatedHebrewLexiconV12.json",
      "generatedHebrewLemmaIndex.json",
    ],
    entityCount: Object.keys(entities).length,
    entities,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`Generated ${output.entityCount} rich BibleIQ entities`);
  console.log(outputPath);
}

main();