#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const repositoryRoot = path.resolve(process.argv[2] || process.cwd());
const outputRoot = path.resolve(
  process.argv[3] ||
    path.join(repositoryRoot, "public", "scripture", "search"),
);

const TRANSLATIONS = [
  {
    id: "web",
    expectedVerses: 31098,
    sourceRoot: "public/scripture/runtime/web",
  },
  {
    id: "kjv",
    expectedVerses: 31102,
    sourceRoot: "public/scripture/runtime/kjv",
  },
  {
    id: "brenton",
    expectedVerses: 28548,
    sourceRoot: "public/scripture/runtime/brenton",
  },
];

const BOOK_ORDER = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings",
  "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah",
  "Esther", "Esther Greek", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "Song of Songs", "Song of Solomon", "Isaiah",
  "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Daniel Greek",
  "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum",
  "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
  "Tobit", "Judith", "Wisdom", "Sirach", "Baruch",
  "Letter of Jeremiah", "Susanna", "Bel and the Dragon",
  "1 Maccabees", "2 Maccabees", "3 Maccabees", "4 Maccabees",
  "1 Esdras", "Prayer of Manasseh", "Matthew", "Mark", "Luke",
  "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians",
  "Galatians", "Ephesians", "Philippians", "Colossians",
  "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy",
  "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter",
  "1 John", "2 John", "3 John", "Jude", "Revelation",
];

const orderByBook = new Map(
  BOOK_ORDER.map((book, index) => [book.toLowerCase(), index]),
);

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}

