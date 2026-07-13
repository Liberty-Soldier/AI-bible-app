const fs = require("fs");
const path = require("path");

const { tokenizeDisplayText } = require("./canonical/utils/tokenize");

const root = process.cwd();

const lxxPrivateDir = path.join(
  root,
  ".private",
  "scripture",
  "canonical",
  "lxx"
);

const brentonPath = path.join(
  root,
  "app",
  "data",
  "scripture",
  "generatedBrenton.json"
);

const reportDir = path.join(root, "reports");
const reportPath = path.join(reportDir, "lxx-brenton-alignment-audit.json");

const BRENTON_TO_LXX_BOOK = {
  "Daniel Greek": "Daniel",
  "Esther Greek": "Esther",
  "Letter of Jeremiah": "Epistle of Jeremiah",
};

const BRENTON_ONLY_WITHOUT_LXX_SOURCE = new Set([
  "1 Esdras",
  "Judith",
  "Prayer of Manasseh",
  "Tobit",
]);

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "him",
  "his",
  "i",
  "if",
  "in",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "she",
  "so",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "thy",
  "thee",
  "thou",
  "to",
  "unto",
  "was",
  "we",
  "were",
  "with",
  "ye",
  "you",
  "your",
]);

const ALIGNABLE_GRAMMAR_WORDS = new Set([
  "am",
  "are",
  "be",
  "been",
  "being",
  "in",
  "is",
  "made",
  "make",
  "was",
  "were",
  "with",
]);

