#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");

const ROOT = process.cwd();

function fail(message) {
  throw new Error(`[P05.12J V4 TVTMS census] ${message}`);
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

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(filePath) {
  return sha256Buffer(readBuffer(filePath));
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
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
    sourceRoot: "",
    sourceManifest: "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];

    if (argument === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else if (argument === "--source-root" && next) {
      args.sourceRoot = path.resolve(next);
      index += 1;
    } else if (argument === "--source-manifest" && next) {
      args.sourceManifest = path.resolve(next);
      index += 1;
    } else {
      fail(`Unknown or incomplete argument: ${argument}`);
    }
  }

  if (!args.output) fail("Missing --output.");
  if (!args.sourceRoot) fail("Missing --source-root.");
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
    fail(`Missing P05.12I checksums: ${checksumPath}`);
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
    const normalizedPath = normalizeSlashes(match[2]);

    const exact = path.join(
      reportRoot,
      normalizedPath.replace(/\//g, path.sep),
    );

    const filePath = fs.existsSync(exact)
      ? exact
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
    (filePath) => path.basename(filePath) === "brenton-topology-summary.json",
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
    summaryPath,
    reportRoot: path.dirname(summaryPath),
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
      `Expected exactly one TVTMS text file, found ${candidates.length}: ${candidates
        .map((filePath) => relative(sourceRoot, filePath))
        .join(", ")}`,
    );
  }

  return candidates[0];
}

function newlineProfile(buffer) {
  const text = buffer.toString("utf8");

  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(?<!\r)\n/g) || []).length;
  const cr = (text.match(/\r(?!\n)/g) || []).length;

  return { crlf, lf, cr };
}

function classifyLine(line) {
  if (!line.trim()) return "blank";
  if (line.startsWith("$")) return "record-marker";
  if (line.startsWith("#")) return "comment";
  if (line.startsWith("\t")) return "tab-indented-subrecord";
  if (/^[A-Z][A-Za-z0-9 _+&/()-]{2,}\t/.test(line)) {
    return "possible-header-or-record";
  }
  return "other";
}

function delimiterProfile(lines) {
  const counts = new Map();

  for (const line of lines) {
    const tabs = (line.match(/\t/g) || []).length;
    counts.set(tabs, (counts.get(tabs) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([tabCount, lines]) => ({ tabCount, lines }))
    .sort((a, b) => a.tabCount - b.tabCount);
}

function collectContexts(lines, patterns, radius = 1, limitPerPattern = 30) {
  const rows = [];

  for (const descriptor of patterns) {
    const regex = new RegExp(descriptor.pattern, "i");
    let matches = 0;

    for (let index = 0; index < lines.length; index += 1) {
      if (!regex.test(lines[index])) continue;
      if (matches >= limitPerPattern) break;

      matches += 1;

      for (
        let contextIndex = Math.max(0, index - radius);
        contextIndex <= Math.min(lines.length - 1, index + radius);
        contextIndex += 1
      ) {
        rows.push({
          topic: descriptor.topic,
          matchedLine: index + 1,
          contextLine: contextIndex + 1,
          isMatch: contextIndex === index,
          text: lines[contextIndex],
        });
      }
    }
  }

  return rows;
}

function uniqueSectionMarkers(lines) {
  const markers = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (
      line.startsWith("$") ||
      /methodology|tradition|versification|standardi[sz]ation/i.test(line)
    ) {
      markers.push({
        line: index + 1,
        classification: classifyLine(line),
        text: line,
      });
    }

    if (markers.length >= 500) break;
  }

  return markers;
}

function headerCandidates(lines) {
  const candidates = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const cells = line.split("\t");

    if (cells.length < 3) continue;

    const joined = cells.join(" ").toLowerCase();
    const score = [
      "english",
      "eng",
      "greek",
      "grk",
      "hebrew",
      "heb",
      "latin",
      "reference",
      "verse",
      "tradition",
      "rule",
      "section",
      "method",
    ].reduce(
      (total, token) => total + (joined.includes(token) ? 1 : 0),
      0,
    );

    if (score >= 2) {
      candidates.push({
        line: index + 1,
        columns: cells.length,
        score,
        text: line,
      });
    }

    if (candidates.length >= 300) break;
  }

  return candidates;
}

function tokenCounts(text) {
  const tokens = [
    "English",
    "Eng",
    "Greek",
    "Grk",
    "Hebrew",
    "Heb",
    "Latin",
    "Lat",
    "LXX",
    "Septuagint",
    "NRSV",
    "KJV",
  ];

  return Object.fromEntries(
    tokens.map((token) => [
      token,
      (text.match(new RegExp(`\\b${token}\\b`, "gi")) || []).length,
    ]),
  );
}

