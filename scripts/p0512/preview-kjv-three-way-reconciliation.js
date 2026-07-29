#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.cwd();

function fail(message) {
  throw new Error(`[P05.12H KJV reconciliation] ${message}`);
}

function normalizeSlashes(value) {
  return String(value || "").replace(/\\/g, "/");
}

function relative(root, target) {
  return normalizeSlashes(path.relative(root, target));
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function parseArgs(argv) {
  const args = {
    output: "",
    profiles: "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else if (arg === "--profiles" && next) {
      args.profiles = path.resolve(next);
      index += 1;
    } else {
      fail(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (!args.output) {
    fail("Missing required --output path.");
  }

  return args;
}

function walk(directory, predicate = () => true) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  const stack = [directory];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && predicate(fullPath)) {
        result.push(fullPath);
      }
    }
  }

  return result.sort((a, b) => a.localeCompare(b));
}

function findLatestSourceProfiles(explicitPath) {
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      fail(`Authoritative source profiles not found: ${explicitPath}`);
    }
    return explicitPath;
  }

  const reportRoot = path.join(ROOT, ".private", "reports", "P05.12");
  const candidates = walk(
    reportRoot,
    (filePath) => path.basename(filePath) === "authoritative-source-profiles.json",
  );

  if (!candidates.length) {
    fail(
      `No authoritative-source-profiles.json found under ${relative(ROOT, reportRoot)}`,
    );
  }

  candidates.sort((a, b) => {
    const aTime = fs.statSync(a).mtimeMs;
    const bTime = fs.statSync(b).mtimeMs;
    return bTime - aTime;
  });

  return candidates[0];
}

function toAbsoluteRepoPath(value) {
  const normalized = String(value || "").replace(/\//g, path.sep);
  return path.isAbsolute(normalized)
    ? normalized
    : path.join(ROOT, normalized);
}

function git(command) {
  try {
    return require("child_process")
      .execFileSync("git", command, {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
      .trim();
  } catch {
    return "";
  }
}

function normalizeWhitespace(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .trim();
}

function normalizeTypography(value) {
  return normalizeWhitespace(value)
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/…/g, "...");
}

function words(value) {
  const normalized = normalizeTypography(value).toLocaleLowerCase("en-US");
  return normalized.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
}

function sameWords(a, b) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function isSubsequence(needle, haystack) {
  if (!needle.length) return true;
  let index = 0;
  for (const value of haystack) {
    if (value === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}

function lcsLength(a, b) {
  if (!a.length || !b.length) return 0;

  let shorter = a;
  let longer = b;
  if (a.length > b.length) {
    shorter = b;
    longer = a;
  }

  let previous = new Uint32Array(shorter.length + 1);
  let current = new Uint32Array(shorter.length + 1);

  for (let i = 1; i <= longer.length; i += 1) {
    for (let j = 1; j <= shorter.length; j += 1) {
      current[j] =
        longer[i - 1] === shorter[j - 1]
          ? previous[j - 1] + 1
          : Math.max(previous[j], current[j - 1]);
    }
    const swap = previous;
    previous = current;
    current = swap;
    current.fill(0);
  }

  return previous[shorter.length];
}

function similarity(aWords, bWords) {
  if (!aWords.length && !bWords.length) return 1;
  if (!aWords.length || !bWords.length) return 0;
  const lcs = lcsLength(aWords, bWords);
  return (2 * lcs) / (aWords.length + bWords.length);
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  let text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/["\r\n,]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(filePath, rows, columns) {
  ensureDir(path.dirname(filePath));
  const header = columns.map(csvCell).join(",");
  const lines = [header];

  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(","));
  }

  fs.writeFileSync(filePath, lines.join("\r\n") + "\r\n", "utf8");
}

const ID_TO_BOOK = {
  GEN: "Genesis",
  EXO: "Exodus",
  LEV: "Leviticus",
  NUM: "Numbers",
  DEU: "Deuteronomy",
  JOS: "Joshua",
  JDG: "Judges",
  RUT: "Ruth",
  "1SA": "1 Samuel",
  "2SA": "2 Samuel",
  "1KI": "1 Kings",
  "2KI": "2 Kings",
  "1CH": "1 Chronicles",
  "2CH": "2 Chronicles",
  EZR: "Ezra",
  NEH: "Nehemiah",
  EST: "Esther",
  JOB: "Job",
  PSA: "Psalms",
  PRO: "Proverbs",
  ECC: "Ecclesiastes",
  SNG: "Song of Solomon",
  ISA: "Isaiah",
  JER: "Jeremiah",
  LAM: "Lamentations",
  EZK: "Ezekiel",
  DAN: "Daniel",
  DAG: "Daniel",
  HOS: "Hosea",
  JOL: "Joel",
  AMO: "Amos",
  OBA: "Obadiah",
  JON: "Jonah",
  MIC: "Micah",
  NAM: "Nahum",
  HAB: "Habakkuk",
  ZEP: "Zephaniah",
  HAG: "Haggai",
  ZEC: "Zechariah",
  MAL: "Malachi",
  MAT: "Matthew",
  MRK: "Mark",
  LUK: "Luke",
  JHN: "John",
  ACT: "Acts",
  ROM: "Romans",
  "1CO": "1 Corinthians",
  "2CO": "2 Corinthians",
  GAL: "Galatians",
  EPH: "Ephesians",
  PHP: "Philippians",
  COL: "Colossians",
  "1TH": "1 Thessalonians",
  "2TH": "2 Thessalonians",
  "1TI": "1 Timothy",
  "2TI": "2 Timothy",
  TIT: "Titus",
  PHM: "Philemon",
  HEB: "Hebrews",
  JAS: "James",
  "1PE": "1 Peter",
  "2PE": "2 Peter",
  "1JN": "1 John",
  "2JN": "2 John",
  "3JN": "3 John",
  JUD: "Jude",
  REV: "Revelation",
  TOB: "Tobit",
  JDT: "Judith",
  ESG: "Esther",
  WIS: "Wisdom",
  SIR: "Sirach",
  BAR: "Baruch",
  LJE: "Letter of Jeremiah",
  S3Y: "Song of the Three Young Men",
  SUS: "Susanna",
  BEL: "Bel and the Dragon",
  "1MA": "1 Maccabees",
  "2MA": "2 Maccabees",
  "3MA": "3 Maccabees",
  "4MA": "4 Maccabees",
  "1ES": "1 Esdras",
  "2ES": "2 Esdras",
  MAN: "Prayer of Manasseh",
  PS2: "Psalm 151",
  ODA: "Odes",
  PSS: "Psalms of Solomon",
};

const BOOK_EQUIVALENTS = new Map();

function simpleBookName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(first|i)\b/gi, "1")
    .replace(/\b(second|ii)\b/gi, "2")
    .replace(/\b(third|iii)\b/gi, "3")
    .replace(/\b(fourth|iv)\b/gi, "4")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function registerBookAliases(canonical, aliases) {
  for (const alias of [canonical, ...aliases]) {
    BOOK_EQUIVALENTS.set(simpleBookName(alias), canonical);
  }
}

for (const canonical of Object.values(ID_TO_BOOK)) {
  registerBookAliases(canonical, []);
}

registerBookAliases("Psalms", ["Psalm", "The Psalms"]);
registerBookAliases("Song of Solomon", [
  "Song of Songs",
  "Canticles",
  "Canticle of Canticles",
]);
registerBookAliases("Ecclesiastes", ["Qoheleth"]);
registerBookAliases("1 Samuel", ["1 Kingdoms", "I Kingdoms", "First Kingdoms"]);
registerBookAliases("2 Samuel", ["2 Kingdoms", "II Kingdoms", "Second Kingdoms"]);
registerBookAliases("1 Kings", ["3 Kingdoms", "III Kingdoms", "Third Kingdoms"]);
registerBookAliases("2 Kings", ["4 Kingdoms", "IV Kingdoms", "Fourth Kingdoms"]);
registerBookAliases("Ezra", ["Esdras"]);
registerBookAliases("Nehemiah", []);
registerBookAliases("Isaiah", ["Esaias"]);
registerBookAliases("Jeremiah", ["Jeremias"]);
registerBookAliases("Ezekiel", ["Ezechiel"]);
registerBookAliases("Hosea", ["Osee"]);
registerBookAliases("Obadiah", ["Abdias"]);
registerBookAliases("Jonah", ["Jonas"]);
registerBookAliases("Micah", ["Micheas"]);
registerBookAliases("Nahum", ["Naum"]);
registerBookAliases("Habakkuk", ["Ambacum"]);
registerBookAliases("Zephaniah", ["Sophonias"]);
registerBookAliases("Haggai", ["Aggaeus"]);
registerBookAliases("Zechariah", ["Zacharias"]);
registerBookAliases("Malachi", ["Malachias"]);
registerBookAliases("Daniel", ["Daniel Greek"]);
registerBookAliases("Wisdom", ["Wisdom of Solomon"]);
registerBookAliases("Sirach", ["Ecclesiasticus", "Wisdom of Jesus Son of Sirach"]);
registerBookAliases("Letter of Jeremiah", ["Epistle of Jeremy"]);
registerBookAliases("Prayer of Manasseh", ["Prayer of Manasses"]);
registerBookAliases("1 Esdras", ["1 Esdras Greek", "I Esdras"]);
registerBookAliases("2 Esdras", ["II Esdras"]);
registerBookAliases("1 Maccabees", ["I Maccabees"]);
registerBookAliases("2 Maccabees", ["II Maccabees"]);
registerBookAliases("3 Maccabees", ["III Maccabees"]);
registerBookAliases("4 Maccabees", ["IV Maccabees"]);

function canonicalBookName(value, fallbackId = "") {
  const normalized = simpleBookName(value);
  if (BOOK_EQUIVALENTS.has(normalized)) {
    return BOOK_EQUIVALENTS.get(normalized);
  }

  const idBook = ID_TO_BOOK[String(fallbackId || "").toUpperCase()];
  if (idBook) return idBook;

  return normalizeWhitespace(value);
}

const HEADING_MARKERS = new Set([
  "s",
  "s1",
  "s2",
  "s3",
  "s4",
  "ms",
  "ms1",
  "ms2",
  "ms3",
  "mr",
  "r",
  "d",
  "sp",
  "cl",
  "qa",
  "cd",
]);

const STRUCTURE_MARKERS = new Set([
  "p",
  "m",
  "po",
  "pr",
  "cls",
  "pmo",
  "pm",
  "pmc",
  "pmr",
  "pi",
  "pi1",
  "pi2",
  "pi3",
  "mi",
  "nb",
  "pc",
  "ph",
  "ph1",
  "ph2",
  "ph3",
  "q",
  "q1",
  "q2",
  "q3",
  "q4",
  "qr",
  "qc",
  "qm",
  "qm1",
  "qm2",
  "qm3",
  "qd",
  "lh",
  "li",
  "li1",
  "li2",
  "li3",
  "li4",
  "b",
]);

const BOOK_NAME_MARKERS = new Set(["toc1", "toc2", "h", "mt", "mt1"]);
const NON_SCRIPTURE_MARKERS = new Set([
  "id",
  "ide",
  "usfm",
  "sts",
  "rem",
  "toc1",
  "toc2",
  "toc3",
  "h",
  "h1",
  "h2",
  "h3",
  "mt",
  "mt1",
  "mt2",
  "mt3",
  "imt",
  "imt1",
  "imt2",
  "is",
  "is1",
  "is2",
  "ip",
  "ipi",
  "im",
  "imi",
  "ipq",
  "imq",
  "ipr",
  "iq",
  "iq1",
  "iq2",
  "iq3",
  "ili",
  "ili1",
  "ili2",
  "iot",
  "io",
  "io1",
  "io2",
  "ior",
  "iex",
  "imte",
  "ie",
  "periph",
]);

function parseAttributes(value) {
  const attributes = {};
  const text = String(value || "");
  const regex = /([\w-]+)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = regex.exec(text))) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}