const HIGH_VALUE_WORDS = new Set([
  "angel",
  "blood",
  "commandment",
  "commandments",
  "covenant",
  "darkness",
  "death",
  "earth",
  "elohim",
  "faith",
  "father",
  "flesh",
  "god",
  "heaven",
  "holy",
  "israel",
  "jerusalem",
  "judah",
  "judgment",
  "king",
  "kingdom",
  "law",
  "life",
  "light",
  "lord",
  "man",
  "moses",
  "name",
  "peace",
  "priest",
  "prophet",
  "prophets",
  "righteous",
  "righteousness",
  "sabbath",
  "sin",
  "sins",
  "son",
  "spirit",
  "temple",
  "truth",
  "water",
  "wisdom",
  "word",
  "world",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeEnglish(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function singularize(value) {
  const word = normalizeEnglish(value);

  if (word.length <= 3) return word;

  if (word.endsWith("ies")) {
    return `${word.slice(0, -3)}y`;
  }

  if (/(ches|shes|xes|zes|sses|oes)$/.test(word)) {
    return word.slice(0, -2);
  }

  if (word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }

  return word;
}

function expandEnglishWord(value) {
  const normalized = normalizeEnglish(value);
  const singular = singularize(normalized);

  const forms = new Set([normalized, singular]);

  if (normalized.endsWith("eth")) forms.add(normalized.slice(0, -3));
  if (normalized.endsWith("est")) forms.add(normalized.slice(0, -3));
  if (normalized.endsWith("ed")) forms.add(normalized.slice(0, -2));
  if (normalized.endsWith("ing")) forms.add(normalized.slice(0, -3));

  const oldEnglish = {
    made: ["make"],
    maketh: ["make"],
    created: ["create"],
    saith: ["say"],
    spake: ["speak"],
    hath: ["have"],
    hast: ["have"],
    art: ["be"],
    wast: ["be"],
    shalt: ["shall"],
    thy: ["your"],
    thee: ["you"],
    thou: ["you"],
    ye: ["you"],
  };

  for (const extra of oldEnglish[normalized] || []) {
    forms.add(extra);
  }

  return [...forms].filter(Boolean);
}

function splitGloss(value) {
  return String(value || "")
    .replace(/\([^)]*\)/g, " ")
    .split(/[\s,;/|:]+/)
    .map(normalizeEnglish)
    .filter(Boolean);
}

function getSourceGlossWords(sourceToken) {
  const words = new Set();

  for (const field of [
    "gloss",
    "shortDefinition",
    "lemma",
    "normalizedLemma",
    "transliteration",
    "partOfSpeech",
  ]) {
    for (const part of splitGloss(sourceToken[field])) {
      words.add(part);
      words.add(singularize(part));
    }
  }

  return [...words].filter(Boolean);
}

function getVerseKey(book, chapter, verse) {
  return `${book}.${Number(chapter)}.${Number(verse)}`;
}

function getVerseText(verse) {
  return verse?.sources?.[0]?.text || "";
}

function normalizeBrentonBookToLxx(book) {
  return BRENTON_TO_LXX_BOOK[book] || book;
}

function loadBrentonVerseMap() {
  const rows = readJson(brentonPath);
  const map = new Map();

  const skippedBooks = {};
  const mappedBooks = {};

  for (const row of rows) {
    const originalBook = row.book;
    const lxxBook = normalizeBrentonBookToLxx(originalBook);

    mappedBooks[originalBook] = lxxBook;

    if (BRENTON_ONLY_WITHOUT_LXX_SOURCE.has(originalBook)) {
      skippedBooks[originalBook] = (skippedBooks[originalBook] || 0) + 1;
      continue;
    }

    const key = getVerseKey(lxxBook, row.chapter, row.verse);

    map.set(key, {
      originalBook,
      lxxBook,
      chapter: Number(row.chapter),
      verse: Number(row.verse),
      reference: row.reference,
      text: getVerseText(row),
    });
  }

  return {
    map,
    skippedBooks,
    mappedBooks,
    totalRows: rows.length,
  };
}

function findBestUnusedCandidate({
  englishToken,
  sourceTokens,
  usedSourceTokenIds,
  minSourceIndex,
}) {
  const englishForms = expandEnglishWord(
    englishToken.normalized || englishToken.text
  );

  let best = null;

  for (const sourceToken of sourceTokens) {
    if (usedSourceTokenIds.has(sourceToken.id)) continue;

    const sourceGlossWords = getSourceGlossWords(sourceToken);

    let score = 0;
    let method = null;

    for (const form of englishForms) {
      if (sourceGlossWords.includes(form)) {
        score += 100;
        method = "lxx-gloss-order";
      }
    }

    if (score === 0) continue;

    if (sourceToken.lexiconMatched) score += 10;
    if (sourceToken.lexiconAmbiguous) score -= 2;

    const sourceIndex = Number(sourceToken.index);
    score -= Math.abs(sourceIndex - minSourceIndex);

    if (sourceIndex < minSourceIndex) score -= 5;

    if (!best || score > best.score) {
      best = {
        sourceToken,
        score,
        method,
        confidence: score >= 100 ? "high" : score >= 80 ? "medium" : "low",
      };
    }
  }

  return best;
}

function alignTranslationTokens({
  verseKey,
  translationTokens,
  sourceTokens,
}) {
  const usedSourceTokenIds = new Set();
  let minSourceIndex = 0;
  const edges = [];

  for (const token of translationTokens) {
    token.alignedSourceTokenIds = [];

    const normalized = normalizeEnglish(token.normalized || token.text);

    if (!normalized || normalized.length < 2) {
      token.alignmentStatus = "ignored";
      token.alignmentReason = "empty-or-short-token";
      continue;
    }

    if (STOP_WORDS.has(normalized) && !ALIGNABLE_GRAMMAR_WORDS.has(normalized)) {
      token.alignmentStatus = "ignored";
      token.alignmentReason = "english-grammar-token";
      continue;
    }

    const candidate = findBestUnusedCandidate({
      englishToken: token,
      sourceTokens,
      usedSourceTokenIds,
      minSourceIndex,
    });

    if (!candidate) {
      token.alignmentStatus = "unaligned";
      continue;
    }

    const sourceToken = candidate.sourceToken;

    token.alignedSourceTokenIds.push(sourceToken.id);
    token.alignedSourceEntityIds = [sourceToken.entityId].filter(Boolean);
    token.alignmentStatus = "aligned";
    token.alignmentConfidence = candidate.confidence;
    token.alignmentMethod = candidate.method;

    usedSourceTokenIds.add(sourceToken.id);
    minSourceIndex = Math.max(minSourceIndex, Number(sourceToken.index));

    edges.push({
      verseKey,
      translationWitness: "brenton",
      translationTokenIndex: token.index,
      translationTokenText: token.text,
      translationTokenNormalized: normalized,

      sourceCorpus: "lxx",
      sourceLanguage: "greek",
      sourceTokenId: sourceToken.id,
      sourceTokenIndex: sourceToken.index,
      sourceSurface: sourceToken.surface,
      sourceEntityId: sourceToken.entityId,
      sourceLxxId: sourceToken.lxxId,
      sourceLemma: sourceToken.lemma,
      sourceGloss: sourceToken.gloss,

      confidence: candidate.confidence,
      method: candidate.method,
    });
  }

  return edges;
}

function addCounter(counter, word) {
  if (!word) return;
  counter[word] = (counter[word] || 0) + 1;
}

function topCounter(counter, limit = 50) {
  return Object.entries(counter || {})
    .filter(([word, count]) => word && typeof count === "number")
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

function hasUnusedSourceGlossForWord(sourceTokens, usedSourceTokenIds, word) {
  const forms = expandEnglishWord(word);

  for (const sourceToken of sourceTokens) {
    if (usedSourceTokenIds.has(sourceToken.id)) continue;

    const glossWords = getSourceGlossWords(sourceToken);

    if (forms.some((form) => glossWords.includes(form))) {
      return true;
    }
  }

  return false;
}

function hasConsumedSourceGlossForWord(sourceTokens, usedSourceTokenIds, word) {
  const forms = expandEnglishWord(word);

  for (const sourceToken of sourceTokens) {
    if (!usedSourceTokenIds.has(sourceToken.id)) continue;

    const glossWords = getSourceGlossWords(sourceToken);

    if (forms.some((form) => glossWords.includes(form))) {
      return true;
    }
  }

  return false;
}

function summarizeTokens(tokens, sourceTokens, stats) {
  const usedSourceTokenIds = new Set();

  for (const token of tokens) {
    for (const id of token.alignedSourceTokenIds || []) {
      usedSourceTokenIds.add(id);
    }
  }

  for (const token of tokens) {
    const normalized = normalizeEnglish(token.normalized || token.text);

    if (token.alignmentStatus === "aligned") {
      stats.alignedTokens += 1;
    } else if (token.alignmentStatus === "ignored") {
      stats.ignoredTokens += 1;
    } else {
      stats.unalignedTokens += 1;

      if (HIGH_VALUE_WORDS.has(normalized)) {
        addCounter(stats.highValueUnaligned, normalized);

        if (hasUnusedSourceGlossForWord(sourceTokens, usedSourceTokenIds, normalized)) {
          addCounter(stats.highValueUnalignedSourcePresent, normalized);
          token.alignmentReason = "expected-lxx-source-present-but-unmatched";
        } else if (
          hasConsumedSourceGlossForWord(sourceTokens, usedSourceTokenIds, normalized)
        ) {
          addCounter(stats.highValueUnalignedSourceConsumed, normalized);
          token.alignmentReason = "expected-lxx-source-already-consumed";
        } else {
          addCounter(stats.highValueUnalignedSourceAbsent, normalized);
          token.alignmentReason = "no-expected-lxx-source-token-in-verse";
        }
      }
    }
  }
}

function emptyStats() {
  return {
    versesWithSource: 0,
    versesWithBrenton: 0,
    sourceTokens: 0,
    translationTokens: 0,
    alignedTokens: 0,
    ignoredTokens: 0,
    unalignedTokens: 0,
    highValueUnaligned: {},
    highValueUnalignedSourcePresent: {},
    highValueUnalignedSourceConsumed: {},
    highValueUnalignedSourceAbsent: {},
  };
}

function finalizeStats(stats) {
  stats.alignedRate =
    stats.translationTokens > 0
      ? Number((stats.alignedTokens / stats.translationTokens).toFixed(4))
      : 0;

  stats.actionableAlignedRate =
    stats.translationTokens - stats.ignoredTokens > 0
      ? Number(
          (
            stats.alignedTokens /
            (stats.translationTokens - stats.ignoredTokens)
          ).toFixed(4)
        )
      : 0;

  stats.highValueUnaligned = topCounter(stats.highValueUnaligned, 100);
  stats.highValueUnalignedSourcePresent = topCounter(
    stats.highValueUnalignedSourcePresent,
    100
  );
  stats.highValueUnalignedSourceConsumed = topCounter(
    stats.highValueUnalignedSourceConsumed,
    100
  );
  stats.highValueUnalignedSourceAbsent = topCounter(
    stats.highValueUnalignedSourceAbsent,
    100
  );

  return stats;
}

function loadLxxBooks() {
  const books = {};

  for (const file of fs.readdirSync(lxxPrivateDir)) {
    if (!file.endsWith(".json")) continue;

    const filePath = path.join(lxxPrivateDir, file);
    const data = readJson(filePath);
    const firstVerse = Object.values(data)[0];

    if (!firstVerse?.book) {
      throw new Error(`Could not determine book for LXX file: ${filePath}`);
    }

    books[firstVerse.book] = {
      file,
      filePath,
      data,
    };
  }

  return books;
}

function main() {
  if (!fs.existsSync(lxxPrivateDir)) {
    throw new Error(
      "Missing LXX canonical corpus. Run: node scripts\\build-lxx-canonical-corpus.cjs"
    );
  }

  if (!fs.existsSync(brentonPath)) {
    throw new Error(`Missing Brenton file: ${brentonPath}`);
  }

  ensureDir(reportDir);

  const brenton = loadBrentonVerseMap();
  const books = loadLxxBooks();

  const totals = emptyStats();
  totals.books = Object.keys(books).length;
  totals.alignmentEdges = 0;

  const byBook = {};
  const missingBrentonByBook = {};
  const sampleEdges = [];

  for (const [book, record] of Object.entries(books)) {
    byBook[book] = emptyStats();

    for (const [verseKey, canonical] of Object.entries(record.data)) {
      totals.versesWithSource += 1;
      totals.sourceTokens += canonical.sourceTokens.length;

      byBook[book].versesWithSource += 1;
      byBook[book].sourceTokens += canonical.sourceTokens.length;

      if (!canonical.translations) canonical.translations = {};

      const brentonVerse = brenton.map.get(verseKey);

      if (!brentonVerse?.text) {
        missingBrentonByBook[book] = (missingBrentonByBook[book] || 0) + 1;
        continue;
      }

      const tokens = tokenizeDisplayText(brentonVerse.text);

      const edges = alignTranslationTokens({
        verseKey,
        translationTokens: tokens,
        sourceTokens: canonical.sourceTokens,
      });

      canonical.translations.brenton = {
        text: brentonVerse.text,
        originalBook: brentonVerse.originalBook,
        tokens,
      };

      totals.versesWithBrenton += 1;
      totals.translationTokens += tokens.length;
      totals.alignmentEdges += edges.length;

      byBook[book].versesWithBrenton += 1;
      byBook[book].translationTokens += tokens.length;

      summarizeTokens(tokens, canonical.sourceTokens, totals);
      summarizeTokens(tokens, canonical.sourceTokens, byBook[book]);

      for (const edge of edges.slice(0, 5)) {
        if (sampleEdges.length < 30) sampleEdges.push(edge);
      }
    }

    writeJson(record.filePath, record.data);
  }

  for (const book of Object.keys(byBook)) {
    finalizeStats(byBook[book]);
  }

  finalizeStats(totals);

  const report = {
    corpus: "lxx",
    translationWitness: "brenton",
    generatedAt: new Date().toISOString(),

    sourceBooks: Object.keys(books).sort(),
    brentonRows: brenton.totalRows,
    skippedBrentonOnlyBooksWithoutLxxSource: brenton.skippedBooks,
    brentonBookMapping: brenton.mappedBooks,

    totals,
    byBook,
    missingBrentonByBook,
    sampleEdges,
  };

  writeJson(reportPath, report);

  console.log("Aligned LXX Brenton:");
  console.log(`source books: ${totals.books}`);
  console.log(`source verses: ${totals.versesWithSource}`);
  console.log(`verses with Brenton: ${totals.versesWithBrenton}`);
  console.log(`source tokens: ${totals.sourceTokens}`);
  console.log(`translation tokens: ${totals.translationTokens}`);
  console.log(`aligned tokens: ${totals.alignedTokens}`);
  console.log(`ignored tokens: ${totals.ignoredTokens}`);
  console.log(`unaligned tokens: ${totals.unalignedTokens}`);
  console.log(`alignedRate: ${totals.alignedRate}`);
  console.log(`actionableAlignedRate: ${totals.actionableAlignedRate}`);
  console.log(
    `top source-present high-value misses: ${totals.highValueUnalignedSourcePresent
      .slice(0, 20)
      .map((item) => `${item.word}:${item.count}`)
      .join(", ")}`
  );
  console.log(`audit: ${path.relative(root, reportPath)}`);
  console.log(
    "Run runtime export next: node scripts\\export-bibleiq-canonical-runtime.js"
  );
}

main();