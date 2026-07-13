const fs = require("fs");
const path = require("path");

const {
  NT_BOOKS,
  normalizeBookName,
  isNewTestamentBook,
} = require("./shared/corpus-ownership.cjs");

const root = process.cwd();

const inputWordsPath = path.join(
  root,
  "app",
  "data",
  "scripture",
  "generatedGreekNTWords.json"
);

const outputDir = path.join(
  root,
  ".private",
  "scripture",
  "canonical",
  "greek-nt"
);

const reportDir = path.join(root, "reports");
const reportPath = path.join(reportDir, "greek-nt-canonical-corpus-audit.json");

const BOOK_FILE_NAMES = {
  Matthew: "Matt",
  Mark: "Mark",
  Luke: "Luke",
  John: "John",
  Acts: "Acts",
  Romans: "Rom",
  "1 Corinthians": "1Cor",
  "2 Corinthians": "2Cor",
  Galatians: "Gal",
  Ephesians: "Eph",
  Philippians: "Phil",
  Colossians: "Col",
  "1 Thessalonians": "1Thess",
  "2 Thessalonians": "2Thess",
  "1 Timothy": "1Tim",
  "2 Timothy": "2Tim",
  Titus: "Titus",
  Philemon: "Phlm",
  Hebrews: "Heb",
  James: "Jas",
  "1 Peter": "1Pet",
  "2 Peter": "2Pet",
  "1 John": "1John",
  "2 John": "2John",
  "3 John": "3John",
  Jude: "Jude",
  Revelation: "Rev",
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeGreekText(value) {
  if (!value) return "";

  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ʼ'’]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeStrong(value) {
  if (!value) return null;

  const text = String(value).trim().toUpperCase();
  const match = text.match(/^G?0*([0-9]+)$/);

  if (!match) return text.startsWith("G") ? text : `G${text}`;

  return `G${String(Number(match[1])).padStart(4, "0")}`;
}

function toVerseKey(book, chapter, verse) {
  return `${book}.${chapter}.${verse}`;
}

function makeSafeBookForTokenId(book) {
  return book.replace(/\s+/g, "_");
}

function makeTokenId(book, chapter, verse, tokenIndex) {
  return `greek-nt:${makeSafeBookForTokenId(book)}.${chapter}.${verse}:${tokenIndex}`;
}

function makeEntityId(strong) {
  if (!strong) return null;
  return `word:greek-nt:${strong}`;
}

function asPositiveInteger(value, fieldName, rowNumber) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(
      `Invalid ${fieldName} at Greek NT row ${rowNumber}: ${JSON.stringify(
        value
      )}`
    );
  }

  return number;
}

function getOrCreateVerse(canonicalByVerse, book, chapter, verse) {
  const verseKey = toVerseKey(book, chapter, verse);

  if (!canonicalByVerse[verseKey]) {
    canonicalByVerse[verseKey] = {
      reference: verseKey,
      book,
      chapter,
      verse,
      source: "greek-nt",
      sourceTokens: [],
      translations: {},
    };
  }

  return canonicalByVerse[verseKey];
}

function addGreekSourceTokens(words) {
  const canonicalByVerse = {};
  const verseTokenCounters = new Map();

  for (let index = 0; index < words.length; index += 1) {
    const row = words[index];
    const rowNumber = index + 1;

    const book = normalizeBookName(row.book);
    const chapter = asPositiveInteger(row.chapter, "chapter", rowNumber);
    const verse = asPositiveInteger(row.verse, "verse", rowNumber);

    if (!book || !isNewTestamentBook(book)) {
      throw new Error(
        `Invalid Greek NT book at row ${rowNumber}: ${JSON.stringify(row.book)}`
      );
    }

    const verseKey = toVerseKey(book, chapter, verse);
    const canonical = getOrCreateVerse(canonicalByVerse, book, chapter, verse);

    const tokenIndex = verseTokenCounters.get(verseKey) || 0;
    verseTokenCounters.set(verseKey, tokenIndex + 1);

    const strong = normalizeStrong(row.strong);
    const tokenId = makeTokenId(book, chapter, verse, tokenIndex);

    canonical.sourceTokens.push({
      id: tokenId,
      tokenId,
      index: tokenIndex,

      source: "greek-nt",
      corpus: "greek-nt",
      language: "greek",
      witness: "OpenGNT",
      sourceName: "OpenGNT",

      surface: row.word || "",
      normalizedSurface: normalizeGreekText(row.word),

      lemma: "",
      strong,
      entityId: makeEntityId(strong),

      morph: row.morph || "",
      morphEnglish: row.morphEnglish || "",

      gloss: row.gloss || "",
      mounceGloss: row.mounceGloss || "",
      tyndaleGloss: row.tyndaleGloss || "",

      sourceSort: row.sort ? String(row.sort).trim() : null,

      sourceReference: verseKey,
      canonicalReference: verseKey,
      versificationRuleId: null,
    });
  }

  return canonicalByVerse;
}

