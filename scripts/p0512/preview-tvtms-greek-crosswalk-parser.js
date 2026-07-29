#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");

const ROOT = process.cwd();

function fail(message) {
  throw new Error(`[P05.12K TVTMS parser] ${message}`);
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function normalizeSlashes(value) {
  return String(value || "").replace(/\\/g, "/");
}

function relative(root, target) {
  return normalizeSlashes(path.relative(root, target));
}

function readBuffer(filePath) {
  return fs.readFileSync(filePath);
}

function readText(filePath) {
  return readBuffer(filePath).toString("utf8").replace(/^\uFEFF/, "");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(readBuffer(filePath))
    .digest("hex");
}

function sha256Text(value) {
  return crypto
    .createHash("sha256")
    .update(String(value), "utf8")
    .digest("hex");
}

function walk(directory, predicate = () => true) {
  if (!fs.existsSync(directory)) return [];

  const result = [];
  const stack = [directory];

  while (stack.length) {
    const current = stack.pop();

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && predicate(fullPath)) result.push(fullPath);
    }
  }

  return result.sort((a, b) => a.localeCompare(b));
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

function csvCell(value) {
  if (value === null || value === undefined) return "";

  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);

  return /[",\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

function writeCsv(filePath, rows, columns) {
  ensureDir(path.dirname(filePath));

  const lines = [columns.map(csvCell).join(",")];

  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(","));
  }

  fs.writeFileSync(filePath, lines.join("\r\n") + "\r\n", "utf8");
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

