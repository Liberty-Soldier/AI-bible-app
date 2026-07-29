#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");

const ROOT = process.cwd();

function fail(message) {
  throw new Error(`[P05.12J versification crosswalk] ${message}`);
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
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && predicate(fullPath)) result.push(fullPath);
    }
  }

  return result.sort((a, b) => a.localeCompare(b));
}

function computeTreeSha256(directory) {
  const files = walk(directory, (filePath) => fs.statSync(filePath).isFile());
  const lines = files.map((filePath) => {
    const rel = relative(directory, filePath);
    return `${rel}\t${fs.statSync(filePath).size}\t${sha256File(filePath)}`;
  });
  return sha256Text(lines.join("\n"));
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

function parseArgs(argv) {
  const args = {
    output: "",
    versificationDir: "",
    sourceManifest: "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];

    if (argument === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else if (argument === "--versification-dir" && next) {
      args.versificationDir = path.resolve(next);
      index += 1;
    } else if (argument === "--source-manifest" && next) {
      args.sourceManifest = path.resolve(next);
      index += 1;
    } else {
      fail(`Unknown or incomplete argument: ${argument}`);
    }
  }

  if (!args.output) fail("Missing --output.");
  if (!args.versificationDir) fail("Missing --versification-dir.");
  if (!args.sourceManifest) fail("Missing --source-manifest.");

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

function verifyChecksums(reportRoot) {
  const checksumPath = path.join(reportRoot, "checksums.sha256");
  if (!fs.existsSync(checksumPath)) {
    fail(`Missing checksums.sha256 in ${reportRoot}`);
  }

  const failures = [];
  const checked = [];

  for (const line of readText(checksumPath).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^([a-f0-9]{64})  (.+)$/i.exec(line);
    if (!match) {
      failures.push({ line, reason: "invalid-checksum-line" });
      continue;
    }

    const expected = match[1].toLowerCase();
    const relativePath = normalizeSlashes(match[2]);
    const filePath = path.join(reportRoot, relativePath.replace(/\//g, path.sep));

    if (!fs.existsSync(filePath)) {
      // PowerShell Compress-Archive sometimes preserves a backslash in a filename
      // created on Windows. Fall back to normalized directory enumeration.
      const candidate = walk(reportRoot).find(
        (item) => relative(reportRoot, item) === relativePath,
      );

      if (!candidate) {
        failures.push({ relativePath, reason: "missing" });
        continue;
      }

      const actual = sha256File(candidate);
      checked.push(relativePath);
      if (actual !== expected) {
        failures.push({ relativePath, expected, actual });
      }
      continue;
    }

    const actual = sha256File(filePath);
    checked.push(relativePath);
    if (actual !== expected) {
      failures.push({ relativePath, expected, actual });
    }
  }

  return {
    checked: checked.length,
    failures,
    passed: failures.length === 0,
  };
}

function findLatestP0512I() {
  const reportRoot = path.join(ROOT, ".private", "reports", "P05.12");
  const summaries = walk(
    reportRoot,
    (filePath) => path.basename(filePath) === "brenton-topology-summary.json",
  ).filter((filePath) => {
    try {
      return readJson(filePath)?.milestone === "P05.12I";
    } catch {
      return false;
    }
  });

  if (!summaries.length) {
    fail("No completed P05.12I brenton-topology-summary.json was found.");
  }

  summaries.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const summaryPath = summaries[0];
  const reportRootPath = path.dirname(summaryPath);

  return {
    reportRoot: reportRootPath,
    summaryPath,
    summary: readJson(summaryPath),
  };
}

function findLxxMappingFile(directory) {
  const candidates = [];

  for (const filePath of walk(directory, (item) => /\.json$/i.test(item))) {
    try {
      const value = readJson(filePath);
      const tradition = String(value?.tradition || "").toLowerCase();

      if (
        tradition === "lxx" &&
        value &&
        typeof value.tradition_to_eng === "object" &&
        typeof value.eng_to_tradition === "object"
      ) {
        candidates.push({ filePath, value });
      }
    } catch {
      // Other JSON files in the source package are not mapping files.
    }
  }

  if (candidates.length !== 1) {
    fail(
      `Expected exactly one LXX mapping JSON, found ${candidates.length}: ${candidates
        .map((candidate) => relative(directory, candidate.filePath))
        .join(", ")}`,
    );
  }

  return candidates[0];
}

const BOOK_NAME_TO_ID = new Map(
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

function normalizeCoordinate(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function normalizeMappingTargets(value) {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return value.flatMap(normalizeMappingTargets);
  }

  if (typeof value === "object") {
    return Object.values(value).flatMap(normalizeMappingTargets);
  }

  const text = String(value).trim();
  if (!text) return [];

  // Paratext mappings are normally one coordinate string. This also preserves
  // uncommon comma/space-delimited values without silently inventing meaning.
  const exactCoordinate = /^[1-4A-Z0-9]{3}\.\d+\.[0-9]+[A-Z]?$/i;
  if (exactCoordinate.test(text)) return [normalizeCoordinate(text)];

  const coordinateMatches =
    text.match(/[1-4A-Z0-9]{3}\.\d+\.[0-9]+[A-Z]?/gi) || [];

  return Array.from(new Set(coordinateMatches.map(normalizeCoordinate)));
}

function sourceCoordinate(row) {
  const bookId =
    String(row.sourceBookId || "").toUpperCase() ||
    BOOK_NAME_TO_ID.get(row.book || row.sourceBook);

  if (!bookId) {
    fail(`Unable to determine source book ID for ${row.reference || row.sourceReference}`);
  }

  const chapter = Number(row.sourceChapter || row.chapter);
  const label = String(row.sourceVerseLabel || row.verseLabel || "").toUpperCase();

  return `${bookId}.${chapter}.${label}`;
}

function currentReaderCoordinate(row) {
  const sourceBookId =
    String(row.sourceBookId || "").toUpperCase() ||
    BOOK_NAME_TO_ID.get(row.sourceBook || row.book);

  if (!sourceBookId) return "";

  return `${sourceBookId}.${Number(row.readerChapter)}.${Number(row.readerVerse)}`;
}

function isVerseZero(coordinate) {
  return /\.\d+\.0(?:$|[A-Z])/i.test(coordinate);
}

function targetType(targets) {
  if (!targets.length) return "unparsed-standard-target";
  if (targets.length > 1) return "multiple-standard-targets";
  if (isVerseZero(targets[0])) return "heading-or-superscription-target";
  return "single-verse-target";
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

  if (!fs.existsSync(args.versificationDir)) {
    fail(`Versification directory not found: ${args.versificationDir}`);
  }
  if (!fs.existsSync(args.sourceManifest)) {
    fail(`Source manifest not found: ${args.sourceManifest}`);
  }

  const sourceManifest = readJson(args.sourceManifest);
  const sourceTreeSha256 = computeTreeSha256(args.versificationDir);

  if (sourceManifest.treeSha256 !== sourceTreeSha256) {
    fail(
      `Versification tree hash mismatch. Expected ${sourceManifest.treeSha256}, found ${sourceTreeSha256}`,
    );
  }

  const p0512i = findLatestP0512I();
  const checksumAudit = verifyChecksums(p0512i.reportRoot);

  if (!checksumAudit.passed) {
    fail(
      `P05.12I checksum verification failed: ${JSON.stringify(
        checksumAudit.failures,
        null,
        2,
      )}`,
    );
  }

  const mapPath = path.join(
    p0512i.reportRoot,
    "brenton-source-to-reader-map.csv",
  );
  const unresolvedPath = path.join(
    p0512i.reportRoot,
    "brenton-unresolved-source-segments.csv",
  );

  if (!fs.existsSync(mapPath) || !fs.existsSync(unresolvedPath)) {
    fail("P05.12I mapping files are incomplete.");
  }

  const mappedRows = readCsv(mapPath);
  const unresolvedSourceRows = readCsv(unresolvedPath);

  const sourceRowsByKey = new Map();

  for (const row of mappedRows) {
    const key = sourceCoordinate(row);
    if (!sourceRowsByKey.has(key)) {
      sourceRowsByKey.set(key, {
        sourceBookId: row.sourceBookId,
        sourceBook: row.sourceBook,
        sourceChapter: row.sourceChapter,
        sourceVerseLabel: row.sourceVerseLabel,
        sourceVerse: row.sourceVerse,
        sourceReference: row.sourceReference,
        sourceText: row.sourceText,
        sourceFile: row.sourceFile,
        sourceLine: row.sourceLine,
        currentReaderCoordinate: currentReaderCoordinate(row),
        currentReaderReference: row.readerReference,
        currentReaderText: row.readerText,
        topologyMappingType: row.mappingType,
        topologyConfidence: row.confidence,
        lxxSourceCoordinate: row.lxxSourceCoordinate,
        lxxReaderCoordinate: row.lxxReaderCoordinate,
      });
    }
  }

  for (const row of unresolvedSourceRows) {
    const key = sourceCoordinate(row);
    if (sourceRowsByKey.has(key)) continue;

    sourceRowsByKey.set(key, {
      sourceBookId:
        BOOK_NAME_TO_ID.get(row.book) || "",
      sourceBook: row.book,
      sourceChapter: row.chapter,
      sourceVerseLabel: row.verseLabel,
      sourceVerse: String(row.verseLabel || "").match(/^\d+/)?.[0] || "",
      sourceReference: row.reference,
      sourceText: row.text,
      sourceFile: row.sourceFile,
      sourceLine: row.sourceLine,
      currentReaderCoordinate: "",
      currentReaderReference: "",
      currentReaderText: "",
      topologyMappingType: "unresolved-current-reader",
      topologyConfidence: "",
      lxxSourceCoordinate: "",
      lxxReaderCoordinate: "",
    });
  }

  const expectedSegments = Number(
    p0512i.summary?.topology?.visibleSourceSegments,
  );

  if (sourceRowsByKey.size !== expectedSegments) {
    fail(
      `P05.12I source segment inventory mismatch: expected ${expectedSegments}, found ${sourceRowsByKey.size}`,
    );
  }

  const lxxMapping = findLxxMappingFile(args.versificationDir);
  const traditionToEnglish = lxxMapping.value.tradition_to_eng || {};
  const EnglishToTradition = lxxMapping.value.eng_to_tradition || {};

  const explicitMappingLookup = new Map(
    Object.entries(traditionToEnglish).map(([key, value]) => [
      normalizeCoordinate(key),
      value,
    ]),
  );

  const rows = [];
  const targetToSources = new Map();

  for (const [sourceKey, source] of sourceRowsByKey) {
    const exactValue = explicitMappingLookup.get(sourceKey);
    const numericKey = sourceKey.replace(/([0-9]+)[A-Z]$/i, "$1");
    const numericFallbackValue =
      exactValue === undefined && numericKey !== sourceKey
        ? explicitMappingLookup.get(numericKey)
        : undefined;

    const mappingValue =
      exactValue !== undefined ? exactValue : numericFallbackValue;

    const explicit = mappingValue !== undefined;
    const targets = explicit
      ? normalizeMappingTargets(mappingValue)
      : [sourceKey];

    const parsed = targets.length > 0;
    const currentCoordinate = source.currentReaderCoordinate;
    const currentMatchesStandard =
      Boolean(currentCoordinate) && targets.includes(currentCoordinate);

    const mappingBasis =
      exactValue !== undefined
        ? "explicit-lxx-to-eng"
        : numericFallbackValue !== undefined
          ? "explicit-numeric-fallback-for-subverse"
          : "implicit-identity";

    const row = {
      sourceCoordinate: sourceKey,
      sourceBookId: source.sourceBookId,
      sourceBook: source.sourceBook,
      sourceChapter: source.sourceChapter,
      sourceVerseLabel: source.sourceVerseLabel,
      sourceReference: source.sourceReference,
      sourceText: source.sourceText,
      standardTargetRaw:
        mappingValue === undefined
          ? sourceKey
          : typeof mappingValue === "string"
            ? mappingValue
            : JSON.stringify(mappingValue),
      standardEnglishTargets: targets.join(" | "),
      standardTargetCount: targets.length,
      standardTargetType: targetType(targets),
      mappingBasis,
      mappingParsed: parsed,
      currentReaderCoordinate: currentCoordinate,
      currentReaderReference: source.currentReaderReference,
      currentMatchesStandard,
      currentMismatch:
        Boolean(currentCoordinate) && !currentMatchesStandard,
      currentReaderUnresolved: !currentCoordinate,
      topologyMappingType: source.topologyMappingType,
      topologyConfidence: source.topologyConfidence,
      lxxCanonicalSourceCoordinate: source.lxxSourceCoordinate,
      lxxCanonicalCurrentCoordinate: source.lxxReaderCoordinate,
      sourceFile: source.sourceFile,
      sourceLine: source.sourceLine,
    };

    rows.push(row);

    for (const target of targets) {
      if (!targetToSources.has(target)) targetToSources.set(target, []);
      targetToSources.get(target).push(sourceKey);
    }
  }

  rows.sort((a, b) =>
    a.sourceCoordinate.localeCompare(b.sourceCoordinate, "en", {
      numeric: true,
    }),
  );

  const collisions = Array.from(targetToSources.entries())
    .filter(([, sources]) => sources.length > 1)
    .map(([standardEnglishTarget, sources]) => ({
      standardEnglishTarget,
      sourceSegmentCount: sources.length,
      sourceCoordinates: sources.join(" | "),
      collisionType: isVerseZero(standardEnglishTarget)
        ? "heading-or-superscription-many-to-one"
        : "many-source-segments-to-one-reader-coordinate",
    }))
    .sort(
      (a, b) =>
        b.sourceSegmentCount - a.sourceSegmentCount ||
        a.standardEnglishTarget.localeCompare(b.standardEnglishTarget),
    );

  const unparsed = rows.filter((row) => !row.mappingParsed);
  const currentMismatches = rows.filter((row) => row.currentMismatch);
  const currentUnresolved = rows.filter(
    (row) => row.currentReaderUnresolved,
  );
  const headingTargets = rows.filter(
    (row) => row.standardTargetType === "heading-or-superscription-target",
  );
  const explicitRows = rows.filter(
    (row) => row.mappingBasis !== "implicit-identity",
  );

  const psalm4 = rows.filter(
    (row) =>
      row.sourceBookId === "PSA" &&
      Number(row.sourceChapter) === 4,
  );

  const candidate = {
    schemaVersion: "brenton-lxx-to-english-crosswalk@1",
    generatedAtUtc: new Date().toISOString(),
    source: {
      p0512iReport: relative(ROOT, p0512i.reportRoot),
      p0512iSummarySha256: sha256File(p0512i.summaryPath),
      standardsWitness: sourceManifest,
      lxxMappingFile: relative(
        args.versificationDir,
        lxxMapping.filePath,
      ),
      lxxMappingSha256: sha256File(lxxMapping.filePath),
    },
    mappings: rows.map((row) => ({
      sourceCoordinate: row.sourceCoordinate,
      standardEnglishTargets: row.standardEnglishTargets
        ? row.standardEnglishTargets.split(" | ")
        : [],
      mappingBasis: row.mappingBasis,
      targetType: row.standardTargetType,
      currentReaderCoordinate: row.currentReaderCoordinate || null,
      sourceReference: row.sourceReference,
    })),
  };

  const candidateText = JSON.stringify(candidate, null, 2) + "\n";
  const candidateFingerprint = sha256Text(candidateText);
  const stagingRoot = path.join(
    ROOT,
    ".private",
    "generated",
    "P05.12",
    "brenton-versification",
    candidateFingerprint.slice(0, 16),
  );
  ensureDir(stagingRoot);
  const candidatePath = path.join(
    stagingRoot,
    "brenton-lxx-to-english-crosswalk.candidate.json",
  );
  fs.writeFileSync(candidatePath, candidateText, "utf8");

  const summary = {
    milestone: "P05.12J",
    generatedAtUtc: new Date().toISOString(),
    status: "lxx-to-english-versification-crosswalk-preview-complete",
    repository: {
      branch: git(["branch", "--show-current"]),
      commit: git(["rev-parse", "HEAD"]),
    },
    sources: {
      p0512i: {
        report: relative(ROOT, p0512i.reportRoot),
        checksumsVerified: checksumAudit.checked,
        checksumsPassed: checksumAudit.passed,
        sourceSegments: expectedSegments,
      },
      standardsWitness: {
        repository: sourceManifest.repository,
        commit: sourceManifest.commit,
        copiedFrom: sourceManifest.copiedFrom,
        treeSha256: sourceManifest.treeSha256,
        verifiedTreeSha256: sourceTreeSha256,
        lxxMappingFile: relative(
          args.versificationDir,
          lxxMapping.filePath,
        ),
        lxxMappingSha256: sha256File(lxxMapping.filePath),
        tradition: lxxMapping.value.tradition,
        explicitTraditionToEnglishMappings: Object.keys(
          traditionToEnglish,
        ).length,
        explicitEnglishToTraditionMappings: Object.keys(
          EnglishToTradition,
        ).length,
      },
    },
    crosswalk: {
      sourceSegments: rows.length,
      explicitMappings: explicitRows.length,
      implicitIdentityMappings:
        rows.length - explicitRows.length,
      headingOrSuperscriptionTargets: headingTargets.length,
      manyToOneTargetCollisions: collisions.length,
      currentReaderMatchesStandard:
        rows.length -
        currentMismatches.length -
        currentUnresolved.length,
      currentReaderMismatchesStandard: currentMismatches.length,
      currentReaderUnresolved: currentUnresolved.length,
      unparsedStandardMappings: unparsed.length,
      psalm4Mappings: psalm4.length,
    },
    stagedCandidate: {
      path: relative(ROOT, candidatePath),
      sha256: sha256File(candidatePath),
      fingerprint: candidateFingerprint,
      records: candidate.mappings.length,
    },
    gates: {
      p0512iChecksumsValid: true,
      standardsSourcePinned: true,
      standardsTreeHashVerified: true,
      allBrentonSourceSegmentsInventoried:
        rows.length === expectedSegments,
      allStandardMappingsParsed: unparsed.length === 0,
      productionBrentonModified: false,
      lxxCanonicalModified: false,
      alignmentsModified: false,
      safeToBuildProductionBrentonCandidate: false,
      reason:
        "The external LXX-to-English standard crosswalk must be reviewed, especially verse-zero headings, many-to-one targets, and rows where current reader coordinates differ from the standard.",
    },
  };

  writeJson(
    path.join(args.output, "brenton-standard-crosswalk-summary.json"),
    summary,
  );

  writeCsv(
    path.join(args.output, "brenton-lxx-to-english-crosswalk.csv"),
    rows,
    [
      "sourceCoordinate",
      "sourceBookId",
      "sourceBook",
      "sourceChapter",
      "sourceVerseLabel",
      "sourceReference",
      "standardTargetRaw",
      "standardEnglishTargets",
      "standardTargetCount",
      "standardTargetType",
      "mappingBasis",
      "mappingParsed",
      "currentReaderCoordinate",
      "currentReaderReference",
      "currentMatchesStandard",
      "currentMismatch",
      "currentReaderUnresolved",
      "topologyMappingType",
      "topologyConfidence",
      "lxxCanonicalSourceCoordinate",
      "lxxCanonicalCurrentCoordinate",
      "sourceText",
      "sourceFile",
      "sourceLine",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-current-reader-mismatches-standard.csv"),
    currentMismatches,
    [
      "sourceCoordinate",
      "sourceReference",
      "standardEnglishTargets",
      "standardTargetType",
      "mappingBasis",
      "currentReaderCoordinate",
      "currentReaderReference",
      "topologyMappingType",
      "sourceText",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-standard-target-collisions.csv"),
    collisions,
    [
      "standardEnglishTarget",
      "sourceSegmentCount",
      "sourceCoordinates",
      "collisionType",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-heading-and-superscription-targets.csv"),
    headingTargets,
    [
      "sourceCoordinate",
      "sourceReference",
      "standardEnglishTargets",
      "currentReaderCoordinate",
      "currentReaderReference",
      "sourceText",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-unparsed-standard-mappings.csv"),
    unparsed,
    [
      "sourceCoordinate",
      "sourceReference",
      "standardTargetRaw",
      "sourceText",
    ],
  );

  ensureDir(path.join(args.output, "samples"));
  const psalmLines = [
    "# Brenton Psalm 4 — LXX to English reader crosswalk",
    "",
    "This is a preview only. No verse number or Scripture text was changed.",
    "",
    "| Brenton/LXX source | Standard English target | Current reader | Basis | Text |",
    "|---|---|---|---|---|",
    ...psalm4.map(
      (row) =>
        `| ${row.sourceCoordinate} | ${row.standardEnglishTargets} | ${
          row.currentReaderCoordinate || "unresolved"
        } | ${row.mappingBasis} | ${String(row.sourceText || "").replace(
          /\|/g,
          "\\|",
        )} |`,
    ),
    "",
  ];
  fs.writeFileSync(
    path.join(args.output, "samples", "brenton-psalm-4-standard-crosswalk.md"),
    psalmLines.join("\n"),
    "utf8",
  );

  const readme = [
    "# EMETSEES P05.12J LXX-to-English Versification Crosswalk",
    "",
    `Generated: ${summary.generatedAtUtc}`,
    "",
    "This report compares every locked Brenton/LXX source segment with a pinned UBS-Paratext-derived LXX-to-English versification witness.",
    "",
    "## Results",
    "",
    `- Brenton source segments: ${summary.crosswalk.sourceSegments}`,
    `- Explicit LXX-to-English mappings: ${summary.crosswalk.explicitMappings}`,
    `- Implicit identity mappings: ${summary.crosswalk.implicitIdentityMappings}`,
    `- Heading or superscription targets: ${summary.crosswalk.headingOrSuperscriptionTargets}`,
    `- Many-to-one target collisions: ${summary.crosswalk.manyToOneTargetCollisions}`,
    `- Current reader coordinates matching standard: ${summary.crosswalk.currentReaderMatchesStandard}`,
    `- Current reader coordinates differing from standard: ${summary.crosswalk.currentReaderMismatchesStandard}`,
    `- Current reader unresolved: ${summary.crosswalk.currentReaderUnresolved}`,
    `- Unparsed standard mappings: ${summary.crosswalk.unparsedStandardMappings}`,
    "",
    "## Safety",
    "",
    "- Production Brenton was not modified.",
    "- Greek LXX source tokens were not modified.",
    "- WEB and KJV were not modified.",
    "- Display tokens and alignments were not rebuilt.",
    "- No Brenton apply step is authorized by this report.",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(args.output, "README.md"), readme, "utf8");
  writeChecksums(args.output);

  console.log("");
  console.log("[P05.12J] LXX-to-English crosswalk preview complete.");
  console.log(
    `[P05.12J] Source segments: ${summary.crosswalk.sourceSegments}`,
  );
  console.log(
    `[P05.12J] Current reader mismatches standard: ${summary.crosswalk.currentReaderMismatchesStandard}`,
  );
  console.log(
    `[P05.12J] Heading/superscription targets: ${summary.crosswalk.headingOrSuperscriptionTargets}`,
  );
  console.log(
    `[P05.12J] Unparsed standard mappings: ${summary.crosswalk.unparsedStandardMappings}`,
  );
  console.log("[P05.12J] Production Brenton modified: NO");
  console.log("[P05.12J] Alignments modified: NO");
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
        : path.join(
            ROOT,
            ".private",
            "reports",
            "P05.12",
            "p0512j-fatal",
          );
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
