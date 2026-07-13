const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { normalizeBookName } = require("./shared/corpus-ownership.cjs");

const ROOT = process.cwd();
const INPUT_ROOT = path.join(ROOT, "app", "data", "bibleiq", "canonical");
const OUTPUT_ROOT = path.join(ROOT, "public", "data", "bibleiq", "word-study");
const CORPORA = ["hebrew", "greek-nt", "lxx"];
const VERSION = 1;

function cleanDirectory(directory) {
  if (fs.existsSync(directory)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  fs.mkdirSync(directory, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeAlias(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^0-9A-Za-z]+/g, "")
    .toLowerCase();
}

function safeOutputFileName(fileName) {
  const base = path.basename(fileName, ".json").replace(/[^0-9A-Za-z]+/g, "");
  if (!base) throw new Error(`Cannot derive runtime filename from ${fileName}`);
  return `${base}.json`;
}

function unwrapVerseMap(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("Canonical book must be a JSON object.");
  }

  for (const key of ["verses", "records", "data", "entries"]) {
    const candidate = document[key];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const values = Object.values(candidate);
      if (values.some((value) => value && typeof value === "object" && "sourceTokens" in value)) {
        return candidate;
      }
    }
  }

  return document;
}

function compactSourceToken(token) {
  return [
    String(token?.id || ""),
    String(token?.surface || ""),
    String(token?.lemma || ""),
    String(token?.strong || ""),
    String(token?.entityId || ""),
    String(token?.morph || ""),
  ];
}

function compactVerse(verse, fallbackReference) {
  const sourceTokens = Array.isArray(verse?.sourceTokens) ? verse.sourceTokens : [];
  const sourceIndexById = new Map();

  sourceTokens.forEach((token, index) => {
    const id = String(token?.id || "");
    if (id) sourceIndexById.set(id, index);
  });

  const alignments = {};
  const translations = verse?.translations && typeof verse.translations === "object"
    ? verse.translations
    : {};

  for (const translationKey of Object.keys(translations).sort()) {
    const translation = translations[translationKey];
    const tokens = Array.isArray(translation?.tokens) ? translation.tokens : [];
    const aligned = {};

    for (const token of tokens) {
      const displayIndex = Number(token?.index);
      if (!Number.isInteger(displayIndex) || displayIndex < 0) continue;

      const sourceTokenId = Array.isArray(token?.alignedSourceTokenIds)
        ? String(token.alignedSourceTokenIds[0] || "")
        : "";
      if (!sourceTokenId) continue;

      const sourceIndex = sourceIndexById.get(sourceTokenId);
      if (sourceIndex == null) continue;
      aligned[String(displayIndex)] = sourceIndex;
    }

    if (Object.keys(aligned).length > 0) {
      alignments[String(translationKey).toLowerCase()] = aligned;
    }
  }

  const chapter = Number(verse?.chapter);
  const verseNumber = Number(verse?.verse);
  if (!Number.isInteger(chapter) || !Number.isInteger(verseNumber)) {
    const match = String(verse?.reference || fallbackReference || "").match(/:(\d+):(\d+)$/);
    if (!match) return null;
    return {
      key: `${Number(match[1])}:${Number(match[2])}`,
      value: {
        s: sourceTokens.map(compactSourceToken),
        a: alignments,
      },
    };
  }

  return {
    key: `${chapter}:${verseNumber}`,
    value: {
      s: sourceTokens.map(compactSourceToken),
      a: alignments,
    },
  };
}

function registerAlias(aliasMap, alias, outputFile) {
  const key = normalizeAlias(alias);
  if (!key) return;

  const existing = aliasMap[key];
  if (existing && existing !== outputFile) {
    throw new Error(`Book alias collision for ${key}: ${existing} vs ${outputFile}`);
  }
  aliasMap[key] = outputFile;
}

