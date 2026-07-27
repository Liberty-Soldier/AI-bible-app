#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.cwd();

function fail(message) {
  throw new Error(`[P05.12F WEB production rebuild] ${message}`);
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
    approvedManifest: "",
    apply: false,
    skipBuild: false,
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
    } else if (arg === "--approved-manifest" && next) {
      args.approvedManifest = path.resolve(next);
      index += 1;
    } else if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--skip-build") {
      args.skipBuild = true;
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
      `Reader record ${clone.reference || clone.id || "(unknown)"} has neither text nor sources.`,
    );
  }

  let index = clone.sources.findIndex(
    (source) => source && String(source.language || "").toLowerCase() === "english",
  );
  if (index < 0 && clone.sources.length === 1) index = 0;
  if (index < 0) {
    fail(
      `Reader record ${clone.reference || clone.id || "(unknown)"} has no unambiguous English source.`,
    );
  }

  if (!clone.sources[index] || typeof clone.sources[index] !== "object") {
    fail(
      `Reader record ${clone.reference || clone.id || "(unknown)"} has an invalid English source.`,
    );
  }

  clone.sources[index].text = visibleText;
  return clone;
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

function stableJsonText(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function buildWebArtifacts({
  profile,
  profilesPath,
  certifiedPath,
  certifiedSummary,
  currentPath,
  currentDocument,
  current,
  source,
}) {
  const bookOrder = new Map(
    (profile.includedBookIds || []).map((bookId, index) => [bookId, index]),
  );

  const simpleVerses = source.verses
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
        (bookOrder.get(a.bookId) ?? 999) - (bookOrder.get(b.bookId) ?? 999) ||
        a.chapter - b.chapter ||
        a.verse - b.verse ||
        a.lineNumber - b.lineNumber,
    );

  const sourceByKey = new Map();
  for (const verse of simpleVerses) {
    const key = sourceKey(verse);
    if (!key) fail(`Unable to create WEB source key for ${verse.reference}`);
    if (sourceByKey.has(key)) fail(`Duplicate WEB source key: ${key}`);
    sourceByKey.set(key, verse);
  }

  if (sourceByKey.size !== current.records.length) {
    fail(
      `WEB source/current inventory mismatch: source=${sourceByKey.size}, current=${current.records.length}`,
    );
  }

  const currentRawByKey = new Map();
  for (const record of current.records) {
    if (currentRawByKey.has(record.key)) fail(`Duplicate current WEB key: ${record.key}`);
    currentRawByKey.set(record.key, currentDocument[record.index]);
  }

  const missingCurrent = Array.from(sourceByKey.keys()).filter(
    (key) => !currentRawByKey.has(key),
  );
  const extraCurrent = Array.from(currentRawByKey.keys()).filter(
    (key) => !sourceByKey.has(key),
  );
  if (missingCurrent.length || extraCurrent.length) {
    fail(
      `WEB reader/source key mismatch: ${JSON.stringify({
        missingCurrent: missingCurrent.slice(0, 20),
        extraCurrent: extraCurrent.slice(0, 20),
      })}`,
    );
  }

  const visibleRows = [];
  const headingRows = source.headings
    .slice()
    .sort(
      (a, b) =>
        (bookOrder.get(a.bookId) ?? 999) - (bookOrder.get(b.bookId) ?? 999) ||
        Number(a.chapter || 0) - Number(b.chapter || 0) ||
        Number(a.lineNumber || 0) - Number(b.lineNumber || 0),
    )
    .map((heading, index) => ({
      id: `web-heading-${String(index + 1).padStart(6, "0")}`,
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
        (bookOrder.get(a.bookId) ?? 999) - (bookOrder.get(b.bookId) ?? 999) ||
        Number(a.chapter || 0) - Number(b.chapter || 0) ||
        Number(a.lineNumber || 0) - Number(b.lineNumber || 0),
    )
    .map((event, index) => ({
      id: `web-structure-${String(index + 1).padStart(7, "0")}`,
      bookId: event.bookId,
      book: event.book,
      chapter: event.chapter,
      sourceVerse: event.verse || null,
      marker: event.marker,
      trailingVisibleText: event.trailingText || "",
      sourceFile: event.sourceFile,
      sourceLine: event.lineNumber,
    }));

  const footnoteRows = [];
  const crossReferenceRows = [];
  const strongRows = [];
  const sourceOnlyVerseRows = [];
  const versificationRows = [];
  const changedRows = [];
  const candidateByKey = new Map();

  for (const verse of simpleVerses) {
    const key = sourceKey(verse);
    const currentRecord = current.byKey.get(key);
    const rawRecord = currentRawByKey.get(key);
    if (!currentRecord || !rawRecord) fail(`Missing current WEB record for ${verse.reference}`);

    const candidateRecord = replaceEnglishText(rawRecord, verse.text);
    candidateByKey.set(key, candidateRecord);

    const comparison = classifyPair(verse, currentRecord);
    if (
      comparison.classification !== "exact" &&
      comparison.classification !== "typography-or-punctuation-only"
    ) {
      changedRows.push({
        reference: verse.reference,
        classification: comparison.classification,
        severity: comparison.severity,
        currentWordCount: currentRecord.wordCount,
        sourceWordCount: verse.wordCount,
        wordDelta: verse.wordCount - currentRecord.wordCount,
        confirmedMissingWords: comparison.confirmedMissingWords,
        currentText: currentRecord.text,
        sourceText: verse.text,
        sourceFile: verse.sourceFile,
        sourceLine: verse.lineNumber,
      });
    }

    visibleRows.push({
      translationId: "web",
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
      translationId: "web",
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
        translationId: "web",
        reference: currentRecord.reference,
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
        translationId: "web",
        reference: currentRecord.reference,
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
        translationId: "web",
        reference: currentRecord.reference,
        sourceReference: verse.reference,
        readerReference: currentRecord.reference,
        ownership: "reader-verse",
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

  const emptySourceVerses = source.emptyVerses
    .slice()
    .sort(
      (a, b) =>
        (bookOrder.get(a.bookId) ?? 999) - (bookOrder.get(b.bookId) ?? 999) ||
        Number(a.chapter || 0) - Number(b.chapter || 0) ||
        Number(a.verse || 0) - Number(b.verse || 0) ||
        Number(a.lineNumber || 0) - Number(b.lineNumber || 0),
    );

  for (const verse of emptySourceVerses) {
    sourceOnlyVerseRows.push({
      translationId: "web",
      source: {
        bookId: verse.bookId,
        bookName: verse.sourceBookName,
        chapter: verse.chapter,
        verseLabel: verse.verseLabel,
        reference: verse.reference,
        sourceFile: verse.sourceFile,
        sourceLine: verse.lineNumber,
      },
      reader: null,
      mappingStatus: "source-only-empty-verse-label",
      visibleText: "",
      visibleWordCount: 0,
      footnoteCount: verse.footnotes.length,
      crossReferenceCount: verse.crossReferences.length,
      strongTagCount: verse.wordMetadata.length,
      structureMarkers: verse.structureMarkers,
    });

    verse.footnotes.forEach((note, noteIndex) => {
      footnoteRows.push({
        translationId: "web",
        reference: verse.reference,
        sourceReference: verse.reference,
        readerReference: null,
        ownership: "source-only-empty-verse-label",
        noteIndex,
        marker: note.type,
        raw: note.raw,
        sourceFile: verse.sourceFile,
        sourceLine: verse.lineNumber,
      });
    });

    verse.crossReferences.forEach((note, noteIndex) => {
      crossReferenceRows.push({
        translationId: "web",
        reference: verse.reference,
        sourceReference: verse.reference,
        readerReference: null,
        ownership: "source-only-empty-verse-label",
        noteIndex,
        marker: note.type,
        raw: note.raw,
        sourceFile: verse.sourceFile,
        sourceLine: verse.lineNumber,
      });
    });

    if (verse.wordMetadata.length) {
      strongRows.push({
        translationId: "web",
        reference: verse.reference,
        sourceReference: verse.reference,
        readerReference: null,
        ownership: "source-only-empty-verse-label",
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
    const currentRecord = current.records.find((record) => record.index === index);
    if (!currentRecord) {
      fail(`WEB reader candidate encountered an unprofiled record at index ${index}`);
    }
    const replacement = candidateByKey.get(currentRecord.key);
    if (!replacement) fail(`No candidate WEB replacement for ${currentRecord.reference}`);
    return replacement;
  });

  const candidateText = stableJsonText(candidateDocument);

  return {
    visibleRows,
    headingRows,
    structureRows,
    footnoteRows,
    crossReferenceRows,
    strongRows,
    sourceOnlyVerseRows,
    versificationRows,
    changedRows,
    candidateDocument,
    candidateText,
    deterministicFingerprint: sha256Text(
      [
        visibleRows.map(JSON.stringify).join("\n"),
        headingRows.map(JSON.stringify).join("\n"),
        structureRows.map(JSON.stringify).join("\n"),
        footnoteRows.map(JSON.stringify).join("\n"),
        crossReferenceRows.map(JSON.stringify).join("\n"),
        strongRows.map(JSON.stringify).join("\n"),
        sourceOnlyVerseRows.map(JSON.stringify).join("\n"),
        versificationRows.map(JSON.stringify).join("\n"),
        candidateText,
      ].join("\n---ARTIFACT---\n"),
    ),
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
  files.sourceOnlyVerseLabels = writeNdjson(
    path.join(stagingRoot, "source-only-empty-verse-labels.ndjson"),
    artifacts.sourceOnlyVerseRows,
  );
  files.versification = writeNdjson(
    path.join(stagingRoot, "source-reader-versification.ndjson"),
    artifacts.versificationRows,
  );

  const candidatePath = path.join(stagingRoot, "generatedWEB.candidate.json");
  fs.writeFileSync(candidatePath, artifacts.candidateText, "utf8");
  files.readerCandidate = {
    path: candidatePath,
    sha256: sha256Text(artifacts.candidateText),
    bytes: Buffer.byteLength(artifacts.candidateText, "utf8"),
    records: artifacts.candidateDocument.length,
  };

  return files;
}

function makePsalm4Preview(artifacts) {
  const rows = artifacts.visibleRows.filter(
    (row) => row.reader.book === "Psalms" && row.reader.chapter === 4,
  );
  const lines = [
    "# WEB Psalm 4 — staged importer preview",
    "",
    "The candidate text below comes directly from the locked USFM source. No production file was changed.",
    "",
  ];

  for (const row of rows) {
    lines.push(
      `## ${row.reader.reference}`,
      "",
      row.visibleText,
      "",
    );
  }

  return lines.join("\n");
}

function sourceOnlyVerseLabelsMarkdown(artifacts) {
  const lines = [
    "# WEB source-only empty verse labels",
    "",
    "These source labels intentionally have no visible reader verse text. Their footnotes and other metadata are preserved separately rather than discarded or inserted into Scripture text.",
    "",
  ];

  for (const row of artifacts.sourceOnlyVerseRows) {
    lines.push(
      `## ${row.source.reference}`,
      "",
      `- Mapping status: ${row.mappingStatus}`,
      `- Footnotes: ${row.footnoteCount}`,
      `- Cross-references: ${row.crossReferenceCount}`,
      `- Strong's tags: ${row.strongTagCount}`,
      `- Source: ${row.source.sourceFile}:${row.source.sourceLine}`,
      "",
    );
  }

  return lines.join("\n");
}

function topRestorationsMarkdown(changedRows) {
  const rows = changedRows
    .slice()
    .sort(
      (a, b) =>
        b.wordDelta - a.wordDelta ||
        b.confirmedMissingWords - a.confirmedMissingWords ||
        a.reference.localeCompare(b.reference),
    )
    .slice(0, 100);

  const lines = [
    "# WEB highest word-restoration candidates",
    "",
    "These are preview differences between the current reader text and the locked USFM source.",
    "",
  ];

  for (const row of rows) {
    lines.push(
      `## ${row.reference}`,
      "",
      `- Classification: ${row.classification}`,
      `- Current words: ${row.currentWordCount}`,
      `- Staged source words: ${row.sourceWordCount}`,
      `- Net restoration: ${row.wordDelta}`,
      "",
      `**Current:** ${row.currentText}`,
      "",
      `**Staged:** ${row.sourceText}`,
      "",
    );
  }

  return lines.join("\n");
}


function findLatestApprovedWebManifest(explicitPath) {
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      fail(`Approved P05.12E manifest not found: ${explicitPath}`);
    }
    return explicitPath;
  }

  const reportRoot = path.join(ROOT, ".private", "reports", "P05.12");
  const candidates = walk(
    reportRoot,
    (filePath) => path.basename(filePath) === "staging-manifest.json",
  ).filter((filePath) => {
    try {
      const value = readJson(filePath);
      return (
        value?.milestone === "P05.12E" &&
        value?.schemaVersion === "web-translation-ingestion@1.1" &&
        value?.gates?.candidateVisibleTextExactToSource === true &&
        value?.gates?.metadataInventoryExactToSource === true &&
        value?.gates?.sourceOnlyEmptyVerseLabelsPreserved === true &&
        value?.gates?.productionReaderModified === false
      );
    } catch {
      return false;
    }
  });

  if (!candidates.length) {
    fail(
      `No approved P05.12E V2 staging-manifest.json found under ${relative(ROOT, reportRoot)}`,
    );
  }

  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0];
}

function runRepositoryBuild(skipBuild) {
  if (skipBuild) {
    return {
      command: "SKIPPED",
      status: 0,
      skipped: true,
    };
  }

  const childProcess = require("child_process");
  let command;
  let commandArgs;
  let displayCommand;

  if (process.platform === "win32") {
    command = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";
    commandArgs = ["/d", "/s", "/c", "npm run build"];
    displayCommand = `${command} /d /s /c "npm run build"`;
  } else {
    command = "npm";
    commandArgs = ["run", "build"];
    displayCommand = "npm run build";
  }

  const result = childProcess.spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: "inherit",
    windowsHide: false,
    shell: false,
    env: process.env,
  });

  if (result.error) {
    throw new Error(
      `Unable to launch repository build with ${displayCommand}: ${result.error.stack || result.error}`,
    );
  }

  if (result.signal) {
    throw new Error(
      `Repository build was terminated by signal ${result.signal}.`,
    );
  }

  return {
    command: displayCommand,
    status: Number(result.status ?? 1),
    skipped: false,
  };
}

function verifiedFileHash(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Required file is missing: ${relative(ROOT, filePath)}`);
  }
  return sha256File(filePath);
}

function validateApprovedManifest(approved) {
  const requiredTrueGates = [
    "sourceTreeImmutable",
    "sourceProfileValid",
    "currentReaderHashMatchesCertifiedCensus",
    "importerDeterministicAcrossTwoBuilds",
    "candidateVerseInventoryExact",
    "candidateVisibleTextExactToSource",
    "metadataInventoryExactToSource",
    "sourceOnlyEmptyVerseLabelsPreserved",
  ];

  if (approved.milestone !== "P05.12E") {
    fail(`Expected P05.12E approved manifest, found ${approved.milestone}`);
  }

  if (approved.schemaVersion !== "web-translation-ingestion@1.1") {
    fail(
      `Expected approved WEB ingestion schema 1.1, found ${approved.schemaVersion}`,
    );
  }

  for (const gate of requiredTrueGates) {
    if (approved.gates?.[gate] !== true) {
      fail(`Approved P05.12E gate is not true: ${gate}`);
    }
  }

  if (approved.gates?.productionReaderModified !== false) {
    fail("Approved P05.12E report did not preserve the production reader.");
  }

  if (approved.counts?.candidateSubstantiveDifferences !== 0) {
    fail("Approved P05.12E candidate has substantive text differences.");
  }
}

function assertCount(name, actual, expected) {
  if (Number(actual) !== Number(expected)) {
    fail(`${name} mismatch: expected ${expected}, found ${actual}`);
  }
}

function atomicPromoteReader({
  currentPath,
  candidateText,
  candidateSha256,
  backupRoot,
  skipBuild,
}) {
  ensureDir(backupRoot);

  const currentSha256Before = sha256File(currentPath);
  const backupPath = path.join(backupRoot, "generatedWEB.before.json");
  const siblingRollback = `${currentPath}.p0512.rollback`;
  const siblingCandidate = `${currentPath}.p0512.candidate`;

  if (fs.existsSync(siblingRollback) || fs.existsSync(siblingCandidate)) {
    fail(
      `A prior P05.12F transaction file exists beside generatedWEB.json. ` +
      `Do not delete it blindly. Files present: ${JSON.stringify({
        rollback: fs.existsSync(siblingRollback),
        candidate: fs.existsSync(siblingCandidate),
      })}`,
    );
  }

  fs.copyFileSync(currentPath, backupPath);
  if (sha256File(backupPath) !== currentSha256Before) {
    fail("The pre-apply WEB backup hash does not match generatedWEB.json.");
  }

  if (currentSha256Before === candidateSha256) {
    const build = runRepositoryBuild(skipBuild);
    if (build.status !== 0) {
      fail(`Repository build failed with exit code ${build.status}.`);
    }

    return {
      applied: false,
      idempotent: true,
      backupPath,
      currentSha256Before,
      currentSha256After: currentSha256Before,
      build,
    };
  }

  fs.writeFileSync(siblingCandidate, candidateText, "utf8");
  if (sha256File(siblingCandidate) !== candidateSha256) {
    fs.rmSync(siblingCandidate, { force: true });
    fail("The sibling WEB candidate hash is incorrect before promotion.");
  }

  let oldMoved = false;
  let newInstalled = false;

  try {
    fs.renameSync(currentPath, siblingRollback);
    oldMoved = true;

    fs.renameSync(siblingCandidate, currentPath);
    newInstalled = true;

    const installedHash = sha256File(currentPath);
    if (installedHash !== candidateSha256) {
      fail(
        `Installed WEB reader hash mismatch: expected ${candidateSha256}, found ${installedHash}`,
      );
    }

    const build = runRepositoryBuild(skipBuild);
    if (build.status !== 0) {
      fail(`Repository build failed with exit code ${build.status}.`);
    }

    fs.rmSync(siblingRollback, { force: true });

    return {
      applied: true,
      idempotent: false,
      backupPath,
      currentSha256Before,
      currentSha256After: installedHash,
      build,
    };
  } catch (error) {
    try {
      if (newInstalled && fs.existsSync(currentPath)) {
        fs.rmSync(currentPath, { force: true });
      }

      if (oldMoved && fs.existsSync(siblingRollback)) {
        fs.renameSync(siblingRollback, currentPath);
      }

      if (fs.existsSync(siblingCandidate)) {
        fs.rmSync(siblingCandidate, { force: true });
      }
    } catch (rollbackError) {
      throw new Error(
        `${error?.stack || error}\nROLLBACK ALSO FAILED: ${rollbackError?.stack || rollbackError}`,
      );
    }

    if (!fs.existsSync(currentPath) || sha256File(currentPath) !== currentSha256Before) {
      throw new Error(
        `${error?.stack || error}\nROLLBACK VERIFICATION FAILED for generatedWEB.json`,
      );
    }

    throw error;
  }
}

function main() {
  const args = parseArgs(process.argv);
  ensureDir(args.output);

  if (!args.apply) {
    fail("P05.12F requires the explicit --apply flag.");
  }

  const profilesPath = findLatestSourceProfiles(args.profiles);
  const profiles = readJson(profilesPath);
  const webProfile = profiles.translations?.web;

  if (profiles.milestone !== "P05.12C" || webProfile?.validationPassed !== true) {
    fail("The locked P05.12C WEB source profile is missing or invalid.");
  }

  const approvedManifestPath = findLatestApprovedWebManifest(
    args.approvedManifest,
  );
  const approved = readJson(approvedManifestPath);
  validateApprovedManifest(approved);

  const sourceDirectory = toAbsoluteRepoPath(webProfile.rawSourcePath);
  const currentPath = path.join(
    ROOT,
    "app",
    "data",
    "scripture",
    "generatedWEB.json",
  );
  const kjvPath = path.join(
    ROOT,
    "app",
    "data",
    "scripture",
    "generatedKJV.json",
  );
  const brentonPath = path.join(
    ROOT,
    "app",
    "data",
    "scripture",
    "generatedBrenton.json",
  );

  const criticalHashesBefore = {
    web: verifiedFileHash(currentPath),
    kjv: verifiedFileHash(kjvPath),
    brenton: verifiedFileHash(brentonPath),
  };

  const approvedOldHash = approved.inputs?.currentReaderSha256;
  const approvedCandidateHash =
    approved.output?.files?.readerCandidate?.sha256;

  if (!approvedCandidateHash) {
    fail("Approved P05.12E manifest has no reader-candidate SHA-256.");
  }

  if (
    criticalHashesBefore.web !== approvedOldHash &&
    criticalHashesBefore.web !== approvedCandidateHash
  ) {
    fail(
      `generatedWEB.json does not match either the approved pre-apply hash or approved candidate hash: ${criticalHashesBefore.web}`,
    );
  }

  const actualTreeHash = computeTreeSha256(sourceDirectory);
  if (actualTreeHash !== webProfile.rawTreeSha256) {
    fail(
      `Locked WEB source tree changed: expected ${webProfile.rawTreeSha256}, found ${actualTreeHash}`,
    );
  }

  if (
    approved.source?.rawTreeSha256 !== webProfile.rawTreeSha256 ||
    approved.source?.rawArchiveSha256 !== webProfile.rawArchiveSha256
  ) {
    fail("The approved P05.12E source identity does not match P05.12C.");
  }

  const includedIds = new Set(webProfile.includedBookIds || []);
  const allowedBooks = new Set(
    Array.from(includedIds)
      .map((bookId) => ID_TO_BOOK[bookId])
      .filter(Boolean),
  );

  console.log("[P05.12F] Parsing locked WEB source...");
  const source = parseUsfmDirectory(sourceDirectory, "web", includedIds);

  console.log("[P05.12F] Rebuilding WEB candidate from immutable source...");
  const currentDocument = readJson(currentPath);
  const current = loadCurrentTranslation(currentPath, "web", allowedBooks);

  if (
    current.invalid.length ||
    current.duplicates.length ||
    current.excludedProfileRecords.length
  ) {
    fail(
      `Current WEB schema preflight failed: ${JSON.stringify({
        invalid: current.invalid.length,
        duplicates: current.duplicates.length,
        excludedProfileRecords: current.excludedProfileRecords.length,
      })}`,
    );
  }

  const buildOne = buildWebArtifacts({
    profile: webProfile,
    profilesPath,
    certifiedPath: "",
    certifiedSummary: null,
    currentPath,
    currentDocument,
    current,
    source,
  });
  const buildTwo = buildWebArtifacts({
    profile: webProfile,
    profilesPath,
    certifiedPath: "",
    certifiedSummary: null,
    currentPath,
    currentDocument,
    current,
    source,
  });

  if (buildOne.deterministicFingerprint !== buildTwo.deterministicFingerprint) {
    fail("Permanent WEB importer produced different repeated-build fingerprints.");
  }

  if (
    buildOne.deterministicFingerprint !==
    approved.output?.deterministicFingerprint
  ) {
    fail(
      `Fresh importer fingerprint differs from approved P05.12E: ${buildOne.deterministicFingerprint}`,
    );
  }

  const freshCandidateHash = sha256Text(buildOne.candidateText);
  if (freshCandidateHash !== approvedCandidateHash) {
    fail(
      `Freshly rebuilt candidate differs from approved P05.12E candidate: ${freshCandidateHash}`,
    );
  }

  const stagedStrongTagCount = buildOne.strongRows.reduce(
    (sum, row) => sum + row.tags.length,
    0,
  );

  assertCount("visible verses", buildOne.visibleRows.length, approved.counts.verses);
  assertCount(
    "headings and superscriptions",
    buildOne.headingRows.length,
    approved.counts.headingsAndSuperscriptions,
  );
  assertCount(
    "paragraph and poetry events",
    buildOne.structureRows.length,
    approved.counts.paragraphAndPoetryEvents,
  );
  assertCount("footnotes", buildOne.footnoteRows.length, approved.counts.footnotes);
  assertCount(
    "cross-references",
    buildOne.crossReferenceRows.length,
    approved.counts.crossReferences,
  );
  assertCount("Strong's tags", stagedStrongTagCount, approved.counts.strongTags);
  assertCount(
    "source-only empty verse labels",
    buildOne.sourceOnlyVerseRows.length,
    approved.counts.sourceOnlyEmptyVerseLabels,
  );
  assertCount(
    "versification mappings",
    buildOne.versificationRows.length,
    approved.counts.versificationMappings,
  );

  const permanentArtifactRoot = path.join(
    ROOT,
    ".private",
    "generated",
    "translation-ingestion",
    "web",
    String(webProfile.rawArchiveSha256).slice(0, 16),
  );

  if (fs.existsSync(permanentArtifactRoot)) {
    fs.rmSync(permanentArtifactRoot, { recursive: true, force: true });
  }

  const generatedFiles = writeStagedArtifacts(
    permanentArtifactRoot,
    buildOne,
  );

  const generatedCandidateHash = sha256File(
    generatedFiles.readerCandidate.path,
  );
  if (generatedCandidateHash !== approvedCandidateHash) {
    fail("Permanent artifact candidate does not match the approved candidate.");
  }

  const candidate = loadCurrentTranslation(
    generatedFiles.readerCandidate.path,
    "web-production-candidate",
    allowedBooks,
  );
  const candidateAudit = compareTranslation(
    "web-production-candidate",
    candidate,
    source,
  );

  if (
    candidateAudit.summary.comparison.exact !== approved.counts.verses ||
    candidateAudit.summary.comparison.substantiveDifferences !== 0 ||
    candidateAudit.summary.comparison.typographyOrPunctuationOnly !== 0 ||
    candidateAudit.summary.comparison.netSourceWordDeficit !== 0
  ) {
    fail(
      `Fresh production candidate/source audit failed: ${JSON.stringify(
        candidateAudit.summary.comparison,
        null,
        2,
      )}`,
    );
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..*$/, "")
    .replace("T", "-");
  const backupRoot = path.join(
    ROOT,
    ".private",
    "backups",
    "P05.12",
    "web",
    timestamp,
  );

  console.log("[P05.12F] Promoting WEB reader transactionally...");
  const transaction = atomicPromoteReader({
    currentPath,
    candidateText: buildOne.candidateText,
    candidateSha256: approvedCandidateHash,
    backupRoot,
    skipBuild: args.skipBuild,
  });

  const postApply = loadCurrentTranslation(
    currentPath,
    "web-production",
    allowedBooks,
  );
  const postApplyAudit = compareTranslation("web-production", postApply, source);

  if (
    postApplyAudit.summary.comparison.exact !== approved.counts.verses ||
    postApplyAudit.summary.comparison.substantiveDifferences !== 0 ||
    postApplyAudit.summary.comparison.typographyOrPunctuationOnly !== 0 ||
    postApplyAudit.summary.comparison.netSourceWordDeficit !== 0
  ) {
    fail(
      `Post-apply WEB/source audit failed: ${JSON.stringify(
        postApplyAudit.summary.comparison,
        null,
        2,
      )}`,
    );
  }

  const criticalHashesAfter = {
    web: sha256File(currentPath),
    kjv: sha256File(kjvPath),
    brenton: sha256File(brentonPath),
  };

  if (criticalHashesAfter.web !== approvedCandidateHash) {
    fail("Production WEB hash does not equal the approved candidate hash.");
  }
  if (criticalHashesAfter.kjv !== criticalHashesBefore.kjv) {
    fail("generatedKJV.json changed during the WEB rebuild.");
  }
  if (criticalHashesAfter.brenton !== criticalHashesBefore.brenton) {
    fail("generatedBrenton.json changed during the WEB rebuild.");
  }

  const permanentManifest = {
    milestone: "P05.12F",
    schemaVersion: "web-translation-ingestion@1.1",
    generatedAtUtc: new Date().toISOString(),
    status: "web-production-reader-rebuilt",
    source: {
      edition: webProfile.edition,
      sourceId: webProfile.sourceId,
      rawSourcePath: webProfile.rawSourcePath,
      rawArchiveSha256: webProfile.rawArchiveSha256,
      rawTreeSha256: webProfile.rawTreeSha256,
      verifiedTreeSha256: actualTreeHash,
      includedBookIds: webProfile.includedBookIds,
    },
    approval: {
      p0512eManifestPath: relative(ROOT, approvedManifestPath),
      p0512eManifestSha256: sha256File(approvedManifestPath),
      approvedCandidateSha256: approvedCandidateHash,
      approvedDeterministicFingerprint:
        approved.output.deterministicFingerprint,
    },
    artifacts: {
      root: relative(ROOT, permanentArtifactRoot),
      files: Object.fromEntries(
        Object.entries(generatedFiles).map(([name, info]) => [
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
    transaction: {
      applied: transaction.applied,
      idempotent: transaction.idempotent,
      backupPath: relative(ROOT, transaction.backupPath),
      currentSha256Before: transaction.currentSha256Before,
      currentSha256After: transaction.currentSha256After,
      build: transaction.build,
    },
    verification: {
      productionVerses: postApplyAudit.summary.current.records,
      exactSourceMatches: postApplyAudit.summary.comparison.exact,
      substantiveDifferences:
        postApplyAudit.summary.comparison.substantiveDifferences,
      punctuationOnlyDifferences:
        postApplyAudit.summary.comparison.typographyOrPunctuationOnly,
      missingWordOccurrences:
        postApplyAudit.summary.comparison.confirmedMissingWordOccurrences,
      netSourceWordDeficit:
        postApplyAudit.summary.comparison.netSourceWordDeficit,
      footnotesPreserved: buildOne.footnoteRows.length,
      crossReferencesPreserved: buildOne.crossReferenceRows.length,
      strongTagsPreserved: stagedStrongTagCount,
      sourceOnlyEmptyVerseLabelsPreserved:
        buildOne.sourceOnlyVerseRows.length,
      deterministicRepeatedBuild: true,
      kjvUnchanged: true,
      brentonUnchanged: true,
    },
    gates: {
      sourceTreeImmutable: true,
      approvedPreviewReproducedExactly: true,
      candidateExactToSource: true,
      metadataInventoryExactToSource: true,
      transactionCompleted: true,
      repositoryBuildPassed: transaction.build.status === 0,
      generatedKJVUnchanged: true,
      generatedBrentonUnchanged: true,
      displayTokensRebuilt: false,
      alignmentsRebuilt: false,
      safeToDeploy: false,
      reason:
        "WEB source text is repaired, but translation display tokens and WEB alignments must be rebuilt and audited before deployment.",
    },
  };

  writeJson(
    path.join(permanentArtifactRoot, "production-manifest.json"),
    permanentManifest,
  );
  writeJson(path.join(args.output, "apply-summary.json"), permanentManifest);

  const readme = [
    "# EMETSEES P05.12F WEB Production Translation Rebuild",
    "",
    `Generated: ${permanentManifest.generatedAtUtc}`,
    "",
    "## Result",
    "",
    `- Production WEB verses: ${permanentManifest.verification.productionVerses}`,
    `- Exact matches to locked USFM: ${permanentManifest.verification.exactSourceMatches}`,
    `- Substantive differences: ${permanentManifest.verification.substantiveDifferences}`,
    `- Net source word deficit: ${permanentManifest.verification.netSourceWordDeficit}`,
    `- Footnotes preserved: ${permanentManifest.verification.footnotesPreserved}`,
    `- Cross-references preserved: ${permanentManifest.verification.crossReferencesPreserved}`,
    `- Strong's tags preserved: ${permanentManifest.verification.strongTagsPreserved}`,
    `- Source-only empty verse labels preserved: ${permanentManifest.verification.sourceOnlyEmptyVerseLabelsPreserved}`,
    `- Repository build passed: ${permanentManifest.gates.repositoryBuildPassed}`,
    `- KJV changed: NO`,
    `- Brenton changed: NO`,
    "",
    "## Deployment gate",
    "",
    "**DO NOT DEPLOY YET.** WEB display tokens and translation alignments still correspond to the previous incomplete reader text. Those layers must be rebuilt and audited next.",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(args.output, "README.md"), readme, "utf8");
  writeChecksums(args.output);

  console.log("");
  console.log("[P05.12F] WEB production translation rebuild complete.");
  console.log(`[P05.12F] Production WEB SHA-256: ${criticalHashesAfter.web}`);
  console.log(`[P05.12F] Exact source matches: ${postApplyAudit.summary.comparison.exact}`);
  console.log("[P05.12F] Substantive differences: 0");
  console.log("[P05.12F] Repository build passed.");
  console.log("[P05.12F] Display tokens rebuilt: NO");
  console.log("[P05.12F] Alignments rebuilt: NO");
  console.log("[P05.12F] Safe to deploy: NO");
  console.log(`OUTPUT_DIR=${args.output}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exit(1);
}