function stripInlineMarkers(segment, context) {
  let value = String(segment || "");

  value = value.replace(
    /\\w\s+([\s\S]*?)(?:\|([\s\S]*?))?\\w\*/gi,
    (whole, display, attributeText) => {
      const cleanDisplay = normalizeWhitespace(display);
      const attributes = parseAttributes(attributeText);
      const strongValue =
        attributes.strong ||
        attributes.lemma ||
        attributes["x-strong"] ||
        "";

      context.wordMetadata.push({
        display: cleanDisplay,
        attributes,
        strong: strongValue,
      });

      return cleanDisplay;
    },
  );

  value = value.replace(/\\fig\b[\s\S]*?\\fig\*/gi, " ");
  value = value.replace(/\\cat\b[\s\S]*?\\cat\*/gi, " ");
  value = value.replace(/\\zaln-s\b[^\\]*?\\\*/gi, " ");
  value = value.replace(/\\zaln-e\\\*/gi, " ");
  value = value.replace(/\\k-s\b[^\\]*?\\\*/gi, " ");
  value = value.replace(/\\k-e\\\*/gi, " ");

  value = value.replace(/\\\+?[\w-]+\*/g, "");
  value = value.replace(/\\\+?[\w-]+\b\s*/g, "");
  value = value.replace(/\|[\w-]+="[^"]*"/g, "");
  value = value.replace(/~/g, " ");

  return normalizeWhitespace(value);
}

function consumeNotesAndVisible(text, state, context) {
  let remaining = String(text || "");
  const visible = [];

  while (remaining.length) {
    if (state.noteType) {
      const closeToken = `\\${state.noteType}*`;
      const closeIndex = remaining.indexOf(closeToken);

      if (closeIndex === -1) {
        state.noteBuffer += (state.noteBuffer ? "\n" : "") + remaining;
        remaining = "";
        continue;
      }

      state.noteBuffer +=
        (state.noteBuffer ? "\n" : "") + remaining.slice(0, closeIndex);

      const noteRecord = {
        type: state.noteType,
        raw: normalizeWhitespace(state.noteBuffer),
      };

      if (state.noteType === "x" || state.noteType === "ex") {
        context.crossReferences.push(noteRecord);
      } else {
        context.footnotes.push(noteRecord);
      }

      remaining = remaining.slice(closeIndex + closeToken.length);
      state.noteType = "";
      state.noteBuffer = "";
      continue;
    }

    const openMatch = /\\(f|fe|ef|x|ex)\b\s*/i.exec(remaining);
    if (!openMatch) {
      const clean = stripInlineMarkers(remaining, context);
      if (clean) visible.push(clean);
      break;
    }

    const before = remaining.slice(0, openMatch.index);
    const cleanBefore = stripInlineMarkers(before, context);
    if (cleanBefore) visible.push(cleanBefore);

    state.noteType = openMatch[1].toLowerCase();
    state.noteBuffer = "";
    remaining = remaining.slice(openMatch.index + openMatch[0].length);
  }

  return normalizeWhitespace(visible.join(" "));
}

function markerAndBody(line) {
  const match = /^\\([+a-zA-Z0-9-]+)\*?\s*(.*)$/.exec(line);
  if (!match) return { marker: "", body: line };
  return { marker: match[1].toLowerCase(), body: match[2] || "" };
}

function parseUsfmFile(filePath, translationId) {
  const text = readText(filePath);
  const lines = text.split(/\r?\n/);

  let bookId = "";
  let chapter = 0;
  let currentVerse = null;
  let currentBookName = "";
  const titleCandidates = [];
  const verses = [];
  const headings = [];
  const structures = [];
  const markerCounts = {};
  const verseLabels = [];
  const noteState = { noteType: "", noteBuffer: "" };

  function countMarker(marker) {
    if (!marker) return;
    markerCounts[marker] = (markerCounts[marker] || 0) + 1;
  }

  function currentContext() {
    if (currentVerse) return currentVerse;
    return {
      footnotes: [],
      crossReferences: [],
      wordMetadata: [],
    };
  }

  function appendVerseText(textValue) {
    const clean = normalizeWhitespace(textValue);
    if (!currentVerse || !clean) return;
    currentVerse.textParts.push(clean);
  }

  function flushVerse() {
    if (!currentVerse) return;

    currentVerse.text = normalizeWhitespace(currentVerse.textParts.join(" "));
    delete currentVerse.textParts;
    currentVerse.wordCount = words(currentVerse.text).length;
    currentVerse.strongTagCount = currentVerse.wordMetadata.length;
    currentVerse.strongValues = Array.from(
      new Set(
        currentVerse.wordMetadata
          .flatMap((entry) =>
            String(entry.strong || "")
              .split(/\s+/)
              .map((value) => value.trim())
              .filter(Boolean),
          ),
      ),
    );

    verses.push(currentVerse);
    currentVerse = null;
  }

  for (let lineNumber = 1; lineNumber <= lines.length; lineNumber += 1) {
    const rawLine = lines[lineNumber - 1];
    const line = rawLine.replace(/^\uFEFF/, "");
    if (!line.trim()) continue;

    if (noteState.noteType) {
      const context = currentContext();
      const visible = consumeNotesAndVisible(line, noteState, context);
      appendVerseText(visible);
      continue;
    }

    const { marker, body } = markerAndBody(line);
    countMarker(marker);

    if (["f", "fe", "ef", "x", "ex"].includes(marker)) {
      const context = currentContext();
      const visible = consumeNotesAndVisible(
        `\\${marker} ${body}`,
        noteState,
        context,
      );
      appendVerseText(visible);
      continue;
    }

    if (!marker) {
      const context = currentContext();
      const visible = consumeNotesAndVisible(line, noteState, context);
      appendVerseText(visible);
      continue;
    }

    if (marker === "id") {
      const idMatch = /^([A-Z0-9]{3})\b/i.exec(body.trim());
      if (idMatch) bookId = idMatch[1].toUpperCase();
      continue;
    }

    if (BOOK_NAME_MARKERS.has(marker)) {
      const context = currentContext();
      const visible = consumeNotesAndVisible(body, noteState, context);
      if (visible) titleCandidates.push(visible);
      continue;
    }

    if (marker === "c") {
      flushVerse();
      const chapterMatch = /^(\d+)/.exec(body.trim());
      chapter = chapterMatch ? Number(chapterMatch[1]) : 0;
      continue;
    }

    if (marker === "v") {
      flushVerse();

      const verseMatch = /^([0-9]+(?:[-,][0-9]+)?[a-z]?)\s*(.*)$/i.exec(
        body.trim(),
      );

      if (!verseMatch) {
        verseLabels.push({
          sourceFile: relative(ROOT, filePath),
          chapter,
          label: body.trim(),
          issue: "unparsed-verse-label",
        });
        continue;
      }

      const verseLabel = verseMatch[1];
      const verseStartMatch = /^(\d+)/.exec(verseLabel);
      const verseNumber = verseStartMatch ? Number(verseStartMatch[1]) : null;
      const isBridge = /[-,]/.test(verseLabel);
      const isSubverse = /[a-z]$/i.test(verseLabel);

      currentVerse = {
        translation: translationId,
        sourceFile: relative(ROOT, filePath),
        lineNumber,
        bookId,
        sourceBookName: "",
        chapter,
        verseLabel,
        verse: verseNumber,
        isBridge,
        isSubverse,
        textParts: [],
        footnotes: [],
        crossReferences: [],
        wordMetadata: [],
        structureMarkers: [],
      };

      verseLabels.push({
        sourceFile: relative(ROOT, filePath),
        bookId,
        chapter,
        label: verseLabel,
        verse: verseNumber,
        isBridge,
        isSubverse,
        issue: isBridge
          ? "verse-bridge"
          : isSubverse
            ? "subverse"
            : "",
      });

      const visible = consumeNotesAndVisible(
        verseMatch[2],
        noteState,
        currentVerse,
      );
      appendVerseText(visible);
      continue;
    }

    if (HEADING_MARKERS.has(marker)) {
      const context = currentContext();
      const visible = consumeNotesAndVisible(body, noteState, context);
      headings.push({
        translation: translationId,
        sourceFile: relative(ROOT, filePath),
        lineNumber,
        bookId,
        chapter,
        beforeVerse: currentVerse ? currentVerse.verseLabel : "",
        marker,
        text: visible,
      });
      continue;
    }

    if (STRUCTURE_MARKERS.has(marker)) {
      const context = currentContext();
      const visible = consumeNotesAndVisible(body, noteState, context);
      const structureRecord = {
        translation: translationId,
        sourceFile: relative(ROOT, filePath),
        lineNumber,
        bookId,
        chapter,
        verse: currentVerse ? currentVerse.verseLabel : "",
        marker,
        trailingText: visible,
      };
      structures.push(structureRecord);
      if (currentVerse) currentVerse.structureMarkers.push(marker);
      appendVerseText(visible);
      continue;
    }

    if (NON_SCRIPTURE_MARKERS.has(marker)) {
      continue;
    }

    const context = currentContext();
    const visible = consumeNotesAndVisible(body, noteState, context);
    appendVerseText(visible);
  }

  flushVerse();

  currentBookName =
    titleCandidates.find((value) => value.length > 2) ||
    ID_TO_BOOK[bookId] ||
    bookId ||
    path.basename(filePath);

  const canonical = ID_TO_BOOK[bookId] || canonicalBookName(currentBookName, bookId);

  for (const verse of verses) {
    verse.sourceBookName = currentBookName;
    verse.book = canonical;
    verse.reference = `${canonical} ${verse.chapter}:${verse.verseLabel}`;
  }

  for (const heading of headings) {
    heading.sourceBookName = currentBookName;
    heading.book = canonical;
  }

  for (const structure of structures) {
    structure.sourceBookName = currentBookName;
    structure.book = canonical;
  }

  for (const label of verseLabels) {
    label.sourceBookName = currentBookName;
    label.book = canonical;
  }

  return {
    translation: translationId,
    sourceFile: relative(ROOT, filePath),
    bookId,
    sourceBookName: currentBookName,
    book: canonical,
    titles: titleCandidates,
    verses,
    headings,
    structures,
    markerCounts,
    verseLabels,
    danglingNote: noteState.noteType
      ? {
          type: noteState.noteType,
          raw: normalizeWhitespace(noteState.noteBuffer),
        }
      : null,
  };
}