function fileManifest(sourceRoot) {
  const files = walk(
    sourceRoot,
    (filePath) => path.basename(filePath) !== "source-manifest.json",
  );

  return files.map((filePath) => ({
    path: relative(sourceRoot, filePath),
    bytes: fs.statSync(filePath).size,
    sha256: sha256File(filePath),
  }));
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

  if (!fs.existsSync(args.sourceRoot)) {
    fail(`Pinned STEPBible source root not found: ${args.sourceRoot}`);
  }

  if (!fs.existsSync(args.sourceManifest)) {
    fail(`Source manifest not found: ${args.sourceManifest}`);
  }

  const sourceManifest = readJson(args.sourceManifest);
  const sourceFiles = fileManifest(args.sourceRoot);
  const sourceTreeFingerprint = sha256Text(
    sourceFiles
      .map((record) => `${record.path}\t${record.bytes}\t${record.sha256}`)
      .join("\n"),
  );

  if (sourceTreeFingerprint !== sourceManifest.treeSha256) {
    fail(
      `Pinned source tree fingerprint changed. Expected ${sourceManifest.treeSha256}, found ${sourceTreeFingerprint}`,
    );
  }

  const tvtmsPath = findTvtmsFile(args.sourceRoot);
  const buffer = readBuffer(tvtmsPath);
  const hasBom =
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf;

  const text = readText(tvtmsPath);
  const lines = text.split(/\r\n|\n|\r/);

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

  const lineTypes = {};

  for (const line of lines) {
    const type = classifyLine(line);
    lineTypes[type] = (lineTypes[type] || 0) + 1;
  }

  const topics = [
    { topic: "Psalm 4", pattern: "\\bPsa\\.?\\s*4\\b|Psalm\\s+4\\b" },
    {
      topic: "1 Chronicles 1",
      pattern: "\\b1Ch\\.?\\s*1\\b|1\\s*Chronicles\\s+1\\b",
    },
    {
      topic: "Proverbs 28",
      pattern: "\\bPro\\.?\\s*28\\b|Proverbs\\s+28\\b",
    },
    { topic: "Sirach 30", pattern: "\\bSir\\.?\\s*30\\b|Sirach\\s+30\\b" },
    { topic: "Ezra 13", pattern: "\\bEzr\\.?\\s*13\\b|Ezra\\s+13\\b" },
    { topic: "Nehemiah 3", pattern: "\\bNeh\\.?\\s*3\\b|Nehemiah\\s+3\\b" },
    { topic: "Greek tradition", pattern: "\\bGrk\\b|\\bGreek\\b|\\bLXX\\b" },
    { topic: "English standard", pattern: "\\bEng\\b|\\bEnglish\\b|\\bNRSV\\b" },
  ];

  const contexts = collectContexts(lines, topics, 1, 40);
  const sections = uniqueSectionMarkers(lines);
  const headers = headerCandidates(lines);
  const delimiters = delimiterProfile(lines);

  const dataLikeLines = lines.filter(
    (line) =>
      line.includes("\t") &&
      !line.startsWith("#") &&
      !line.startsWith("$") &&
      line.trim(),
  );

  const summary = {
    milestone: "P05.12J-V4",
    generatedAtUtc: new Date().toISOString(),
    status: "stepbible-tvtms-source-acquired-with-short-path-and-schema-censused",
    repository: {
      branch: git(["branch", "--show-current"]),
      commit: git(["rev-parse", "HEAD"]),
    },
    source: {
      repository: sourceManifest.repository,
      pinnedCommit: sourceManifest.commit,
      originalRepositoryPath: sourceManifest.originalRepositoryPath || null,
      originalFilename: sourceManifest.originalFilename || null,
      originalSha256: sourceManifest.originalSha256 || null,
      localPath: relative(ROOT, args.sourceRoot),
      treeSha256: sourceManifest.treeSha256,
      verifiedTreeSha256: sourceTreeFingerprint,
      files: sourceFiles.length,
      tvtmsPath: relative(args.sourceRoot, tvtmsPath),
      tvtmsBytes: buffer.length,
      tvtmsSha256: sha256Buffer(buffer),
      utf8Bom: hasBom,
      newlineProfile: newlineProfile(buffer),
      license: sourceManifest.license,
    },
    p0512i: {
      report: relative(ROOT, p0512i.reportRoot),
      checksumsVerified: p0512iChecksums.checked,
      checksumsPassed: true,
      sourceSegments:
        p0512i.summary?.topology?.visibleSourceSegments ?? null,
      unresolvedSourceSegments:
        p0512i.summary?.topology?.unresolvedSourceSegments ?? null,
      ownershipRiskRows:
        Object.entries(
          p0512i.summary?.topology?.lxxOwnershipRiskCounts || {},
        )
          .filter(([name]) => name !== "identity-coordinate")
          .reduce((sum, [, count]) => sum + Number(count), 0),
    },
    schemaCensus: {
      lines: lines.length,
      nonEmptyLines: lines.filter((line) => line.trim()).length,
      dataLikeTabDelimitedLines: dataLikeLines.length,
      lineTypeCounts: lineTypes,
      delimiterProfile: delimiters,
      tokenCounts: tokenCounts(text),
      possibleSectionMarkers: sections.length,
      possibleHeaderRows: headers.length,
      contextRows: contexts.length,
    },
    gates: {
      sourcePinnedByCommit: true,
      sourceTreeFingerprintVerified: true,
      tvtmsFileUnique: true,
      p0512iChecksumsValid: true,
      productionBrentonModified: false,
      lxxCanonicalModified: false,
      alignmentsModified: false,
      safeToGenerateCrosswalkParser: false,
      reason:
        "TVTMS is the correct scholarly versification dataset, but its record schema must be reviewed from this census before a parser is allowed to generate mappings.",
    },
  };

  writeJson(path.join(args.output, "tvtms-source-census-summary.json"), summary);
  writeJson(path.join(args.output, "tvtms-pinned-source-manifest.json"), sourceManifest);

  writeCsv(
    path.join(args.output, "tvtms-source-files.csv"),
    sourceFiles,
    ["path", "bytes", "sha256"],
  );

  writeCsv(
    path.join(args.output, "tvtms-delimiter-profile.csv"),
    delimiters,
    ["tabCount", "lines"],
  );

  writeCsv(
    path.join(args.output, "tvtms-section-markers.csv"),
    sections,
    ["line", "classification", "text"],
  );

  writeCsv(
    path.join(args.output, "tvtms-header-candidates.csv"),
    headers,
    ["line", "columns", "score", "text"],
  );

  writeCsv(
    path.join(args.output, "tvtms-reference-contexts.csv"),
    contexts,
    ["topic", "matchedLine", "contextLine", "isMatch", "text"],
  );

  const firstNonEmpty = lines
    .map((line, index) => ({ line: index + 1, text: line }))
    .filter((row) => row.text.trim())
    .slice(0, 500);

  writeCsv(
    path.join(args.output, "tvtms-first-500-nonempty-lines.csv"),
    firstNonEmpty,
    ["line", "text"],
  );

  const rawSampleLines = [
    "# TVTMS schema sample",
    "",
    `Pinned commit: ${sourceManifest.commit}`,
    `TVTMS SHA-256: ${sha256Buffer(buffer)}`,
    "",
    "The lines below are copied solely for format/schema review.",
    "",
    ...firstNonEmpty.slice(0, 250).map(
      (row) => `${String(row.line).padStart(7, " ")} | ${row.text}`,
    ),
    "",
  ];

  fs.writeFileSync(
    path.join(args.output, "tvtms-format-sample.txt"),
    rawSampleLines.join("\n"),
    "utf8",
  );

  const readme = [
    "# EMETSEES P05.12J V4 — STEPBible TVTMS Source Census",
    "",
    `Generated: ${summary.generatedAtUtc}`,
    "",
    "The prior BSB versification files were rejected because they contain tradition verse limits, not an LXX-to-English crosswalk.",
    "",
    "This run pins and inventories STEPBible TVTMS, the dataset specifically documenting English, Hebrew, Latin, Greek, and other versification traditions.",
    "",
    "## Source",
    "",
    `- Pinned commit: ${summary.source.pinnedCommit}`,
    `- TVTMS bytes: ${summary.source.tvtmsBytes}`,
    `- TVTMS SHA-256: ${summary.source.tvtmsSha256}`,
    `- Lines: ${summary.schemaCensus.lines}`,
    `- Tab-delimited data-like lines: ${summary.schemaCensus.dataLikeTabDelimitedLines}`,
    `- Header candidates: ${summary.schemaCensus.possibleHeaderRows}`,
    `- Section markers: ${summary.schemaCensus.possibleSectionMarkers}`,
    "",
    "## Safety",
    "",
    "- Production Brenton was not modified.",
    "- Greek LXX canonical data was not modified.",
    "- WEB and KJV were not modified.",
    "- Display tokens and alignments were not rebuilt.",
    "- This report authorizes no crosswalk or production apply step.",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(args.output, "README.md"), readme, "utf8");
  writeChecksums(args.output);

  console.log("");
  console.log("[P05.12J V4] STEPBible TVTMS source census complete.");
  console.log(`[P05.12J V4] Pinned commit: ${summary.source.pinnedCommit}`);
  console.log(`[P05.12J V4] TVTMS lines: ${summary.schemaCensus.lines}`);
  console.log(
    `[P05.12J V4] Header candidates: ${summary.schemaCensus.possibleHeaderRows}`,
  );
  console.log("[P05.12J V4] Production Brenton modified: NO");
  console.log("[P05.12J V4] Alignments modified: NO");
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
        : path.join(ROOT, ".private", "reports", "P05.12", "p0512j-v3-fatal");

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
