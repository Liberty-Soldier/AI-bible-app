const fs = require("fs");
const path = require("path");

const CONCORDANCE_FILE = path.join(
  process.cwd(),
  "sources/open-gnt/OpenGNT-master/OpenGNT-concordance/OpenGNT-concordance-sortedByBook_raw.csv"
);

const GLOSS_FILE = path.join(
  process.cwd(),
  "sources/open-gnt/OpenGNT-master/Glossary/SN_lemma_EnglishGloss.csv"
);

const OUTPUT_FILE = path.join(
  process.cwd(),
  "app/data/lexicon/generatedGreekNTLemmaIndex.json"
);

const bookMap = {
  40: "Matthew",
  41: "Mark",
  42: "Luke",
  43: "John",
  44: "Acts",
  45: "Romans",
  46: "1 Corinthians",
  47: "2 Corinthians",
  48: "Galatians",
  49: "Ephesians",
  50: "Philippians",
  51: "Colossians",
  52: "1 Thessalonians",
  53: "2 Thessalonians",
  54: "1 Timothy",
  55: "2 Timothy",
  56: "Titus",
  57: "Philemon",
  58: "Hebrews",
  59: "James",
  60: "1 Peter",
  61: "2 Peter",
  62: "1 John",
  63: "2 John",
  64: "3 John",
  65: "Jude",
  66: "Revelation",
};

function loadGlosses() {
  const lines = fs.readFileSync(GLOSS_FILE, "utf8").split(/\r?\n/);
  const glosses = new Map();

  for (const line of lines) {
    const match = line.match(/^(G\d+)\s+(\S+)\s+(.+)$/);
    if (!match) continue;

    const [, strongs, lemma, gloss] = match;

    glosses.set(strongs, {
      strongs,
      lemma,
      gloss,
    });
  }

  return glosses;
}

function parseOccurrences(rawHtmlish) {
  const matches = rawHtmlish.matchAll(/｛(\d+)\.(\d+)\.(\d+)｜\d+\.\d+\.\d+｝/g);

  const occurrences = [];

  for (const match of matches) {
    const bookNumber = Number(match[1]);
    const chapter = Number(match[2]);
    const verse = Number(match[3]);

    const book = bookMap[bookNumber];

    if (!book || !chapter || !verse) continue;

    occurrences.push({
      book,
      reference: `${book} ${chapter}:${verse}`,
      chapter,
      verse,
    });
  }

  return occurrences;
}

function main() {
  const glosses = loadGlosses();
  const lines = fs.readFileSync(CONCORDANCE_FILE, "utf8").split(/\r?\n/);

  const index = [];

  for (const line of lines) {
    const match = line.match(/^(G\d+)\s+([\s\S]+)$/);
    if (!match) continue;

    const strongs = match[1];
    const raw = match[2];

    const lexical = glosses.get(strongs);

    const occurrences = parseOccurrences(raw);

    if (!lexical || occurrences.length === 0) continue;

    index.push({
      testament: "new",
      language: "greek",
      strongs,
      lemma: lexical.lemma,
      gloss: lexical.gloss,
      occurrenceCount: occurrences.length,
      occurrences,
    });
  }

  index.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2));

  console.log(`Done. Wrote ${index.length} Greek NT lemmas.`);
}

main();