function parseUsfmDirectory(directory, translationId, includedBookIds) {
  const files = walk(directory, (filePath) => /\.usfm$/i.test(filePath));
  if (!files.length) {
    fail(`No USFM files found for ${translationId}: ${directory}`);
  }

  const included = new Set(includedBookIds || []);
  if (!included.size) {
    fail(`No included book profile supplied for ${translationId}.`);
  }

  const documents = files.map((filePath) =>
    parseUsfmFile(filePath, translationId),
  );

  const includedDocuments = documents.filter((document) =>
    included.has(document.bookId),
  );
  const excludedDocuments = documents.filter(
    (document) => !included.has(document.bookId),
  );

  const foundCounts = new Map();
  for (const document of includedDocuments) {
    foundCounts.set(document.bookId, (foundCounts.get(document.bookId) || 0) + 1);
  }

  const missingBookIds = Array.from(included).filter(
    (bookId) => !foundCounts.has(bookId),
  );
  const duplicateBookIds = Array.from(foundCounts.entries())
    .filter(([, count]) => count !== 1)
    .map(([bookId, count]) => ({ bookId, count }));
  const emptyIncludedBooks = includedDocuments
    .filter((document) => !document.verses.length)
    .map((document) => document.bookId);

  if (missingBookIds.length || duplicateBookIds.length || emptyIncludedBooks.length) {
    fail(
      `${translationId} source profile validation failed: ${JSON.stringify({ missingBookIds, duplicateBookIds, emptyIncludedBooks }, null, 2)}`,
    );
  }

  const verses = includedDocuments.flatMap((document) => document.verses);
  const emptyVerses = verses.filter(
    (verse) => !verse.isBridge && !verse.isSubverse && verse.wordCount === 0,
  );

  return {
    directory,
    files,
    documents,
    scriptureDocuments: includedDocuments,
    excludedDocuments,
    verses,
    emptyVerses,
    headings: includedDocuments.flatMap((document) => document.headings),
    structures: includedDocuments.flatMap((document) => document.structures),
    verseLabels: includedDocuments.flatMap((document) => document.verseLabels),
    markerCounts: includedDocuments.reduce((aggregate, document) => {
      for (const [marker, count] of Object.entries(document.markerCounts)) {
        aggregate[marker] = (aggregate[marker] || 0) + count;
      }
      return aggregate;
    }, {}),
    danglingNotes: includedDocuments
      .filter((document) => document.danglingNote)
      .map((document) => ({
        sourceFile: document.sourceFile,
        ...document.danglingNote,
      })),
    profileValidation: {
      expectedBookIds: Array.from(included),
      foundBookIds: includedDocuments.map((document) => document.bookId).sort(),
      missingBookIds,
      duplicateBookIds,
      emptyIncludedBooks,
      passed: true,
    },
  };
}

function extractCurrentText(record) {
  if (!record || typeof record !== "object") return "";

  if (typeof record.text === "string") return record.text;

  const sources = Array.isArray(record.sources) ? record.sources : [];
  const english =
    sources.find((source) => source && source.language === "english") ||
    sources[0];

  return typeof english?.text === "string" ? english.text : "";
}

function loadCurrentTranslation(filePath, translationId, allowedBooks) {
  if (!fs.existsSync(filePath)) {
    fail(`Current translation file not found: ${relative(ROOT, filePath)}`);
  }

  const document = readJson(filePath);
  if (!Array.isArray(document)) {
    fail(`Current translation is not an array: ${relative(ROOT, filePath)}`);
  }

  const records = [];
  const excludedProfileRecords = [];
  const invalid = [];
  const duplicates = [];
  const seen = new Map();

  for (let index = 0; index < document.length; index += 1) {
    const item = document[index];
    const chapter = Number(item?.chapter);
    const verse = Number(item?.verse);
    const rawBook = String(item?.book || "").trim();
    const book = canonicalBookName(rawBook);
    const text = normalizeWhitespace(extractCurrentText(item));

    if (allowedBooks && allowedBooks.size && rawBook && !allowedBooks.has(book)) {
      excludedProfileRecords.push({
        index,
        id: item?.id || "",
        rawBook,
        book,
        chapter: item?.chapter ?? "",
        verse: item?.verse ?? "",
        reason: "outside-locked-production-profile",
      });
      continue;
    }

    if (!rawBook || !Number.isInteger(chapter) || !Number.isInteger(verse)) {
      invalid.push({
        index,
        id: item?.id || "",
        book: rawBook,
        chapter: item?.chapter ?? "",
        verse: item?.verse ?? "",
        reason: "invalid-book-chapter-or-verse",
      });
      continue;
    }

    const key = `${book}\u0000${chapter}\u0000${verse}`;

    const record = {
      translation: translationId,
      sourceFile: relative(ROOT, filePath),
      index,
      id: item?.id || "",
      rawBook,
      book,
      chapter,
      verse,
      reference: item?.reference || `${rawBook} ${chapter}:${verse}`,
      text,
      wordCount: words(text).length,
      key,
    };

    if (seen.has(key)) {
      duplicates.push({
        key,
        firstIndex: seen.get(key).index,
        duplicateIndex: index,
        firstReference: seen.get(key).reference,
        duplicateReference: record.reference,
      });
    } else {
      seen.set(key, record);
    }

    records.push(record);
  }

  return {
    filePath,
    fileSha256: sha256File(filePath),
    records,
    invalid,
    duplicates,
    excludedProfileRecords,
    byKey: seen,
    books: Array.from(new Set(records.map((record) => record.book))).sort(),
  };
}

function sourceKey(verse) {
  if (
    !verse ||
    !Number.isInteger(verse.chapter) ||
    !Number.isInteger(verse.verse) ||
    verse.isBridge ||
    verse.isSubverse
  ) {
    return "";
  }

  return `${verse.book}\u0000${verse.chapter}\u0000${verse.verse}`;
}

function sourceMap(parsed) {
  const byKey = new Map();
  const duplicates = [];

  for (const verse of parsed.verses) {
    const key = sourceKey(verse);
    if (!key || verse.wordCount === 0) continue;

    if (byKey.has(key)) {
      duplicates.push({
        key,
        firstReference: byKey.get(key).reference,
        duplicateReference: verse.reference,
        firstSourceFile: byKey.get(key).sourceFile,
        duplicateSourceFile: verse.sourceFile,
      });
    } else {
      byKey.set(key, verse);
    }
  }

  return { byKey, duplicates };
}