function parseArgs(argv) {
  const args = {
    output: "",
    sourceManifest: "",
    sourceRoot: "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];

    if (argument === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else if (argument === "--source-manifest" && next) {
      args.sourceManifest = path.resolve(next);
      index += 1;
    } else if (argument === "--source-root" && next) {
      args.sourceRoot = path.resolve(next);
      index += 1;
    } else {
      fail(`Unknown or incomplete argument: ${argument}`);
    }
  }

  if (!args.output) fail("Missing --output.");
  if (!args.sourceManifest) fail("Missing --source-manifest.");
  if (!args.sourceRoot) fail("Missing --source-root.");

  return args;
}

function git(args) {
  try {
    return childProcess
      .execFileSync("git", args, {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
      .trim();
  } catch {
    return "";
  }
}

function sourceFileManifest(sourceRoot) {
  return walk(
    sourceRoot,
    (filePath) => path.basename(filePath) !== "source-manifest.json",
  ).map((filePath) => ({
    path: relative(sourceRoot, filePath),
    bytes: fs.statSync(filePath).size,
    sha256: sha256File(filePath),
  }));
}

function sourceTreeFingerprint(sourceRoot) {
  const manifest = sourceFileManifest(sourceRoot);
  return {
    files: manifest,
    sha256: sha256Text(
      manifest
        .map(
          (record) =>
            `${record.path}\t${record.bytes}\t${record.sha256}`,
        )
        .join("\n"),
    ),
  };
}

function verifyChecksums(reportRoot) {
  const checksumPath = path.join(reportRoot, "checksums.sha256");

  if (!fs.existsSync(checksumPath)) {
    fail(`Missing report checksums: ${checksumPath}`);
  }

  let checked = 0;
  const failures = [];

  for (const line of readText(checksumPath).split(/\r?\n/)) {
    if (!line.trim()) continue;

    const match = /^([a-f0-9]{64})  (.+)$/i.exec(line);

    if (!match) {
      failures.push({ line, reason: "invalid-checksum-line" });
      continue;
    }

    const expected = match[1].toLowerCase();
    const normalizedPath = normalizeSlashes(match[2]);
    const direct = path.join(
      reportRoot,
      normalizedPath.replace(/\//g, path.sep),
    );
    const filePath = fs.existsSync(direct)
      ? direct
      : walk(reportRoot).find(
          (candidate) => relative(reportRoot, candidate) === normalizedPath,
        );

    if (!filePath) {
      failures.push({ path: normalizedPath, reason: "missing" });
      continue;
    }

    checked += 1;
    const actual = sha256File(filePath);

    if (actual !== expected) {
      failures.push({
        path: normalizedPath,
        expected,
        actual,
      });
    }
  }

  return {
    checked,
    failures,
    passed: failures.length === 0,
  };
}

function findLatestP0512I() {
  const reportRoot = path.join(ROOT, ".private", "reports", "P05.12");
  const summaries = walk(
    reportRoot,
    (filePath) =>
      path.basename(filePath) === "brenton-topology-summary.json",
  ).filter((filePath) => {
    try {
      return readJson(filePath)?.milestone === "P05.12I";
    } catch {
      return false;
    }
  });

  if (!summaries.length) {
    fail("No completed P05.12I topology report was found.");
  }

  summaries.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  const summaryPath = summaries[0];

  return {
    reportRoot: path.dirname(summaryPath),
    summaryPath,
    summary: readJson(summaryPath),
  };
}

function findTvtmsFile(sourceRoot) {
  const candidates = walk(
    sourceRoot,
    (filePath) =>
      /^TVTMS(?: .*)?\.txt$/i.test(path.basename(filePath)) &&
      normalizeSlashes(filePath).includes("/Versification/"),
  );

  if (candidates.length !== 1) {
    fail(
      `Expected exactly one pinned TVTMS file, found ${candidates.length}: ${candidates
        .map((filePath) => relative(sourceRoot, filePath))
        .join(", ")}`,
    );
  }

  return candidates[0];
}

const EXPANDED_HEADERS = [
  "SourceType",
  "SourceRef",
  "StandardRef",
  "Action",
  "NoteMarker",
  "Reversification Note",
  "Versification Note",
  "Ancient Versions",
  "Tests",
];

function normalizeHeader(value) {
  return String(value || "").replace(/^\uFEFF/, "").trim();
}

function findExpandedHeader(lines) {
  const matches = [];

  for (let index = 0; index < lines.length; index += 1) {
    const cells = lines[index].split("\t").map(normalizeHeader);

    if (
      EXPANDED_HEADERS.every(
        (header, position) => cells[position] === header,
      )
    ) {
      matches.push({
        lineIndex: index,
        lineNumber: index + 1,
        cells,
      });
    }
  }

  if (matches.length !== 1) {
    fail(
      `Expected exactly one expanded-version header, found ${matches.length}: ${JSON.stringify(
        matches.map((match) => match.lineNumber),
      )}`,
    );
  }

  return matches[0];
}

function looksLikeReference(value) {
  return /^[1-4A-Za-z][A-Za-z0-9]{1,6}\.\d+:(?:Title|TextBeforeV1|\d+)/i.test(
    String(value || "").trim(),
  );
}

function parseExpandedRecords(text) {
  const lines = text.split(/\r\n|\n|\r/);
  const header = findExpandedHeader(lines);
  const records = [];
  const rejected = [];

  for (let index = header.lineIndex + 1; index < lines.length; index += 1) {
    const raw = lines[index];
    const cells = raw.split("\t");

    while (cells.length < EXPANDED_HEADERS.length) cells.push("");

    const record = Object.fromEntries(
      EXPANDED_HEADERS.map((headerName, position) => [
        headerName,
        String(cells[position] || "").trim(),
      ]),
    );

    record.sourceLine = index + 1;
    record.columnCount = cells.length;
    record.extraColumns = cells
      .slice(EXPANDED_HEADERS.length)
      .map((cell) => String(cell || "").trim())
      .filter(Boolean)
      .join(" | ");

    if (
      record.SourceType &&
      looksLikeReference(record.SourceRef) &&
      looksLikeReference(record.StandardRef)
    ) {
      records.push(record);
      continue;
    }

    if (
      record.SourceType ||
      record.SourceRef ||
      record.StandardRef ||
      record.Action
    ) {
      rejected.push({
        sourceLine: index + 1,
        columnCount: cells.length,
        sourceType: record.SourceType,
        sourceRef: record.SourceRef,
        standardRef: record.StandardRef,
        action: record.Action,
        raw,
      });
    }
  }

  return {
    lines,
    header,
    records,
    rejected,
  };
}

function greekSourceType(sourceType) {
  return /(^|[+\/,&\s-])Greek\d*(?=$|[+\/,&\s-])/i.test(
    String(sourceType || ""),
  );
}

const TVTMS_BOOK_ALIASES = {
  GEN: ["Gen"],
  EXO: ["Exo", "Exod"],
  LEV: ["Lev"],
  NUM: ["Num"],
  DEU: ["Deu", "Deut"],
  JOS: ["Jos", "Josh"],
  JDG: ["Jdg", "Judg"],
  RUT: ["Rut", "Ruth"],
  "1SA": ["1Sa", "1Sam"],
  "2SA": ["2Sa", "2Sam"],
  "1KI": ["1Ki", "1Kgs"],
  "2KI": ["2Ki", "2Kgs"],
  "1CH": ["1Ch", "1Chr"],
  "2CH": ["2Ch", "2Chr"],
  EZR: ["Ezr", "Ezra"],
  NEH: ["Neh"],
  EST: ["Est"],
  ESG: ["Esg", "Est"],
  JOB: ["Job"],
  PSA: ["Psa", "Ps"],
  PRO: ["Pro", "Prov"],
  ECC: ["Ecc", "Eccl"],
  SNG: ["Sng", "Song"],
  ISA: ["Isa"],
  JER: ["Jer"],
  LAM: ["Lam"],
  EZK: ["Eze", "Ezk"],
  DAN: ["Dan"],
  DAG: ["Dan", "Dag"],
  HOS: ["Hos"],
  JOL: ["Joe", "Joel"],
  AMO: ["Amo", "Amos"],
  OBA: ["Oba", "Obad"],
  JON: ["Jon"],
  MIC: ["Mic"],
  NAM: ["Nah", "Nam"],
  HAB: ["Hab"],
  ZEP: ["Zep", "Zeph"],
  HAG: ["Hag"],
  ZEC: ["Zec", "Zech"],
  MAL: ["Mal"],
  TOB: ["Tob"],
  JDT: ["Jdt", "Judith"],
  WIS: ["Wis"],
  SIR: ["Sir"],
  BAR: ["Bar"],
  LJE: ["Lje", "EpJer", "LetJer"],
  S3Y: ["S3Y", "PrAzar", "Song3"],
  SUS: ["Sus"],
  BEL: ["Bel"],
  "1MA": ["1Ma", "1Macc"],
  "2MA": ["2Ma", "2Macc"],
  "3MA": ["3Ma", "3Macc"],
  "4MA": ["4Ma", "4Macc"],
  "1ES": ["1Es", "1Esd"],
  "2ES": ["2Es", "2Esd"],
  MAN: ["Man", "PrMan"],
  PS2: ["Ps2", "Psa"],
};

const SOURCE_BOOK_NAME_TO_ID = new Map(
  Object.entries({
    Genesis: "GEN",
    Exodus: "EXO",
    Leviticus: "LEV",
    Numbers: "NUM",
    Deuteronomy: "DEU",
    Joshua: "JOS",
    Judges: "JDG",
    Ruth: "RUT",
    "1 Samuel": "1SA",
    "2 Samuel": "2SA",
    "1 Kings": "1KI",
    "2 Kings": "2KI",
    "1 Chronicles": "1CH",
    "2 Chronicles": "2CH",
    Ezra: "EZR",
    Nehemiah: "NEH",
    Esther: "ESG",
    Job: "JOB",
    Psalms: "PSA",
    Proverbs: "PRO",
    Ecclesiastes: "ECC",
    "Song of Solomon": "SNG",
    Isaiah: "ISA",
    Jeremiah: "JER",
    Lamentations: "LAM",
    Ezekiel: "EZK",
    Daniel: "DAG",
    Hosea: "HOS",
    Joel: "JOL",
    Amos: "AMO",
    Obadiah: "OBA",
    Jonah: "JON",
    Micah: "MIC",
    Nahum: "NAM",
    Habakkuk: "HAB",
    Zephaniah: "ZEP",
    Haggai: "HAG",
    Zechariah: "ZEC",
    Malachi: "MAL",
    Tobit: "TOB",
    Judith: "JDT",
    Wisdom: "WIS",
    Sirach: "SIR",
    Baruch: "BAR",
    "Letter of Jeremiah": "LJE",
    "Song of the Three Young Men": "S3Y",
    Susanna: "SUS",
    "Bel and the Dragon": "BEL",
    "1 Maccabees": "1MA",
    "2 Maccabees": "2MA",
    "3 Maccabees": "3MA",
    "4 Maccabees": "4MA",
    "1 Esdras": "1ES",
    "2 Esdras": "2ES",
    "Prayer of Manasseh": "MAN",
    "Psalm 151": "PS2",
  }),
);

const TVTMS_PREFIX_TO_BOOK_ID = new Map();

for (const [bookId, aliases] of Object.entries(TVTMS_BOOK_ALIASES)) {
  for (const alias of aliases) {
    const key = alias.toLowerCase();

    if (!TVTMS_PREFIX_TO_BOOK_ID.has(key)) {
      TVTMS_PREFIX_TO_BOOK_ID.set(key, []);
    }

    TVTMS_PREFIX_TO_BOOK_ID.get(key).push(bookId);
  }
}

function parseVerseToken(rawToken) {
  const token = String(rawToken || "").trim();

  if (/^(Title|TextBeforeV1)$/i.test(token)) {
    return {
      raw: token,
      kind: token.toLowerCase() === "title" ? "title" : "text-before-v1",
      number: null,
      subverse: "",
      normalized: token.toLowerCase() === "title" ? "Title" : "TextBeforeV1",
    };
  }

  const match = /^(\d+)(?:(?:!|\*|\.)([A-Za-z0-9]+)|([A-Za-z]))?$/.exec(
    token,
  );

  if (!match) return null;

  const number = Number(match[1]);
  const subverse = String(match[2] || match[3] || "").toLowerCase();

  return {
    raw: token,
    kind: subverse ? "subverse" : "verse",
    number,
    subverse,
    normalized: subverse ? `${number}!${subverse}` : String(number),
  };
}

function parseEndpoint(raw, defaultPrefix, defaultChapter) {
  const text = String(raw || "").trim();
  let prefix = defaultPrefix;
  let chapter = defaultChapter;
  let verseText = text;

  const full = /^([1-4A-Za-z][A-Za-z0-9]{1,6})\.(\d+):(.+)$/.exec(text);

  if (full) {
    prefix = full[1];
    chapter = Number(full[2]);
    verseText = full[3];
  } else {
    const chapterOnly = /^(\d+):(.+)$/.exec(text);

    if (chapterOnly) {
      chapter = Number(chapterOnly[1]);
      verseText = chapterOnly[2];
    }
  }

  const verse = parseVerseToken(verseText);

  if (!prefix || !Number.isInteger(chapter) || !verse) return null;

  return {
    prefix,
    chapter,
    verse,
    coordinate: `${prefix}.${chapter}:${verse.normalized}`,
  };
}

function parseReferenceExpression(raw) {
  const text = String(raw || "").trim();
  const startMatch =
    /^([1-4A-Za-z][A-Za-z0-9]{1,6})\.(\d+):(.+)$/.exec(text);

  if (!startMatch) {
    return {
      raw: text,
      parsed: false,
      reason: "invalid-reference-start",
      coordinates: [],
    };
  }

  const prefix = startMatch[1];
  const chapter = Number(startMatch[2]);
  const remainder = startMatch[3];

  // A single hyphen separates ranges. Double hyphens and lists are retained
  // for explicit review instead of guessed expansion.
  if (
    remainder.includes("--") ||
    /[,&;]/.test(remainder)
  ) {
    return {
      raw: text,
      parsed: false,
      reason: "complex-list-or-cross-section-expression",
      coordinates: [],
    };
  }

  const rangeMatch = /^(.+?)-(.+)$/.exec(remainder);

  if (!rangeMatch) {
    const endpoint = parseEndpoint(
      `${prefix}.${chapter}:${remainder}`,
      prefix,
      chapter,
    );

    return endpoint
      ? {
          raw: text,
          parsed: true,
          kind: "single",
          coordinates: [endpoint],
        }
      : {
          raw: text,
          parsed: false,
          reason: "invalid-single-reference",
          coordinates: [],
        };
  }

  const start = parseEndpoint(
    `${prefix}.${chapter}:${rangeMatch[1]}`,
    prefix,
    chapter,
  );
  const end = parseEndpoint(rangeMatch[2], prefix, chapter);

  if (!start || !end) {
    return {
      raw: text,
      parsed: false,
      reason: "invalid-range-endpoint",
      coordinates: [],
    };
  }

  if (
    start.prefix.toLowerCase() !== end.prefix.toLowerCase() ||
    start.chapter !== end.chapter ||
    start.verse.kind !== "verse" ||
    end.verse.kind !== "verse"
  ) {
    return {
      raw: text,
      parsed: false,
      reason: "cross-chapter-or-subverse-range",
      coordinates: [],
      start,
      end,
    };
  }

  if (
    end.verse.number < start.verse.number ||
    end.verse.number - start.verse.number > 500
  ) {
    return {
      raw: text,
      parsed: false,
      reason: "invalid-or-excessive-range",
      coordinates: [],
      start,
      end,
    };
  }

  const coordinates = [];

  for (
    let verseNumber = start.verse.number;
    verseNumber <= end.verse.number;
    verseNumber += 1
  ) {
    coordinates.push({
      prefix: start.prefix,
      chapter: start.chapter,
      verse: {
        raw: String(verseNumber),
        kind: "verse",
        number: verseNumber,
        subverse: "",
        normalized: String(verseNumber),
      },
      coordinate: `${start.prefix}.${start.chapter}:${verseNumber}`,
    });
  }

  return {
    raw: text,
    parsed: true,
    kind: "numeric-range",
    coordinates,
    start,
    end,
  };
}

function coordinateKey(bookId, chapter, token) {
  return `${bookId}.${Number(chapter)}:${token}`;
}

function p0512SourceCoordinateCandidates(row) {
  const bookId = String(row.sourceBookId || "").toUpperCase();
  const aliases = TVTMS_BOOK_ALIASES[bookId] || [];
  const chapter = Number(row.sourceChapter);
  const rawLabel = String(row.sourceVerseLabel || "").trim();

  const labelMatch = /^(\d+)([A-Za-z])$/.exec(rawLabel);
  const tokens = new Set();

  if (labelMatch) {
    const number = Number(labelMatch[1]);
    const letter = labelMatch[2].toLowerCase();
    tokens.add(`${number}!${letter}`);
    tokens.add(`${number}.${letter}`);
    tokens.add(`${number}${letter}`);
  } else if (/^\d+$/.test(rawLabel)) {
    tokens.add(String(Number(rawLabel)));
  } else {
    tokens.add(rawLabel);
  }

  const coordinates = [];

  for (const alias of aliases) {
    for (const token of tokens) {
      coordinates.push({
        bookId,
        prefix: alias,
        chapter,
        token,
        key: `${alias.toLowerCase()}.${chapter}:${token.toLowerCase()}`,
      });
    }
  }

  return coordinates;
}

function recordMappingEdges(record) {
  const source = parseReferenceExpression(record.SourceRef);
  const standard = parseReferenceExpression(record.StandardRef);

  if (!source.parsed || !standard.parsed) {
    return {
      parsed: false,
      source,
      standard,
      edges: [],
      reason: !source.parsed
        ? `source:${source.reason}`
        : `standard:${standard.reason}`,
    };
  }

  const sourceCoordinates = source.coordinates;
  const standardCoordinates = standard.coordinates;
  const edges = [];

  if (sourceCoordinates.length === standardCoordinates.length) {
    for (let index = 0; index < sourceCoordinates.length; index += 1) {
      edges.push({
        source: sourceCoordinates[index],
        standard: standardCoordinates[index],
        relation:
          sourceCoordinates.length === 1
            ? "one-to-one"
            : "parallel-ranges",
        groupIndex: index,
        groupSize: sourceCoordinates.length,
      });
    }
  } else if (sourceCoordinates.length > 1 && standardCoordinates.length === 1) {
    sourceCoordinates.forEach((sourceCoordinate, index) => {
      edges.push({
        source: sourceCoordinate,
        standard: standardCoordinates[0],
        relation: "many-source-to-one-standard",
        groupIndex: index,
        groupSize: sourceCoordinates.length,
      });
    });
  } else if (sourceCoordinates.length === 1 && standardCoordinates.length > 1) {
    standardCoordinates.forEach((standardCoordinate, index) => {
      edges.push({
        source: sourceCoordinates[0],
        standard: standardCoordinate,
        relation: "one-source-to-many-standard",
        groupIndex: index,
        groupSize: standardCoordinates.length,
      });
    });
  } else {
    return {
      parsed: false,
      source,
      standard,
      edges: [],
      reason: "range-cardinality-mismatch",
    };
  }

  return {
    parsed: true,
    source,
    standard,
    edges,
    reason: "",
  };
}

function normalizedEdgeKey(edge) {
  return `${edge.standard.prefix.toLowerCase()}.${edge.standard.chapter}:${edge.standard.verse.normalized.toLowerCase()}`;
}

function countBy(rows, field) {
  const result = {};

  for (const row of rows) {
    const key = String(row[field] || "");
    result[key] = (result[key] || 0) + 1;
  }

  return result;
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

function main() {
  const args = parseArgs(process.argv);
  ensureDir(args.output);

  if (!fs.existsSync(args.sourceManifest)) {
    fail(`Pinned source manifest not found: ${args.sourceManifest}`);
  }

  if (!fs.existsSync(args.sourceRoot)) {
    fail(`Pinned source root not found: ${args.sourceRoot}`);
  }

  const sourceManifest = readJson(args.sourceManifest);

  if (sourceManifest.milestone !== "P05.12J-V4") {
    fail(
      `Expected P05.12J-V4 source manifest, found ${sourceManifest.milestone}`,
    );
  }

  const actualTree = sourceTreeFingerprint(args.sourceRoot);

  if (actualTree.sha256 !== sourceManifest.treeSha256) {
    fail(
      `Pinned TVTMS source tree changed. Expected ${sourceManifest.treeSha256}, found ${actualTree.sha256}`,
    );
  }

  const tvtmsPath = findTvtmsFile(args.sourceRoot);

  if (
    sourceManifest.originalSha256 &&
    sha256File(tvtmsPath) !== sourceManifest.originalSha256
  ) {
    fail(
      `Pinned TVTMS bytes differ from the original repository file hash.`,
    );
  }

  const p0512i = findLatestP0512I();
  const p0512iChecksums = verifyChecksums(p0512i.reportRoot);

  if (!p0512iChecksums.passed) {
    fail(
      `P05.12I checksum verification failed: ${JSON.stringify(
        p0512iChecksums.failures,
        null,
        2,
      )}`,
    );
  }

  const topologyMapPath = path.join(
    p0512i.reportRoot,
    "brenton-source-to-reader-map.csv",
  );
  const unresolvedSourcePath = path.join(
    p0512i.reportRoot,
    "brenton-unresolved-source-segments.csv",
  );

  if (
    !fs.existsSync(topologyMapPath) ||
    !fs.existsSync(unresolvedSourcePath)
  ) {
    fail("P05.12I topology files are incomplete.");
  }

  console.log("[P05.12K] Parsing TVTMS expanded version...");
  const parsed = parseExpandedRecords(readText(tvtmsPath));
  const greekRecords = parsed.records.filter((record) =>
    greekSourceType(record.SourceType),
  );

  const parsedGreekRecords = [];
  const unparsedGreekRecords = [];
  const edgeIndex = new Map();
  const allEdges = [];

  for (const record of greekRecords) {
    const mapping = recordMappingEdges(record);

    if (!mapping.parsed) {
      unparsedGreekRecords.push({
        sourceLine: record.sourceLine,
        sourceType: record.SourceType,
        sourceRef: record.SourceRef,
        standardRef: record.StandardRef,
        action: record.Action,
        tests: record.Tests,
        reason: mapping.reason,
      });
      continue;
    }

    const edgeRows = mapping.edges.map((edge) => ({
      sourceLine: record.sourceLine,
      sourceType: record.SourceType,
      sourceRef: record.SourceRef,
      standardRef: record.StandardRef,
      action: record.Action,
      noteMarker: record.NoteMarker,
      reversificationNote: record["Reversification Note"],
      versificationNote: record["Versification Note"],
      ancientVersions: record["Ancient Versions"],
      tests: record.Tests,
      sourceCoordinate: edge.source.coordinate,
      standardCoordinate: edge.standard.coordinate,
      relation: edge.relation,
      groupIndex: edge.groupIndex,
      groupSize: edge.groupSize,
    }));

    parsedGreekRecords.push({
      sourceLine: record.sourceLine,
      sourceType: record.SourceType,
      sourceRef: record.SourceRef,
      standardRef: record.StandardRef,
      action: record.Action,
      tests: record.Tests,
      edgeCount: edgeRows.length,
    });

    for (const edgeRow of edgeRows) {
      allEdges.push(edgeRow);
      const key = edgeRow.sourceCoordinate.toLowerCase();

      if (!edgeIndex.has(key)) edgeIndex.set(key, []);
      edgeIndex.get(key).push(edgeRow);
    }
  }

  const topologyRows = readCsv(topologyMapPath);
  const unresolvedSourceRows = readCsv(unresolvedSourcePath);
  const allSourceRows = topologyRows.concat(
    unresolvedSourceRows.map((row) => ({
      sourceBookId: SOURCE_BOOK_NAME_TO_ID.get(row.book) || "",
      sourceBook: row.book,
      sourceChapter: row.chapter,
      sourceVerseLabel: row.verseLabel,
      sourceReference: row.reference,
      readerChapter: "",
      readerVerse: "",
      readerReference: "",
      mappingType: "unresolved-current-reader",
      confidence: "",
      lxxOwnershipRisk: "unresolved-current-reader",
      sourceText: row.text,
    })),
  );

  const unknownBookIds = new Set();
  const reviewRows = [];

  for (const row of allSourceRows) {
    const bookId = String(row.sourceBookId || "").toUpperCase();

    if (!TVTMS_BOOK_ALIASES[bookId]) {
      if (bookId) unknownBookIds.add(bookId);
      continue;
    }

    const sourceCandidates = p0512SourceCoordinateCandidates(row);
    const candidateEdges = [];

    for (const candidate of sourceCandidates) {
      const key = `${candidate.prefix.toLowerCase()}.${candidate.chapter}:${candidate.token.toLowerCase()}`;

      for (const edge of edgeIndex.get(key) || []) {
        candidateEdges.push(edge);
      }
    }

    const uniqueEdges = [];
    const seen = new Set();

    for (const edge of candidateEdges) {
      const key = [
        edge.sourceLine,
        edge.sourceCoordinate,
        edge.standardCoordinate,
        edge.sourceType,
        edge.action,
        edge.tests,
      ].join("\u0000");

      if (seen.has(key)) continue;
      seen.add(key);
      uniqueEdges.push(edge);
    }

    const standardTargets = Array.from(
      new Set(
        uniqueEdges.map((edge) =>
          String(edge.standardCoordinate).toLowerCase(),
        ),
      ),
    ).sort();

    const currentCoordinate =
      bookId && row.readerChapter && row.readerVerse
        ? coordinateKey(
            bookId,
            row.readerChapter,
            String(row.readerVerse),
          )
        : "";

    const currentAliases = TVTMS_BOOK_ALIASES[bookId] || [];
    const currentCandidateKeys = new Set(
      currentAliases.map(
        (alias) =>
          `${alias.toLowerCase()}.${Number(row.readerChapter)}:${String(
            row.readerVerse,
          ).toLowerCase()}`,
      ),
    );

    const currentMatchesCandidate = standardTargets.some((target) =>
      currentCandidateKeys.has(target),
    );

    let status;

    if (!uniqueEdges.length) {
      status = "no-tvtms-greek-record";
    } else if (standardTargets.length === 1) {
      status = currentMatchesCandidate
        ? "unambiguous-standard-target-current-matches"
        : "unambiguous-standard-target-current-differs";
    } else {
      status = currentMatchesCandidate
        ? "multiple-standard-targets-current-among-options"
        : "multiple-standard-targets-current-not-among-options";
    }

    reviewRows.push({
      sourceBookId: bookId,
      sourceBook: row.sourceBook,
      sourceChapter: row.sourceChapter,
      sourceVerseLabel: row.sourceVerseLabel,
      sourceReference: row.sourceReference,
      sourceText: row.sourceText,
      topologyMappingType: row.mappingType,
      topologyConfidence: row.confidence,
      lxxOwnershipRisk: row.lxxOwnershipRisk,
      currentReaderReference: row.readerReference,
      currentReaderCoordinate: currentCoordinate,
      tvtmsCandidateRecords: uniqueEdges.length,
      tvtmsSourceTypes: Array.from(
        new Set(uniqueEdges.map((edge) => edge.sourceType)),
      ).join(" | "),
      tvtmsActions: Array.from(
        new Set(uniqueEdges.map((edge) => edge.action)),
      ).join(" | "),
      tvtmsStandardTargets: uniqueEdges.length
        ? Array.from(
            new Set(uniqueEdges.map((edge) => edge.standardCoordinate)),
          ).join(" | ")
        : "",
      tvtmsTests: Array.from(
        new Set(uniqueEdges.map((edge) => edge.tests).filter(Boolean)),
      ).join(" || "),
      status,
      currentMatchesCandidate,
      candidateDetails: uniqueEdges.map((edge) => ({
        sourceLine: edge.sourceLine,
        sourceType: edge.sourceType,
        sourceRef: edge.sourceRef,
        standardRef: edge.standardRef,
        standardCoordinate: edge.standardCoordinate,
        action: edge.action,
        tests: edge.tests,
        relation: edge.relation,
      })),
    });
  }

  const unresolvedBrentonSourceRows = reviewRows.filter(
    (row) => row.lxxOwnershipRisk === "unresolved-current-reader",
  );
  const riskRows = reviewRows.filter(
    (row) =>
      row.lxxOwnershipRisk &&
      row.lxxOwnershipRisk !== "identity-coordinate" &&
      row.lxxOwnershipRisk !== "unresolved-current-reader",
  );
  const identityRows = reviewRows.filter(
    (row) => row.lxxOwnershipRisk === "identity-coordinate",
  );

  const unambiguousRisk = riskRows.filter((row) =>
    row.status.startsWith("unambiguous-standard-target"),
  );
  const ambiguousRisk = riskRows.filter((row) =>
    row.status.startsWith("multiple-standard-targets"),
  );
  const unmappedRisk = riskRows.filter(
    (row) => row.status === "no-tvtms-greek-record",
  );

  const expectedSourceRows = Number(
    p0512i.summary?.topology?.visibleSourceSegments || 0,
  );
  const expectedRiskRows = Object.entries(
    p0512i.summary?.topology?.lxxOwnershipRiskCounts || {},
  )
    .filter(([name]) => name !== "identity-coordinate")
    .reduce((sum, [, count]) => sum + Number(count), 0);

  if (reviewRows.length !== expectedSourceRows) {
    fail(
      `Brenton source review inventory mismatch: expected ${expectedSourceRows}, found ${reviewRows.length}.`,
    );
  }

  if (riskRows.length !== expectedRiskRows) {
    fail(
      `Brenton ownership-risk inventory mismatch: expected ${expectedRiskRows}, found ${riskRows.length}.`,
    );
  }

  if (unknownBookIds.size) {
    fail(
      `TVTMS book aliases are incomplete for Brenton source IDs: ${Array.from(
        unknownBookIds,
      )
        .sort()
        .join(", ")}`,
    );
  }

  const psalm4 = reviewRows.filter(
    (row) =>
      row.sourceBookId === "PSA" &&
      Number(row.sourceChapter) === 4,
  );

  if (!psalm4.length) {
    fail("P05.12K found no Brenton Psalm 4 source rows.");
  }

  if (!psalm4.some((row) => row.tvtmsCandidateRecords > 0)) {
    fail("P05.12K found no TVTMS Greek records for Brenton Psalm 4.");
  }

  const parserFingerprint = sha256Text(
    JSON.stringify(
      {
        headerLine: parsed.header.lineNumber,
        expandedRecords: parsed.records.length,
        greekRecords: greekRecords.length,
        greekEdges: allEdges.length,
        reviewRows: reviewRows.map((row) => ({
          sourceReference: row.sourceReference,
          status: row.status,
          targets: row.tvtmsStandardTargets,
          tests: row.tvtmsTests,
        })),
      },
      null,
      2,
    ),
  );

  const stagingRoot = path.join(
    ROOT,
    ".private",
    "generated",
    "P05.12",
    "tvtms-greek-crosswalk",
    parserFingerprint.slice(0, 16),
  );

  if (fs.existsSync(stagingRoot)) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }

  ensureDir(stagingRoot);

  const stagedFiles = {
    expandedRecords: writeNdjson(
      path.join(stagingRoot, "tvtms-expanded-records.ndjson"),
      parsed.records,
    ),
    greekEdges: writeNdjson(
      path.join(stagingRoot, "tvtms-greek-mapping-edges.ndjson"),
      allEdges,
    ),
    brentonReview: writeNdjson(
      path.join(stagingRoot, "brenton-tvtms-review.ndjson"),
      reviewRows,
    ),
  };

  const summary = {
    milestone: "P05.12K",
    generatedAtUtc: new Date().toISOString(),
    status: "tvtms-expanded-parser-and-brenton-greek-crosswalk-preview-complete",
    repository: {
      branch: git(["branch", "--show-current"]),
      commit: git(["rev-parse", "HEAD"]),
    },
    sources: {
      tvtms: {
        manifest: relative(ROOT, args.sourceManifest),
        sourceRoot: relative(ROOT, args.sourceRoot),
        pinnedCommit: sourceManifest.commit,
        tvtmsPath: relative(ROOT, tvtmsPath),
        tvtmsSha256: sha256File(tvtmsPath),
        sourceTreeSha256: actualTree.sha256,
      },
      p0512i: {
        report: relative(ROOT, p0512i.reportRoot),
        checksumsVerified: p0512iChecksums.checked,
        checksumsPassed: true,
        sourceSegments:
          p0512i.summary?.topology?.visibleSourceSegments ?? null,
        ownershipRiskRows:
          Object.entries(
            p0512i.summary?.topology?.lxxOwnershipRiskCounts || {},
          )
            .filter(([name]) => name !== "identity-coordinate")
            .reduce((sum, [, count]) => sum + Number(count), 0),
      },
    },
    parser: {
      expandedHeaderLine: parsed.header.lineNumber,
      expandedHeaderColumns: parsed.header.cells,
      expandedRecords: parsed.records.length,
      rejectedPostHeaderLines: parsed.rejected.length,
      greekSourceTypeRecords: greekRecords.length,
      parsedGreekRecords: parsedGreekRecords.length,
      unparsedGreekRecords: unparsedGreekRecords.length,
      greekMappingEdges: allEdges.length,
      sourceTypeCounts: countBy(greekRecords, "SourceType"),
      actionCounts: countBy(greekRecords, "Action"),
      fingerprint: parserFingerprint,
    },
    brentonCrosswalk: {
      sourceRowsReviewed: reviewRows.length,
      identityRows: identityRows.length,
      unresolvedBrentonSourceRows: unresolvedBrentonSourceRows.length,
      riskRows: riskRows.length,
      unambiguousRiskRows: unambiguousRisk.length,
      ambiguousRiskRows: ambiguousRisk.length,
      unmappedRiskRows: unmappedRisk.length,
      currentMatchesUnambiguousRisk: unambiguousRisk.filter(
        (row) => row.currentMatchesCandidate,
      ).length,
      currentDiffersUnambiguousRisk: unambiguousRisk.filter(
        (row) => !row.currentMatchesCandidate,
      ).length,
      unknownBookIds: Array.from(unknownBookIds).sort(),
      psalm4Rows: psalm4.length,
    },
    stagedArtifacts: {
      root: relative(ROOT, stagingRoot),
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
    },
    gates: {
      tvtmsSourcePinnedAndVerified: true,
      p0512iChecksumsValid: true,
      expandedHeaderUnique: true,
      greekRecordsParsedWithoutGuessingTests: true,
      competingGreekTraditionsPreserved: true,
      completeBrentonSourceInventoryReviewed: true,
      ownershipRiskInventoryExactToP0512I: true,
      allBrentonBookIdsRecognized: true,
      productionBrentonModified: false,
      lxxCanonicalModified: false,
      alignmentsModified: false,
      safeToBuildProductionBrentonCandidate: false,
      reason:
        "TVTMS Tests and competing Greek traditions must be evaluated against the locked Brenton source inventory. Only unambiguous mappings are candidates; ambiguous and unmapped risk rows remain fail-closed.",
    },
  };

  writeJson(
    path.join(args.output, "tvtms-greek-crosswalk-summary.json"),
    summary,
  );

  writeCsv(
    path.join(args.output, "tvtms-expanded-records.csv"),
    parsed.records,
    [
      "sourceLine",
      "columnCount",
      "SourceType",
      "SourceRef",
      "StandardRef",
      "Action",
      "NoteMarker",
      "Reversification Note",
      "Versification Note",
      "Ancient Versions",
      "Tests",
      "extraColumns",
    ],
  );

  writeCsv(
    path.join(args.output, "tvtms-greek-mapping-edges.csv"),
    allEdges,
    [
      "sourceLine",
      "sourceType",
      "sourceRef",
      "standardRef",
      "action",
      "sourceCoordinate",
      "standardCoordinate",
      "relation",
      "groupIndex",
      "groupSize",
      "tests",
      "ancientVersions",
      "versificationNote",
    ],
  );

  writeCsv(
    path.join(args.output, "tvtms-unparsed-greek-records.csv"),
    unparsedGreekRecords,
    [
      "sourceLine",
      "sourceType",
      "sourceRef",
      "standardRef",
      "action",
      "tests",
      "reason",
    ],
  );

  const reviewColumns = [
    "sourceBookId",
    "sourceBook",
    "sourceChapter",
    "sourceVerseLabel",
    "sourceReference",
    "topologyMappingType",
    "topologyConfidence",
    "lxxOwnershipRisk",
    "currentReaderReference",
    "currentReaderCoordinate",
    "tvtmsCandidateRecords",
    "tvtmsSourceTypes",
    "tvtmsActions",
    "tvtmsStandardTargets",
    "tvtmsTests",
    "status",
    "currentMatchesCandidate",
    "sourceText",
  ];

  writeCsv(
    path.join(args.output, "brenton-tvtms-all-source-review.csv"),
    reviewRows,
    reviewColumns,
  );
  writeCsv(
    path.join(args.output, "brenton-tvtms-risk-unambiguous.csv"),
    unambiguousRisk,
    reviewColumns,
  );
  writeCsv(
    path.join(args.output, "brenton-tvtms-risk-ambiguous.csv"),
    ambiguousRisk,
    reviewColumns,
  );
  writeCsv(
    path.join(args.output, "brenton-tvtms-risk-unmapped.csv"),
    unmappedRisk,
    reviewColumns,
  );

  writeCsv(
    path.join(args.output, "tvtms-rejected-post-header-lines.csv"),
    parsed.rejected,
    [
      "sourceLine",
      "columnCount",
      "sourceType",
      "sourceRef",
      "standardRef",
      "action",
      "raw",
    ],
  );

  ensureDir(path.join(args.output, "samples"));

  const psalmLines = [
    "# Brenton Psalm 4 — TVTMS Greek crosswalk preview",
    "",
    "No verse numbering or Scripture text was changed.",
    "",
    "| Brenton source | Current reader | TVTMS targets | Source types | Actions | Status |",
    "|---|---|---|---|---|---|",
    ...psalm4.map(
      (row) =>
        `| ${row.sourceReference} | ${
          row.currentReaderReference || "unresolved"
        } | ${String(row.tvtmsStandardTargets || "").replace(
          /\|/g,
          "\\|",
        )} | ${String(row.tvtmsSourceTypes || "").replace(
          /\|/g,
          "\\|",
        )} | ${String(row.tvtmsActions || "").replace(
          /\|/g,
          "\\|",
        )} | ${row.status} |`,
    ),
    "",
  ];

  fs.writeFileSync(
    path.join(args.output, "samples", "brenton-psalm-4-tvtms-crosswalk.md"),
    psalmLines.join("\n"),
    "utf8",
  );

  const readme = [
    "# EMETSEES P05.12K TVTMS Greek Crosswalk Parser Preview",
    "",
    `Generated: ${summary.generatedAtUtc}`,
    "",
    "This run parses TVTMS's software-oriented expanded version rather than the human condensed tables.",
    "",
    "## Parser",
    "",
    `- Expanded header line: ${summary.parser.expandedHeaderLine}`,
    `- Expanded records: ${summary.parser.expandedRecords}`,
    `- Greek-related records: ${summary.parser.greekSourceTypeRecords}`,
    `- Parsed Greek records: ${summary.parser.parsedGreekRecords}`,
    `- Unparsed Greek records: ${summary.parser.unparsedGreekRecords}`,
    `- Greek mapping edges: ${summary.parser.greekMappingEdges}`,
    "",
    "## Brenton ownership risks",
    "",
    `- Unresolved Brenton source rows: ${summary.brentonCrosswalk.unresolvedBrentonSourceRows}`,
    `- Risk rows: ${summary.brentonCrosswalk.riskRows}`,
    `- Unambiguous: ${summary.brentonCrosswalk.unambiguousRiskRows}`,
    `- Ambiguous: ${summary.brentonCrosswalk.ambiguousRiskRows}`,
    `- Unmapped: ${summary.brentonCrosswalk.unmappedRiskRows}`,
    `- Current reader differs from unambiguous TVTMS target: ${summary.brentonCrosswalk.currentDiffersUnambiguousRisk}`,
    "",
    "## Safety",
    "",
    "- TVTMS tests and competing Greek traditions were retained.",
    "- No test was silently assumed true.",
    "- Production Brenton was not modified.",
    "- Greek LXX canonical data was not modified.",
    "- WEB and KJV were not modified.",
    "- Display tokens and alignments were not rebuilt.",
    "- No Brenton production candidate is authorized yet.",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(args.output, "README.md"), readme, "utf8");
  writeChecksums(args.output);

  console.log("");
  console.log("[P05.12K] TVTMS expanded parser preview complete.");
  console.log(`[P05.12K] Expanded records: ${summary.parser.expandedRecords}`);
  console.log(
    `[P05.12K] Parsed Greek records: ${summary.parser.parsedGreekRecords}`,
  );
  console.log(
    `[P05.12K] Brenton risk rows: ${summary.brentonCrosswalk.riskRows}`,
  );
  console.log(
    `[P05.12K] Unambiguous / ambiguous / unmapped: ${summary.brentonCrosswalk.unambiguousRiskRows} / ${summary.brentonCrosswalk.ambiguousRiskRows} / ${summary.brentonCrosswalk.unmappedRiskRows}`,
  );
  console.log("[P05.12K] Production Brenton modified: NO");
  console.log("[P05.12K] Alignments modified: NO");
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
        : path.join(ROOT, ".private", "reports", "P05.12", "p0512k-fatal");

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
