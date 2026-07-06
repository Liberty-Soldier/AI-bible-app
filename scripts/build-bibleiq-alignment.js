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

const outputRoot = path.join(root, ".private", "evidence", "alignment");

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

function buildNameAlignmentForTranslation(translation, verses, lexicon) {
  const byVerse = {};

  const verseMap = new Map();

  for (const verse of verses) {
    const evidenceBook = getEvidenceBook(verse.book);
    const key = `${evidenceBook}:${verse.chapter}:${verse.verse}`;
    verseMap.set(key, verse);
  }

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
      const verse = verseMap.get(verseKey);
      if (!verse) continue;

      const tokens = tokenizeDisplayText(getVerseText(verse));
      const matchingTokens = tokens.filter((token) =>
        candidates.has(token.normalized)
      );

      if (!matchingTokens.length) continue;

      const pairCount = Math.min(matchingTokens.length, occurrences.length);

      for (let i = 0; i < pairCount; i += 1) {
        const displayToken = matchingTokens[i];
        const sourceOccurrence = occurrences[i];

        if (!byVerse[verseKey]) byVerse[verseKey] = {};

        byVerse[verseKey][String(displayToken.index)] = {
          displayWord: displayToken.text,
          displayTokenIndex: displayToken.index,
          source: "hebrew",
          sourceTokenIndex: i,
          strong: entry.strong,
          entityPath: `entities/hebrew/${entry.strong}.json`,
          sourceWord: sourceOccurrence.surface || "",
          transliteration: entry.transliteration || "",
          method: "proper-name-usage-match",
          confidence: "high",
        };
      }
    }
  }

  return byVerse;
}

function writeByBook(translation, alignment) {
  const byBook = {};

  for (const [verseKey, tokenMap] of Object.entries(alignment)) {
    const [book] = verseKey.split(":");
    if (!byBook[book]) byBook[book] = {};
    byBook[book][verseKey] = tokenMap;
  }

  const translationDir = path.join(outputRoot, translation);
  ensureDir(translationDir);

  for (const [book, data] of Object.entries(byBook)) {
    fs.writeFileSync(
      path.join(translationDir, `${book}.json`),
      JSON.stringify(data),
      "utf8"
    );
  }
}

function main() {
  const lexicon = readJson(hebrewLexiconPath);

  for (const [translation, filePath] of Object.entries(scriptureFiles)) {
    const verses = readJson(filePath);

    const alignment = buildNameAlignmentForTranslation(
      translation,
      verses,
      lexicon
    );

    writeByBook(translation, alignment);

    console.log(`Built ${translation} alignment`);
    console.log(`Verses: ${Object.keys(alignment).length}`);
  }
}

main();