function buildChapterIndex(records) {
  const index = new Map();

  for (const record of records) {
    const key = `${record.book}\u0000${record.chapter}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(record);
  }

  for (const values of index.values()) {
    values.sort((a, b) => Number(a.verse) - Number(b.verse));
  }

  return index;
}

function bestShiftCandidate(sourceVerse, currentChapterIndex) {
  const candidates = [];

  for (const chapterDelta of [-1, 0, 1]) {
    const chapter = sourceVerse.chapter + chapterDelta;
    if (chapter < 1) continue;
    const chapterKey = `${sourceVerse.book}\u0000${chapter}`;
    for (const current of currentChapterIndex.get(chapterKey) || []) {
      const verseDistance =
        chapterDelta === 0
          ? Math.abs(Number(current.verse) - Number(sourceVerse.verse))
          : 100 + Math.abs(Number(current.verse) - Number(sourceVerse.verse));

      if (chapterDelta === 0 && verseDistance > 5) continue;
      if (chapterDelta !== 0) {
        const nearBoundary =
          current.verse <= 5 ||
          sourceVerse.verse <= 5 ||
          Math.abs(current.verse - sourceVerse.verse) <= 3;
        if (!nearBoundary) continue;
      }

      const score = similarity(words(sourceVerse.text), words(current.text));
      if (score >= 0.82) {
        candidates.push({
          current,
          score,
          verseDistance,
        });
      }
    }
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      a.verseDistance - b.verseDistance ||
      a.current.verse - b.current.verse,
  );

  return candidates[0] || null;
}

function classifyPair(sourceVerse, currentVerse) {
  const sourceText = normalizeTypography(sourceVerse.text);
  const currentText = normalizeTypography(currentVerse.text);
  const sourceWords = words(sourceText);
  const currentWords = words(currentText);

  if (!sourceText && !currentText) {
    return {
      classification: "both-empty",
      severity: "critical",
      similarity: 1,
      confirmedMissingWords: 0,
    };
  }

  if (!sourceText) {
    return {
      classification: "empty-source-text",
      severity: "critical",
      similarity: 0,
      confirmedMissingWords: 0,
    };
  }

  if (!currentText) {
    return {
      classification: "empty-current-text",
      severity: "critical",
      similarity: 0,
      confirmedMissingWords: sourceWords.length,
    };
  }

  if (sourceText === currentText) {
    return {
      classification: "exact",
      severity: "none",
      similarity: 1,
      confirmedMissingWords: 0,
    };
  }

  if (sameWords(sourceWords, currentWords)) {
    return {
      classification: "typography-or-punctuation-only",
      severity: "review",
      similarity: 1,
      confirmedMissingWords: 0,
    };
  }

  const score = similarity(sourceWords, currentWords);
  const currentInSource = isSubsequence(currentWords, sourceWords);
  const sourceInCurrent = isSubsequence(sourceWords, currentWords);

  if (
    currentWords.length < sourceWords.length &&
    currentInSource &&
    currentWords.length / Math.max(1, sourceWords.length) >= 0.2
  ) {
    return {
      classification: "shortened-current-text",
      severity: "critical",
      similarity: score,
      confirmedMissingWords: sourceWords.length - currentWords.length,
    };
  }

  if (
    sourceWords.length < currentWords.length &&
    sourceInCurrent &&
    sourceWords.length / Math.max(1, currentWords.length) >= 0.2
  ) {
    return {
      classification: "extra-or-contaminated-current-text",
      severity: "high",
      similarity: score,
      confirmedMissingWords: 0,
    };
  }

  if (score >= 0.9 && sourceWords.length > currentWords.length) {
    return {
      classification: "probable-shortening-or-omission",
      severity: "critical",
      similarity: score,
      confirmedMissingWords: Math.max(0, sourceWords.length - currentWords.length),
    };
  }

  if (score >= 0.9 && currentWords.length > sourceWords.length) {
    return {
      classification: "probable-extra-or-contamination",
      severity: "high",
      similarity: score,
      confirmedMissingWords: 0,
    };
  }

  return {
    classification: "substantive-text-difference",
    severity: score >= 0.65 ? "high" : "critical",
    similarity: score,
    confirmedMissingWords: 0,
  };
}

function compareTranslation(translation, current, source) {
  const mappedSource = sourceMap(source);
  const currentChapterIndex = buildChapterIndex(current.records);

  const allKeys = Array.from(
    new Set([...current.byKey.keys(), ...mappedSource.byKey.keys()]),
  ).sort();

  const rows = [];
  const shiftRows = [];

  for (const key of allKeys) {
    const sourceVerse = mappedSource.byKey.get(key) || null;
    const currentVerse = current.byKey.get(key) || null;

    if (!sourceVerse) {
      rows.push({
        translation,
        severity: "high",
        classification: "extra-current-verse",
        sourceReference: "",
        currentReference: currentVerse.reference,
        sourceBook: "",
        currentBook: currentVerse.book,
        sourceChapter: "",
        currentChapter: currentVerse.chapter,
        sourceVerse: "",
        currentVerse: currentVerse.verse,
        sourceWordCount: 0,
        currentWordCount: currentVerse.wordCount,
        confirmedMissingWords: 0,
        similarity: 0,
        likelyShiftTarget: "",
        sourceText: "",
        currentText: currentVerse.text,
        sourceFile: "",
        currentFile: currentVerse.sourceFile,
      });
      continue;
    }

    if (!currentVerse) {
      const shift = bestShiftCandidate(sourceVerse, currentChapterIndex);
      const likelyShift =
        shift && shift.score >= 0.9
          ? `${shift.current.book} ${shift.current.chapter}:${shift.current.verse}`
          : "";

      const classification = likelyShift
        ? "missing-current-verse-probable-shift"
        : "missing-current-verse";

      const row = {
        translation,
        severity: "critical",
        classification,
        sourceReference: sourceVerse.reference,
        currentReference: "",
        sourceBook: sourceVerse.book,
        currentBook: "",
        sourceChapter: sourceVerse.chapter,
        currentChapter: "",
        sourceVerse: sourceVerse.verseLabel,
        currentVerse: "",
        sourceWordCount: sourceVerse.wordCount,
        currentWordCount: 0,
        confirmedMissingWords: sourceVerse.wordCount,
        similarity: shift ? Number(shift.score.toFixed(6)) : 0,
        likelyShiftTarget: likelyShift,
        sourceText: sourceVerse.text,
        currentText: "",
        sourceFile: sourceVerse.sourceFile,
        currentFile: "",
      };
      rows.push(row);

      if (likelyShift) {
        shiftRows.push({
          translation,
          sourceReference: sourceVerse.reference,
          likelyCurrentReference: likelyShift,
          verseOffset:
            sourceVerse.chapter === shift.current.chapter
              ? shift.current.verse - sourceVerse.verse
              : "",
          chapterOffset: shift.current.chapter - sourceVerse.chapter,
          similarity: Number(shift.score.toFixed(6)),
          sourceText: sourceVerse.text,
          currentText: shift.current.text,
        });
      }

      continue;
    }

    const comparison = classifyPair(sourceVerse, currentVerse);

    let likelyShiftTarget = "";
    if (
      comparison.classification === "substantive-text-difference" ||
      comparison.classification === "empty-current-text"
    ) {
      const shift = bestShiftCandidate(sourceVerse, currentChapterIndex);
      if (
        shift &&
        shift.score >= 0.9 &&
        !(
          shift.current.chapter === currentVerse.chapter &&
          shift.current.verse === currentVerse.verse
        )
      ) {
        likelyShiftTarget = `${shift.current.book} ${shift.current.chapter}:${shift.current.verse}`;
        shiftRows.push({
          translation,
          sourceReference: sourceVerse.reference,
          likelyCurrentReference: likelyShiftTarget,
          verseOffset:
            sourceVerse.chapter === shift.current.chapter
              ? shift.current.verse - sourceVerse.verse
              : "",
          chapterOffset: shift.current.chapter - sourceVerse.chapter,
          similarity: Number(shift.score.toFixed(6)),
          sourceText: sourceVerse.text,
          currentText: shift.current.text,
        });
      }
    }

    const classification = likelyShiftTarget
      ? "probable-verse-shift"
      : comparison.classification;

    const severity = likelyShiftTarget ? "critical" : comparison.severity;

    rows.push({
      translation,
      severity,
      classification,
      sourceReference: sourceVerse.reference,
      currentReference: currentVerse.reference,
      sourceBook: sourceVerse.book,
      currentBook: currentVerse.book,
      sourceChapter: sourceVerse.chapter,
      currentChapter: currentVerse.chapter,
      sourceVerse: sourceVerse.verseLabel,
      currentVerse: currentVerse.verse,
      sourceWordCount: sourceVerse.wordCount,
      currentWordCount: currentVerse.wordCount,
      confirmedMissingWords: comparison.confirmedMissingWords,
      similarity: Number(comparison.similarity.toFixed(6)),
      likelyShiftTarget,
      sourceText: sourceVerse.text,
      currentText: currentVerse.text,
      sourceFile: sourceVerse.sourceFile,
      currentFile: currentVerse.sourceFile,
    });
  }

  const differences = rows.filter(
    (row) =>
      row.classification !== "exact" &&
      row.classification !== "typography-or-punctuation-only",
  );

  const reviewOnly = rows.filter(
    (row) => row.classification === "typography-or-punctuation-only",
  );

  const counts = {};
  const severityCounts = {};
  for (const row of rows) {
    counts[row.classification] = (counts[row.classification] || 0) + 1;
    severityCounts[row.severity] = (severityCounts[row.severity] || 0) + 1;
  }

  const sourceBooks = Array.from(
    new Set(source.verses.map((verse) => verse.book)),
  ).sort();
  const currentBooks = current.books;

  const sourceOnlyBooks = sourceBooks.filter(
    (book) => !currentBooks.includes(book),
  );
  const currentOnlyBooks = currentBooks.filter(
    (book) => !sourceBooks.includes(book),
  );

  const structureByMarker = {};
  for (const structure of source.structures) {
    structureByMarker[structure.marker] =
      (structureByMarker[structure.marker] || 0) + 1;
  }

  const footnotes = source.verses.flatMap((verse) =>
    verse.footnotes.map((note, noteIndex) => ({
      translation,
      reference: verse.reference,
      sourceFile: verse.sourceFile,
      noteIndex,
      marker: note.type,
      text: note.raw,
    })),
  );

  const crossReferences = source.verses.flatMap((verse) =>
    verse.crossReferences.map((note, noteIndex) => ({
      translation,
      reference: verse.reference,
      sourceFile: verse.sourceFile,
      noteIndex,
      marker: note.type,
      text: note.raw,
    })),
  );

  const strongByVerse = source.verses
    .filter((verse) => verse.strongTagCount > 0)
    .map((verse) => ({
      translation,
      reference: verse.reference,
      sourceFile: verse.sourceFile,
      strongTagCount: verse.strongTagCount,
      uniqueStrongValueCount: verse.strongValues.length,
      strongValuesSample: verse.strongValues.slice(0, 20).join(" "),
    }));

  const verseInventory = source.verses.map((verse) => ({
    translation,
    bookId: verse.bookId,
    sourceBookName: verse.sourceBookName,
    book: verse.book,
    chapter: verse.chapter,
    verseLabel: verse.verseLabel,
    verse: verse.verse,
    reference: verse.reference,
    isBridge: verse.isBridge,
    isSubverse: verse.isSubverse,
    visibleWordCount: verse.wordCount,
    footnoteCount: verse.footnotes.length,
    crossReferenceCount: verse.crossReferences.length,
    strongTagCount: verse.strongTagCount,
    structureMarkers: verse.structureMarkers.join(" "),
    sourceFile: verse.sourceFile,
  }));

  const confirmedMissingWords = differences.reduce(
    (sum, row) => sum + Number(row.confirmedMissingWords || 0),
    0,
  );

  const netSourceWordDeficit = rows.reduce(
    (sum, row) =>
      sum +
      Math.max(
        0,
        Number(row.sourceWordCount || 0) - Number(row.currentWordCount || 0),
      ),
    0,
  );

  const summary = {
    translation,
    current: {
      file: relative(ROOT, current.filePath),
      sha256: current.fileSha256,
      records: current.records.length,
      books: currentBooks.length,
      invalidRecords: current.invalid.length,
      duplicateVerseKeys: current.duplicates.length,
      excludedProfileRecords: current.excludedProfileRecords?.length || 0,
    },
    source: {
      directory: relative(ROOT, source.directory),
      usfmFiles: source.files.length,
      scriptureBooks: source.scriptureDocuments.length,
      versesIncludingBridgesAndSubverses: source.verses.length,
      simpleNumericVerses: mappedSource.byKey.size,
      headings: source.headings.length,
      structureEvents: source.structures.length,
      footnotes: footnotes.length,
      crossReferences: crossReferences.length,
      versesWithStrongMetadata: strongByVerse.length,
      strongTags: source.verses.reduce(
        (sum, verse) => sum + verse.strongTagCount,
        0,
      ),
      verseBridges: source.verseLabels.filter((row) => row.isBridge).length,
      subverses: source.verseLabels.filter((row) => row.isSubverse).length,
      duplicateVerseKeys: mappedSource.duplicates.length,
      danglingNotes: source.danglingNotes.length,
      emptySimpleVerseLabels: source.emptyVerses?.length || 0,
      excludedRawDocuments: source.excludedDocuments?.length || 0,
      profileValidation: source.profileValidation || null,
    },
    bookInventory: {
      sourceBooks,
      currentBooks,
      sourceOnlyBooks,
      currentOnlyBooks,
    },
    comparison: {
      comparedOrInventoriedVerseKeys: rows.length,
      exact: counts.exact || 0,
      typographyOrPunctuationOnly:
        counts["typography-or-punctuation-only"] || 0,
      substantiveDifferences: differences.length,
      probableVerseShifts:
        (counts["probable-verse-shift"] || 0) +
        (counts["missing-current-verse-probable-shift"] || 0),
      confirmedMissingWordOccurrences: confirmedMissingWords,
      netSourceWordDeficit,
      classificationCounts: counts,
      severityCounts,
    },
    metadataMarkerCounts: source.markerCounts,
    structureMarkerCounts: structureByMarker,
  };

  return {
    summary,
    rows,
    differences,
    reviewOnly,
    shiftRows,
    verseInventory,
    headings: source.headings,
    structures: source.structures,
    footnotes,
    crossReferences,
    strongByVerse,
    verseLabels: source.verseLabels,
    currentInvalid: current.invalid,
    currentDuplicates: current.duplicates,
    sourceDuplicates: mappedSource.duplicates,
    danglingNotes: source.danglingNotes,
  };
}

function writeTranslationReport(outputRoot, result) {
  const id = result.summary.translation;
  const summaryRoot = path.join(outputRoot, "summaries");
  const discrepancyRoot = path.join(outputRoot, "discrepancies");
  const structureRoot = path.join(outputRoot, "structure");
  const versificationRoot = path.join(outputRoot, "versification");
  const inputRoot = path.join(outputRoot, "inputs");

  writeJson(path.join(summaryRoot, `${id}-summary.json`), result.summary);

  const diffColumns = [
    "translation",
    "severity",
    "classification",
    "sourceReference",
    "currentReference",
    "sourceBook",
    "currentBook",
    "sourceChapter",
    "currentChapter",
    "sourceVerse",
    "currentVerse",
    "sourceWordCount",
    "currentWordCount",
    "confirmedMissingWords",
    "similarity",
    "likelyShiftTarget",
    "sourceText",
    "currentText",
    "sourceFile",
    "currentFile",
  ];

  writeCsv(
    path.join(discrepancyRoot, `${id}-verse-differences.csv`),
    result.differences,
    diffColumns,
  );

  writeCsv(
    path.join(discrepancyRoot, `${id}-normalization-only.csv`),
    result.reviewOnly,
    diffColumns,
  );

  writeCsv(
    path.join(versificationRoot, `${id}-probable-verse-shifts.csv`),
    result.shiftRows,
    [
      "translation",
      "sourceReference",
      "likelyCurrentReference",
      "verseOffset",
      "chapterOffset",
      "similarity",
      "sourceText",
      "currentText",
    ],
  );

  writeCsv(
    path.join(versificationRoot, `${id}-source-verse-labels.csv`),
    result.verseLabels,
    [
      "sourceFile",
      "bookId",
      "sourceBookName",
      "book",
      "chapter",
      "label",
      "verse",
      "isBridge",
      "isSubverse",
      "issue",
    ],
  );

  writeCsv(
    path.join(inputRoot, `${id}-source-verse-inventory.csv`),
    result.verseInventory,
    [
      "translation",
      "bookId",
      "sourceBookName",
      "book",
      "chapter",
      "verseLabel",
      "verse",
      "reference",
      "isBridge",
      "isSubverse",
      "visibleWordCount",
      "footnoteCount",
      "crossReferenceCount",
      "strongTagCount",
      "structureMarkers",
      "sourceFile",
    ],
  );

  writeCsv(
    path.join(structureRoot, `${id}-headings-and-superscriptions.csv`),
    result.headings,
    [
      "translation",
      "sourceFile",
      "lineNumber",
      "bookId",
      "sourceBookName",
      "book",
      "chapter",
      "beforeVerse",
      "marker",
      "text",
    ],
  );

  writeCsv(
    path.join(structureRoot, `${id}-paragraph-and-poetry-events.csv`),
    result.structures,
    [
      "translation",
      "sourceFile",
      "lineNumber",
      "bookId",
      "sourceBookName",
      "book",
      "chapter",
      "verse",
      "marker",
      "trailingText",
    ],
  );

  writeCsv(
    path.join(structureRoot, `${id}-footnotes.csv`),
    result.footnotes,
    [
      "translation",
      "reference",
      "sourceFile",
      "noteIndex",
      "marker",
      "text",
    ],
  );

  writeCsv(
    path.join(structureRoot, `${id}-cross-references.csv`),
    result.crossReferences,
    [
      "translation",
      "reference",
      "sourceFile",
      "noteIndex",
      "marker",
      "text",
    ],
  );

  writeCsv(
    path.join(structureRoot, `${id}-strongs-by-verse.csv`),
    result.strongByVerse,
    [
      "translation",
      "reference",
      "sourceFile",
      "strongTagCount",
      "uniqueStrongValueCount",
      "strongValuesSample",
    ],
  );

  writeCsv(
    path.join(discrepancyRoot, `${id}-current-invalid-records.csv`),
    result.currentInvalid,
    ["index", "id", "book", "chapter", "verse", "reason"],
  );

  writeCsv(
    path.join(discrepancyRoot, `${id}-current-duplicate-verses.csv`),
    result.currentDuplicates,
    [
      "key",
      "firstIndex",
      "duplicateIndex",
      "firstReference",
      "duplicateReference",
    ],
  );

  writeCsv(
    path.join(discrepancyRoot, `${id}-source-duplicate-verses.csv`),
    result.sourceDuplicates,
    [
      "key",
      "firstReference",
      "duplicateReference",
      "firstSourceFile",
      "duplicateSourceFile",
    ],
  );

  writeCsv(
    path.join(discrepancyRoot, `${id}-dangling-note-blocks.csv`),
    result.danglingNotes,
    ["sourceFile", "type", "raw"],
  );
}

function writeProfileDiagnostics(outputRoot, translationId, current, source) {
  const profileRoot = path.join(outputRoot, "profiles");
  const discrepancyRoot = path.join(outputRoot, "discrepancies");

  writeJson(path.join(profileRoot, `${translationId}-profile-validation.json`), {
    translation: translationId,
    validation: source.profileValidation,
    includedDocuments: source.scriptureDocuments.map((document) => ({
      bookId: document.bookId,
      book: document.book,
      sourceBookName: document.sourceBookName,
      sourceFile: document.sourceFile,
      verseRecords: document.verses.length,
    })),
    excludedRawDocuments: source.excludedDocuments.map((document) => ({
      bookId: document.bookId,
      book: document.book,
      sourceBookName: document.sourceBookName,
      sourceFile: document.sourceFile,
      verseRecords: document.verses.length,
    })),
  });

  writeCsv(
    path.join(profileRoot, `${translationId}-excluded-raw-documents.csv`),
    source.excludedDocuments.map((document) => ({
      translation: translationId,
      bookId: document.bookId,
      sourceBookName: document.sourceBookName,
      canonicalBook: document.book,
      sourceFile: document.sourceFile,
      verseRecords: document.verses.length,
    })),
    [
      "translation",
      "bookId",
      "sourceBookName",
      "canonicalBook",
      "sourceFile",
      "verseRecords",
    ],
  );

  writeCsv(
    path.join(profileRoot, `${translationId}-empty-source-verse-labels.csv`),
    source.emptyVerses.map((verse) => ({
      translation: translationId,
      bookId: verse.bookId,
      book: verse.book,
      chapter: verse.chapter,
      verseLabel: verse.verseLabel,
      reference: verse.reference,
      sourceFile: verse.sourceFile,
    })),
    [
      "translation",
      "bookId",
      "book",
      "chapter",
      "verseLabel",
      "reference",
      "sourceFile",
    ],
  );

  writeCsv(
    path.join(discrepancyRoot, `${translationId}-current-outside-profile.csv`),
    current.excludedProfileRecords || [],
    ["index", "id", "rawBook", "book", "chapter", "verse", "reason"],
  );
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseXmlAttributes(value) {
  const attributes = {};
  const regex = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = regex.exec(String(value || "")))) {
    attributes[match[1]] = match[2] ?? match[3] ?? "";
  }
  return attributes;
}

const OSIS_BOOK_TO_ID = {
  Gen: "GEN", Exod: "EXO", Lev: "LEV", Num: "NUM", Deut: "DEU",
  Josh: "JOS", Judg: "JDG", Ruth: "RUT", "1Sam": "1SA", "2Sam": "2SA",
  "1Kgs": "1KI", "2Kgs": "2KI", "1Chr": "1CH", "2Chr": "2CH",
  Ezra: "EZR", Neh: "NEH", Esth: "EST", Job: "JOB", Ps: "PSA",
  Prov: "PRO", Eccl: "ECC", Song: "SNG", Isa: "ISA", Jer: "JER",
  Lam: "LAM", Ezek: "EZK", Dan: "DAN", Hos: "HOS", Joel: "JOL",
  Amos: "AMO", Obad: "OBA", Jonah: "JON", Mic: "MIC", Nah: "NAM",
  Hab: "HAB", Zeph: "ZEP", Hag: "HAG", Zech: "ZEC", Mal: "MAL",
  Matt: "MAT", Mark: "MRK", Luke: "LUK", John: "JHN", Acts: "ACT",
  Rom: "ROM", "1Cor": "1CO", "2Cor": "2CO", Gal: "GAL", Eph: "EPH",
  Phil: "PHP", Col: "COL", "1Thess": "1TH", "2Thess": "2TH",
  "1Tim": "1TI", "2Tim": "2TI", Titus: "TIT", Phlm: "PHM",
  Heb: "HEB", Jas: "JAS", "1Pet": "1PE", "2Pet": "2PE",
  "1John": "1JN", "2John": "2JN", "3John": "3JN", Jude: "JUD", Rev: "REV",
};

function cleanOsisVisibleText(segment) {
  let value = String(segment || "");
  value = value.replace(/<!--[^]*?-->/g, " ");
  value = value.replace(/<note\b[^>]*>[^]*?<\/note>/gi, " ");
  value = value.replace(/<title\b[^>]*>[^]*?<\/title>/gi, " ");
  value = value.replace(/<reference\b[^>]*>[^]*?<\/reference>/gi, " ");
  value = value.replace(/<(?:lb|milestone)\b[^>]*\/?\s*>/gi, " ");
  value = value.replace(/<[^>]+>/g, " ");
  return normalizeWhitespace(decodeXmlEntities(value));
}

function parseOsisReference(osisId) {
  const first = String(osisId || "").trim().split(/\s+/)[0];
  const match = /^([^.]+)\.(\d+)\.(\d+)/.exec(first);
  if (!match) return null;
  const bookId = OSIS_BOOK_TO_ID[match[1]];
  if (!bookId) return null;
  return {
    osisBook: match[1],
    bookId,
    book: ID_TO_BOOK[bookId],
    chapter: Number(match[2]),
    verse: Number(match[3]),
    osisId: first,
  };
}

function parseCrosswireOsis(filePath, expectedBookIds) {
  const xml = readText(filePath);
  const verseTag = /<verse\b([^>]*)>/gi;
  const records = [];
  const duplicates = [];
  const seen = new Map();
  let match;

  while ((match = verseTag.exec(xml))) {
    const attrs = parseXmlAttributes(match[1]);
    if (attrs.eID) continue;
    const osisId = attrs.sID || attrs.osisID;
    if (!osisId) continue;
    const ref = parseOsisReference(osisId);
    if (!ref || !expectedBookIds.has(ref.bookId)) continue;

    let segment = "";
    if (attrs.sID) {
      const escaped = String(attrs.sID).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const endRegex = new RegExp(`<verse\\b[^>]*\\beID=(?:"${escaped}"|'${escaped}')[^>]*\\/?\\s*>`, "i");
      const tail = xml.slice(verseTag.lastIndex);
      const endMatch = endRegex.exec(tail);
      if (!endMatch) {
        fail(`CrossWire OSIS verse has no matching eID: ${attrs.sID}`);
      }
      segment = tail.slice(0, endMatch.index);
    } else {
      const closeIndex = xml.indexOf("</verse>", verseTag.lastIndex);
      if (closeIndex < 0) {
        fail(`CrossWire OSIS container verse has no closing tag: ${osisId}`);
      }
      segment = xml.slice(verseTag.lastIndex, closeIndex);
    }

    const visible = cleanOsisVisibleText(segment);
    const key = `${ref.book}\u0000${ref.chapter}\u0000${ref.verse}`;
    const record = {
      translation: "crosswire-kjv",
      sourceFile: relative(ROOT, filePath),
      id: ref.osisId,
      rawBook: ref.book,
      bookId: ref.bookId,
      book: ref.book,
      chapter: ref.chapter,
      verse: ref.verse,
      verseLabel: String(ref.verse),
      reference: `${ref.book} ${ref.chapter}:${ref.verse}`,
      text: visible,
      wordCount: words(visible).length,
      key,
    };

    if (seen.has(key)) {
      duplicates.push({
        key,
        firstReference: seen.get(key).reference,
        duplicateReference: record.reference,
      });
    } else {
      seen.set(key, record);
      records.push(record);
    }
  }

  const foundBookIds = Array.from(new Set(records.map((record) => record.bookId))).sort();
  const missingBookIds = Array.from(expectedBookIds).filter(
    (bookId) => !foundBookIds.includes(bookId),
  );
  if (missingBookIds.length || duplicates.length) {
    fail(`CrossWire OSIS validation failed: ${JSON.stringify({ missingBookIds, duplicates: duplicates.slice(0, 20) }, null, 2)}`);
  }

  return {
    filePath,
    fileSha256: sha256File(filePath),
    records,
    invalid: [],
    duplicates,
    excludedProfileRecords: [],
    byKey: seen,
    books: Array.from(new Set(records.map((record) => record.book))).sort(),
    bookIds: foundBookIds,
  };
}

function findVerse(result, book, chapter, verse) {
  return result.rows.find(
    (row) =>
      canonicalBookName(row.sourceBook || row.currentBook) ===
        canonicalBookName(book) &&
      Number(row.sourceChapter || row.currentChapter) === Number(chapter) &&
      Number(row.sourceVerse || row.currentVerse) === Number(verse),
  );
}

function makePsalm4Report(results) {
  const lines = [
    "# Psalm 4 Census Comparison",
    "",
    "This is a diagnostic view only. No verse-number repair has been applied.",
    "",
  ];

  for (const result of results) {
    const id = result.summary.translation;
    lines.push(`## ${id.toUpperCase()}`, "");
    lines.push(
      "| Source | Current | Classification | Likely shift | Source text | Current text |",
    );
    lines.push("|---:|---:|---|---|---|---|");

    const psalmRows = result.rows.filter(
      (row) =>
        canonicalBookName(row.sourceBook || row.currentBook) === "Psalms" &&
        Number(row.sourceChapter || row.currentChapter) === 4,
    );

    for (const row of psalmRows) {
      lines.push(
        `| ${row.sourceVerse || ""} | ${row.currentVerse || ""} | ${row.classification} | ${row.likelyShiftTarget || ""} | ${String(row.sourceText || "").replace(/\|/g, "\\|")} | ${String(row.currentText || "").replace(/\|/g, "\\|")} |`,
      );
    }

    lines.push("");
  }

  return lines.join("\n") + "\n";
}

