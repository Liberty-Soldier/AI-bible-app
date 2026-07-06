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

const scriptureFiles = {
  kjv: path.join(root, "app", "data", "scripture", "generatedKJV.json"),
  web: path.join(root, "app", "data", "scripture", "generatedWEB.json"),
};

const outputDir = path.join(root, ".private", "evidence", "verses", "hebrew");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function parseReference(reference) {
  const match = String(reference || "").match(/^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/);
  if (!match) return null;

  return {
    book: match[1],
    chapter: Number(match[2]),
    verse: Number(match[3]),
  };
}

function tokenizeDisplayText(text) {
  const parts = String(text || "").split(/(\s+)/);
  const tokens = [];

  for (const part of parts) {
    if (!part || /^\s+$/.test(part)) continue;

    const clean = part.replace(/[.,;:!?()[\]{}"“”‘’]/g, "").trim();
    const normalized = normalize(clean);

    if (!clean || !normalized) continue;

    tokens.push({
      index: tokens.length,
      text: clean,
      normalized,
      sourceTokenIndexes: [],
      strong: undefined,
      confidence: undefined,
      method: undefined,
    });
  }

  return tokens;
}

function getVerseText(verse) {
  return verse?.sources?.[0]?.text || "";
}

function getEvidenceBook(book) {
  const map = {
    Genesis: "Gen",
    Exodus: "Exod",
    Leviticus: "Lev",
    Numbers: "Num",
    Deuteronomy: "Deut",
    Joshua: "Josh",
    Judges: "Judg",
    Ruth: "Ruth",
    "1 Samuel": "1Sam",
    "2 Samuel": "2Sam",
    "1 Kings": "1Kgs",
    "2 Kings": "2Kgs",
    "1 Chronicles": "1Chr",
    "2 Chronicles": "2Chr",
    Ezra: "Ezra",
    Nehemiah: "Neh",
    Esther: "Esth",
    Job: "Job",
    Psalms: "Ps",
    Proverbs: "Prov",
    Ecclesiastes: "Eccl",
    "Song of Solomon": "Song",
    Isaiah: "Isa",
    Jeremiah: "Jer",
    Lamentations: "Lam",
    Ezekiel: "Ezek",
    Daniel: "Dan",
    Hosea: "Hos",
    Joel: "Joel",
    Amos: "Amos",
    Obadiah: "Obad",
    Jonah: "Jonah",
    Micah: "Mic",
    Nahum: "Nah",
    Habakkuk: "Hab",
    Zephaniah: "Zeph",
    Haggai: "Hag",
    Zechariah: "Zech",
    Malachi: "Mal",
  };

  return map[book] || book;
}

function getNameCandidates(entry) {
  const candidates = new Set();

  if (entry.transliteration) {
    candidates.add(normalize(entry.transliteration));
  }

  if (entry.usage) {
    String(entry.usage)
      .split(/[;,./]/)
      .map(normalize)
      .filter(Boolean)
      .forEach((value) => candidates.add(value));
  }

  return candidates;
}

function isProperName(entry) {
  const pos = String(entry.partOfSpeech || "").toLowerCase();

  return (
    pos.includes("np") ||
    pos.includes("n-pr") ||
    pos.includes("proper")
  );
}

function getTranslationVerseMap(verses) {
  const map = new Map();

  for (const verse of verses) {
    const book = getEvidenceBook(verse.book);
    const key = `${book}:${verse.chapter}:${verse.verse}`;
    map.set(key, verse);
  }

  return map;
}

function getOrCreateCanonicalVerse(canonicalByVerse, verseKey, parsed) {
  if (!canonicalByVerse[verseKey]) {
    canonicalByVerse[verseKey] = {
      reference: verseKey,
      book: parsed.book,
      chapter: parsed.chapter,
      verse: parsed.verse,
      source: "hebrew",
      sourceTokens: [],
      translations: {},
    };
  }

  return canonicalByVerse[verseKey];
}

function addTranslationTokens(canonicalByVerse, translation, verseMap) {
  for (const [verseKey, verse] of verseMap.entries()) {
    const [, chapter, verseNumber] = verseKey.split(":");
    const book = verseKey.split(":")[0];

    const canonical = getOrCreateCanonicalVerse(canonicalByVerse, verseKey, {
      book,
      chapter: Number(chapter),
      verse: Number(verseNumber),
    });

    canonical.translations[translation] = {
      text: getVerseText(verse),
      tokens: tokenizeDisplayText(getVerseText(verse)),
    };
  }
}

function addHebrewSourceTokens(canonicalByVerse, lexicon) {
  for (const entry of lexicon) {
    if (!entry?.strong || entry.language !== "hebrew") continue;

    for (const occurrence of entry.occurrences || []) {
      const parsed = parseReference(occurrence.reference);
      if (!parsed) continue;

      const verseKey = `${parsed.book}:${parsed.chapter}:${parsed.verse}`;
      const canonical = getOrCreateCanonicalVerse(canonicalByVerse, verseKey, parsed);

      const sourceTokenIndex = canonical.sourceTokens.length;

      canonical.sourceTokens.push({
        index: sourceTokenIndex,
        source: "hebrew",
        surface: occurrence.surface || "",
        strong: entry.strong,
        lemma: entry.lemma || "",
        transliteration: entry.transliteration || "",
        morph: occurrence.morph || "",
        entityPath: `entities/hebrew/${entry.strong}.json`,
      });
    }
  }
}

function alignProperNames(canonicalByVerse, lexicon) {
  for (const entry of lexicon) {
    if (!entry?.strong || entry.language !== "hebrew") continue;
    if (!isProperName(entry)) continue;

    const candidates = getNameCandidates(entry);
    if (!candidates.size) continue;

    const occurrencesByVerse = new Map();

    for (const occurrence of entry.occurrences || []) {
      const parsed = parseReference(occurrence.reference);
      if (!parsed) continue;

      const verseKey = `${parsed.book}:${parsed.chapter}:${parsed.verse}`;

      if (!occurrencesByVerse.has(verseKey)) {
        occurrencesByVerse.set(verseKey, []);
      }

      occurrencesByVerse.get(verseKey).push(occurrence);
    }

    for (const [verseKey, occurrences] of occurrencesByVerse.entries()) {
      const canonical = canonicalByVerse[verseKey];
      if (!canonical) continue;

      const matchingSourceTokens = canonical.sourceTokens.filter(
        (token) => token.strong === entry.strong
      );

      for (const translationData of Object.values(canonical.translations)) {
        const matchingDisplayTokens = translationData.tokens.filter((token) =>
          candidates.has(token.normalized)
        );

        const pairCount = Math.min(
          matchingDisplayTokens.length,
          matchingSourceTokens.length,
          occurrences.length
        );

        for (let i = 0; i < pairCount; i += 1) {
          const displayToken = matchingDisplayTokens[i];
          const sourceToken = matchingSourceTokens[i];

          displayToken.sourceTokenIndexes = [sourceToken.index];
          displayToken.strong = entry.strong;
          displayToken.confidence = "high";
          displayToken.method = "proper-name-usage-match";
        }
      }
    }
  }
}

function writeByBook(canonicalByVerse) {
  ensureDir(outputDir);

  const byBook = {};

  for (const [verseKey, canonical] of Object.entries(canonicalByVerse)) {
    if (!byBook[canonical.book]) byBook[canonical.book] = {};
    byBook[canonical.book][verseKey] = canonical;
  }

  for (const [book, data] of Object.entries(byBook)) {
    fs.writeFileSync(
      path.join(outputDir, `${book}.json`),
      JSON.stringify(data),
      "utf8"
    );
  }

  return Object.keys(byBook).length;
}

function main() {
  const lexicon = readJson(hebrewLexiconPath);
  const canonicalByVerse = {};

  addHebrewSourceTokens(canonicalByVerse, lexicon);

  for (const [translation, filePath] of Object.entries(scriptureFiles)) {
    const verses = readJson(filePath);
    addTranslationTokens(
      canonicalByVerse,
      translation,
      getTranslationVerseMap(verses)
    );
  }

  alignProperNames(canonicalByVerse, lexicon);

  const bookCount = writeByBook(canonicalByVerse);

  console.log("Built canonical Hebrew verses");
  console.log(`Verses: ${Object.keys(canonicalByVerse).length}`);
  console.log(`Books: ${bookCount}`);
  console.log(outputDir);
}

main();