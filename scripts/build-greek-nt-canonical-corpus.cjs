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

function makeVerseId(book, chapter, verse) {
  return `${book}.${chapter}.${verse}`;
}

function makeTokenId(book, chapter, verse, tokenIndex) {
  const safeBook = book.replace(/\s+/g, "_");
  return `greek-nt:${safeBook}.${chapter}.${verse}:${tokenIndex}`;
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

function buildCanonicalTokens(words) {
  const verseCounters = new Map();

  return words.map((row, index) => {
    const rowNumber = index + 1;

    const book = normalizeBookName(row.book);
    const chapter = asPositiveInteger(row.chapter, "chapter", rowNumber);
    const verse = asPositiveInteger(row.verse, "verse", rowNumber);

    if (!book || !isNewTestamentBook(book)) {
      throw new Error(
        `Invalid Greek NT book at row ${rowNumber}: ${JSON.stringify(row.book)}`
      );
    }

    const verseId = makeVerseId(book, chapter, verse);
    const nextIndex = (verseCounters.get(verseId) || 0) + 1;
    verseCounters.set(verseId, nextIndex);

    const strong = normalizeStrong(row.strong);
    const sourceSort = row.sort ? String(row.sort).trim() : null;

    return {
      corpus: "greek-nt",
      language: "greek",
      witness: "OpenGNT",
      sourceName: "OpenGNT",

      book,
      chapter,
      verse,
      verseId,

      tokenIndex: nextIndex,
      tokenId: makeTokenId(book, chapter, verse, nextIndex),

      surface: row.word || "",
      normalizedSurface: normalizeGreekText(row.word),

      strong,
      entityId: makeEntityId(strong),

      morph: row.morph || "",
      morphEnglish: row.morphEnglish || "",

      gloss: row.gloss || "",
      mounceGloss: row.mounceGloss || "",
      tyndaleGloss: row.tyndaleGloss || "",

      sourceSort,
    };
  });
}

function groupByBook(tokens) {
  const grouped = new Map();

  for (const token of tokens) {
    if (!grouped.has(token.book)) grouped.set(token.book, []);
    grouped.get(token.book).push(token);
  }

  return grouped;
}

function countVerses(tokens) {
  const verses = new Set();

  for (const token of tokens) {
    verses.add(token.verseId);
  }

  return verses.size;
}

function buildAudit(words, tokens, grouped) {
  const actualBooks = [...grouped.keys()];
  const actualBookSet = new Set(actualBooks);

  const missingBooks = NT_BOOKS.filter((book) => !actualBookSet.has(book));
  const extraBooks = actualBooks.filter((book) => !NT_BOOKS.includes(book));

  const byBook = {};

  for (const book of NT_BOOKS) {
    const bookTokens = grouped.get(book) || [];
    byBook[book] = {
      tokens: bookTokens.length,
      verses: countVerses(bookTokens),
      firstTokenId: bookTokens[0]?.tokenId || null,
      lastTokenId: bookTokens[bookTokens.length - 1]?.tokenId || null,
    };
  }

  const tokensWithoutStrong = tokens.filter((token) => !token.strong);
  const tokensWithoutSurface = tokens.filter((token) => !token.surface);
  const tokensWithoutGloss = tokens.filter(
    (token) => !token.gloss && !token.mounceGloss && !token.tyndaleGloss
  );

  return {
    corpus: "greek-nt",
    witness: "OpenGNT",
    sourceFile: path.relative(root, inputWordsPath),
    generatedAt: new Date().toISOString(),

    inputRows: words.length,
    outputTokens: tokens.length,

    books: {
      expected: NT_BOOKS.length,
      actual: actualBooks.length,
      missing: missingBooks,
      extra: extraBooks,
    },

    verses: countVerses(tokens),

    quality: {
      tokensWithoutStrong: tokensWithoutStrong.length,
      tokensWithoutSurface: tokensWithoutSurface.length,
      tokensWithoutGloss: tokensWithoutGloss.length,
    },

    byBook,
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

function writeBookFiles(grouped) {
  cleanDir(outputDir);

  for (const book of NT_BOOKS) {
    const tokens = grouped.get(book) || [];
    const fileBase = BOOK_FILE_NAMES[book] || book.replace(/\s+/g, "");
    const filePath = path.join(outputDir, `${fileBase}.json`);

    const payload = {
      corpus: "greek-nt",
      language: "greek",
      witness: "OpenGNT",
      sourceName: "OpenGNT",
      book,

      tokenCount: tokens.length,
      verseCount: countVerses(tokens),

      tokens,
    };

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
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

  const tokens = buildCanonicalTokens(words);
  const grouped = groupByBook(tokens);
  const audit = buildAudit(words, tokens, grouped);

  assertAuditPassed(audit);

  writeBookFiles(grouped);

  fs.writeFileSync(reportPath, JSON.stringify(audit, null, 2));

  console.log("Built Greek NT canonical corpus:");
  console.log(`source rows: ${audit.inputRows}`);
  console.log(`tokens: ${audit.outputTokens}`);
  console.log(`books: ${audit.books.actual}`);
  console.log(`verses: ${audit.verses}`);
  console.log(`output: ${path.relative(root, outputDir)}`);
  console.log(`audit: ${path.relative(root, reportPath)}`);
}

main();