function topDifferencesMarkdown(results) {
  const lines = [
    "# Highest-Severity Translation Differences",
    "",
    "Rows are sorted by severity, confirmed missing words, and source word deficit.",
    "",
  ];

  const all = results.flatMap((result) => result.differences);
  const severityRank = { critical: 0, high: 1, review: 2, none: 3 };

  all.sort(
    (a, b) =>
      (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) ||
      Number(b.confirmedMissingWords || 0) -
        Number(a.confirmedMissingWords || 0) ||
      Number(b.sourceWordCount || 0) -
        Number(b.currentWordCount || 0) -
        (Number(a.sourceWordCount || 0) -
          Number(a.currentWordCount || 0)),
  );

  for (const row of all.slice(0, 100)) {
    lines.push(
      `## ${row.translation.toUpperCase()} — ${row.sourceReference || row.currentReference}`,
      "",
      `- Classification: ${row.classification}`,
      `- Severity: ${row.severity}`,
      `- Source words: ${row.sourceWordCount}`,
      `- Current words: ${row.currentWordCount}`,
      `- Confirmed missing: ${row.confirmedMissingWords}`,
      row.likelyShiftTarget
        ? `- Likely shift target: ${row.likelyShiftTarget}`
        : "",
      "",
      `**Source:** ${row.sourceText || "—"}`,
      "",
      `**Current:** ${row.currentText || "—"}`,
      "",
    );
  }

  return lines.filter((line) => line !== "").join("\n") + "\n";
}