function listJsonFiles(root) {
  const result = [];
  const stack = [root];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs
      .readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, "en"));

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith(".json")) {
        result.push(full);
      }
    }
  }

  return result.sort((a, b) => a.localeCompare(b, "en"));
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceScore(source, translation) {
  const identity = [
    source && source.sourceName,
    source && source.label,
    source && source.tradition,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (translation === "web" && /(world english|\bweb\b)/.test(identity)) {
    return 100;
  }
  if (translation === "kjv" && /(king james|\bkjv\b)/.test(identity)) {
    return 100;
  }
  if (translation === "brenton" && /brenton/.test(identity)) {
    return 100;
  }
  if (source && source.language === "english") return 20;
  return 1;
}

function extractText(verse, translation) {
  const direct = [
    verse && verse.text,
    verse && verse.translationText,
    verse && verse.displayText,
    verse && typeof verse.display === "string" ? verse.display : null,
    verse && verse.display && verse.display.text,
  ];

  for (const candidate of direct) {
    const normalized = normalizeWhitespace(candidate);
    if (normalized) return normalized;
  }

  const sources = Array.isArray(verse && verse.sources)
    ? [...verse.sources]
    : [];

  sources.sort(
    (left, right) =>
      sourceScore(right, translation) - sourceScore(left, translation),
  );

  for (const source of sources) {
    const normalized = normalizeWhitespace(source && source.text);
    if (normalized) return normalized;
  }

  if (
    typeof (verse && verse.verse) === "string" &&
    !/^\d+[a-z]?$/.test(verse.verse.trim())
  ) {
    return normalizeWhitespace(verse.verse);
  }

  return "";
}

function verseLabelOf(verse) {
  const candidates = [
    verse && verse.verseLabel,
    verse && verse.display && verse.display.verseLabel,
    verse && verse.verse,
  ];

  for (const candidate of candidates) {
    if (
      typeof candidate === "string" ||
      typeof candidate === "number"
    ) {
      const normalized = String(candidate).trim();
      if (/^\d+[a-z]?$/.test(normalized)) return normalized;
    }
  }

  const reference = String((verse && verse.reference) || "");
  const match = reference.match(/:(\d+[a-z]?)$/i);
  return match ? match[1] : "";
}

function chapterOf(verse, file) {
  const direct = Number(verse && verse.chapter);
  if (Number.isInteger(direct) && direct > 0) return direct;

  const fromFile = Number(path.basename(file, ".json"));
  return Number.isInteger(fromFile) && fromFile > 0 ? fromFile : 0;
}

function bookOf(verse, file, sourceRoot) {
  const direct = normalizeWhitespace(verse && verse.book);
  if (direct) return direct;

  const relative = path.relative(sourceRoot, file);
  const directory = relative.split(path.sep)[0] || "";
  return directory.replace(/_/g, " ").trim();
}

function compareVerseLabels(left, right) {
  const parse = (value) => {
    const match = String(value).match(/^(\d+)([a-z]?)$/i);
    return match
      ? [Number(match[1]), match[2].toLowerCase()]
      : [Number.MAX_SAFE_INTEGER, String(value)];
  };
  const a = parse(left);
  const b = parse(right);

  if (a[0] !== b[0]) return a[0] - b[0];
  return String(a[1]).localeCompare(String(b[1]), "en");
}

function buildTranslation(config) {
  const sourceRoot = path.join(repositoryRoot, config.sourceRoot);

  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Missing reader runtime: ${sourceRoot}`);
  }

  const files = listJsonFiles(sourceRoot);
  const records = [];
  const seen = new Set();
  const fileFingerprints = [];
  const extractionFailures = [];

  for (const file of files) {
    const raw = fs.readFileSync(file);
    const document = JSON.parse(raw.toString("utf8"));
    const verses = Array.isArray(document)
      ? document
      : Array.isArray(document && document.verses)
        ? document.verses
        : [];

    fileFingerprints.push(
      `${path.relative(sourceRoot, file).replace(/\\/g, "/")}:${sha256Buffer(raw)}`,
    );

    for (const verse of verses) {
      const book = bookOf(verse, file, sourceRoot);
      const chapter = chapterOf(verse, file);
      const verseLabel = verseLabelOf(verse);
      const text = extractText(verse, config.id);
      const key = `${book}\u0000${chapter}\u0000${verseLabel}`;

      if (!book || !chapter || !verseLabel || !text) {
        extractionFailures.push({
          file: path.relative(repositoryRoot, file).replace(/\\/g, "/"),
          reference: verse && verse.reference,
          book,
          chapter,
          verseLabel,
          hasText: Boolean(text),
        });
        continue;
      }

      if (seen.has(key)) {
        throw new Error(
          `Duplicate search record for ${book} ${chapter}:${verseLabel}`,
        );
      }

      seen.add(key);
      records.push([book, chapter, verseLabel, text]);
    }
  }

  if (extractionFailures.length) {
    const preview = extractionFailures.slice(0, 10);
    throw new Error(
      `${config.id} search extraction failed for ${extractionFailures.length} verses: ${JSON.stringify(preview)}`,
    );
  }

  if (records.length !== config.expectedVerses) {
    throw new Error(
      `${config.id} verse count mismatch. Expected ${config.expectedVerses}, found ${records.length}.`,
    );
  }

  records.sort((left, right) => {
    const leftOrder =
      orderByBook.get(String(left[0]).toLowerCase()) ??
      BOOK_ORDER.length + 1;
    const rightOrder =
      orderByBook.get(String(right[0]).toLowerCase()) ??
      BOOK_ORDER.length + 1;

    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    if (left[0] !== right[0]) {
      return String(left[0]).localeCompare(String(right[0]), "en");
    }
    if (left[1] !== right[1]) return left[1] - right[1];
    return compareVerseLabels(left[2], right[2]);
  });

  const books = Array.from(new Set(records.map((record) => record[0])));
  const sourceFingerprint = sha256Buffer(
    fileFingerprints.sort().join("\n"),
  );
  const output = {
    schemaVersion: 1,
    translation: config.id,
    verseCount: records.length,
    books,
    sourceFingerprint,
    records,
  };
  const serialized = `${JSON.stringify(output)}\n`;
  const destination = path.join(outputRoot, `${config.id}.json`);

  ensureDirectory(outputRoot);
  fs.writeFileSync(destination, serialized, "utf8");

  return {
    translation: config.id,
    sourceRoot: config.sourceRoot,
    sourceFiles: files.length,
    verseCount: records.length,
    books: books.length,
    sourceFingerprint,
    output: path.relative(repositoryRoot, destination).replace(/\\/g, "/"),
    outputBytes: Buffer.byteLength(serialized),
    outputSha256: sha256Buffer(serialized),
  };
}

function main() {
  if (!fs.existsSync(path.join(repositoryRoot, "package.json"))) {
    throw new Error(`Not an EMETSEES repository: ${repositoryRoot}`);
  }

  ensureDirectory(outputRoot);
  const summaries = TRANSLATIONS.map(buildTranslation);
  const manifest = {
    phase: "P08.3",
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceOfTruth: "public/scripture/runtime",
    summaries,
  };

  fs.writeFileSync(
    path.join(outputRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  for (const summary of summaries) {
    console.log(
      `${summary.translation}: ${summary.verseCount} verses, ${summary.outputBytes} bytes, ${summary.outputSha256}`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
}
