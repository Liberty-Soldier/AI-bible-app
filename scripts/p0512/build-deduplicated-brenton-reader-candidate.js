#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.cwd();

function fail(message) {
  throw new Error(`[P05.12P V2 Brenton reader candidate] ${message}`);
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
registerBookAliases("Esther", ["Esther Greek"]);
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



function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells;
}

function readCsv(filePath) {
  const lines = readText(filePath)
    .split(/\r?\n/)
    .filter((line) => line.length > 0);

  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(
      headers.map((header, index) => [header, cells[index] ?? ""]),
    );
  });
}

function findBrentonLockedInventory(profilesPath) {
  const sibling = path.join(
    path.dirname(profilesPath),
    "inventories",
    "brenton-tree.csv",
  );

  if (fs.existsSync(sibling)) return sibling;

  const reportRoot = path.join(ROOT, ".private", "reports", "P05.12");
  const candidates = walk(
    reportRoot,
    (filePath) =>
      normalizeSlashes(filePath).endsWith(
        "/inventories/brenton-tree.csv",
      ),
  );

  if (!candidates.length) {
    fail(
      "Could not locate the locked P05.12C inventories/brenton-tree.csv.",
    );
  }

  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0];
}

function verifyLockedInventory(directory, inventoryPath) {
  const expectedRows = readCsv(inventoryPath);
  if (!expectedRows.length) {
    fail(`Locked Brenton inventory is empty: ${inventoryPath}`);
  }

  const expected = new Map(
    expectedRows.map((row) => [
      normalizeSlashes(row.relativePath),
      {
        sizeBytes: Number(row.sizeBytes),
        sha256: String(row.sha256).toLowerCase(),
      },
    ]),
  );

  const actualFiles = walk(
    directory,
    (filePath) => fs.statSync(filePath).isFile(),
  );
  const actual = new Map(
    actualFiles.map((filePath) => [
      relative(directory, filePath),
      {
        sizeBytes: fs.statSync(filePath).size,
        sha256: sha256File(filePath),
      },
    ]),
  );

  const missing = [];
  const changed = [];
  const extra = [];

  for (const [relativePath, expectedRecord] of expected) {
    const actualRecord = actual.get(relativePath);

    if (!actualRecord) {
      missing.push(relativePath);
      continue;
    }

    if (
      actualRecord.sizeBytes !== expectedRecord.sizeBytes ||
      actualRecord.sha256 !== expectedRecord.sha256
    ) {
      changed.push({
        relativePath,
        expectedSizeBytes: expectedRecord.sizeBytes,
        actualSizeBytes: actualRecord.sizeBytes,
        expectedSha256: expectedRecord.sha256,
        actualSha256: actualRecord.sha256,
      });
    }
  }

  for (const relativePath of actual.keys()) {
    if (!expected.has(relativePath)) extra.push(relativePath);
  }

  const canonicalLines = expectedRows.map(
    (row) =>
      `${normalizeSlashes(row.relativePath)}\t${row.sizeBytes}\t${String(
        row.sha256,
      ).toLowerCase()}`,
  );
  const inventoryTreeSha256 = sha256Text(canonicalLines.join("\n"));

  return {
    inventoryPath,
    expectedFiles: expected.size,
    actualFiles: actual.size,
    inventoryTreeSha256,
    missing,
    changed,
    extra,
    passed: missing.length === 0 && changed.length === 0,
  };
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

function textSignature(value) {
  return normalizeTypography(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function lxxBookName(book) {
  const mapping = {
    "Letter of Jeremiah": "Epistle of Jeremiah",
    "Song of Solomon": "Song of Songs",
    "Esther Greek": "Esther",
    "Daniel Greek": "Daniel",
  };
  return mapping[book] || book;
}

function loadLxxVerseKeys(directory) {
  if (!fs.existsSync(directory)) {
    fail(`LXX canonical directory is missing: ${directory}`);
  }

  const keys = new Set();
  const files = walk(directory, (filePath) => /\.json$/i.test(filePath));

  for (const filePath of files) {
    const document = readJson(filePath);
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      continue;
    }

    for (const key of Object.keys(document)) {
      keys.add(key);
    }
  }

  return {
    keys,
    files,
    treeSha256: computeTreeSha256(directory),
  };
}

function sourceCoordinateKey(verse) {
  return `${verse.book}\u0000${verse.chapter}\u0000${verse.verseLabel}`;
}

function readerCoordinateKey(record) {
  return `${record.book}\u0000${record.chapter}\u0000${record.verse}`;
}

function signatureIndex(records, textGetter) {
  const index = new Map();
  records.forEach((record, position) => {
    const signature = textSignature(textGetter(record));
    if (!signature) return;
    if (!index.has(signature)) index.set(signature, []);
    index.get(signature).push(position);
  });
  return index;
}

function longestIncreasingSubsequence(pairs) {
  if (!pairs.length) return [];

  const tails = [];
  const tailsIndex = [];
  const previous = new Array(pairs.length).fill(-1);

  for (let index = 0; index < pairs.length; index += 1) {
    const value = pairs[index].currentIndex;
    let low = 0;
    let high = tails.length;

    while (low < high) {
      const middle = (low + high) >> 1;
      if (tails[middle] < value) low = middle + 1;
      else high = middle;
    }

    if (low > 0) previous[index] = tailsIndex[low - 1];
    tails[low] = value;
    tailsIndex[low] = index;
  }

  const result = [];
  let cursor = tailsIndex[tails.length - 1];
  while (cursor >= 0) {
    result.push(pairs[cursor]);
    cursor = previous[cursor];
  }

  return result.reverse();
}

function makeMapping(source, current, mappingType, confidence, relation, extra = {}) {
  return {
    sourceIndex: source.index,
    currentIndex: current.index,
    sourceBookId: source.bookId,
    sourceBook: source.book,
    sourceChapter: source.chapter,
    sourceVerseLabel: source.verseLabel,
    sourceVerse: source.verse,
    sourceReference: source.reference,
    readerRawBook: current.rawBook,
    readerBook: current.book,
    readerChapter: current.chapter,
    readerVerse: current.verse,
    readerReference: current.reference,
    mappingType,
    confidence,
    relation,
    sourceText: source.text,
    readerText: current.text,
    sourceFile: source.sourceFile,
    sourceLine: source.lineNumber,
    ...extra,
  };
}

function mapBook(sourceVerses, currentRecords) {
  const sourceWithIndex = sourceVerses.map((verse, index) => ({
    ...verse,
    index,
  }));
  const currentWithIndex = currentRecords.map((record, index) => ({
    ...record,
    index,
  }));

  const sourceSignatureIndex = signatureIndex(
    sourceWithIndex,
    (verse) => verse.text,
  );
  const currentSignatureIndex = signatureIndex(
    currentWithIndex,
    (record) => record.text,
  );

  const seedPairs = [];
  const usedSource = new Set();
  const usedCurrent = new Set();

  // Exact identity coordinates are the strongest anchors.
  const currentByCoordinate = new Map(
    currentWithIndex.map((record) => [
      `${record.chapter}\u0000${record.verse}`,
      record,
    ]),
  );

  for (const source of sourceWithIndex) {
    if (source.isSubverse) continue;
    const current = currentByCoordinate.get(
      `${source.chapter}\u0000${source.verse}`,
    );
    if (
      current &&
      textSignature(source.text) &&
      textSignature(source.text) === textSignature(current.text)
    ) {
      seedPairs.push({
        sourceIndex: source.index,
        currentIndex: current.index,
        source,
        current,
        reason: "identity-exact",
      });
    }
  }

  // Globally unique exact text is also a strong anchor.
  for (const [signature, sourcePositions] of sourceSignatureIndex) {
    const currentPositions = currentSignatureIndex.get(signature) || [];
    if (sourcePositions.length !== 1 || currentPositions.length !== 1) {
      continue;
    }

    const source = sourceWithIndex[sourcePositions[0]];
    const current = currentWithIndex[currentPositions[0]];
    seedPairs.push({
      sourceIndex: source.index,
      currentIndex: current.index,
      source,
      current,
      reason: "unique-text-exact",
    });
  }

  seedPairs.sort(
    (a, b) =>
      a.sourceIndex - b.sourceIndex ||
      a.currentIndex - b.currentIndex,
  );

  const dedupedSeeds = [];
  const seenSeed = new Set();
  for (const pair of seedPairs) {
    const key = `${pair.sourceIndex}\u0000${pair.currentIndex}`;
    if (seenSeed.has(key)) continue;
    seenSeed.add(key);
    dedupedSeeds.push(pair);
  }

  const anchors = longestIncreasingSubsequence(dedupedSeeds);
  const mappings = [];

  for (const anchor of anchors) {
    if (
      usedSource.has(anchor.sourceIndex) ||
      usedCurrent.has(anchor.currentIndex)
    ) {
      continue;
    }

    usedSource.add(anchor.sourceIndex);
    usedCurrent.add(anchor.currentIndex);

    const source = anchor.source;
    const current = anchor.current;
    const identity =
      !source.isSubverse &&
      source.chapter === current.chapter &&
      source.verse === current.verse;

    mappings.push(
      makeMapping(
        source,
        current,
        identity ? "identity-exact" : "shifted-exact",
        1,
        anchor.reason,
      ),
    );
  }

  // Map remaining exact signatures monotonically between anchors.
  for (const source of sourceWithIndex) {
    if (usedSource.has(source.index)) continue;
    const signature = textSignature(source.text);
    if (!signature) continue;

    const candidates = (currentSignatureIndex.get(signature) || [])
      .filter((position) => !usedCurrent.has(position))
      .map((position) => currentWithIndex[position]);

    if (!candidates.length) continue;

    const previous = mappings
      .filter((mapping) => mapping.sourceIndex < source.index)
      .sort((a, b) => b.sourceIndex - a.sourceIndex)[0];
    const next = mappings
      .filter((mapping) => mapping.sourceIndex > source.index)
      .sort((a, b) => a.sourceIndex - b.sourceIndex)[0];

    const legal = candidates.filter((candidate) => {
      if (previous && candidate.index <= previous.currentIndex) return false;
      if (next && candidate.index >= next.currentIndex) return false;
      return true;
    });

    if (!legal.length) continue;

    const expected = previous && next
      ? previous.currentIndex +
        ((source.index - previous.sourceIndex) /
          Math.max(1, next.sourceIndex - previous.sourceIndex)) *
          (next.currentIndex - previous.currentIndex)
      : source.index;

    legal.sort(
      (a, b) =>
        Math.abs(a.index - expected) - Math.abs(b.index - expected) ||
        a.index - b.index,
    );

    const current = legal[0];
    usedSource.add(source.index);
    usedCurrent.add(current.index);

    const identity =
      !source.isSubverse &&
      source.chapter === current.chapter &&
      source.verse === current.verse;

    mappings.push(
      makeMapping(
        source,
        current,
        source.isSubverse
          ? "subverse-exact"
          : identity
            ? "identity-exact"
            : "shifted-exact",
        1,
        "anchored-duplicate-text-exact",
      ),
    );
  }

  // Detect consecutive source segments merged into one reader verse.
  for (const current of currentWithIndex) {
    if (usedCurrent.has(current.index)) continue;
    const target = textSignature(current.text);
    if (!target) continue;

    for (let start = 0; start < sourceWithIndex.length; start += 1) {
      if (usedSource.has(start)) continue;
      let combined = "";

      for (let length = 1; length <= 8; length += 1) {
        const position = start + length - 1;
        if (position >= sourceWithIndex.length || usedSource.has(position)) {
          break;
        }

        const verse = sourceWithIndex[position];
        if (
          length > 1 &&
          verse.chapter !== sourceWithIndex[start].chapter
        ) {
          break;
        }

        combined += textSignature(verse.text);

        if (combined === target && length > 1) {
          const group = sourceWithIndex.slice(start, start + length);
          group.forEach((source, groupIndex) => {
            usedSource.add(source.index);
            mappings.push(
              makeMapping(
                source,
                current,
                "many-source-segments-to-one-reader-verse",
                1,
                "exact-concatenation",
                {
                  groupId: `source-group:${group[0].book}:${group[0].chapter}:${group[0].verseLabel}-${group[group.length - 1].verseLabel}`,
                  groupIndex,
                  groupSize: group.length,
                },
              ),
            );
          });
          usedCurrent.add(current.index);
          start = sourceWithIndex.length;
          break;
        }

        if (!target.startsWith(combined)) break;
      }
    }
  }

  // Detect one source segment split across consecutive reader verses.
  for (const source of sourceWithIndex) {
    if (usedSource.has(source.index)) continue;
    const target = textSignature(source.text);
    if (!target) continue;

    for (let start = 0; start < currentWithIndex.length; start += 1) {
      if (usedCurrent.has(start)) continue;
      let combined = "";

      for (let length = 1; length <= 8; length += 1) {
        const position = start + length - 1;
        if (position >= currentWithIndex.length || usedCurrent.has(position)) {
          break;
        }

        const record = currentWithIndex[position];
        if (
          length > 1 &&
          record.chapter !== currentWithIndex[start].chapter
        ) {
          break;
        }

        combined += textSignature(record.text);

        if (combined === target && length > 1) {
          const group = currentWithIndex.slice(start, start + length);
          group.forEach((current, groupIndex) => {
            usedCurrent.add(current.index);
            mappings.push(
              makeMapping(
                source,
                current,
                "one-source-segment-to-many-reader-verses",
                1,
                "exact-concatenation",
                {
                  groupId: `reader-group:${group[0].book}:${group[0].chapter}:${group[0].verse}-${group[group.length - 1].verse}`,
                  groupIndex,
                  groupSize: group.length,
                },
              ),
            );
          });
          usedSource.add(source.index);
          start = currentWithIndex.length;
          break;
        }

        if (!target.startsWith(combined)) break;
      }
    }
  }

  // High-similarity fallback within the same book and a bounded sequence window.
  const remainingSources = sourceWithIndex.filter(
    (source) => !usedSource.has(source.index),
  );
  const remainingCurrent = currentWithIndex.filter(
    (current) => !usedCurrent.has(current.index),
  );

  for (const source of remainingSources) {
    const candidates = remainingCurrent
      .filter((current) => !usedCurrent.has(current.index))
      .filter(
        (current) =>
          current.chapter === source.chapter ||
          Math.abs(current.index - source.index) <= 12,
      )
      .map((current) => ({
        current,
        score: similarity(words(source.text), words(current.text)),
      }))
      .filter((candidate) => candidate.score >= 0.92)
      .sort(
        (a, b) =>
          b.score - a.score ||
          Math.abs(a.current.index - source.index) -
            Math.abs(b.current.index - source.index),
      );

    if (!candidates.length) continue;

    const best = candidates[0];
    if (
      candidates[1] &&
      Math.abs(candidates[1].score - best.score) < 0.02
    ) {
      continue;
    }

    usedSource.add(source.index);
    usedCurrent.add(best.current.index);
    mappings.push(
      makeMapping(
        source,
        best.current,
        "high-similarity-one-to-one",
        Number(best.score.toFixed(6)),
        "bounded-sequence-similarity",
      ),
    );
  }

  mappings.sort(
    (a, b) =>
      a.sourceIndex - b.sourceIndex ||
      a.currentIndex - b.currentIndex,
  );

  return {
    mappings,
    unresolvedSource: sourceWithIndex.filter(
      (source) => !usedSource.has(source.index),
    ),
    unresolvedCurrent: currentWithIndex.filter(
      (current) => !usedCurrent.has(current.index),
    ),
  };
}

function buildShiftRuns(mappings) {
  const eligible = mappings
    .filter(
      (mapping) =>
        [
          "identity-exact",
          "shifted-exact",
          "subverse-exact",
          "high-similarity-one-to-one",
        ].includes(mapping.mappingType) &&
        !mapping.groupId,
    )
    .sort(
      (a, b) =>
        a.sourceBook.localeCompare(b.sourceBook) ||
        a.sourceIndex - b.sourceIndex ||
        a.currentIndex - b.currentIndex,
    );

  const runs = [];
  let currentRun = null;

  for (const mapping of eligible) {
    const chapterOffset =
      Number(mapping.readerChapter) - Number(mapping.sourceChapter);
    const verseOffset =
      Number(mapping.readerVerse) - Number(mapping.sourceVerse);

    const signature = [
      mapping.sourceBook,
      mapping.readerRawBook,
      chapterOffset,
      verseOffset,
      mapping.mappingType === "identity-exact" ? "identity" : "shift",
    ].join("\u0000");

    const consecutive =
      currentRun &&
      currentRun.signature === signature &&
      mapping.sourceIndex === currentRun.lastSourceIndex + 1 &&
      mapping.currentIndex === currentRun.lastCurrentIndex + 1;

    if (!consecutive) {
      if (currentRun) runs.push(currentRun);
      currentRun = {
        signature,
        sourceBook: mapping.sourceBook,
        readerBook: mapping.readerRawBook,
        sourceStart: mapping.sourceReference,
        sourceEnd: mapping.sourceReference,
        readerStart: mapping.readerReference,
        readerEnd: mapping.readerReference,
        sourceChapterStart: mapping.sourceChapter,
        sourceChapterEnd: mapping.sourceChapter,
        readerChapterStart: mapping.readerChapter,
        readerChapterEnd: mapping.readerChapter,
        chapterOffset,
        verseOffset,
        mappingClass:
          mapping.mappingType === "identity-exact"
            ? "identity"
            : "shifted",
        segments: 1,
        lastSourceIndex: mapping.sourceIndex,
        lastCurrentIndex: mapping.currentIndex,
      };
    } else {
      currentRun.sourceEnd = mapping.sourceReference;
      currentRun.readerEnd = mapping.readerReference;
      currentRun.sourceChapterEnd = mapping.sourceChapter;
      currentRun.readerChapterEnd = mapping.readerChapter;
      currentRun.segments += 1;
      currentRun.lastSourceIndex = mapping.sourceIndex;
      currentRun.lastCurrentIndex = mapping.currentIndex;
    }
  }

  if (currentRun) runs.push(currentRun);

  return runs.map(({ signature, lastSourceIndex, lastCurrentIndex, ...run }) => run);
}

function buildSubverseClusters(sourceVerses, mappings) {
  const byKey = new Map();

  for (const verse of sourceVerses.filter((verse) => verse.isSubverse)) {
    const key = `${verse.book}\u0000${verse.chapter}\u0000${verse.verse}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(verse);
  }

  const mappedBySourceCoordinate = new Map();
  for (const mapping of mappings) {
    const key = `${mapping.sourceBook}\u0000${mapping.sourceChapter}\u0000${mapping.sourceVerseLabel}`;
    if (!mappedBySourceCoordinate.has(key)) {
      mappedBySourceCoordinate.set(key, []);
    }
    mappedBySourceCoordinate.get(key).push(mapping);
  }

  return Array.from(byKey.values()).map((cluster) => {
    const mapped = cluster.flatMap((verse) => {
      const key = `${verse.book}\u0000${verse.chapter}\u0000${verse.verseLabel}`;
      return mappedBySourceCoordinate.get(key) || [];
    });

    return {
      book: cluster[0].book,
      chapter: cluster[0].chapter,
      numericVerse: cluster[0].verse,
      sourceLabels: cluster.map((verse) => verse.verseLabel).join(" "),
      sourceSegmentCount: cluster.length,
      mappedSegmentCount: mapped.length,
      readerReferences: Array.from(
        new Set(mapped.map((mapping) => mapping.readerReference)),
      ).join(" | "),
      mappingTypes: Array.from(
        new Set(mapped.map((mapping) => mapping.mappingType)),
      ).join(" | "),
      allSegmentsMapped: mapped.length >= cluster.length,
    };
  });
}

function addLxxOwnership(mapping, lxxKeys) {
  const sourceBook = lxxBookName(mapping.sourceBook);
  const readerBook = lxxBookName(mapping.readerBook);

  const sourceKey = `${sourceBook}.${Number(mapping.sourceChapter)}.${Number(mapping.sourceVerse)}`;
  const readerKey = `${readerBook}.${Number(mapping.readerChapter)}.${Number(mapping.readerVerse)}`;

  return {
    ...mapping,
    lxxSourceCoordinate: sourceKey,
    lxxReaderCoordinate: readerKey,
    lxxHasSourceCoordinate: lxxKeys.has(sourceKey),
    lxxHasReaderCoordinate: lxxKeys.has(readerKey),
    lxxOwnershipRisk:
      sourceKey !== readerKey &&
      lxxKeys.has(sourceKey) &&
      lxxKeys.has(readerKey)
        ? "both-coordinates-exist-requires-explicit-ownership"
        : sourceKey !== readerKey && lxxKeys.has(sourceKey)
          ? "source-coordinate-exists-reader-coordinate-missing"
          : sourceKey !== readerKey && lxxKeys.has(readerKey)
            ? "reader-coordinate-exists-source-coordinate-missing"
            : sourceKey !== readerKey
              ? "neither-coordinate-found"
              : "identity-coordinate",
  };
}

function psalm4Markdown(mappings, sourceVerses, currentRecords) {
  const source = sourceVerses.filter(
    (verse) => verse.book === "Psalms" && verse.chapter === 4,
  );
  const current = currentRecords.filter(
    (record) => record.book === "Psalms" && record.chapter === 4,
  );
  const mapped = mappings.filter(
    (mapping) =>
      mapping.sourceBook === "Psalms" &&
      mapping.sourceChapter === 4,
  );

  const lines = [
    "# Brenton Psalm 4 versification topology",
    "",
    "No numbering has been changed. This report shows source labels, current reader labels, and proposed ownership mappings.",
    "",
    "## Source segments",
    "",
    ...source.map(
      (verse) => `- ${verse.reference}: ${verse.text}`,
    ),
    "",
    "## Current reader verses",
    "",
    ...current.map(
      (record) => `- ${record.reference}: ${record.text}`,
    ),
    "",
    "## Proposed map",
    "",
    ...mapped.map(
      (mapping) =>
        `- ${mapping.sourceReference} → ${mapping.readerReference} (${mapping.mappingType}, ${mapping.confidence})`,
    ),
    "",
  ];

  return lines.join("\n");
}

function countBy(rows, field) {
  const result = {};
  for (const row of rows) {
    const key = String(row[field] ?? "");
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}


function findLatestReportFile(basename, milestone) {
  const reportRoot = path.join(ROOT, ".private", "reports", "P05.12");
  const candidates = walk(
    reportRoot,
    (filePath) => path.basename(filePath) === basename,
  ).filter((filePath) => {
    try {
      return readJson(filePath)?.milestone === milestone;
    } catch {
      return false;
    }
  });

  if (!candidates.length) {
    fail(`No completed ${milestone} ${basename} was found.`);
  }

  candidates.sort(
    (left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs,
  );

  return candidates[0];
}

function verifyReportChecksums(reportRoot) {
  const checksumPath = path.join(reportRoot, "checksums.sha256");

  if (!fs.existsSync(checksumPath)) {
    fail(`Missing checksums.sha256 in ${relative(ROOT, reportRoot)}`);
  }

  const failures = [];
  let checked = 0;

  for (const line of readText(checksumPath).split(/\r?\n/)) {
    if (!line.trim()) continue;

    const match = /^([a-f0-9]{64})  (.+)$/i.exec(line);

    if (!match) {
      failures.push({ line, reason: "invalid-checksum-line" });
      continue;
    }

    const expected = match[1].toLowerCase();
    const normalized = normalizeSlashes(match[2]);
    const exactPath = path.join(
      reportRoot,
      normalized.replace(/\//g, path.sep),
    );

    const filePath = fs.existsSync(exactPath)
      ? exactPath
      : walk(reportRoot).find(
          (candidate) => relative(reportRoot, candidate) === normalized,
        );

    if (!filePath) {
      failures.push({ path: normalized, reason: "missing" });
      continue;
    }

    checked += 1;
    const actual = sha256File(filePath);

    if (actual !== expected) {
      failures.push({ path: normalized, expected, actual });
    }
  }

  return {
    checked,
    failures,
    passed: failures.length === 0,
  };
}

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }

  cells.push(cell);
  return cells;
}

function readCsv(filePath) {
  const lines = readText(filePath)
    .split(/\r?\n/)
    .filter((line) => line.length > 0);

  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);

    return Object.fromEntries(
      headers.map((header, index) => [header, cells[index] ?? ""]),
    );
  });
}

function readNdjson(filePath) {
  return readText(filePath)
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        fail(
          `Invalid NDJSON at ${relative(ROOT, filePath)}:${index + 1}: ${error.message}`,
        );
      }
    });
}

function absoluteRepoPath(value) {
  return path.isAbsolute(value)
    ? value
    : path.join(ROOT, normalizeSlashes(value).replace(/\//g, path.sep));
}

function verifyStagedFile(record, label) {
  if (!record?.path || !record?.sha256 || !Number.isInteger(record?.records)) {
    fail(`Incomplete staged artifact metadata for ${label}.`);
  }

  const filePath = absoluteRepoPath(record.path);

  if (!fs.existsSync(filePath)) {
    fail(`Missing staged artifact: ${record.path}`);
  }

  const actual = sha256File(filePath);

  if (actual !== record.sha256) {
    fail(
      `${label} hash mismatch. Expected ${record.sha256}, found ${actual}`,
    );
  }

  return {
    filePath,
    records: record.records,
    sha256: actual,
  };
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

function stableJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function normalizeSourceText(value) {
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

function sourceId(bookId, chapter, verseLabel) {
  return `brenton:${bookId}:${chapter}:${verseLabel}`;
}

function verseLabelSort(value) {
  const match = /^(\d+)([A-Za-z]*)$/.exec(String(value || ""));

  return {
    number: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
    suffix: match ? match[2] : String(value || ""),
  };
}

function compareVerseLabels(left, right) {
  const a = verseLabelSort(left);
  const b = verseLabelSort(right);

  return a.number - b.number || a.suffix.localeCompare(b.suffix);
}

function splitJsonArray(value) {
  if (Array.isArray(value)) return value;

  const text = String(value || "").trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return text
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
  }
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

function findCertifiedCensus() {
  return findLatestReportFile("overall-summary.json", "P05.12D");
}

function loadUpstream() {
  const lSummaryPath = findLatestReportFile(
    "brenton-dual-coordinate-summary.json",
    "P05.12L",
  );
  const mSummaryPath = findLatestReportFile(
    "brenton-lxx-ownership-classification-summary.json",
    "P05.12M",
  );
  const oSummaryPath = findLatestReportFile(
    "brenton-ezra-nehemiah-duplicate-summary.json",
    "P05.12O",
  );

  const lRoot = path.dirname(lSummaryPath);
  const mRoot = path.dirname(mSummaryPath);
  const oRoot = path.dirname(oSummaryPath);

  const lChecksums = verifyReportChecksums(lRoot);
  const mChecksums = verifyReportChecksums(mRoot);
  const oChecksums = verifyReportChecksums(oRoot);

  for (const [milestone, result] of [
    ["P05.12L", lChecksums],
    ["P05.12M", mChecksums],
    ["P05.12O", oChecksums],
  ]) {
    if (!result.passed) {
      fail(
        `${milestone} checksum verification failed: ${JSON.stringify(
          result.failures,
          null,
          2,
        )}`,
      );
    }
  }

  const l = readJson(lSummaryPath);
  const m = readJson(mSummaryPath);
  const o = readJson(oSummaryPath);

  if (
    l.corpus?.sourceSegments !== 29004 ||
    m.accounting?.totalBrentonSourceSegments !== 29004 ||
    o.duplicateSourceInventory?.aliasMappings !== 389 ||
    o.gates?.safeToBuildDeduplicatedBrentonReaderCandidate !== true
  ) {
    fail(
      `Upstream candidate authorization is incomplete: ${JSON.stringify({
        lCorpus: l.corpus,
        mAccounting: m.accounting,
        oInventory: o.duplicateSourceInventory,
        oGate: o.gates,
      })}`,
    );
  }

  return {
    l: { summaryPath: lSummaryPath, root: lRoot, summary: l, checksums: lChecksums },
    m: { summaryPath: mSummaryPath, root: mRoot, summary: m, checksums: mChecksums },
    o: { summaryPath: oSummaryPath, root: oRoot, summary: o, checksums: oChecksums },
  };
}

function buildCandidate({
  source,
  profile,
  lSourceRows,
  lNavigationRows,
  lCompatibilityRows,
  classifications,
  aliasRows,
}) {
  const sourceRowsById = new Map(lSourceRows.map((row) => [row.id, row]));
  const navigationById = new Map(
    lNavigationRows.map((row) => [row.sourceId, row]),
  );
  const compatibilityById = new Map(
    lCompatibilityRows.map((row) => [row.sourceId, row]),
  );
  const classificationById = new Map(
    classifications.map((row) => [row.sourceId, row]),
  );
  const aliasBySourceId = new Map(
    aliasRows.map((row) => [row.aliasSourceId, row]),
  );
  const primaryAliasTargets = new Set(
    aliasRows.map((row) => row.primarySourceId),
  );

  for (const [label, map, expected] of [
    ["P05.12L source", sourceRowsById, 29004],
    ["P05.12L navigation", navigationById, 29004],
    ["P05.12L compatibility", compatibilityById, 29004],
    ["P05.12M classifications", classificationById, 29004],
    ["P05.12O aliases", aliasBySourceId, 389],
  ]) {
    if (map.size !== expected) {
      fail(`${label} coverage is ${map.size}; expected ${expected}`);
    }
  }

  const parsedVerses = source.verses.filter((verse) => verse.wordCount > 0);
  const parsedById = new Map();

  for (const verse of parsedVerses) {
    const id = sourceId(verse.bookId, verse.chapter, verse.verseLabel);

    if (parsedById.has(id)) fail(`Duplicate parsed source ID: ${id}`);

    parsedById.set(id, verse);
  }

  if (parsedById.size !== 29004) {
    fail(`Parsed Brenton source coverage is ${parsedById.size}; expected 29,004`);
  }

  for (const [id, staged] of sourceRowsById) {
    const parsed = parsedById.get(id);

    if (!parsed) fail(`Immutable source is missing staged segment ${id}`);

    if (
      normalizeSourceText(parsed.text) !==
      normalizeSourceText(staged.visibleText)
    ) {
      fail(`Immutable source text drift at ${staged.source.reference}`);
    }
  }

  const bookOrder = new Map(
    (profile.includedBookIds || []).map((bookId, index) => [bookId, index]),
  );

  const sortedIds = [...parsedById.keys()].sort((leftId, rightId) => {
    const left = sourceRowsById.get(leftId);
    const right = sourceRowsById.get(rightId);

    return (
      (bookOrder.get(left.source.bookId) ?? 999) -
        (bookOrder.get(right.source.bookId) ?? 999) ||
      Number(left.source.chapter) - Number(right.source.chapter) ||
      compareVerseLabels(left.source.verseLabel, right.source.verseLabel)
    );
  });

  const sourceSegments = [];
  const readerVerses = [];
  const superscriptions = [];
  const aliases = [];
  const ownership = [];
  const navigation = [];
  const compatibility = [];

  const visibleCoordinateSet = new Set();

  for (const id of sortedIds) {
    const parsed = parsedById.get(id);
    const staged = sourceRowsById.get(id);
    const nav = navigationById.get(id);
    const compat = compatibilityById.get(id);
    const classification = classificationById.get(id);
    const alias = aliasBySourceId.get(id) || null;
    const isSuperscription = staged.segmentType === "superscription";
    const isAlias = Boolean(alias);

    if (!nav || !compat || !classification) {
      fail(`Incomplete joined evidence for ${id}`);
    }

    const sourceRecord = {
      schemaVersion: "brenton-source-segment@1",
      id,
      translationId: "brenton",
      segmentType: isSuperscription
        ? "superscription"
        : isAlias
          ? "alternate-source-alias"
          : "verse",
      source: {
        bookId: parsed.bookId,
        book: parsed.book,
        chapter: parsed.chapter,
        verseLabel: parsed.verseLabel,
        numericVerse: parsed.verse,
        reference: parsed.reference,
        sourceFile: parsed.sourceFile,
        sourceLine: parsed.lineNumber,
      },
      text: parsed.text,
      wordCount: parsed.wordCount,
      structureMarkers: parsed.structureMarkers,
      classification: classification.classification,
    };

    sourceSegments.push(sourceRecord);

    const ownershipRecord = {
      sourceId: id,
      sourceReference: parsed.reference,
      classification: classification.classification,
      eligibility: classification.eligibility,
      authoritativeOwnershipKey:
        classification.authoritativeOwnershipKey || null,
      directLxxCoordinate:
        classification.directLxxCoordinate || null,
      directLxxCoordinateExists:
        String(classification.directLxxCoordinateExists).toLowerCase() ===
        "true",
      entityRoutingEligible:
        classification.eligibility ===
        "eligible-for-source-token-ownership",
      exclusionReason:
        classification.eligibility ===
        "eligible-for-source-token-ownership"
          ? null
          : classification.classification,
    };
    ownership.push(ownershipRecord);

    const navigationTargets = splitJsonArray(nav.navigationTargets);
    const navigationRecord = {
      sourceId: id,
      sourceReference: parsed.reference,
      segmentType: sourceRecord.segmentType,
      status: nav.navigationStatus,
      targets: navigationTargets,
      basis: nav.navigationBasis || null,
      sourceTypes: splitJsonArray(nav.tvtmsSourceTypes),
      actions: splitJsonArray(nav.tvtmsActions),
      tests: splitJsonArray(nav.tvtmsTests),
    };
    navigation.push(navigationRecord);

    const compatibilityRecord = {
      sourceId: id,
      sourceReference: parsed.reference,
      legacyBook: compat.readerBook,
      legacyChapter: Number(compat.readerChapter),
      legacyVerse: Number(compat.readerVerse),
      legacyReference: compat.readerReference,
      mappingType: compat.mappingType,
      confidence: Number(compat.confidence),
      headingContaminationRemoved:
        String(compat.headingContaminationRemoved).toLowerCase() === "true",
    };
    compatibility.push(compatibilityRecord);

    if (isAlias) {
      aliases.push({
        schemaVersion: "brenton-alternate-source-alias@1",
        aliasSourceId: id,
        aliasSourceCoordinate: alias.aliasSourceCoordinate,
        aliasSourceReference: alias.aliasSourceReference,
        primarySourceId: alias.primarySourceId,
        primarySourceCoordinate: alias.primarySourceCoordinate,
        primarySourceReference: alias.primarySourceReference,
        mappingType: alias.mappingType,
        confidence: Number(alias.confidence),
        textPreserved: true,
      });
      continue;
    }

    if (isSuperscription) {
      superscriptions.push({
        schemaVersion: "brenton-superscription@1",
        id,
        source: sourceRecord.source,
        text: parsed.text,
        wordCount: parsed.wordCount,
        lxxOwnership: ownershipRecord,
        standardNavigation: navigationRecord,
        attachBeforeVisibleSourceId: null,
      });
      continue;
    }

    const displayBook = compat.readerBook || parsed.book;
    const displayChapter = parsed.chapter;
    const displayVerseLabel = parsed.verseLabel;
    const displayReference = `${displayBook} ${displayChapter}:${displayVerseLabel}`;
    const displayCoordinate = `${displayBook}\u0000${displayChapter}\u0000${displayVerseLabel}`;

    if (visibleCoordinateSet.has(displayCoordinate)) {
      fail(`Duplicate visible reader coordinate: ${displayReference}`);
    }
    visibleCoordinateSet.add(displayCoordinate);

    readerVerses.push({
      schemaVersion: "brenton-reader-verse@1",
      id,
      translationId: "brenton",
      display: {
        bookId: parsed.bookId,
        book: displayBook,
        chapter: displayChapter,
        verseLabel: displayVerseLabel,
        numericVerse: parsed.verse,
        reference: displayReference,
      },
      source: sourceRecord.source,
      text: parsed.text,
      wordCount: parsed.wordCount,
      structureMarkers: parsed.structureMarkers,
      lxxOwnership: ownershipRecord,
      standardNavigation: navigationRecord,
      legacyCompatibility: compatibilityRecord,
    });
  }

  const readerIndex = new Map(
    readerVerses.map((record, index) => [record.id, index]),
  );

  for (const title of superscriptions) {
    const bookId = title.source.bookId;
    const chapter = title.source.chapter;
    const titleOrder = verseLabelSort(title.source.verseLabel);

    const next = readerVerses.find((verse) => {
      if (
        verse.source.bookId !== bookId ||
        verse.source.chapter !== chapter
      ) {
        return false;
      }

      const verseOrder = verseLabelSort(verse.source.verseLabel);

      return (
        verseOrder.number > titleOrder.number ||
        (verseOrder.number === titleOrder.number &&
          verseOrder.suffix.localeCompare(titleOrder.suffix) > 0)
      );
    });

    title.attachBeforeVisibleSourceId = next?.id || null;
  }

  for (const alias of aliases) {
    if (!readerIndex.has(alias.primarySourceId)) {
      fail(
        `Alias target is not a visible primary reader verse: ${alias.primarySourceId}`,
      );
    }
  }

  const sourcePartition =
    readerVerses.length + superscriptions.length + aliases.length;

  if (sourcePartition !== sourceSegments.length) {
    fail(
      `Source partition mismatch: ${JSON.stringify({
        sourceSegments: sourceSegments.length,
        readerVerses: readerVerses.length,
        superscriptions: superscriptions.length,
        aliases: aliases.length,
        partition: sourcePartition,
      })}`,
    );
  }

  const substantiveSourceIds = new Set(parsedVerses.map((parsed) =>
    sourceId(parsed.bookId, parsed.chapter, parsed.verseLabel),
  ));
  const footnotes = [];
  const sourceSegmentFootnotes = [];
  const nonSubstantiveSourceFootnotes = [];
  const crossReferences = [];
  const nonSubstantiveSourceCrossReferences = [];

  // Preserve notes from every parsed USFM verse record. P05.12P V1 only
  // iterated the 29,004 substantive text segments, while the certified source
  // contains one additional empty simple verse record. Notes on that record
  // are source metadata and must be preserved without inventing visible text
  // or attaching them to a different verse.
  for (const parsed of source.verses) {
    const candidateSourceId = sourceId(
      parsed.bookId,
      parsed.chapter,
      parsed.verseLabel,
    );
    const attachedToSubstantiveSegment =
      substantiveSourceIds.has(candidateSourceId);
    const metadataSourceRecordId = attachedToSubstantiveSegment
      ? candidateSourceId
      : `brenton-source-record:${parsed.bookId}:${parsed.chapter}:${parsed.verseLabel}`;

    parsed.footnotes.forEach((note, noteIndex) => {
      const record = {
        sourceId: attachedToSubstantiveSegment
          ? candidateSourceId
          : null,
        sourceRecordId: metadataSourceRecordId,
        sourceReference: parsed.reference,
        sourceBookId: parsed.bookId,
        sourceBook: parsed.book,
        sourceChapter: parsed.chapter,
        sourceVerseLabel: parsed.verseLabel,
        sourceWordCount: parsed.wordCount,
        sourceVisibleText: parsed.text,
        attachmentStatus: attachedToSubstantiveSegment
          ? "substantive-source-segment"
          : "non-substantive-source-record",
        noteIndex,
        marker: note.type,
        raw: note.raw,
        sourceFile: parsed.sourceFile,
        sourceLine: parsed.lineNumber,
      };

      footnotes.push(record);

      if (attachedToSubstantiveSegment) {
        sourceSegmentFootnotes.push(record);
      } else {
        nonSubstantiveSourceFootnotes.push(record);
      }
    });

    parsed.crossReferences.forEach((note, noteIndex) => {
      const record = {
        sourceId: attachedToSubstantiveSegment
          ? candidateSourceId
          : null,
        sourceRecordId: metadataSourceRecordId,
        sourceReference: parsed.reference,
        sourceBookId: parsed.bookId,
        sourceBook: parsed.book,
        sourceChapter: parsed.chapter,
        sourceVerseLabel: parsed.verseLabel,
        sourceWordCount: parsed.wordCount,
        sourceVisibleText: parsed.text,
        attachmentStatus: attachedToSubstantiveSegment
          ? "substantive-source-segment"
          : "non-substantive-source-record",
        noteIndex,
        marker: note.type,
        raw: note.raw,
        sourceFile: parsed.sourceFile,
        sourceLine: parsed.lineNumber,
      };

      crossReferences.push(record);

      if (!attachedToSubstantiveSegment) {
        nonSubstantiveSourceCrossReferences.push(record);
      }
    });
  }

  const danglingNotes = source.danglingNotes.map((note, noteIndex) => ({
    sourceRecordId: `brenton-dangling-note:${noteIndex}`,
    attachmentStatus: "dangling-usfm-note",
    noteIndex,
    marker: note.type,
    raw: note.raw,
    sourceFile: note.sourceFile,
  }));

  const bookChapterIndex = [];
  const chapters = new Map();

  for (const verse of readerVerses) {
    const key = `${verse.display.bookId}\u0000${verse.display.book}\u0000${verse.display.chapter}`;

    if (!chapters.has(key)) {
      chapters.set(key, {
        bookId: verse.display.bookId,
        book: verse.display.book,
        chapter: verse.display.chapter,
        verseIds: [],
        verseLabels: [],
      });
    }

    const chapter = chapters.get(key);
    chapter.verseIds.push(verse.id);
    chapter.verseLabels.push(verse.display.verseLabel);
  }

  for (const chapter of chapters.values()) {
    bookChapterIndex.push({
      ...chapter,
      verseCount: chapter.verseIds.length,
      firstVerseLabel: chapter.verseLabels[0] || null,
      lastVerseLabel:
        chapter.verseLabels[chapter.verseLabels.length - 1] || null,
    });
  }

  bookChapterIndex.sort(
    (left, right) =>
      (bookOrder.get(left.bookId) ?? 999) -
        (bookOrder.get(right.bookId) ?? 999) ||
      left.chapter - right.chapter,
  );

  const counts = {
    sourceSegments: sourceSegments.length,
    readerVerses: readerVerses.length,
    superscriptions: superscriptions.length,
    alternateAliases: aliases.length,
    readerBooks: new Set(readerVerses.map((row) => row.display.bookId)).size,
    readerChapters: bookChapterIndex.length,
    headings: source.headings.length,
    paragraphAndPoetryEvents: source.structures.length,
    footnotes: footnotes.length,
    sourceSegmentFootnotes: sourceSegmentFootnotes.length,
    nonSubstantiveSourceFootnotes:
      nonSubstantiveSourceFootnotes.length,
    danglingNotes: danglingNotes.length,
    crossReferences: crossReferences.length,
    nonSubstantiveSourceCrossReferences:
      nonSubstantiveSourceCrossReferences.length,
    visibleEntityRoutingEligible: readerVerses.filter(
      (row) => row.lxxOwnership.entityRoutingEligible,
    ).length,
    visibleTranslationOnlyWithoutGreek: readerVerses.filter(
      (row) =>
        row.lxxOwnership.classification ===
        "translation-only-no-locked-greek-source",
    ).length,
    visibleUnresolvedOwnership: readerVerses.filter(
      (row) =>
        row.lxxOwnership.classification ===
        "remaining-versification-coordinate-gap",
    ).length,
    visibleAliasTargets: readerVerses.filter((row) =>
      primaryAliasTargets.has(row.id),
    ).length,
  };

  return {
    sourceSegments,
    readerVerses,
    superscriptions,
    aliases,
    ownership,
    navigation,
    compatibility,
    headings: source.headings,
    structures: source.structures,
    footnotes,
    sourceSegmentFootnotes,
    nonSubstantiveSourceFootnotes,
    danglingNotes,
    crossReferences,
    nonSubstantiveSourceCrossReferences,
    bookChapterIndex,
    counts,
  };
}

function main() {
  const args = parseArgs(process.argv);
  ensureDir(args.output);

  const profilesPath = findLatestSourceProfiles(args.profiles);
  const profiles = readJson(profilesPath);
  const profile = profiles.translations?.brenton;

  if (
    profiles.milestone !== "P05.12C" ||
    !profile ||
    profile.validationPassed !== true
  ) {
    fail("Locked P05.12C Brenton source profile is missing or invalid.");
  }

  const upstream = loadUpstream();
  const certifiedPath = findCertifiedCensus();
  const certified = readJson(certifiedPath);
  const certifiedBrenton = certified.translations?.brenton;

  if (!certifiedBrenton) {
    fail("P05.12D certified Brenton census is missing.");
  }

  const sourceDirectory = toAbsoluteRepoPath(profile.rawSourcePath);
  const inventoryPath = findBrentonLockedInventory(profilesPath);
  const inventory = verifyLockedInventory(sourceDirectory, inventoryPath);

  if (
    !inventory.passed ||
    inventory.inventoryTreeSha256 !== profile.rawTreeSha256
  ) {
    fail(
      `Immutable Brenton source verification failed: ${JSON.stringify(
        inventory,
        null,
        2,
      )}`,
    );
  }

  const currentFiles = {
    brenton: path.join(
      ROOT,
      "app",
      "data",
      "scripture",
      "generatedBrenton.json",
    ),
    web: path.join(ROOT, "app", "data", "scripture", "generatedWEB.json"),
    kjv: path.join(ROOT, "app", "data", "scripture", "generatedKJV.json"),
  };

  const hashesBefore = Object.fromEntries(
    Object.entries(currentFiles).map(([name, filePath]) => [
      name,
      sha256File(filePath),
    ]),
  );

  if (
    hashesBefore.brenton !==
    upstream.l.summary.sources?.currentReader?.sha256Before
  ) {
    fail("Production Brenton changed after P05.12L.");
  }

  const lSourceArtifact = verifyStagedFile(
    upstream.l.summary.stagedArtifacts?.files?.sourceSegments,
    "P05.12L source segments",
  );
  const lNavigationArtifact = verifyStagedFile(
    upstream.l.summary.stagedArtifacts?.files?.standardNavigation,
    "P05.12L standard navigation",
  );
  const lCompatibilityArtifact = verifyStagedFile(
    upstream.l.summary.stagedArtifacts?.files?.readerCompatibility,
    "P05.12L reader compatibility",
  );
  const oAliasArtifact = verifyStagedFile(
    upstream.o.summary.stagedAliasMap,
    "P05.12O alias map",
  );

  const classifications = readCsv(
    path.join(
      upstream.m.root,
      "brenton-all-ownership-classifications.csv",
    ),
  );

  if (classifications.length !== 29004) {
    fail(
      `P05.12M classification file has ${classifications.length} rows; expected 29,004`,
    );
  }

  const includedIds = new Set(profile.includedBookIds || []);

  console.log("[P05.12P V2] Parsing immutable Brenton USFM...");
  const source = parseUsfmDirectory(
    sourceDirectory,
    "brenton",
    includedIds,
  );

  const actualSourceCounts = {
    books: source.scriptureDocuments.length,
    sourceSegments: source.verses.filter((verse) => verse.wordCount > 0)
      .length,
    headings: source.headings.length,
    paragraphAndPoetryEvents: source.structures.length,
    footnotes: source.verses.reduce(
      (sum, verse) => sum + verse.footnotes.length,
      0,
    ),
    substantiveVerseFootnotes: source.verses
      .filter((verse) => verse.wordCount > 0)
      .reduce((sum, verse) => sum + verse.footnotes.length, 0),
    nonSubstantiveVerseFootnotes: source.verses
      .filter((verse) => verse.wordCount === 0)
      .reduce((sum, verse) => sum + verse.footnotes.length, 0),
    danglingNotes: source.danglingNotes.length,
    emptySimpleVerseLabels: source.emptyVerses.length,
    crossReferences: source.verses.reduce(
      (sum, verse) => sum + verse.crossReferences.length,
      0,
    ),
    nonSubstantiveVerseCrossReferences: source.verses
      .filter((verse) => verse.wordCount === 0)
      .reduce((sum, verse) => sum + verse.crossReferences.length, 0),
  };

  const expectedSourceCounts = {
    books: certifiedBrenton.source.scriptureBooks,
    sourceSegments:
      upstream.l.summary.corpus?.sourceSegments,
    headings: certifiedBrenton.source.headings,
    paragraphAndPoetryEvents:
      certifiedBrenton.source.structureEvents,
    footnotes: certifiedBrenton.source.footnotes,
    danglingNotes: certifiedBrenton.source.danglingNotes,
    emptySimpleVerseLabels:
      certifiedBrenton.source.emptySimpleVerseLabels,
    crossReferences: certifiedBrenton.source.crossReferences,
  };

  for (const key of Object.keys(expectedSourceCounts)) {
    if (
      Number(actualSourceCounts[key]) !==
      Number(expectedSourceCounts[key])
    ) {
      fail(
        `Certified source count drift for ${key}: expected ${expectedSourceCounts[key]}, found ${actualSourceCounts[key]}`,
      );
    }
  }

  if (
    actualSourceCounts.substantiveVerseFootnotes +
      actualSourceCounts.nonSubstantiveVerseFootnotes !==
    actualSourceCounts.footnotes
  ) {
    fail(
      `Footnote source inventory does not reconcile: ${JSON.stringify(
        actualSourceCounts,
        null,
        2,
      )}`,
    );
  }

  console.log(
    `[P05.12P V2] Footnote source inventory: ${actualSourceCounts.substantiveVerseFootnotes} substantive + ${actualSourceCounts.nonSubstantiveVerseFootnotes} non-substantive = ${actualSourceCounts.footnotes}`,
  );

  const buildInputs = {
    source,
    profile,
    lSourceRows: readNdjson(lSourceArtifact.filePath),
    lNavigationRows: readNdjson(lNavigationArtifact.filePath),
    lCompatibilityRows: readNdjson(lCompatibilityArtifact.filePath),
    classifications,
    aliasRows: readNdjson(oAliasArtifact.filePath),
  };

  console.log("[P05.12P V2] Building deterministic reader candidate twice...");
  const first = buildCandidate(buildInputs);
  const second = buildCandidate(buildInputs);

  const fingerprintPayload = (candidate) =>
    [
      candidate.sourceSegments.map(JSON.stringify).join("\n"),
      candidate.readerVerses.map(JSON.stringify).join("\n"),
      candidate.superscriptions.map(JSON.stringify).join("\n"),
      candidate.aliases.map(JSON.stringify).join("\n"),
      candidate.ownership.map(JSON.stringify).join("\n"),
      candidate.navigation.map(JSON.stringify).join("\n"),
      candidate.compatibility.map(JSON.stringify).join("\n"),
      candidate.headings.map(JSON.stringify).join("\n"),
      candidate.structures.map(JSON.stringify).join("\n"),
      candidate.footnotes.map(JSON.stringify).join("\n"),
      candidate.nonSubstantiveSourceFootnotes
        .map(JSON.stringify)
        .join("\n"),
      candidate.danglingNotes.map(JSON.stringify).join("\n"),
      candidate.crossReferences.map(JSON.stringify).join("\n"),
      candidate.nonSubstantiveSourceCrossReferences
        .map(JSON.stringify)
        .join("\n"),
      stableJson(candidate.bookChapterIndex),
    ].join("\n---P05.12P-ARTIFACT---\n");

  const fingerprintOne = sha256Text(fingerprintPayload(first));
  const fingerprintTwo = sha256Text(fingerprintPayload(second));

  if (fingerprintOne !== fingerprintTwo) {
    fail("Brenton candidate build is not deterministic.");
  }

  const expectedCandidateCounts = {
    sourceSegments: 29004,
    readerVerses: 28548,
    superscriptions: 67,
    alternateAliases: 389,
    readerBooks: 53,
    headings: 166,
    paragraphAndPoetryEvents: 7052,
    footnotes: certifiedBrenton.source.footnotes,
    sourceSegmentFootnotes:
      actualSourceCounts.substantiveVerseFootnotes,
    nonSubstantiveSourceFootnotes:
      actualSourceCounts.nonSubstantiveVerseFootnotes,
    danglingNotes: certifiedBrenton.source.danglingNotes,
    crossReferences: certifiedBrenton.source.crossReferences,
    nonSubstantiveSourceCrossReferences:
      actualSourceCounts.nonSubstantiveVerseCrossReferences,
    visibleEntityRoutingEligible: 27216,
    visibleTranslationOnlyWithoutGreek: 1047,
    visibleUnresolvedOwnership: 285,
    visibleAliasTargets: 389,
  };

  for (const [key, expected] of Object.entries(expectedCandidateCounts)) {
    if (Number(first.counts[key]) !== Number(expected)) {
      fail(
        `Candidate count gate failed for ${key}: expected ${expected}, found ${first.counts[key]}`,
      );
    }
  }

  if (
    first.counts.sourceSegmentFootnotes +
      first.counts.nonSubstantiveSourceFootnotes !==
    first.counts.footnotes
  ) {
    fail(
      `Candidate footnote reconciliation failed: ${JSON.stringify(
        first.counts,
        null,
        2,
      )}`,
    );
  }

  const stagingRoot = path.join(
    ROOT,
    ".private",
    "generated",
    "P05.12",
    "brenton-reader-candidate",
    fingerprintOne.slice(0, 16),
  );

  if (fs.existsSync(stagingRoot)) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
  ensureDir(stagingRoot);

  const staged = {
    sourceSegments: writeNdjson(
      path.join(stagingRoot, "brenton-source-segments.candidate.ndjson"),
      first.sourceSegments,
    ),
    readerVerses: writeNdjson(
      path.join(stagingRoot, "brenton-reader-verses.candidate.ndjson"),
      first.readerVerses,
    ),
    superscriptions: writeNdjson(
      path.join(stagingRoot, "brenton-superscriptions.candidate.ndjson"),
      first.superscriptions,
    ),
    aliases: writeNdjson(
      path.join(
        stagingRoot,
        "brenton-alternate-source-aliases.candidate.ndjson",
      ),
      first.aliases,
    ),
    ownership: writeNdjson(
      path.join(stagingRoot, "brenton-lxx-ownership.candidate.ndjson"),
      first.ownership,
    ),
    navigation: writeNdjson(
      path.join(stagingRoot, "brenton-standard-navigation.candidate.ndjson"),
      first.navigation,
    ),
    compatibility: writeNdjson(
      path.join(stagingRoot, "brenton-legacy-compatibility.candidate.ndjson"),
      first.compatibility,
    ),
    headings: writeNdjson(
      path.join(stagingRoot, "brenton-headings.candidate.ndjson"),
      first.headings,
    ),
    structures: writeNdjson(
      path.join(
        stagingRoot,
        "brenton-paragraph-and-poetry.candidate.ndjson",
      ),
      first.structures,
    ),
    footnotes: writeNdjson(
      path.join(stagingRoot, "brenton-footnotes.candidate.ndjson"),
      first.footnotes,
    ),
    nonSubstantiveSourceFootnotes: writeNdjson(
      path.join(
        stagingRoot,
        "brenton-non-substantive-source-footnotes.candidate.ndjson",
      ),
      first.nonSubstantiveSourceFootnotes,
    ),
    danglingNotes: writeNdjson(
      path.join(stagingRoot, "brenton-dangling-notes.candidate.ndjson"),
      first.danglingNotes,
    ),
    crossReferences: writeNdjson(
      path.join(
        stagingRoot,
        "brenton-cross-references.candidate.ndjson",
      ),
      first.crossReferences,
    ),
    nonSubstantiveSourceCrossReferences: writeNdjson(
      path.join(
        stagingRoot,
        "brenton-non-substantive-source-cross-references.candidate.ndjson",
      ),
      first.nonSubstantiveSourceCrossReferences,
    ),
  };

  const indexPath = path.join(
    stagingRoot,
    "brenton-book-chapter-index.candidate.json",
  );
  fs.writeFileSync(
    indexPath,
    stableJson(first.bookChapterIndex),
    "utf8",
  );
  staged.bookChapterIndex = {
    path: indexPath,
    sha256: sha256File(indexPath),
    bytes: fs.statSync(indexPath).size,
    records: first.bookChapterIndex.length,
  };

  const schema = {
    schemaVersion: "brenton-reader-candidate@1",
    generatedAtUtc: new Date().toISOString(),
    identityRules: {
      sourceCoordinate:
        "Immutable Brenton USFM bookId/chapter/verseLabel",
      visibleReaderCoordinate:
        "Translation-local display book/chapter/string verseLabel",
      superscriptions:
        "Stored outside visible verse stream with source identity preserved",
      alternateSources:
        "Preserved in alias sidecar and suppressed from duplicate reader display",
      lxxOwnership:
        "Explicit nullable ownership sidecar; never inferred from navigation",
      standardNavigation:
        "Optional cross-translation route; never replaces source identity",
    },
    counts: first.counts,
    fingerprint: fingerprintOne,
  };
  const schemaPath = path.join(
    stagingRoot,
    "brenton-reader-schema.candidate.json",
  );
  fs.writeFileSync(schemaPath, stableJson(schema), "utf8");
  staged.schema = {
    path: schemaPath,
    sha256: sha256File(schemaPath),
    bytes: fs.statSync(schemaPath).size,
    records: 1,
  };

  const hashesAfter = Object.fromEntries(
    Object.entries(currentFiles).map(([name, filePath]) => [
      name,
      sha256File(filePath),
    ]),
  );

  for (const name of Object.keys(hashesBefore)) {
    if (hashesBefore[name] !== hashesAfter[name]) {
      fail(`Production ${name} reader changed during P05.12P.`);
    }
  }

  const summary = {
    milestone: "P05.12P",
    schemaVersion: "brenton-deduplicated-reader-candidate@1",
    generatedAtUtc: new Date().toISOString(),
    status:
      "deduplicated-source-faithful-brenton-reader-candidate-v2-complete",
    repository: {
      branch: git(["branch", "--show-current"]),
      commit: git(["rev-parse", "HEAD"]),
    },
    sources: {
      sourceProfile: {
        path: relative(ROOT, profilesPath),
        sha256: sha256File(profilesPath),
        rawSourcePath: profile.rawSourcePath,
        rawTreeSha256: profile.rawTreeSha256,
        inventoryFiles: inventory.expectedFiles,
      },
      certifiedCensus: {
        path: relative(ROOT, certifiedPath),
        sha256: sha256File(certifiedPath),
      },
      p0512l: {
        report: relative(ROOT, upstream.l.root),
        checksumsVerified: upstream.l.checksums.checked,
        summarySha256: sha256File(upstream.l.summaryPath),
      },
      p0512m: {
        report: relative(ROOT, upstream.m.root),
        checksumsVerified: upstream.m.checksums.checked,
        summarySha256: sha256File(upstream.m.summaryPath),
      },
      p0512o: {
        report: relative(ROOT, upstream.o.root),
        checksumsVerified: upstream.o.checksums.checked,
        summarySha256: sha256File(upstream.o.summaryPath),
        aliasFingerprint:
          upstream.o.summary.stagedAliasMap?.fingerprint,
      },
    },
    sourceCounts: actualSourceCounts,
    candidateCounts: first.counts,
    footnoteReconciliation: {
      certifiedFootnotes: certifiedBrenton.source.footnotes,
      substantiveSourceSegmentFootnotes:
        first.counts.sourceSegmentFootnotes,
      nonSubstantiveSourceRecordFootnotes:
        first.counts.nonSubstantiveSourceFootnotes,
      danglingNotes: first.counts.danglingNotes,
      reconciled:
        first.counts.sourceSegmentFootnotes +
          first.counts.nonSubstantiveSourceFootnotes ===
        first.counts.footnotes,
      nonSubstantiveRecords:
        first.nonSubstantiveSourceFootnotes,
    },
    partition: {
      sourceSegments: first.sourceSegments.length,
      readerVerses: first.readerVerses.length,
      superscriptions: first.superscriptions.length,
      alternateAliases: first.aliases.length,
      balanced:
        first.readerVerses.length +
          first.superscriptions.length +
          first.aliases.length ===
        first.sourceSegments.length,
    },
    stagedCandidate: {
      root: relative(ROOT, stagingRoot),
      fingerprint: fingerprintOne,
      repeatedBuildFingerprint: fingerprintTwo,
      files: Object.fromEntries(
        Object.entries(staged).map(([name, info]) => [
          name,
          {
            path: relative(ROOT, info.path),
            sha256: info.sha256,
            bytes: info.bytes,
            records: info.records,
          },
        ]),
      ),
    },
    productionHashes: {
      before: hashesBefore,
      after: hashesAfter,
    },
    gates: {
      immutableSourceInventoryVerified: true,
      certifiedSourceCountsReproduced: true,
      upstreamReportsChecksumsValid: true,
      deterministicRepeatedBuild: true,
      all29004SourceSegmentsPreservedExactlyOnce: true,
      readerSourcePartitionBalanced: true,
      duplicateNehemiahReaderRowsSuppressed: true,
      all389AlternateSourcesPreservedAsAliases: true,
      all67SuperscriptionsSeparated: true,
      all2596FootnotesPreserved:
        first.counts.footnotes === certifiedBrenton.source.footnotes,
      substantiveAndNonSubstantiveFootnotesReconciled:
        first.counts.sourceSegmentFootnotes +
          first.counts.nonSubstantiveSourceFootnotes ===
        first.counts.footnotes,
      nonSubstantiveFootnotesPreservedWithoutFalseVerseAttachment: true,
      all150CrossReferencesPreserved:
        first.counts.crossReferences ===
        certifiedBrenton.source.crossReferences,
      all166HeadingsPreserved: true,
      all7052StructureEventsPreserved: true,
      explicitTappabilityEligibilityPreserved: true,
      productionBrentonModified: false,
      productionWebModified: false,
      productionKjvModified: false,
      lxxCanonicalModified: false,
      alignmentsModified: false,
      safeToAuditReaderSchemaAdapter: true,
      safeToApplyProductionBrenton: false,
      reason:
        "The candidate is complete and source-faithful, but production still uses a numeric-only legacy reader contract. A reader-schema adapter and route/runtime audit must pass before any transactional apply.",
    },
  };

  writeJson(
    path.join(args.output, "brenton-reader-candidate-summary.json"),
    summary,
  );

  writeCsv(
    path.join(args.output, "brenton-candidate-book-chapter-census.csv"),
    first.bookChapterIndex.map((row) => ({
      bookId: row.bookId,
      book: row.book,
      chapter: row.chapter,
      verseCount: row.verseCount,
      firstVerseLabel: row.firstVerseLabel,
      lastVerseLabel: row.lastVerseLabel,
    })),
    [
      "bookId",
      "book",
      "chapter",
      "verseCount",
      "firstVerseLabel",
      "lastVerseLabel",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-footnote-reconciliation.csv"),
    first.footnotes.map((note) => ({
      sourceRecordId: note.sourceRecordId,
      sourceId: note.sourceId,
      sourceReference: note.sourceReference,
      sourceBookId: note.sourceBookId,
      sourceChapter: note.sourceChapter,
      sourceVerseLabel: note.sourceVerseLabel,
      sourceWordCount: note.sourceWordCount,
      attachmentStatus: note.attachmentStatus,
      noteIndex: note.noteIndex,
      marker: note.marker,
      raw: note.raw,
      sourceFile: note.sourceFile,
      sourceLine: note.sourceLine,
    })),
    [
      "sourceRecordId",
      "sourceId",
      "sourceReference",
      "sourceBookId",
      "sourceChapter",
      "sourceVerseLabel",
      "sourceWordCount",
      "attachmentStatus",
      "noteIndex",
      "marker",
      "raw",
      "sourceFile",
      "sourceLine",
    ],
  );

  writeCsv(
    path.join(
      args.output,
      "brenton-non-substantive-footnote-resolution.csv",
    ),
    first.nonSubstantiveSourceFootnotes,
    [
      "sourceRecordId",
      "sourceId",
      "sourceReference",
      "sourceBookId",
      "sourceBook",
      "sourceChapter",
      "sourceVerseLabel",
      "sourceWordCount",
      "sourceVisibleText",
      "attachmentStatus",
      "noteIndex",
      "marker",
      "raw",
      "sourceFile",
      "sourceLine",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-candidate-excluded-from-tappability.csv"),
    first.readerVerses
      .filter((row) => !row.lxxOwnership.entityRoutingEligible)
      .map((row) => ({
        id: row.id,
        reference: row.display.reference,
        classification: row.lxxOwnership.classification,
        exclusionReason: row.lxxOwnership.exclusionReason,
        text: row.text,
      })),
    ["id", "reference", "classification", "exclusionReason", "text"],
  );

  ensureDir(path.join(args.output, "samples"));
  const psalm4 = [
    ...first.superscriptions.filter(
      (row) =>
        row.source.bookId === "PSA" &&
        row.source.chapter === 4,
    ),
    ...first.readerVerses.filter(
      (row) =>
        row.source.bookId === "PSA" &&
        row.source.chapter === 4,
    ),
  ];

  const sampleLines = [
    "# Brenton Psalm 4 candidate",
    "",
    "| Type | Source | Display/navigation | Ownership | Text |",
    "|---|---|---|---|---|",
    ...psalm4.map((row) => {
      if (row.schemaVersion === "brenton-superscription@1") {
        return `| superscription | ${row.source.reference} | ${
          row.standardNavigation.targets.join(" | ") ||
          row.standardNavigation.status
        } | ${
          row.lxxOwnership.authoritativeOwnershipKey || "none"
        } | ${row.text.replace(/\|/g, "\\|")} |`;
      }

      return `| verse | ${row.source.reference} | ${
        row.display.reference
      } | ${
        row.lxxOwnership.authoritativeOwnershipKey || "none"
      } | ${row.text.replace(/\|/g, "\\|")} |`;
    }),
    "",
  ];

  fs.writeFileSync(
    path.join(args.output, "samples", "brenton-psalm-4-reader-candidate.md"),
    sampleLines.join("\n"),
    "utf8",
  );

  const readme = [
    "# EMETSEES P05.12P Deduplicated Brenton Reader Candidate",
    "",
    `Generated: ${summary.generatedAtUtc}`,
    "",
    "This candidate is rebuilt from immutable Brenton USFM. It does not copy visible Scripture text from the current reader.",
    "",
    "## Candidate",
    "",
    `- Full authoritative source segments preserved: ${first.counts.sourceSegments}`,
    `- Visible reader verses: ${first.counts.readerVerses}`,
    `- Superscriptions separated: ${first.counts.superscriptions}`,
    `- Alternate Ezra-Nehemiah source aliases preserved: ${first.counts.alternateAliases}`,
    `- Reader books: ${first.counts.readerBooks}`,
    `- Footnotes: ${first.counts.footnotes}`,
    `- Footnotes on substantive source segments: ${first.counts.sourceSegmentFootnotes}`,
    `- Footnotes on non-substantive source records: ${first.counts.nonSubstantiveSourceFootnotes}`,
    `- Dangling USFM notes: ${first.counts.danglingNotes}`,
    `- Cross-references: ${first.counts.crossReferences}`,
    `- Headings: ${first.counts.headings}`,
    `- Paragraph/poetry events: ${first.counts.paragraphAndPoetryEvents}`,
    "",
    "## Tappability",
    "",
    `- Explicit LXX source ownership: ${first.counts.visibleEntityRoutingEligible}`,
    `- Translation-only verses without locked Greek source: ${first.counts.visibleTranslationOnlyWithoutGreek}`,
    `- Visible verses with unresolved ownership: ${first.counts.visibleUnresolvedOwnership}`,
    "",
    "## Safety",
    "",
    "- Production Brenton was not modified.",
    "- Production WEB and KJV were not modified.",
    "- Greek LXX canonical data was not modified.",
    "- Display tokens and alignments were not rebuilt.",
    "- The candidate is not compatible with the legacy numeric-only reader until the adapter milestone passes.",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(args.output, "README.md"), readme, "utf8");
  writeChecksums(args.output);

  console.log("");
  console.log("[P05.12P V2] Deduplicated Brenton reader candidate complete.");
  console.log(`[P05.12P V2] Source segments preserved: ${first.counts.sourceSegments}`);
  console.log(`[P05.12P V2] Visible reader verses: ${first.counts.readerVerses}`);
  console.log(`[P05.12P V2] Superscriptions separated: ${first.counts.superscriptions}`);
  console.log(`[P05.12P V2] Alternate aliases preserved: ${first.counts.alternateAliases}`);
  console.log(`[P05.12P V2] Footnotes preserved: ${first.counts.footnotes}`);
  console.log(`[P05.12P V2] Cross-references preserved: ${first.counts.crossReferences}`);
  console.log("[P05.12P V2] Production Brenton modified: NO");
  console.log("[P05.12P V2] Alignments modified: NO");
  console.log(`OUTPUT_DIR=${args.output}`);
}

try {
  main();
} catch (error) {
  const rendered = error?.stack || String(error);
  console.error(rendered);

  try {
    const outputIndex = process.argv.indexOf("--output");
    const output =
      outputIndex >= 0 && process.argv[outputIndex + 1]
        ? path.resolve(process.argv[outputIndex + 1])
        : path.join(ROOT, ".private", "reports", "P05.12", "p0512p-fatal");

    ensureDir(output);
    fs.writeFileSync(
      path.join(output, "fatal-error.txt"),
      rendered + "\n",
      "utf8",
    );
  } catch {
    // Preserve original failure.
  }

  process.exit(1);
}
