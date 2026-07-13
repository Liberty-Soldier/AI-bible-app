const fs = require("fs");
const path = require("path");

const {
  OT_BOOKS,
  NT_BOOKS,
  normalizeBookName,
  isOldTestamentBook,
  isNewTestamentBook,
} = require("./shared/corpus-ownership.cjs");

const root = process.cwd();

const inputRoot = path.join(root, ".private", "scripture", "canonical");
const outputRoot = path.join(root, "app", "data", "bibleiq", "canonical");

function cleanDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeFileBase(file) {
  return path
    .basename(file, ".json")
    // Strip only zero-padded or multi-digit file ordering prefixes like:
    // 01-Genesis.json, 02_Exodus.json, 10 Isaiah.json
    // Do NOT strip canonical book ordinals like 1Sam, 1 Kings, 1 Corinthians.
    .replace(/^(?:0\d+|\d{2,})[-_\s]+/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function findBookInValue(value) {
  if (!value) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBookInValue(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof value !== "object") return null;

  const direct =
    value.book ||
    value.bookName ||
    value.bookId ||
    value.osisBook ||
    value.ref?.book ||
    value.reference?.book ||
    value.metadata?.book ||
    value.meta?.book;

  if (direct) return normalizeBookName(direct);

  const likelyArrays = [
    value.verses,
    value.records,
    value.tokens,
    value.items,
    value.data,
    value.entries,
  ];

  for (const arr of likelyArrays) {
    if (!Array.isArray(arr)) continue;

    for (const item of arr) {
      const found = findBookInValue(item);
      if (found) return found;
    }
  }

  return null;
}

function detectBook(inputFilePath, file) {
  const json = readJsonSafe(inputFilePath);
  const fromJson = findBookInValue(json);
  if (fromJson) return fromJson;

  const fromFile = normalizeBookName(normalizeFileBase(file));
  if (isOldTestamentBook(fromFile) || isNewTestamentBook(fromFile)) {
    return fromFile;
  }

  return null;
}

function copyCorpus(corpus, shouldCopyBook) {
  const inputDir = path.join(inputRoot, corpus);
  const outputDir = path.join(outputRoot, corpus);

  fs.mkdirSync(outputDir, { recursive: true });

  if (!fs.existsSync(inputDir)) {
    console.log(`Skipping missing canonical corpus: ${corpus}`);
    return {
      copied: 0,
      skipped: 0,
      unknown: [],
      books: [],
    };
  }

  let copied = 0;
  let skipped = 0;
  const unknown = [];
  const books = new Set();

  for (const file of fs.readdirSync(inputDir)) {
    if (!file.endsWith(".json")) continue;

    const inputFilePath = path.join(inputDir, file);
    const outputFilePath = path.join(outputDir, file);
    const book = detectBook(inputFilePath, file);

    if (!book) {
      unknown.push(file);
      skipped += 1;
      continue;
    }

    if (!shouldCopyBook(book)) {
      skipped += 1;
      continue;
    }

    fs.copyFileSync(inputFilePath, outputFilePath);
    books.add(book);
    copied += 1;
  }

  return {
    copied,
    skipped,
    unknown,
    books: [...books].sort(),
  };
}

function assertExpectedBooks(label, result, expectedBooks) {
  const actual = new Set(result.books);
  const missing = expectedBooks.filter((book) => !actual.has(book));
  const extra = result.books.filter((book) => !expectedBooks.includes(book));

  if (missing.length || extra.length || result.unknown.length) {
    throw new Error(
      [
        `${label} corpus ownership failed.`,
        `Expected books: ${expectedBooks.length}`,
        `Actual books: ${actual.size}`,
        `Missing: ${missing.join(", ") || "none"}`,
        `Extra: ${extra.join(", ") || "none"}`,
        `Unknown files: ${result.unknown.join(", ") || "none"}`,
      ].join("\n")
    );
  }
}

function main() {
  if (!fs.existsSync(inputRoot)) {
    console.log(
      "No .private canonical source found. Keeping committed canonical runtime."
    );
    return;
  }

  cleanDir(outputRoot);

  const hebrew = copyCorpus("hebrew", isOldTestamentBook);
  const lxx = copyCorpus("lxx", isOldTestamentBook);
  const greekNt = copyCorpus("greek-nt", isNewTestamentBook);

  assertExpectedBooks("Hebrew", hebrew, OT_BOOKS);

  if (greekNt.copied > 0) {
    assertExpectedBooks("Greek NT", greekNt, NT_BOOKS);
  }

  console.log("Exported BibleIQ canonical runtime:");
  console.log(
    `source corpora: hebrew=${hebrew.copied}, lxx=${lxx.copied}, greek-nt=${greekNt.copied}`
  );
  console.log(
    `skipped: hebrew=${hebrew.skipped}, lxx=${lxx.skipped}, greek-nt=${greekNt.skipped}`
  );

  if (hebrew.unknown.length || lxx.unknown.length || greekNt.unknown.length) {
    console.log("Unknown canonical files:");
    console.log(
      JSON.stringify(
        {
          hebrew: hebrew.unknown,
          lxx: lxx.unknown,
          "greek-nt": greekNt.unknown,
        },
        null,
        2
      )
    );
  }
}

main();