function buildBook(corpus, inputFile, outputFile, aliasMap) {
  const inputPath = path.join(INPUT_ROOT, corpus, inputFile);
  const sourceDocument = readJson(inputPath);
  const verseMap = unwrapVerseMap(sourceDocument);
  const compactVerses = {};
  const bookNames = new Set([path.basename(inputFile, ".json")]);
  let sourceTokenCount = 0;
  let alignedDisplayTokenCount = 0;

  for (const reference of Object.keys(verseMap).sort()) {
    const verse = verseMap[reference];
    if (!verse || typeof verse !== "object") continue;

    if (verse.book) bookNames.add(String(verse.book));
    const compact = compactVerse(verse, reference);
    if (!compact) continue;

    compactVerses[compact.key] = compact.value;
    sourceTokenCount += compact.value.s.length;
    for (const translation of Object.values(compact.value.a)) {
      alignedDisplayTokenCount += Object.keys(translation).length;
    }
  }

  if (Object.keys(compactVerses).length === 0) {
    throw new Error(`${corpus}/${inputFile} contained no canonical verses.`);
  }

  const baseName = path.basename(inputFile, ".json");
  const normalizedBook = normalizeBookName(baseName);
  if (normalizedBook) bookNames.add(normalizedBook);

  const runtimeBook = {
    version: VERSION,
    corpus,
    book: normalizedBook || [...bookNames][0],
    verses: compactVerses,
  };

  const serialized = `${JSON.stringify(runtimeBook)}\n`;
  const outputPath = path.join(OUTPUT_ROOT, corpus, outputFile);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized, "utf8");

  for (const bookName of [...bookNames].sort()) {
    registerAlias(aliasMap, bookName, outputFile);
    const normalized = normalizeBookName(bookName);
    if (normalized) registerAlias(aliasMap, normalized, outputFile);
  }

  return {
    file: outputFile,
    verses: Object.keys(compactVerses).length,
    sourceTokens: sourceTokenCount,
    alignedDisplayTokens: alignedDisplayTokenCount,
    bytes: Buffer.byteLength(serialized),
    checksum: sha256(serialized),
  };
}

function main() {
  if (!fs.existsSync(INPUT_ROOT)) {
    throw new Error(`Missing canonical runtime: ${INPUT_ROOT}`);
  }

  cleanDirectory(OUTPUT_ROOT);

  const manifest = {
    version: VERSION,
    generatedFrom: "app/data/bibleiq/canonical",
    corpora: {},
    totals: {
      books: 0,
      verses: 0,
      sourceTokens: 0,
      alignedDisplayTokens: 0,
      bytes: 0,
    },
  };

  for (const corpus of CORPORA) {
    const inputDirectory = path.join(INPUT_ROOT, corpus);
    const aliases = {};
    const books = {};

    if (!fs.existsSync(inputDirectory)) {
      manifest.corpora[corpus] = { aliases, books };
      continue;
    }

    const files = fs.readdirSync(inputDirectory)
      .filter((file) => file.endsWith(".json"))
      .sort();

    for (const inputFile of files) {
      const outputFile = safeOutputFileName(inputFile);
      const stats = buildBook(corpus, inputFile, outputFile, aliases);
      books[outputFile] = stats;
      manifest.totals.books += 1;
      manifest.totals.verses += stats.verses;
      manifest.totals.sourceTokens += stats.sourceTokens;
      manifest.totals.alignedDisplayTokens += stats.alignedDisplayTokens;
      manifest.totals.bytes += stats.bytes;
    }

    manifest.corpora[corpus] = {
      aliases: Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b))),
      books: Object.fromEntries(Object.entries(books).sort(([a], [b]) => a.localeCompare(b))),
    };
  }

  const manifestWithoutChecksum = JSON.stringify(manifest);
  manifest.checksum = sha256(manifestWithoutChecksum);
  writeJson(path.join(OUTPUT_ROOT, "manifest.json"), manifest);

  console.log("\n========================================");
  console.log(" EMETSEES Word Study Runtime");
  console.log("========================================\n");
  console.log(`Books                 : ${manifest.totals.books}`);
  console.log(`Verses                : ${manifest.totals.verses}`);
  console.log(`Source tokens         : ${manifest.totals.sourceTokens}`);
  console.log(`Aligned display tokens: ${manifest.totals.alignedDisplayTokens}`);
  console.log(`Runtime size          : ${(manifest.totals.bytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Checksum              : ${manifest.checksum}`);
  console.log(`Output                : ${OUTPUT_ROOT}\n`);
}

main();