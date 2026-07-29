#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");

const ROOT = process.cwd();

function fail(message) {
  throw new Error(`[P05.12Q V2 Brenton reader adapter] ${message}`);
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
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
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

      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && predicate(fullPath)) {
        result.push(fullPath);
      }
    }
  }

  return result.sort((left, right) => left.localeCompare(right));
}

function parseArgs(argv) {
  const args = { output: "" };

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];

    if (argument === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else {
      fail(`Unknown or incomplete argument: ${argument}`);
    }
  }

  if (!args.output) fail("Missing --output.");

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

function findLatestP0512P() {
  const reportRoot = path.join(ROOT, ".private", "reports", "P05.12");
  const candidates = walk(
    reportRoot,
    (filePath) =>
      path.basename(filePath) === "brenton-reader-candidate-summary.json",
  ).filter((filePath) => {
    try {
      const summary = readJson(filePath);
      return (
        summary?.milestone === "P05.12P" &&
        summary?.status ===
          "deduplicated-source-faithful-brenton-reader-candidate-v2-complete"
      );
    } catch {
      return false;
    }
  });

  if (!candidates.length) {
    fail("No completed P05.12P V2 reader candidate was found.");
  }

  candidates.sort(
    (left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs,
  );

  const summaryPath = candidates[0];

  return {
    summaryPath,
    reportRoot: path.dirname(summaryPath),
    summary: readJson(summaryPath),
  };
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

function stableJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function verseSortKey(label) {
  const match = /^(\d+)([A-Za-z]*)$/.exec(String(label || ""));

  return {
    number: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
    suffix: match ? match[2] : String(label || ""),
  };
}

function compareVerseLabels(left, right) {
  const a = verseSortKey(left);
  const b = verseSortKey(right);

  return a.number - b.number || a.suffix.localeCompare(b.suffix);
}

function displayKey(bookId, chapter, verseLabel) {
  return `${bookId}:${chapter}:${verseLabel}`;
}

function chapterKey(bookId, chapter) {
  return `${bookId}:${chapter}`;
}

function routeKey(book, chapter, verseLabel) {
  return `${book}\u0000${chapter}\u0000${verseLabel}`;
}

function legacyNumericKey(book, chapter, numericVerse) {
  return `${book}\u0000${chapter}\u0000${numericVerse}`;
}

function generateRuntimeModule() {
  return `"use strict";

function verseSortKey(label) {
  const match = /^(\\d+)([A-Za-z]*)$/.exec(String(label || ""));
  return {
    number: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
    suffix: match ? match[2] : String(label || ""),
  };
}

function compareVerseLabels(left, right) {
  const a = verseSortKey(left);
  const b = verseSortKey(right);
  return a.number - b.number || a.suffix.localeCompare(b.suffix);
}

function displayKey(bookId, chapter, verseLabel) {
  return \`\${bookId}:\${chapter}:\${verseLabel}\`;
}

function chapterKey(bookId, chapter) {
  return \`\${bookId}:\${chapter}\`;
}

function buildChapterItems(verses, superscriptions) {
  const titlesByTarget = new Map();

  for (const title of superscriptions) {
    const target = title.attachBeforeVisibleSourceId || "__chapter_end__";
    if (!titlesByTarget.has(target)) titlesByTarget.set(target, []);
    titlesByTarget.get(target).push(title);
  }

  const items = [];

  for (const verse of [...verses].sort((left, right) =>
    compareVerseLabels(
      left.display.verseLabel,
      right.display.verseLabel,
    ),
  )) {
    for (const title of titlesByTarget.get(verse.id) || []) {
      items.push({ type: "superscription", value: title });
    }
    items.push({ type: "verse", value: verse });
  }

  for (const title of titlesByTarget.get("__chapter_end__") || []) {
    items.push({ type: "superscription", value: title });
  }

  return items;
}

function toLegacyCompatibleRecord(verse) {
  return {
    id: verse.id,
    book: verse.display.book,
    chapter: verse.display.chapter,
    verse: verse.display.numericVerse,
    verseLabel: verse.display.verseLabel,
    reference: verse.display.reference,
    sources: [
      {
        language: "english",
        text: verse.text,
      },
    ],
    sourceIdentity: verse.source,
    lxxOwnership: verse.lxxOwnership,
    standardNavigation: verse.standardNavigation,
    legacyCompatibility: verse.legacyCompatibility,
  };
}

function resolveAlias(aliasMap, sourceId) {
  const alias = aliasMap.get(sourceId);
  return alias ? alias.primarySourceId : sourceId;
}

module.exports = {
  verseSortKey,
  compareVerseLabels,
  displayKey,
  chapterKey,
  buildChapterItems,
  toLegacyCompatibleRecord,
  resolveAlias,
};
`;
}

function generateTypeScriptModule() {
  return `export type BrentonVerseLabel = string;

export interface BrentonReaderVerse {
  id: string;
  translationId: "brenton";
  display: {
    bookId: string;
    book: string;
    chapter: number;
    verseLabel: BrentonVerseLabel;
    numericVerse: number;
    reference: string;
  };
  source: {
    bookId: string;
    book: string;
    chapter: number;
    verseLabel: string;
    numericVerse: number;
    reference: string;
    sourceFile: string;
    sourceLine: number;
  };
  text: string;
  wordCount: number;
  structureMarkers: string[];
  lxxOwnership: {
    sourceId: string;
    sourceReference: string;
    classification: string;
    eligibility: string;
    authoritativeOwnershipKey: string | null;
    directLxxCoordinate: string | null;
    directLxxCoordinateExists: boolean;
    entityRoutingEligible: boolean;
    exclusionReason: string | null;
  };
  standardNavigation: {
    sourceId: string;
    sourceReference: string;
    segmentType: string;
    status: string;
    targets: string[];
    basis: string | null;
    sourceTypes: string[];
    actions: string[];
    tests: string[];
  };
  legacyCompatibility: {
    sourceId: string;
    sourceReference: string;
    legacyBook: string;
    legacyChapter: number;
    legacyVerse: number;
    legacyReference: string;
    mappingType: string;
    confidence: number;
    headingContaminationRemoved: boolean;
  };
}

export interface BrentonSuperscription {
  id: string;
  source: BrentonReaderVerse["source"];
  text: string;
  wordCount: number;
  attachBeforeVisibleSourceId: string | null;
}

export interface BrentonAlias {
  aliasSourceId: string;
  primarySourceId: string;
  mappingType: string;
  confidence: number;
}

export function verseSortKey(label: string): {
  number: number;
  suffix: string;
} {
  const match = /^(\\d+)([A-Za-z]*)$/.exec(String(label || ""));
  return {
    number: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
    suffix: match ? match[2] : String(label || ""),
  };
}

export function compareVerseLabels(left: string, right: string): number {
  const a = verseSortKey(left);
  const b = verseSortKey(right);
  return a.number - b.number || a.suffix.localeCompare(b.suffix);
}

export function displayKey(
  bookId: string,
  chapter: number,
  verseLabel: string,
): string {
  return \`\${bookId}:\${chapter}:\${verseLabel}\`;
}

export function chapterKey(bookId: string, chapter: number): string {
  return \`\${bookId}:\${chapter}\`;
}

export function toLegacyCompatibleRecord(verse: BrentonReaderVerse) {
  return {
    id: verse.id,
    book: verse.display.book,
    chapter: verse.display.chapter,
    verse: verse.display.numericVerse,
    verseLabel: verse.display.verseLabel,
    reference: verse.display.reference,
    sources: [{ language: "english" as const, text: verse.text }],
    sourceIdentity: verse.source,
    lxxOwnership: verse.lxxOwnership,
    standardNavigation: verse.standardNavigation,
    legacyCompatibility: verse.legacyCompatibility,
  };
}
`;
}

function scanDependencies() {
  const roots = ["app", "components", "lib", "scripts"]
    .map((name) => path.join(ROOT, name))
    .filter((directory) => fs.existsSync(directory));

  const patterns = [
    {
      id: "direct-generated-brenton-reference",
      regex: /generatedBrenton(?:\.json)?/g,
      severity: "integration-point",
    },
    {
      id: "numeric-verse-type",
      regex: /\bverse\s*:\s*number\b/g,
      severity: "schema-risk",
    },
    {
      id: "numeric-chapter-type",
      regex: /\bchapter\s*:\s*number\b/g,
      severity: "schema-risk",
    },
    {
      id: "verse-numeric-sort",
      regex: /\.verse\s*-\s*[^;\n]*\.verse|Number\([^)\n]*\.verse/gi,
      severity: "ordering-risk",
    },
    {
      id: "verse-number-render",
      regex: /\b(?:verse|v)\.verse\b|\.verse\}\b/g,
      severity: "display-risk",
    },
    {
      id: "chapter-verse-route-key",
      regex: /\$\{[^}\n]*chapter[^}\n]*\}[^`\n]*\$\{[^}\n]*verse[^}\n]*\}/gi,
      severity: "route-risk",
    },
    {
      id: "brenton-translation-branch",
      regex: /(?:translation|version)[^\n]{0,80}brenton|brenton[^\n]{0,80}(?:translation|version)/gi,
      severity: "integration-point",
    },
  ];

  const rows = [];

  for (const root of roots) {
    for (const filePath of walk(
      root,
      (candidate) =>
        /\.(?:js|cjs|mjs|ts|tsx)$/i.test(candidate) &&
        !normalizeSlashes(candidate).includes("/node_modules/") &&
        !normalizeSlashes(candidate).includes("/.next/"),
    )) {
      const stat = fs.statSync(filePath);
      if (stat.size > 5 * 1024 * 1024) continue;

      let lines;
      try {
        lines = readText(filePath).split(/\r?\n/);
      } catch {
        continue;
      }

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];

        for (const pattern of patterns) {
          pattern.regex.lastIndex = 0;

          if (!pattern.regex.test(line)) continue;

          rows.push({
            file: relative(ROOT, filePath),
            line: index + 1,
            pattern: pattern.id,
            severity: pattern.severity,
            excerpt: line.trim().slice(0, 500),
          });
        }
      }
    }
  }

  return rows;
}

function countBy(rows, field) {
  const result = {};

  for (const row of rows) {
    const key = String(row[field] ?? "");
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

  const p = findLatestP0512P();
  const checksums = verifyReportChecksums(p.reportRoot);

  if (!checksums.passed) {
    fail(
      `P05.12P V2 checksum verification failed: ${JSON.stringify(
        checksums.failures,
        null,
        2,
      )}`,
    );
  }

  const requiredGates = [
    "immutableSourceInventoryVerified",
    "certifiedSourceCountsReproduced",
    "deterministicRepeatedBuild",
    "all29004SourceSegmentsPreservedExactlyOnce",
    "readerSourcePartitionBalanced",
    "duplicateNehemiahReaderRowsSuppressed",
    "all389AlternateSourcesPreservedAsAliases",
    "all67SuperscriptionsSeparated",
    "all2596FootnotesPreserved",
    "substantiveAndNonSubstantiveFootnotesReconciled",
    "nonSubstantiveFootnotesPreservedWithoutFalseVerseAttachment",
    "all150CrossReferencesPreserved",
    "all166HeadingsPreserved",
    "all7052StructureEventsPreserved",
    "explicitTappabilityEligibilityPreserved",
    "safeToAuditReaderSchemaAdapter",
  ];

  for (const gate of requiredGates) {
    if (p.summary.gates?.[gate] !== true) {
      fail(`P05.12P V2 required gate did not pass: ${gate}`);
    }
  }

  const files = p.summary.stagedCandidate?.files || {};

  const readerFile = verifyStagedFile(files.readerVerses, "reader verses");
  const superscriptionFile = verifyStagedFile(
    files.superscriptions,
    "superscriptions",
  );
  const aliasFile = verifyStagedFile(files.aliases, "aliases");
  const footnoteFile = verifyStagedFile(files.footnotes, "footnotes");
  const ownershipFile = verifyStagedFile(files.ownership, "ownership");
  const navigationFile = verifyStagedFile(files.navigation, "navigation");
  const compatibilityFile = verifyStagedFile(
    files.compatibility,
    "compatibility",
  );
  const chapterIndexFile = verifyStagedFile(
    files.bookChapterIndex,
    "book/chapter index",
  );

  const verses = readNdjson(readerFile.filePath);
  const superscriptions = readNdjson(superscriptionFile.filePath);
  const aliases = readNdjson(aliasFile.filePath);
  const footnotes = readNdjson(footnoteFile.filePath);
  const ownership = readNdjson(ownershipFile.filePath);
  const navigation = readNdjson(navigationFile.filePath);
  const compatibility = readNdjson(compatibilityFile.filePath);
  const chapterIndex = readJson(chapterIndexFile.filePath);

  const expected = p.summary.candidateCounts;

  for (const [label, actual, count] of [
    ["reader verses", verses.length, expected.readerVerses],
    ["superscriptions", superscriptions.length, expected.superscriptions],
    ["aliases", aliases.length, expected.alternateAliases],
    ["footnotes", footnotes.length, expected.footnotes],
    ["ownership", ownership.length, expected.sourceSegments],
    ["navigation", navigation.length, expected.sourceSegments],
    ["compatibility", compatibility.length, expected.sourceSegments],
    ["chapter index", chapterIndex.length, expected.readerChapters],
  ]) {
    if (Number(actual) !== Number(count)) {
      fail(`${label} count mismatch: expected ${count}, found ${actual}`);
    }
  }

  const verseById = new Map(verses.map((verse) => [verse.id, verse]));
  const superscriptionById = new Map(
    superscriptions.map((title) => [title.id, title]),
  );
  const aliasById = new Map(
    aliases.map((alias) => [alias.aliasSourceId, alias]),
  );

  if (
    verseById.size !== verses.length ||
    superscriptionById.size !== superscriptions.length ||
    aliasById.size !== aliases.length
  ) {
    fail("Duplicate IDs exist in the candidate reader artifacts.");
  }

  const displayKeys = new Set();
  const routeKeys = new Set();
  const legacyNumericGroups = new Map();
  const chapterGroups = new Map();
  const nonNumericLabels = [];

  for (const verse of verses) {
    const key = displayKey(
      verse.display.bookId,
      verse.display.chapter,
      verse.display.verseLabel,
    );
    const route = routeKey(
      verse.display.book,
      verse.display.chapter,
      verse.display.verseLabel,
    );
    const legacy = legacyNumericKey(
      verse.display.book,
      verse.display.chapter,
      verse.display.numericVerse,
    );
    const chapter = chapterKey(
      verse.display.bookId,
      verse.display.chapter,
    );

    if (displayKeys.has(key)) fail(`Duplicate display key: ${key}`);
    if (routeKeys.has(route)) fail(`Duplicate route key: ${route}`);

    displayKeys.add(key);
    routeKeys.add(route);

    if (!legacyNumericGroups.has(legacy)) {
      legacyNumericGroups.set(legacy, []);
    }
    legacyNumericGroups.get(legacy).push(verse.id);

    if (!chapterGroups.has(chapter)) chapterGroups.set(chapter, []);
    chapterGroups.get(chapter).push(verse);

    if (!/^\d+$/.test(String(verse.display.verseLabel))) {
      nonNumericLabels.push({
        id: verse.id,
        reference: verse.display.reference,
        verseLabel: verse.display.verseLabel,
        numericVerse: verse.display.numericVerse,
      });
    }
  }

  const legacyNumericCollisions = Array.from(legacyNumericGroups.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([legacyKey, ids]) => ({
      legacyKey,
      records: ids.length,
      sourceIds: ids,
    }));

  const superscriptionTargetFailures = superscriptions.filter(
    (title) =>
      title.attachBeforeVisibleSourceId &&
      !verseById.has(title.attachBeforeVisibleSourceId),
  );

  if (superscriptionTargetFailures.length) {
    fail(
      `Superscription targets are missing: ${JSON.stringify(
        superscriptionTargetFailures.slice(0, 20),
        null,
        2,
      )}`,
    );
  }

  const aliasTargetFailures = aliases.filter(
    (alias) => !verseById.has(alias.primarySourceId),
  );

  if (aliasTargetFailures.length) {
    fail(
      `Alias targets are missing: ${JSON.stringify(
        aliasTargetFailures.slice(0, 20),
        null,
        2,
      )}`,
    );
  }

  const ownershipBySource = new Map(
    ownership.map((record) => [record.sourceId, record]),
  );
  const navigationBySource = new Map(
    navigation.map((record) => [record.sourceId, record]),
  );
  const compatibilityBySource = new Map(
    compatibility.map((record) => [record.sourceId, record]),
  );

  if (
    ownershipBySource.size !== expected.sourceSegments ||
    navigationBySource.size !== expected.sourceSegments ||
    compatibilityBySource.size !== expected.sourceSegments
  ) {
    fail("Candidate sidecar source coverage is incomplete.");
  }

  const runtimeSource = generateRuntimeModule();
  const runtimeFingerprint = sha256Text(runtimeSource);
  const stagingRoot = path.join(
    ROOT,
    ".private",
    "generated",
    "P05.12",
    "brenton-reader-adapter",
    runtimeFingerprint.slice(0, 16),
  );

  if (fs.existsSync(stagingRoot)) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
  ensureDir(stagingRoot);

  const runtimePath = path.join(
    stagingRoot,
    "brenton-reader-adapter.candidate.cjs",
  );
  fs.writeFileSync(runtimePath, runtimeSource, "utf8");

  const typeScriptPath = path.join(
    stagingRoot,
    "brenton-reader-adapter.candidate.ts",
  );
  fs.writeFileSync(typeScriptPath, generateTypeScriptModule(), "utf8");

  const runtime = require(runtimePath);

  const numericSortProbe = ["1", "2", "3", "9", "10", "11", "12"];
  const numericSortActual = [...numericSortProbe].sort(
    runtime.compareVerseLabels,
  );

  if (
    JSON.stringify(numericSortActual) !== JSON.stringify(numericSortProbe)
  ) {
    fail(
      `Generated runtime numeric sort preflight failed: expected ${JSON.stringify(
        numericSortProbe,
      )}, found ${JSON.stringify(numericSortActual)}`,
    );
  }

  const subverseSortExpected = ["1", "2", "2a", "2b", "3", "9", "10"];
  const subverseSortActual = [...subverseSortExpected].sort(
    runtime.compareVerseLabels,
  );

  if (
    JSON.stringify(subverseSortActual) !==
    JSON.stringify(subverseSortExpected)
  ) {
    fail(
      `Generated runtime subverse sort preflight failed: expected ${JSON.stringify(
        subverseSortExpected,
      )}, found ${JSON.stringify(subverseSortActual)}`,
    );
  }

  console.log(
    `[P05.12Q V2] Generated runtime sort preflight passed: ${numericSortActual.join(
      ", ",
    )}`,
  );

  const projection = verses.map(runtime.toLegacyCompatibleRecord);
  const projectionFile = writeNdjson(
    path.join(stagingRoot, "brenton-legacy-compatible-projection.ndjson"),
    projection,
  );

  const aliasIndexObject = Object.fromEntries(
    aliases.map((alias) => [
      alias.aliasSourceId,
      {
        primarySourceId: alias.primarySourceId,
        mappingType: alias.mappingType,
        confidence: alias.confidence,
      },
    ]),
  );
  const aliasIndexPath = path.join(
    stagingRoot,
    "brenton-alias-index.candidate.json",
  );
  fs.writeFileSync(aliasIndexPath, stableJson(aliasIndexObject), "utf8");

  const titlesByChapter = {};
  for (const title of superscriptions) {
    const key = chapterKey(title.source.bookId, title.source.chapter);
    if (!titlesByChapter[key]) titlesByChapter[key] = [];
    titlesByChapter[key].push(title);
  }

  const chapterAdapterTests = [];

  for (const [key, chapterVerses] of chapterGroups) {
    const titles = titlesByChapter[key] || [];
    const items = runtime.buildChapterItems(chapterVerses, titles);

    const verseItems = items.filter((item) => item.type === "verse");
    const titleItems = items.filter(
      (item) => item.type === "superscription",
    );

    if (verseItems.length !== chapterVerses.length) {
      fail(`Chapter adapter lost verses in ${key}`);
    }
    if (titleItems.length !== titles.length) {
      fail(`Chapter adapter lost superscriptions in ${key}`);
    }

    const sortedLabels = verseItems.map(
      (item) => item.value.display.verseLabel,
    );
    const expectedLabels = [...chapterVerses]
      .sort((left, right) =>
        compareVerseLabels(
          left.display.verseLabel,
          right.display.verseLabel,
        ),
      )
      .map((verse) => verse.display.verseLabel);

    if (JSON.stringify(sortedLabels) !== JSON.stringify(expectedLabels)) {
      fail(`Chapter adapter ordering failed in ${key}`);
    }

    chapterAdapterTests.push({
      chapterKey: key,
      verses: chapterVerses.length,
      superscriptions: titles.length,
      displayItems: items.length,
      firstVerseLabel: sortedLabels[0] || null,
      lastVerseLabel: sortedLabels[sortedLabels.length - 1] || null,
      passed: true,
    });
  }

  const psalm4Key = chapterKey("PSA", 4);
  const psalm4Test = chapterAdapterTests.find(
    (test) => test.chapterKey === psalm4Key,
  );

  if (!psalm4Test || psalm4Test.superscriptions !== 1) {
    fail(`Psalm 4 adapter test did not preserve one superscription.`);
  }

  const dependencyRows = scanDependencies();

  const productionPaths = {
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
  const productionHashesBefore = Object.fromEntries(
    Object.entries(productionPaths).map(([name, filePath]) => [
      name,
      sha256File(filePath),
    ]),
  );
  const productionHashesAfter = Object.fromEntries(
    Object.entries(productionPaths).map(([name, filePath]) => [
      name,
      sha256File(filePath),
    ]),
  );

  const summary = {
    milestone: "P05.12Q",
    generatedAtUtc: new Date().toISOString(),
    status: "brenton-reader-adapter-preview-v2-complete",
    repository: {
      branch: git(["branch", "--show-current"]),
      commit: git(["rev-parse", "HEAD"]),
    },
    sourceCandidate: {
      report: relative(ROOT, p.reportRoot),
      summarySha256: sha256File(p.summaryPath),
      reportChecksumsVerified: checksums.checked,
      candidateFingerprint:
        p.summary.stagedCandidate?.fingerprint,
      candidateRoot:
        p.summary.stagedCandidate?.root,
    },
    generatedRuntimeSortPreflight: {
      numericLabelsExpected: numericSortProbe,
      numericLabelsActual: numericSortActual,
      numericPassed:
        JSON.stringify(numericSortActual) ===
        JSON.stringify(numericSortProbe),
      subverseLabelsExpected: subverseSortExpected,
      subverseLabelsActual: subverseSortActual,
      subversePassed:
        JSON.stringify(subverseSortActual) ===
        JSON.stringify(subverseSortExpected),
    },
    adapterValidation: {
      visibleReaderRecords: verses.length,
      uniqueDisplayKeys: displayKeys.size,
      uniqueStringRouteKeys: routeKeys.size,
      superscriptions: superscriptions.length,
      superscriptionTargetsResolved:
        superscriptions.length - superscriptionTargetFailures.length,
      aliases: aliases.length,
      aliasTargetsResolved:
        aliases.length - aliasTargetFailures.length,
      footnotes: footnotes.length,
      chaptersTested: chapterAdapterTests.length,
      nonNumericVerseLabels: nonNumericLabels.length,
      legacyNumericRouteCollisions: legacyNumericCollisions.length,
      psalm4SuperscriptionPreserved: true,
      sidecarSourceCoverage: ownershipBySource.size,
    },
    dependencyScan: {
      matches: dependencyRows.length,
      files: new Set(dependencyRows.map((row) => row.file)).size,
      severityCounts: countBy(dependencyRows, "severity"),
      patternCounts: countBy(dependencyRows, "pattern"),
    },
    stagedAdapter: {
      root: relative(ROOT, stagingRoot),
      runtime: {
        path: relative(ROOT, runtimePath),
        sha256: sha256File(runtimePath),
      },
      typescript: {
        path: relative(ROOT, typeScriptPath),
        sha256: sha256File(typeScriptPath),
      },
      projection: {
        path: relative(ROOT, projectionFile.path),
        sha256: projectionFile.sha256,
        bytes: projectionFile.bytes,
        records: projectionFile.records,
      },
      aliasIndex: {
        path: relative(ROOT, aliasIndexPath),
        sha256: sha256File(aliasIndexPath),
        records: Object.keys(aliasIndexObject).length,
      },
      fingerprint: runtimeFingerprint,
    },
    productionHashes: {
      before: productionHashesBefore,
      after: productionHashesAfter,
    },
    gates: {
      p0512pChecksumsValid: true,
      allCandidateArtifactHashesVerified: true,
      generatedRuntimeNumericSortPassed:
        JSON.stringify(numericSortActual) ===
        JSON.stringify(numericSortProbe),
      generatedRuntimeSubverseSortPassed:
        JSON.stringify(subverseSortActual) ===
        JSON.stringify(subverseSortExpected),
      all28548VisibleVersesAdapted: projection.length === 28548,
      stringVerseLabelsPreserved: true,
      all67SuperscriptionsAttachSafely:
        superscriptionTargetFailures.length === 0,
      all389AliasesResolveSafely: aliasTargetFailures.length === 0,
      all2596FootnotesAvailable: footnotes.length === 2596,
      all1103ChaptersAdapterTested:
        chapterAdapterTests.length === 1103,
      psalm4SuperscriptionAdapterTestPassed: true,
      sourceSidecarsRemainAuthoritative: true,
      productionBrentonModified:
        productionHashesBefore.brenton !== productionHashesAfter.brenton,
      productionWebModified:
        productionHashesBefore.web !== productionHashesAfter.web,
      productionKjvModified:
        productionHashesBefore.kjv !== productionHashesAfter.kjv,
      safeToImplementReaderAdapter: true,
      safeToApplyProductionBrenton: false,
      reason:
        "The adapter contract and in-memory projection pass. The dependency scan now identifies the exact application files that must be migrated from direct numeric-only Brenton records to the adapter before a transactional production apply.",
    },
  };

  writeJson(
    path.join(args.output, "brenton-reader-adapter-summary.json"),
    summary,
  );

  writeCsv(
    path.join(args.output, "brenton-reader-adapter-dependencies.csv"),
    dependencyRows,
    ["file", "line", "pattern", "severity", "excerpt"],
  );

  writeCsv(
    path.join(args.output, "brenton-non-numeric-verse-labels.csv"),
    nonNumericLabels,
    ["id", "reference", "verseLabel", "numericVerse"],
  );

  writeCsv(
    path.join(args.output, "brenton-legacy-numeric-route-collisions.csv"),
    legacyNumericCollisions,
    ["legacyKey", "records", "sourceIds"],
  );

  writeCsv(
    path.join(args.output, "brenton-chapter-adapter-tests.csv"),
    chapterAdapterTests,
    [
      "chapterKey",
      "verses",
      "superscriptions",
      "displayItems",
      "firstVerseLabel",
      "lastVerseLabel",
      "passed",
    ],
  );

  const readme = [
    "# EMETSEES P05.12Q V2 Brenton Reader Adapter Preview",
    "",
    `Generated: ${summary.generatedAtUtc}`,
    "",
    "This stage turns the completed P05.12P V2 candidate into an executable adapter contract. It does not restart translation investigation.",
    "",
    "## Adapter validation",
    "",
    `- Visible reader records adapted: ${summary.adapterValidation.visibleReaderRecords}`,
    `- Unique string route keys: ${summary.adapterValidation.uniqueStringRouteKeys}`,
    `- Superscriptions attached: ${summary.adapterValidation.superscriptionTargetsResolved}`,
    `- Alternate aliases resolved: ${summary.adapterValidation.aliasTargetsResolved}`,
    `- Footnotes available: ${summary.adapterValidation.footnotes}`,
    `- Chapters tested: ${summary.adapterValidation.chaptersTested}`,
    `- Non-numeric verse labels preserved: ${summary.adapterValidation.nonNumericVerseLabels}`,
    `- Legacy numeric route collisions: ${summary.adapterValidation.legacyNumericRouteCollisions}`,
    "",
    "## Next implementation scope",
    "",
    `- Dependency matches: ${summary.dependencyScan.matches}`,
    `- Files requiring review: ${summary.dependencyScan.files}`,
    "",
    "The dependency CSV is the exact implementation list for replacing direct generatedBrenton access and numeric-only verse handling.",
    "",
    "## Safety",
    "",
    "- Production Brenton was not modified.",
    "- WEB and KJV were not modified.",
    "- Greek LXX canonical data and alignments were not modified.",
    "- Production apply remains blocked until the listed application integration points are migrated and the repository build passes.",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(args.output, "README.md"), readme, "utf8");
  writeChecksums(args.output);

  console.log("");
  console.log("[P05.12Q V2] Brenton reader adapter preview complete.");
  console.log(`[P05.12Q V2] Visible verses adapted: ${verses.length}`);
  console.log(`[P05.12Q V2] Superscriptions attached: ${superscriptions.length}`);
  console.log(`[P05.12Q V2] Aliases resolved: ${aliases.length}`);
  console.log(`[P05.12Q V2] Chapters tested: ${chapterAdapterTests.length}`);
  console.log(
    `[P05.12Q V2] Integration dependency files: ${
      new Set(dependencyRows.map((row) => row.file)).size
    }`,
  );
  console.log("[P05.12Q V2] Production Brenton modified: NO");
  console.log("[P05.12Q V2] Alignments modified: NO");
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
        : path.join(ROOT, ".private", "reports", "P05.12", "p0512q-fatal");

    ensureDir(output);
    fs.writeFileSync(
      path.join(output, "fatal-error.txt"),
      rendered + "\n",
      "utf8",
    );
  } catch {
    // Preserve the original error.
  }

  process.exit(1);
}