function writeChecksums(outputRoot) {
  const checksumPath = path.join(outputRoot, "checksums.sha256");
  const files = walk(
    outputRoot,
    (filePath) => filePath !== checksumPath && fs.statSync(filePath).isFile(),
  );

  const lines = files.map(
    (filePath) => `${sha256File(filePath)}  ${relative(outputRoot, filePath)}`,
  );

  fs.writeFileSync(checksumPath, lines.join("\n") + "\n", "ascii");
}


function findLatestCertifiedCensus() {
  const reportRoot = path.join(ROOT, ".private", "reports", "P05.12");
  const candidates = walk(
    reportRoot,
    (filePath) => path.basename(filePath) === "overall-summary.json",
  ).filter((filePath) => {
    try {
      return readJson(filePath)?.milestone === "P05.12D";
    } catch {
      return false;
    }
  });

  if (!candidates.length) {
    fail(
      `No completed P05.12D overall-summary.json found under ${relative(ROOT, reportRoot)}`,
    );
  }

  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0];
}

function computeTreeSha256(directory) {
  const files = walk(directory, (filePath) => fs.statSync(filePath).isFile());
  const lines = files.map((filePath) => {
    const rel = relative(directory, filePath);
    const size = fs.statSync(filePath).size;
    return `${rel}\t${size}\t${sha256File(filePath)}`;
  });
  return sha256Text(lines.join("\n"));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function replaceEnglishText(record, visibleText) {
  const clone = cloneJson(record);

  if (typeof clone.text === "string") {
    clone.text = visibleText;
    return clone;
  }

  if (!Array.isArray(clone.sources) || !clone.sources.length) {
    fail(
      `KJV reader record ${clone.reference || clone.id || "(unknown)"} has neither text nor sources.`,
    );
  }

  let index = clone.sources.findIndex(
    (source) =>
      source &&
      String(source.language || "").toLowerCase() === "english",
  );

  if (index < 0 && clone.sources.length === 1) index = 0;
  if (index < 0) {
    fail(
      `KJV reader record ${clone.reference || clone.id || "(unknown)"} has no unambiguous English source.`,
    );
  }

  clone.sources[index].text = visibleText;
  return clone;
}

function stableJsonText(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function writeNdjson(filePath, rows) {
  ensureDir(path.dirname(filePath));
  const text = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
  fs.writeFileSync(filePath, text, "utf8");
  return {
    path: filePath,
    sha256: sha256Text(text),
    bytes: Buffer.byteLength(text, "utf8"),
    records: rows.length,
  };
}

function lexicalSignature(value) {
  return String(value || "")
    .replace(/Æ/g, "Ae")
    .replace(/æ/g, "ae")
    .replace(/Œ/g, "Oe")
    .replace(/œ/g, "oe")
    .replace(/ſ/g, "s")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function textRelation(leftText, rightText) {
  const left = normalizeTypography(leftText);
  const right = normalizeTypography(rightText);

  if (left === right) {
    return {
      level: "exact-normalized-text",
      equivalent: true,
      similarity: 1,
    };
  }

  const leftWords = words(left);
  const rightWords = words(right);

  if (sameWords(leftWords, rightWords)) {
    return {
      level: "same-word-sequence",
      equivalent: true,
      similarity: 1,
    };
  }

  if (
    lexicalSignature(left) &&
    lexicalSignature(left) === lexicalSignature(right)
  ) {
    return {
      level: "lexically-equivalent-boundary-or-orthography",
      equivalent: true,
      similarity: 1,
    };
  }

  return {
    level: "substantive",
    equivalent: false,
    similarity: Number(similarity(leftWords, rightWords).toFixed(6)),
  };
}

function sourceSimpleVerses(source, bookOrder) {
  return source.verses
    .filter(
      (verse) =>
        !verse.isBridge &&
        !verse.isSubverse &&
        Number.isInteger(verse.chapter) &&
        Number.isInteger(verse.verse) &&
        verse.wordCount > 0,
    )
    .sort(
      (a, b) =>
        (bookOrder.get(a.bookId) ?? 999) -
          (bookOrder.get(b.bookId) ?? 999) ||
        a.chapter - b.chapter ||
        a.verse - b.verse ||
        a.lineNumber - b.lineNumber,
    );
}

function buildKjvArtifacts({
  profile,
  currentDocument,
  current,
  source,
  crosswire,
}) {
  const bookOrder = new Map(
    (profile.includedBookIds || []).map((bookId, index) => [bookId, index]),
  );
  const verses = sourceSimpleVerses(source, bookOrder);
  const currentRawByKey = new Map();
  const sourceByKey = new Map();

  for (const record of current.records) {
    if (currentRawByKey.has(record.key)) {
      fail(`Duplicate current KJV verse key: ${record.key}`);
    }
    currentRawByKey.set(record.key, currentDocument[record.index]);
  }

  for (const verse of verses) {
    const key = sourceKey(verse);
    if (!key) fail(`Unable to create source key for ${verse.reference}`);
    if (sourceByKey.has(key)) fail(`Duplicate KJV source key: ${key}`);
    sourceByKey.set(key, verse);
  }

  if (
    sourceByKey.size !== currentRawByKey.size ||
    sourceByKey.size !== crosswire.byKey.size
  ) {
    fail(
      `KJV three-way verse inventory mismatch: ${JSON.stringify({
        source: sourceByKey.size,
        current: currentRawByKey.size,
        crosswire: crosswire.byKey.size,
      })}`,
    );
  }

  const visibleRows = [];
  const versificationRows = [];
  const footnoteRows = [];
  const crossReferenceRows = [];
  const strongRows = [];
  const candidateByKey = new Map();
  const currentToSourceRows = [];
  const threeWayRows = [];

  for (const verse of verses) {
    const key = sourceKey(verse);
    const currentRecord = current.byKey.get(key);
    const rawRecord = currentRawByKey.get(key);
    const crosswireRecord = crosswire.byKey.get(key);

    if (!currentRecord || !rawRecord || !crosswireRecord) {
      fail(`KJV three-way record missing for ${verse.reference}`);
    }

    const candidateRecord = replaceEnglishText(rawRecord, verse.text);
    candidateByKey.set(key, candidateRecord);

    const currentSource = textRelation(currentRecord.text, verse.text);
    const sourceCrosswire = textRelation(verse.text, crosswireRecord.text);
    const currentCrosswire = textRelation(
      currentRecord.text,
      crosswireRecord.text,
    );

    let category;
    if (
      currentSource.equivalent &&
      sourceCrosswire.equivalent &&
      currentCrosswire.equivalent
    ) {
      const allExact =
        currentSource.level === "exact-normalized-text" &&
        sourceCrosswire.level === "exact-normalized-text" &&
        currentCrosswire.level === "exact-normalized-text";
      category = allExact
        ? "all-three-exact"
        : "all-three-lexically-equivalent";
    } else if (
      sourceCrosswire.equivalent &&
      !currentSource.equivalent &&
      !currentCrosswire.equivalent
    ) {
      category = "two-authoritative-sources-agree-current-differs";
    } else if (
      currentSource.equivalent &&
      !sourceCrosswire.equivalent
    ) {
      category = "current-agrees-kjv2006-crosswire-edition-variant";
    } else if (
      currentCrosswire.equivalent &&
      !sourceCrosswire.equivalent
    ) {
      category = "current-agrees-crosswire-kjv2006-variant";
    } else {
      category = "three-way-substantive-disagreement";
    }

    const sourceWords = words(verse.text);
    const currentWords = words(currentRecord.text);
    const crosswireWords = words(crosswireRecord.text);

    threeWayRows.push({
      reference: verse.reference,
      category,
      currentVsKjv2006: currentSource.level,
      kjv2006VsCrosswire: sourceCrosswire.level,
      currentVsCrosswire: currentCrosswire.level,
      currentVsKjv2006Similarity: currentSource.similarity,
      kjv2006VsCrosswireSimilarity: sourceCrosswire.similarity,
      currentVsCrosswireSimilarity: currentCrosswire.similarity,
      currentWordCount: currentWords.length,
      kjv2006WordCount: sourceWords.length,
      crosswireWordCount: crosswireWords.length,
      currentText: currentRecord.text,
      kjv2006Text: verse.text,
      crosswireText: crosswireRecord.text,
      sourceFile: verse.sourceFile,
      sourceLine: verse.lineNumber,
    });

    if (!currentSource.equivalent) {
      currentToSourceRows.push({
        reference: verse.reference,
        classification: classifyPair(verse, currentRecord).classification,
        currentVsKjv2006Relation: currentSource.level,
        kjv2006VsCrosswireRelation: sourceCrosswire.level,
        currentWordCount: currentWords.length,
        sourceWordCount: sourceWords.length,
        wordDelta: sourceWords.length - currentWords.length,
        currentText: currentRecord.text,
        kjv2006Text: verse.text,
        crosswireText: crosswireRecord.text,
        sourceFile: verse.sourceFile,
        sourceLine: verse.lineNumber,
      });
    }

    visibleRows.push({
      translationId: "kjv",
      source: {
        bookId: verse.bookId,
        bookName: verse.sourceBookName,
        chapter: verse.chapter,
        verseLabel: verse.verseLabel,
        sourceFile: verse.sourceFile,
        sourceLine: verse.lineNumber,
      },
      reader: {
        book: currentRecord.rawBook,
        chapter: currentRecord.chapter,
        verse: currentRecord.verse,
        reference: currentRecord.reference,
        recordId: currentRecord.id || null,
      },
      visibleText: verse.text,
      visibleWordCount: verse.wordCount,
      structureMarkers: verse.structureMarkers,
    });

    versificationRows.push({
      translationId: "kjv",
      sourceBookId: verse.bookId,
      sourceBook: verse.sourceBookName,
      sourceChapter: verse.chapter,
      sourceVerseLabel: verse.verseLabel,
      readerBook: currentRecord.rawBook,
      readerChapter: currentRecord.chapter,
      readerVerse: currentRecord.verse,
      readerReference: currentRecord.reference,
      mappingStatus: "identity-verified",
    });

    verse.footnotes.forEach((note, noteIndex) => {
      footnoteRows.push({
        translationId: "kjv",
        sourceReference: verse.reference,
        readerReference: currentRecord.reference,
        ownership: "reader-verse",
        noteIndex,
        marker: note.type,
        raw: note.raw,
        sourceFile: verse.sourceFile,
        sourceLine: verse.lineNumber,
      });
    });

    verse.crossReferences.forEach((note, noteIndex) => {
      crossReferenceRows.push({
        translationId: "kjv",
        sourceReference: verse.reference,
        readerReference: currentRecord.reference,
        ownership: "reader-verse",
        noteIndex,
        marker: note.type,
        raw: note.raw,
        sourceFile: verse.sourceFile,
        sourceLine: verse.lineNumber,
      });
    });

    if (verse.wordMetadata.length) {
      strongRows.push({
        translationId: "kjv",
        sourceReference: verse.reference,
        readerReference: currentRecord.reference,
        sourceFile: verse.sourceFile,
        sourceLine: verse.lineNumber,
        tags: verse.wordMetadata.map((entry, tagIndex) => ({
          tagIndex,
          display: entry.display,
          strong: entry.strong || null,
          attributes: entry.attributes,
        })),
      });
    }
  }

  const candidateDocument = currentDocument.map((rawRecord, index) => {
    const currentRecord = current.records.find(
      (record) => record.index === index,
    );
    if (!currentRecord) {
      fail(`KJV candidate encountered an unprofiled record at index ${index}`);
    }
    const candidate = candidateByKey.get(currentRecord.key);
    if (!candidate) {
      fail(`No KJV candidate replacement for ${currentRecord.reference}`);
    }
    return candidate;
  });

  const headingRows = source.headings
    .slice()
    .sort(
      (a, b) =>
        (bookOrder.get(a.bookId) ?? 999) -
          (bookOrder.get(b.bookId) ?? 999) ||
        Number(a.chapter || 0) - Number(b.chapter || 0) ||
        Number(a.lineNumber || 0) - Number(b.lineNumber || 0),
    )
    .map((heading, index) => ({
      id: `kjv-heading-${String(index + 1).padStart(6, "0")}`,
      bookId: heading.bookId,
      book: heading.book,
      chapter: heading.chapter,
      beforeSourceVerse: heading.beforeVerse || null,
      marker: heading.marker,
      text: heading.text,
      sourceFile: heading.sourceFile,
      sourceLine: heading.lineNumber,
    }));

  const structureRows = source.structures
    .slice()
    .sort(
      (a, b) =>
        (bookOrder.get(a.bookId) ?? 999) -
          (bookOrder.get(b.bookId) ?? 999) ||
        Number(a.chapter || 0) - Number(b.chapter || 0) ||
        Number(a.lineNumber || 0) - Number(b.lineNumber || 0),
    )
    .map((event, index) => ({
      id: `kjv-structure-${String(index + 1).padStart(7, "0")}`,
      bookId: event.bookId,
      book: event.book,
      chapter: event.chapter,
      sourceVerse: event.verse || null,
      marker: event.marker,
      trailingVisibleText: event.trailingText || "",
      sourceFile: event.sourceFile,
      sourceLine: event.lineNumber,
    }));

  const candidateText = stableJsonText(candidateDocument);
  const deterministicFingerprint = sha256Text(
    [
      visibleRows.map(JSON.stringify).join("\n"),
      headingRows.map(JSON.stringify).join("\n"),
      structureRows.map(JSON.stringify).join("\n"),
      footnoteRows.map(JSON.stringify).join("\n"),
      crossReferenceRows.map(JSON.stringify).join("\n"),
      strongRows.map(JSON.stringify).join("\n"),
      versificationRows.map(JSON.stringify).join("\n"),
      threeWayRows.map(JSON.stringify).join("\n"),
      candidateText,
    ].join("\n---ARTIFACT---\n"),
  );

  return {
    visibleRows,
    headingRows,
    structureRows,
    footnoteRows,
    crossReferenceRows,
    strongRows,
    versificationRows,
    currentToSourceRows,
    threeWayRows,
    candidateDocument,
    candidateText,
    deterministicFingerprint,
  };
}

function writeStagedArtifacts(stagingRoot, artifacts) {
  ensureDir(stagingRoot);
  const files = {};

  files.visibleScripture = writeNdjson(
    path.join(stagingRoot, "visible-scripture.ndjson"),
    artifacts.visibleRows,
  );
  files.headings = writeNdjson(
    path.join(stagingRoot, "headings-and-superscriptions.ndjson"),
    artifacts.headingRows,
  );
  files.structure = writeNdjson(
    path.join(stagingRoot, "paragraph-and-poetry.ndjson"),
    artifacts.structureRows,
  );
  files.footnotes = writeNdjson(
    path.join(stagingRoot, "footnotes.ndjson"),
    artifacts.footnoteRows,
  );
  files.crossReferences = writeNdjson(
    path.join(stagingRoot, "cross-references.ndjson"),
    artifacts.crossReferenceRows,
  );
  files.strongsMetadata = writeNdjson(
    path.join(stagingRoot, "strongs-metadata.ndjson"),
    artifacts.strongRows,
  );
  files.versification = writeNdjson(
    path.join(stagingRoot, "source-reader-versification.ndjson"),
    artifacts.versificationRows,
  );

  const candidatePath = path.join(
    stagingRoot,
    "generatedKJV.candidate.json",
  );
  fs.writeFileSync(candidatePath, artifacts.candidateText, "utf8");
  files.readerCandidate = {
    path: candidatePath,
    sha256: sha256Text(artifacts.candidateText),
    bytes: Buffer.byteLength(artifacts.candidateText, "utf8"),
    records: artifacts.candidateDocument.length,
  };

  return files;
}

function categoryCounts(rows) {
  const result = {};
  for (const row of rows) {
    result[row.category] = (result[row.category] || 0) + 1;
  }
  return result;
}

function threeWayMarkdown(artifacts) {
  const counts = categoryCounts(artifacts.threeWayRows);
  const lines = [
    "# KJV three-way reconciliation",
    "",
    "The three witnesses are the current EMETSEES KJV, locked eBible KJV2006 USFM, and pinned CrossWire KJV OSIS.",
    "",
    "## Categories",
    "",
    ...Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => `- ${category}: ${count}`),
    "",
    "## Highest-priority review",
    "",
  ];

  const priority = artifacts.threeWayRows.filter(
    (row) =>
      row.category === "current-agrees-crosswire-kjv2006-variant" ||
      row.category === "three-way-substantive-disagreement",
  );

  for (const row of priority.slice(0, 100)) {
    lines.push(
      `### ${row.reference}`,
      "",
      `- Category: ${row.category}`,
      `- Current ↔ KJV2006: ${row.currentVsKjv2006}`,
      `- KJV2006 ↔ CrossWire: ${row.kjv2006VsCrosswire}`,
      `- Current ↔ CrossWire: ${row.currentVsCrosswire}`,
      "",
      `**Current:** ${row.currentText}`,
      "",
      `**KJV2006:** ${row.kjv2006Text}`,
      "",
      `**CrossWire:** ${row.crosswireText}`,
      "",
    );
  }

  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  ensureDir(args.output);

  const profilesPath = findLatestSourceProfiles(args.profiles);
  const profiles = readJson(profilesPath);
  if (profiles.milestone !== "P05.12C") {
    fail(`Expected P05.12C profiles, found ${profiles.milestone}`);
  }

  const profile = profiles.translations?.kjv;
  if (!profile || profile.validationPassed !== true) {
    fail("The locked KJV profile is missing or invalid.");
  }

  const certifiedPath = findLatestCertifiedCensus();
  const certified = readJson(certifiedPath);
  const certifiedKjv = certified.translations?.kjv;
  const certifiedVerifier = certified.kjvIndependentVerification?.summary;

  if (
    certified.milestone !== "P05.12D" ||
    !certifiedKjv ||
    !certifiedVerifier
  ) {
    fail("Latest P05.12D report lacks the KJV certification data.");
  }

  const currentPath = path.join(
    ROOT,
    "app",
    "data",
    "scripture",
    "generatedKJV.json",
  );
  const currentHashBefore = sha256File(currentPath);

  if (currentHashBefore !== certifiedKjv.current.sha256) {
    fail(
      `generatedKJV.json changed after P05.12D. Expected ${certifiedKjv.current.sha256}, found ${currentHashBefore}`,
    );
  }

  const sourceDirectory = toAbsoluteRepoPath(profile.rawSourcePath);
  const verifier = profile.independentVerifier;
  const verifierRoot = toAbsoluteRepoPath(verifier.extractedPath);
  const osisPath = (verifier.xmlCandidates || ["kjv.osis.xml"])
    .map((name) => path.join(verifierRoot, name))
    .find(
      (candidate) =>
        fs.existsSync(candidate) &&
        path.basename(candidate).toLowerCase() === "kjv.osis.xml",
    );

  if (!osisPath) {
    fail(`Pinned CrossWire kjv.osis.xml not found under ${verifierRoot}`);
  }

  console.log("[P05.12H] Verifying locked source trees...");
  const sourceTreeHash = computeTreeSha256(sourceDirectory);
  const verifierTreeHash = computeTreeSha256(verifierRoot);

  if (sourceTreeHash !== profile.rawTreeSha256) {
    fail(
      `KJV2006 source tree changed. Expected ${profile.rawTreeSha256}, found ${sourceTreeHash}`,
    );
  }

  if (verifierTreeHash !== verifier.treeSha256) {
    fail(
      `CrossWire source tree changed. Expected ${verifier.treeSha256}, found ${verifierTreeHash}`,
    );
  }

  const includedIds = new Set(profile.includedBookIds || []);
  const allowedBooks = new Set(
    Array.from(includedIds)
      .map((bookId) => ID_TO_BOOK[bookId])
      .filter(Boolean),
  );

  console.log("[P05.12H] Parsing KJV2006 USFM and CrossWire OSIS...");
  const source = parseUsfmDirectory(
    sourceDirectory,
    "kjv2006",
    includedIds,
  );
  const crosswire = parseCrosswireOsis(osisPath, includedIds);
  const currentDocument = readJson(currentPath);
  const current = loadCurrentTranslation(
    currentPath,
    "kjv-current",
    allowedBooks,
  );

  if (
    current.invalid.length ||
    current.duplicates.length ||
    current.excludedProfileRecords.length
  ) {
    fail(
      `Current KJV schema failed preflight: ${JSON.stringify({
        invalid: current.invalid.length,
        duplicates: current.duplicates.length,
        outsideProfile: current.excludedProfileRecords.length,
      })}`,
    );
  }

  console.log("[P05.12H] Reproducing certified pairwise censuses...");
  const currentAudit = compareTranslation(
    "kjv-current-vs-kjv2006",
    current,
    source,
  );
  const verifierAudit = compareTranslation(
    "kjv2006-vs-crosswire",
    crosswire,
    source,
  );

  const expectedCurrent = certifiedKjv.comparison;
  const expectedVerifier = certifiedVerifier.comparison;

  for (const [label, actual, expected] of [
    [
      "current substantive differences",
      currentAudit.summary.comparison.substantiveDifferences,
      expectedCurrent.substantiveDifferences,
    ],
    [
      "current exact",
      currentAudit.summary.comparison.exact,
      expectedCurrent.exact,
    ],
    [
      "verifier substantive differences",
      verifierAudit.summary.comparison.substantiveDifferences,
      expectedVerifier.substantiveDifferences,
    ],
    [
      "verifier exact",
      verifierAudit.summary.comparison.exact,
      expectedVerifier.exact,
    ],
  ]) {
    if (Number(actual) !== Number(expected)) {
      fail(`${label} drift: expected ${expected}, found ${actual}`);
    }
  }

  console.log("[P05.12H] Building deterministic KJV candidate twice...");
  const buildOne = buildKjvArtifacts({
    profile,
    currentDocument,
    current,
    source,
    crosswire,
  });
  const buildTwo = buildKjvArtifacts({
    profile,
    currentDocument,
    current,
    source,
    crosswire,
  });

  if (
    buildOne.deterministicFingerprint !==
    buildTwo.deterministicFingerprint
  ) {
    fail("KJV reconciliation output is not deterministic.");
  }

  const sourceId = String(profile.rawArchiveSha256).slice(0, 16);
  const stagingRoot = path.join(
    ROOT,
    ".private",
    "generated",
    "P05.12",
    "kjv-reconciliation",
    sourceId,
  );

  if (fs.existsSync(stagingRoot)) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }

  const stagedFiles = writeStagedArtifacts(stagingRoot, buildOne);

  console.log("[P05.12H] Auditing staged candidate against KJV2006...");
  const candidate = loadCurrentTranslation(
    stagedFiles.readerCandidate.path,
    "kjv-candidate",
    allowedBooks,
  );
  const candidateAudit = compareTranslation(
    "kjv-candidate-vs-kjv2006",
    candidate,
    source,
  );

  const expectedCandidateVerses = sourceSimpleVerses(
    source,
    new Map(
      (profile.includedBookIds || []).map((bookId, index) => [bookId, index]),
    ),
  ).length;

  if (
    candidateAudit.summary.comparison.exact !== expectedCandidateVerses ||
    candidateAudit.summary.comparison.substantiveDifferences !== 0 ||
    candidateAudit.summary.comparison.typographyOrPunctuationOnly !== 0 ||
    candidateAudit.summary.comparison.netSourceWordDeficit !== 0
  ) {
    fail(
      `KJV candidate/source audit failed: ${JSON.stringify(
        candidateAudit.summary.comparison,
        null,
        2,
      )}`,
    );
  }

  const stagedStrongTagCount = buildOne.strongRows.reduce(
    (sum, row) => sum + row.tags.length,
    0,
  );

  const metadataCounts = {
    verses: buildOne.visibleRows.length,
    headingsAndSuperscriptions: buildOne.headingRows.length,
    paragraphAndPoetryEvents: buildOne.structureRows.length,
    footnotes: buildOne.footnoteRows.length,
    crossReferences: buildOne.crossReferenceRows.length,
    strongTags: stagedStrongTagCount,
    versificationMappings: buildOne.versificationRows.length,
  };

  const expectedMetadataCounts = {
    verses: certifiedKjv.source.simpleNumericVerses,
    headingsAndSuperscriptions: certifiedKjv.source.headings,
    paragraphAndPoetryEvents: certifiedKjv.source.structureEvents,
    footnotes: certifiedKjv.source.footnotes,
    crossReferences: certifiedKjv.source.crossReferences,
    strongTags: certifiedKjv.source.strongTags,
    versificationMappings: certifiedKjv.source.simpleNumericVerses,
  };

  for (const key of Object.keys(expectedMetadataCounts)) {
    if (
      Number(metadataCounts[key]) !==
      Number(expectedMetadataCounts[key])
    ) {
      fail(
        `KJV staged metadata loss for ${key}: expected ${expectedMetadataCounts[key]}, found ${metadataCounts[key]}`,
      );
    }
  }

  const categorySummary = categoryCounts(buildOne.threeWayRows);
  const currentHashAfter = sha256File(currentPath);
  if (currentHashAfter !== currentHashBefore) {
    fail("Production generatedKJV.json changed during reconciliation.");
  }

  const summary = {
    milestone: "P05.12H",
    generatedAtUtc: new Date().toISOString(),
    status: "kjv-three-way-reconciliation-preview-complete",
    repository: {
      branch: git(["branch", "--show-current"]),
      commit: git(["rev-parse", "HEAD"]),
    },
    sources: {
      currentKjv: {
        path: relative(ROOT, currentPath),
        sha256Before: currentHashBefore,
        sha256After: currentHashAfter,
      },
      kjv2006: {
        edition: profile.edition,
        sourceId: profile.sourceId,
        rawSourcePath: profile.rawSourcePath,
        archiveSha256: profile.rawArchiveSha256,
        treeSha256: profile.rawTreeSha256,
        verifiedTreeSha256: sourceTreeHash,
      },
      crosswire: {
        sourceId: verifier.sourceId,
        pinnedCommit: verifier.commit,
        osisPath: relative(ROOT, osisPath),
        osisSha256: sha256File(osisPath),
        treeSha256: verifier.treeSha256,
        verifiedTreeSha256: verifierTreeHash,
      },
    },
    certifiedPairwiseReproduction: {
      currentVsKjv2006: currentAudit.summary.comparison,
      kjv2006VsCrosswire: verifierAudit.summary.comparison,
    },
    threeWayCategories: categorySummary,
    stagedCandidate: {
      root: relative(ROOT, stagingRoot),
      deterministicFingerprint: buildOne.deterministicFingerprint,
      files: Object.fromEntries(
        Object.entries(stagedFiles).map(([name, info]) => [
          name,
          {
            path: relative(ROOT, info.path),
            sha256: info.sha256,
            bytes: info.bytes,
            records: info.records,
          },
        ]),
      ),
      audit: candidateAudit.summary.comparison,
    },
    metadataCounts,
    gates: {
      sourceTreesImmutable: true,
      currentHashMatchesCertifiedCensus: true,
      pairwiseCertifiedCountsReproduced: true,
      deterministicRepeatedBuild: true,
      candidateExactToKjv2006: true,
      metadataInventoryExactToKjv2006: true,
      productionKjvModified: false,
      webModified: false,
      brentonModified: false,
      safeToApplyProductionKjv: false,
      reason:
        "KJV2006 and CrossWire retain edition-level differences. Review the three-way reconciliation before approving one visible-text edition for production.",
    },
  };

  writeJson(path.join(args.output, "reconciliation-summary.json"), summary);

  writeCsv(
    path.join(args.output, "kjv-three-way-reconciliation.csv"),
    buildOne.threeWayRows,
    [
      "reference",
      "category",
      "currentVsKjv2006",
      "kjv2006VsCrosswire",
      "currentVsCrosswire",
      "currentVsKjv2006Similarity",
      "kjv2006VsCrosswireSimilarity",
      "currentVsCrosswireSimilarity",
      "currentWordCount",
      "kjv2006WordCount",
      "crosswireWordCount",
      "currentText",
      "kjv2006Text",
      "crosswireText",
      "sourceFile",
      "sourceLine",
    ],
  );

  const categoryFiles = [
    "two-authoritative-sources-agree-current-differs",
    "current-agrees-kjv2006-crosswire-edition-variant",
    "current-agrees-crosswire-kjv2006-variant",
    "three-way-substantive-disagreement",
  ];

  for (const category of categoryFiles) {
    writeCsv(
      path.join(args.output, `${category}.csv`),
      buildOne.threeWayRows.filter((row) => row.category === category),
      [
        "reference",
        "category",
        "currentVsKjv2006",
        "kjv2006VsCrosswire",
        "currentVsCrosswire",
        "currentText",
        "kjv2006Text",
        "crosswireText",
      ],
    );
  }

  writeCsv(
    path.join(args.output, "current-to-kjv2006-candidate-changes.csv"),
    buildOne.currentToSourceRows,
    [
      "reference",
      "classification",
      "currentVsKjv2006Relation",
      "kjv2006VsCrosswireRelation",
      "currentWordCount",
      "sourceWordCount",
      "wordDelta",
      "currentText",
      "kjv2006Text",
      "crosswireText",
      "sourceFile",
      "sourceLine",
    ],
  );

  ensureDir(path.join(args.output, "samples"));
  fs.writeFileSync(
    path.join(args.output, "samples", "kjv-three-way-review.md"),
    threeWayMarkdown(buildOne),
    "utf8",
  );

  const readme = [
    "# EMETSEES P05.12H KJV Three-Way Reconciliation Preview",
    "",
    `Generated: ${summary.generatedAtUtc}`,
    "",
    "This preview compares the current EMETSEES KJV against both locked KJV2006 USFM and the independently pinned CrossWire KJV OSIS source.",
    "",
    "## Pairwise certified census",
    "",
    `- Current versus KJV2006 substantive differences: ${currentAudit.summary.comparison.substantiveDifferences}`,
    `- KJV2006 versus CrossWire substantive differences: ${verifierAudit.summary.comparison.substantiveDifferences}`,
    "",
    "## Three-way categories",
    "",
    ...Object.entries(categorySummary)
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => `- ${category}: ${count}`),
    "",
    "## Candidate",
    "",
    `- Candidate exact KJV2006 matches: ${candidateAudit.summary.comparison.exact}`,
    `- Candidate substantive differences: ${candidateAudit.summary.comparison.substantiveDifferences}`,
    `- Footnotes preserved: ${metadataCounts.footnotes}`,
    `- Strong's tags preserved: ${metadataCounts.strongTags}`,
    `- Deterministic fingerprint: ${buildOne.deterministicFingerprint}`,
    "",
    "## Safety",
    "",
    "- Production generatedKJV.json was not modified.",
    "- The approved WEB candidate remains staged and unapplied.",
    "- Brenton was not modified.",
    "- Display tokens and alignments were not rebuilt.",
    "- No KJV apply step is authorized by this preview.",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(args.output, "README.md"), readme, "utf8");
  writeChecksums(args.output);

  console.log("");
  console.log("[P05.12H] KJV three-way reconciliation preview complete.");
  console.log(`[P05.12H] Candidate exact KJV2006 matches: ${candidateAudit.summary.comparison.exact}`);
  console.log(`[P05.12H] Three-way substantive disagreements: ${categorySummary["three-way-substantive-disagreement"] || 0}`);
  console.log("[P05.12H] Production generatedKJV.json modified: NO");
  console.log("[P05.12H] Display tokens and alignments rebuilt: NO");
  console.log(`OUTPUT_DIR=${args.output}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exit(1);
}