function groupByBook(canonicalByVerse) {
  const byBook = {};

  for (const [verseKey, canonical] of Object.entries(canonicalByVerse)) {
    if (!byBook[canonical.book]) byBook[canonical.book] = {};
    byBook[canonical.book][verseKey] = canonical;
  }

  return byBook;
}

function countTokens(canonicalByVerse) {
  let total = 0;

  for (const canonical of Object.values(canonicalByVerse)) {
    total += canonical.sourceTokens.length;
  }

  return total;
}

function buildAudit(words, canonicalByVerse, byBook) {
  const actualBooks = Object.keys(byBook);
  const actualBookSet = new Set(actualBooks);

  const missingBooks = NT_BOOKS.filter((book) => !actualBookSet.has(book));
  const extraBooks = actualBooks.filter((book) => !NT_BOOKS.includes(book));

  const byBookAudit = {};

  for (const book of NT_BOOKS) {
    const bookVerses = byBook[book] || {};
    const verses = Object.values(bookVerses);
    const tokens = verses.flatMap((verse) => verse.sourceTokens);

    byBookAudit[book] = {
      verses: verses.length,
      tokens: tokens.length,
      firstVerse: verses[0]?.reference || null,
      lastVerse: verses[verses.length - 1]?.reference || null,
      firstTokenId: tokens[0]?.id || null,
      lastTokenId: tokens[tokens.length - 1]?.id || null,
    };
  }

  const allTokens = Object.values(canonicalByVerse).flatMap(
    (verse) => verse.sourceTokens
  );

  return {
    corpus: "greek-nt",
    witness: "OpenGNT",
    shape: "canonical-verse-map",
    sourceFile: path.relative(root, inputWordsPath),
    generatedAt: new Date().toISOString(),

    inputRows: words.length,
    outputTokens: countTokens(canonicalByVerse),
    outputVerses: Object.keys(canonicalByVerse).length,

    books: {
      expected: NT_BOOKS.length,
      actual: actualBooks.length,
      missing: missingBooks,
      extra: extraBooks,
    },

    quality: {
      tokensWithoutStrong: allTokens.filter((token) => !token.strong).length,
      tokensWithoutSurface: allTokens.filter((token) => !token.surface).length,
      tokensWithoutGloss: allTokens.filter(
        (token) =>
          !token.gloss && !token.mounceGloss && !token.tyndaleGloss
      ).length,
    },

    byBook: byBookAudit,
  };
}

function assertAuditPassed(audit) {
  if (audit.inputRows !== audit.outputTokens) {
    throw new Error(
      `Greek NT token count mismatch: input=${audit.inputRows}, output=${audit.outputTokens}`
    );
  }

  if (audit.books.missing.length || audit.books.extra.length) {
    throw new Error(
      [
        "Greek NT canonical corpus ownership failed.",
        `Expected NT books: ${audit.books.expected}`,
        `Actual books: ${audit.books.actual}`,
        `Missing: ${audit.books.missing.join(", ") || "none"}`,
        `Extra: ${audit.books.extra.join(", ") || "none"}`,
      ].join("\n")
    );
  }

  if (audit.quality.tokensWithoutSurface > 0) {
    throw new Error(
      `Greek NT corpus has ${audit.quality.tokensWithoutSurface} tokens without surface text.`
    );
  }
}

function writeBookFiles(byBook) {
  cleanDir(outputDir);

  for (const book of NT_BOOKS) {
    const fileBase = BOOK_FILE_NAMES[book] || book.replace(/\s+/g, "");
    const filePath = path.join(outputDir, `${fileBase}.json`);
    const payload = byBook[book] || {};

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  }
}

function main() {
  if (!fs.existsSync(inputWordsPath)) {
    throw new Error(`Missing Greek NT words file: ${inputWordsPath}`);
  }

  ensureDir(reportDir);

  const words = readJson(inputWordsPath);

  if (!Array.isArray(words)) {
    throw new Error(
      `Expected generatedGreekNTWords.json to be an array, got ${typeof words}`
    );
  }

  const canonicalByVerse = addGreekSourceTokens(words);
  const byBook = groupByBook(canonicalByVerse);
  const audit = buildAudit(words, canonicalByVerse, byBook);

  assertAuditPassed(audit);
  writeBookFiles(byBook);

  fs.writeFileSync(reportPath, JSON.stringify(audit, null, 2), "utf8");

  console.log("Built Greek NT canonical corpus:");
  console.log(`shape: ${audit.shape}`);
  console.log(`source rows: ${audit.inputRows}`);
  console.log(`tokens: ${audit.outputTokens}`);
  console.log(`books: ${audit.books.actual}`);
  console.log(`verses: ${audit.outputVerses}`);
  console.log(`output: ${path.relative(root, outputDir)}`);
  console.log(`audit: ${path.relative(root, reportPath)}`);
}

main();