#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");

const ROOT = process.cwd();

function fail(message) {
  throw new Error(`[P05.12N Brenton text placement] ${message}`);
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
    fail(`No ${milestone} ${basename} was found.`);
  }

  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0];
}

function absoluteRepoPath(value) {
  return path.isAbsolute(value)
    ? value
    : path.join(ROOT, normalizeSlashes(value).replace(/\//g, path.sep));
}

function verifyStagedFile(record, label) {
  if (!record?.path || !record?.sha256 || !Number.isInteger(record?.records)) {
    fail(`Incomplete staged artifact metadata: ${label}`);
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

function normalizeText(value) {
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

function words(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US")
    .match(/[\p{L}\p{N}]+/gu) || [];
}

function diceSimilarity(leftText, rightText) {
  const left = words(leftText);
  const right = words(rightText);

  if (!left.length && !right.length) return 1;
  if (!left.length || !right.length) return 0;

  const counts = new Map();

  for (const token of left) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  let intersection = 0;

  for (const token of right) {
    const available = counts.get(token) || 0;

    if (available > 0) {
      intersection += 1;
      counts.set(token, available - 1);
    }
  }

  return (2 * intersection) / (left.length + right.length);
}

function parseCanonicalKey(value) {
  const match = /^(.*)\.(\d+)\.(\d+)$/.exec(String(value || ""));

  if (!match) return null;

  return {
    book: match[1],
    chapter: Number(match[2]),
    verse: Number(match[3]),
  };
}

function compareCanonicalKeys(left, right) {
  const a = parseCanonicalKey(left);
  const b = parseCanonicalKey(right);

  if (!a || !b) return String(left).localeCompare(String(right));

  return (
    a.book.localeCompare(b.book) ||
    a.chapter - b.chapter ||
    a.verse - b.verse
  );
}

function loadCanonicalLxx(directory) {
  if (!fs.existsSync(directory)) {
    fail(`Missing canonical LXX directory: ${relative(ROOT, directory)}`);
  }

  const records = [];
  const byKey = new Map();
  const byBook = new Map();

  for (const filePath of walk(directory, (item) => /\.json$/i.test(item))) {
    const document = readJson(filePath);

    if (!document || Array.isArray(document) || typeof document !== "object") {
      fail(`Unexpected canonical LXX file shape: ${relative(ROOT, filePath)}`);
    }

    for (const [verseKey, verse] of Object.entries(document)) {
      const coordinate = parseCanonicalKey(verseKey);

      if (!coordinate) continue;

      const text = verse?.translations?.brenton?.text || "";
      const record = {
        verseKey,
        book: coordinate.book,
        chapter: coordinate.chapter,
        verse: coordinate.verse,
        text,
        signature: normalizeText(text),
        sourceFile: relative(ROOT, filePath),
      };

      records.push(record);
      byKey.set(verseKey, record);

      if (!byBook.has(record.book)) byBook.set(record.book, []);
      byBook.get(record.book).push(record);
    }
  }

  for (const rows of byBook.values()) {
    rows.sort(
      (left, right) =>
        left.chapter - right.chapter || left.verse - right.verse,
    );

    rows.forEach((row, index) => {
      row.bookIndex = index;
    });
  }

  records.sort((left, right) =>
    compareCanonicalKeys(left.verseKey, right.verseKey),
  );

  return {
    records,
    byKey,
    byBook,
    files: walk(directory, (item) => /\.json$/i.test(item)),
  };
}

const SOURCE_BOOK_TO_CANONICAL = {
  "Daniel Greek": "Daniel",
  Daniel: "Daniel",
  "Esther Greek": "Esther",
  Esther: "Esther",
  "Letter of Jeremiah": "Epistle of Jeremiah",
  "Song of Solomon": "Song of Songs",
};

function canonicalBookForSource(segment, classification) {
  if (
    classification === "continuous-ezr-nehemiah-structural-candidate"
  ) {
    return "Nehemiah";
  }

  const rawBook = String(segment?.source?.book || "");
  return SOURCE_BOOK_TO_CANONICAL[rawBook] || rawBook;
}

function sourceOrderRows(sourceSegments) {
  return sourceSegments.map((segment, index) => ({
    segment,
    globalSourceIndex: index,
  }));
}

function exactIndex(canonicalRows) {
  const index = new Map();

  for (const row of canonicalRows) {
    if (!row.signature) continue;
    if (!index.has(row.signature)) index.set(row.signature, []);
    index.get(row.signature).push(row);
  }

  return index;
}

function longestIncreasingSubsequence(pairs) {
  if (!pairs.length) return [];

  const tails = [];
  const tailIndexes = [];
  const previous = new Array(pairs.length).fill(-1);

  for (let index = 0; index < pairs.length; index += 1) {
    const value = pairs[index].canonicalIndex;
    let low = 0;
    let high = tails.length;

    while (low < high) {
      const middle = (low + high) >> 1;

      if (tails[middle] < value) low = middle + 1;
      else high = middle;
    }

    if (low > 0) previous[index] = tailIndexes[low - 1];

    tails[low] = value;
    tailIndexes[low] = index;
  }

  const result = [];
  let cursor = tailIndexes[tails.length - 1];

  while (cursor >= 0) {
    result.push(pairs[cursor]);
    cursor = previous[cursor];
  }

  return result.reverse();
}

function expectedCanonicalIndex(sourceIndex, anchors, fallbackIndex) {
  const previous = [...anchors]
    .filter((anchor) => anchor.sourceIndex < sourceIndex)
    .sort((left, right) => right.sourceIndex - left.sourceIndex)[0];

  const next = [...anchors]
    .filter((anchor) => anchor.sourceIndex > sourceIndex)
    .sort((left, right) => left.sourceIndex - right.sourceIndex)[0];

  if (previous && next) {
    const ratio =
      (sourceIndex - previous.sourceIndex) /
      Math.max(1, next.sourceIndex - previous.sourceIndex);

    return (
      previous.canonicalIndex +
      ratio * (next.canonicalIndex - previous.canonicalIndex)
    );
  }

  if (previous) {
    return previous.canonicalIndex + (sourceIndex - previous.sourceIndex);
  }

  if (next) {
    return next.canonicalIndex - (next.sourceIndex - sourceIndex);
  }

  return fallbackIndex;
}

function resolveExactPlacements(sourceRows, canonicalRows) {
  const canonicalExactIndex = exactIndex(canonicalRows);
  const uniquePairs = [];

  for (let sourceIndex = 0; sourceIndex < sourceRows.length; sourceIndex += 1) {
    const segment = sourceRows[sourceIndex].segment;
    const signature = normalizeText(segment.visibleText);
    const matches = canonicalExactIndex.get(signature) || [];

    if (signature && matches.length === 1) {
      uniquePairs.push({
        sourceIndex,
        canonicalIndex: matches[0].bookIndex,
        canonicalKey: matches[0].verseKey,
        segmentId: segment.id,
      });
    }
  }

  uniquePairs.sort(
    (left, right) =>
      left.sourceIndex - right.sourceIndex ||
      left.canonicalIndex - right.canonicalIndex,
  );

  const monotonicAnchors = longestIncreasingSubsequence(uniquePairs);
  const anchorBySource = new Map(
    monotonicAnchors.map((anchor) => [anchor.sourceIndex, anchor]),
  );
  const usedCanonicalIndexes = new Set(
    monotonicAnchors.map((anchor) => anchor.canonicalIndex),
  );

  const placements = new Map();

  for (const anchor of monotonicAnchors) {
    placements.set(anchor.sourceIndex, {
      method: "exact-unique-monotonic",
      confidence: 1,
      canonicalKeys: [anchor.canonicalKey],
      similarity: 1,
      exactCandidateCount: 1,
    });
  }

  for (let sourceIndex = 0; sourceIndex < sourceRows.length; sourceIndex += 1) {
    if (placements.has(sourceIndex)) continue;

    const segment = sourceRows[sourceIndex].segment;
    const signature = normalizeText(segment.visibleText);
    const matches = (canonicalExactIndex.get(signature) || []).filter(
      (row) => !usedCanonicalIndexes.has(row.bookIndex),
    );

    if (!signature || !matches.length) continue;

    const expectation = expectedCanonicalIndex(
      sourceIndex,
      monotonicAnchors,
      sourceIndex,
    );

    const previous = [...monotonicAnchors]
      .filter((anchor) => anchor.sourceIndex < sourceIndex)
      .sort((left, right) => right.sourceIndex - left.sourceIndex)[0];

    const next = [...monotonicAnchors]
      .filter((anchor) => anchor.sourceIndex > sourceIndex)
      .sort((left, right) => left.sourceIndex - right.sourceIndex)[0];

    const legal = matches.filter((row) => {
      if (previous && row.bookIndex <= previous.canonicalIndex) return false;
      if (next && row.bookIndex >= next.canonicalIndex) return false;
      return true;
    });

    if (!legal.length) continue;

    legal.sort(
      (left, right) =>
        Math.abs(left.bookIndex - expectation) -
          Math.abs(right.bookIndex - expectation) ||
        left.bookIndex - right.bookIndex,
    );

    const best = legal[0];
    const second = legal[1];
    const bestDistance = Math.abs(best.bookIndex - expectation);
    const secondDistance = second
      ? Math.abs(second.bookIndex - expectation)
      : Number.POSITIVE_INFINITY;

    if (second && secondDistance === bestDistance) continue;

    placements.set(sourceIndex, {
      method:
        matches.length === 1
          ? "exact-unique-nonanchor"
          : "exact-duplicate-monotonic",
      confidence: matches.length === 1 ? 0.99 : 0.98,
      canonicalKeys: [best.verseKey],
      similarity: 1,
      exactCandidateCount: matches.length,
    });
    usedCanonicalIndexes.add(best.bookIndex);
  }

  return {
    placements,
    anchors: monotonicAnchors,
    usedCanonicalIndexes,
  };
}

function resolveExactConcatenations(
  sourceRows,
  canonicalRows,
  placements,
  usedCanonicalIndexes,
) {
  const added = [];

  // One source segment equals multiple consecutive canonical verses.
  for (let sourceIndex = 0; sourceIndex < sourceRows.length; sourceIndex += 1) {
    if (placements.has(sourceIndex)) continue;

    const sourceSignature = normalizeText(
      sourceRows[sourceIndex].segment.visibleText,
    );

    if (!sourceSignature) continue;

    for (let canonicalStart = 0; canonicalStart < canonicalRows.length; canonicalStart += 1) {
      if (usedCanonicalIndexes.has(canonicalStart)) continue;

      let combined = "";

      for (let length = 2; length <= 4; length += 1) {
        const end = canonicalStart + length;

        if (end > canonicalRows.length) break;

        const indexes = [];
        let blocked = false;

        for (let index = canonicalStart; index < end; index += 1) {
          indexes.push(index);

          if (usedCanonicalIndexes.has(index)) {
            blocked = true;
            break;
          }
        }

        if (blocked) break;

        combined = canonicalRows
          .slice(canonicalStart, end)
          .map((row) => row.signature)
          .join("");

        if (combined === sourceSignature) {
          const keys = canonicalRows
            .slice(canonicalStart, end)
            .map((row) => row.verseKey);

          placements.set(sourceIndex, {
            method: "exact-one-source-to-canonical-group",
            confidence: 1,
            canonicalKeys: keys,
            similarity: 1,
            exactCandidateCount: 1,
          });

          indexes.forEach((index) => usedCanonicalIndexes.add(index));
          added.push({
            sourceIndexes: [sourceIndex],
            canonicalIndexes: indexes,
          });
          canonicalStart = canonicalRows.length;
          break;
        }

        if (!sourceSignature.startsWith(combined)) break;
      }
    }
  }

  // Multiple consecutive source segments equal one canonical verse.
  for (let sourceStart = 0; sourceStart < sourceRows.length; sourceStart += 1) {
    if (placements.has(sourceStart)) continue;

    for (let sourceLength = 2; sourceLength <= 4; sourceLength += 1) {
      const sourceEnd = sourceStart + sourceLength;

      if (sourceEnd > sourceRows.length) break;

      const sourceIndexes = [];
      let blocked = false;

      for (let index = sourceStart; index < sourceEnd; index += 1) {
        sourceIndexes.push(index);

        if (placements.has(index)) {
          blocked = true;
          break;
        }
      }

      if (blocked) break;

      const combinedSource = sourceRows
        .slice(sourceStart, sourceEnd)
        .map((row) => normalizeText(row.segment.visibleText))
        .join("");

      if (!combinedSource) continue;

      const matches = canonicalRows.filter(
        (row) =>
          !usedCanonicalIndexes.has(row.bookIndex) &&
          row.signature === combinedSource,
      );

      if (matches.length !== 1) continue;

      const canonical = matches[0];
      const groupId = `source-group:${sourceRows[sourceStart].segment.id}:${sourceRows[sourceEnd - 1].segment.id}`;

      sourceIndexes.forEach((index, groupIndex) => {
        placements.set(index, {
          method: "exact-source-group-to-one-canonical",
          confidence: 1,
          canonicalKeys: [canonical.verseKey],
          similarity: 1,
          exactCandidateCount: 1,
          groupId,
          groupIndex,
          groupSize: sourceIndexes.length,
        });
      });

      usedCanonicalIndexes.add(canonical.bookIndex);
      added.push({
        sourceIndexes,
        canonicalIndexes: [canonical.bookIndex],
      });
      sourceStart = sourceEnd - 1;
      break;
    }
  }

  return added;
}

function resolveHighSimilarity(
  sourceRows,
  canonicalRows,
  placements,
  anchors,
  usedCanonicalIndexes,
) {
  for (let sourceIndex = 0; sourceIndex < sourceRows.length; sourceIndex += 1) {
    if (placements.has(sourceIndex)) continue;

    const segment = sourceRows[sourceIndex].segment;
    const expectation = expectedCanonicalIndex(
      sourceIndex,
      anchors,
      sourceIndex,
    );

    const candidates = canonicalRows
      .filter((row) => !usedCanonicalIndexes.has(row.bookIndex))
      .filter((row) => Math.abs(row.bookIndex - expectation) <= 40)
      .map((row) => ({
        row,
        similarity: diceSimilarity(segment.visibleText, row.text),
      }))
      .filter((candidate) => candidate.similarity >= 0.82)
      .sort(
        (left, right) =>
          right.similarity - left.similarity ||
          Math.abs(left.row.bookIndex - expectation) -
            Math.abs(right.row.bookIndex - expectation),
      );

    if (!candidates.length) continue;

    const best = candidates[0];
    const second = candidates[1];

    if (
      second &&
      Math.abs(best.similarity - second.similarity) < 0.035
    ) {
      placements.set(sourceIndex, {
        method: "high-similarity-ambiguous",
        confidence: Number(best.similarity.toFixed(6)),
        canonicalKeys: candidates.slice(0, 5).map((item) => item.row.verseKey),
        similarity: Number(best.similarity.toFixed(6)),
        alternateSimilarity: Number(second.similarity.toFixed(6)),
        exactCandidateCount: 0,
      });
      continue;
    }

    placements.set(sourceIndex, {
      method: "high-similarity-candidate",
      confidence: Number(best.similarity.toFixed(6)),
      canonicalKeys: [best.row.verseKey],
      similarity: Number(best.similarity.toFixed(6)),
      alternateSimilarity: second
        ? Number(second.similarity.toFixed(6))
        : null,
      exactCandidateCount: 0,
    });
  }
}

function targetGroupKey(segment, classification) {
  if (
    classification === "continuous-ezr-nehemiah-structural-candidate"
  ) {
    return "continuous-ezr-to-nehemiah";
  }

  return `source-book:${segment.source.bookId}`;
}

function sourceRowsForGroup(allSourceRows, classificationById, groupKey) {
  return allSourceRows.filter(({ segment }) => {
    const classification = classificationById.get(segment.id)?.classification;

    return targetGroupKey(segment, classification) === groupKey;
  });
}

function canonicalRowsForGroup(groupRows, classificationById, canonical) {
  const first = groupRows[0]?.segment;

  if (!first) return [];

  const classification = classificationById.get(first.id)?.classification;
  const book = canonicalBookForSource(first, classification);

  return canonical.byBook.get(book) || [];
}

function placementStatus(method) {
  if (
    [
      "exact-unique-monotonic",
      "exact-unique-nonanchor",
      "exact-duplicate-monotonic",
      "exact-one-source-to-canonical-group",
      "exact-source-group-to-one-canonical",
    ].includes(method)
  ) {
    return "text-backed-exact";
  }

  if (method === "high-similarity-candidate") {
    return "text-backed-provisional";
  }

  if (method === "high-similarity-ambiguous") {
    return "ambiguous";
  }

  return "unresolved";
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

  const p0512lSummaryPath = findLatestReportFile(
    "brenton-dual-coordinate-summary.json",
    "P05.12L",
  );
  const p0512mSummaryPath = findLatestReportFile(
    "brenton-lxx-ownership-classification-summary.json",
    "P05.12M",
  );

  const p0512lRoot = path.dirname(p0512lSummaryPath);
  const p0512mRoot = path.dirname(p0512mSummaryPath);
  const p0512l = readJson(p0512lSummaryPath);
  const p0512m = readJson(p0512mSummaryPath);

  const lChecksums = verifyReportChecksums(p0512lRoot);
  const mChecksums = verifyReportChecksums(p0512mRoot);

  if (!lChecksums.passed) {
    fail(`P05.12L checksum failure: ${JSON.stringify(lChecksums.failures)}`);
  }
  if (!mChecksums.passed) {
    fail(`P05.12M checksum failure: ${JSON.stringify(mChecksums.failures)}`);
  }

  if (
    p0512m.accounting?.continuousEzraNehemiahStructuralCandidateRows !== 389 ||
    p0512m.accounting?.remainingVersificationCoordinateGapRows !== 285
  ) {
    fail(
      `Unexpected P05.12M target counts: ${JSON.stringify(p0512m.accounting)}`,
    );
  }

  const sourceArtifact = verifyStagedFile(
    p0512l.stagedArtifacts?.files?.sourceSegments,
    "P05.12L source segments",
  );
  const sourceSegments = readNdjson(sourceArtifact.filePath);

  if (sourceSegments.length !== 29004) {
    fail(`Expected 29,004 source segments, found ${sourceSegments.length}`);
  }

  const classifications = readCsv(
    path.join(p0512mRoot, "brenton-all-ownership-classifications.csv"),
  );
  const classificationById = new Map(
    classifications.map((row) => [row.sourceId, row]),
  );

  if (classificationById.size !== 29004) {
    fail(`P05.12M classification coverage is ${classificationById.size}`);
  }

  const allSourceRows = sourceOrderRows(sourceSegments);
  const targetIds = new Set(
    classifications
      .filter((row) =>
        [
          "continuous-ezr-nehemiah-structural-candidate",
          "remaining-versification-coordinate-gap",
        ].includes(row.classification),
      )
      .map((row) => row.sourceId),
  );

  if (targetIds.size !== 674) {
    fail(`Expected 674 placement-review rows, found ${targetIds.size}`);
  }

  const lxxDirectory = path.join(
    ROOT,
    ".private",
    "scripture",
    "canonical",
    "lxx",
  );
  const canonical = loadCanonicalLxx(lxxDirectory);

  const currentBrentonPath = path.join(
    ROOT,
    "app",
    "data",
    "scripture",
    "generatedBrenton.json",
  );
  const currentHashBefore = sha256File(currentBrentonPath);
  const expectedCurrentHash = p0512l.sources?.currentReader?.sha256Before;

  if (currentHashBefore !== expectedCurrentHash) {
    fail(
      `generatedBrenton.json changed. Expected ${expectedCurrentHash}, found ${currentHashBefore}`,
    );
  }

  const groups = new Map();

  for (const { segment } of allSourceRows) {
    const classification = classificationById.get(segment.id)?.classification;
    const groupKey = targetGroupKey(segment, classification);

    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(segment.id);
  }

  const placementRows = [];
  const groupSummaries = [];

  console.log("[P05.12N] Running text-backed monotonic placement...");

  for (const [groupKey] of groups) {
    const groupRows = sourceRowsForGroup(
      allSourceRows,
      classificationById,
      groupKey,
    );
    const targetRows = groupRows.filter(({ segment }) =>
      targetIds.has(segment.id),
    );

    if (!targetRows.length) continue;

    const canonicalRows = canonicalRowsForGroup(
      groupRows,
      classificationById,
      canonical,
    );

    if (!canonicalRows.length) {
      fail(`No canonical LXX target book for group ${groupKey}`);
    }

    const exact = resolveExactPlacements(groupRows, canonicalRows);

    resolveExactConcatenations(
      groupRows,
      canonicalRows,
      exact.placements,
      exact.usedCanonicalIndexes,
    );

    resolveHighSimilarity(
      groupRows,
      canonicalRows,
      exact.placements,
      exact.anchors,
      exact.usedCanonicalIndexes,
    );

    let exactTargetRows = 0;
    let provisionalTargetRows = 0;
    let ambiguousTargetRows = 0;
    let unresolvedTargetRows = 0;

    for (let sourceIndex = 0; sourceIndex < groupRows.length; sourceIndex += 1) {
      const segment = groupRows[sourceIndex].segment;

      if (!targetIds.has(segment.id)) continue;

      const classification = classificationById.get(segment.id);
      const placement = exact.placements.get(sourceIndex) || {
        method: "no-text-backed-candidate",
        confidence: 0,
        canonicalKeys: [],
        similarity: 0,
        exactCandidateCount: 0,
      };
      const status = placementStatus(placement.method);
      const structuralCandidate =
        classification.authoritativeOwnershipKey || null;
      const primaryPlacement = placement.canonicalKeys[0] || null;
      const structuralAgreement =
        Boolean(primaryPlacement) &&
        Boolean(structuralCandidate) &&
        placement.canonicalKeys.includes(structuralCandidate);

      if (status === "text-backed-exact") exactTargetRows += 1;
      else if (status === "text-backed-provisional") provisionalTargetRows += 1;
      else if (status === "ambiguous") ambiguousTargetRows += 1;
      else unresolvedTargetRows += 1;

      placementRows.push({
        sourceId: segment.id,
        sourceBookId: segment.source.bookId,
        sourceBook: segment.source.book,
        sourceChapter: segment.source.chapter,
        sourceVerseLabel: segment.source.verseLabel,
        sourceReference: segment.source.reference,
        classification: classification.classification,
        targetCanonicalBook: canonicalBookForSource(
          segment,
          classification.classification,
        ),
        structuralCandidate,
        placementStatus: status,
        placementMethod: placement.method,
        placementConfidence: placement.confidence,
        placementSimilarity: placement.similarity,
        placementCanonicalKeys: placement.canonicalKeys,
        primaryPlacementCanonicalKey: primaryPlacement,
        structuralCandidateAgrees: structuralAgreement,
        exactCandidateCount: placement.exactCandidateCount,
        groupId: placement.groupId || null,
        groupIndex:
          placement.groupIndex === undefined ? null : placement.groupIndex,
        groupSize:
          placement.groupSize === undefined ? null : placement.groupSize,
        visibleText: segment.visibleText,
      });
    }

    groupSummaries.push({
      groupKey,
      sourceRows: groupRows.length,
      targetRows: targetRows.length,
      canonicalRows: canonicalRows.length,
      exactAnchors: exact.anchors.length,
      exactTargetRows,
      provisionalTargetRows,
      ambiguousTargetRows,
      unresolvedTargetRows,
    });
  }

  if (placementRows.length !== 674) {
    fail(`Placement output contains ${placementRows.length} rows, expected 674`);
  }

  const continuousEzraRows = placementRows.filter(
    (row) =>
      row.classification ===
      "continuous-ezr-nehemiah-structural-candidate",
  );
  const remainingGapRows = placementRows.filter(
    (row) =>
      row.classification ===
      "remaining-versification-coordinate-gap",
  );

  if (continuousEzraRows.length !== 389 || remainingGapRows.length !== 285) {
    fail(
      `Placement classification drift: ${JSON.stringify({
        continuousEzra: continuousEzraRows.length,
        remainingGaps: remainingGapRows.length,
      })}`,
    );
  }

  const exactRows = placementRows.filter(
    (row) => row.placementStatus === "text-backed-exact",
  );
  const provisionalRows = placementRows.filter(
    (row) => row.placementStatus === "text-backed-provisional",
  );
  const ambiguousRows = placementRows.filter(
    (row) => row.placementStatus === "ambiguous",
  );
  const unresolvedRows = placementRows.filter(
    (row) => row.placementStatus === "unresolved",
  );
  const structuralConflicts = continuousEzraRows.filter(
    (row) =>
      row.primaryPlacementCanonicalKey &&
      !row.structuralCandidateAgrees,
  );

  const currentHashAfter = sha256File(currentBrentonPath);

  if (currentHashAfter !== currentHashBefore) {
    fail("Production generatedBrenton.json changed during P05.12N.");
  }

  const summary = {
    milestone: "P05.12N",
    generatedAtUtc: new Date().toISOString(),
    status: "brenton-text-backed-monotonic-placement-audit-complete",
    repository: {
      branch: git(["branch", "--show-current"]),
      commit: git(["rev-parse", "HEAD"]),
    },
    sources: {
      p0512l: {
        report: relative(ROOT, p0512lRoot),
        summarySha256: sha256File(p0512lSummaryPath),
        checksumsVerified: lChecksums.checked,
        stagedSourceSegmentsSha256: sourceArtifact.sha256,
      },
      p0512m: {
        report: relative(ROOT, p0512mRoot),
        summarySha256: sha256File(p0512mSummaryPath),
        checksumsVerified: mChecksums.checked,
      },
      lxxCanonical: {
        path: relative(ROOT, lxxDirectory),
        files: canonical.files.length,
        records: canonical.records.length,
      },
      currentBrenton: {
        path: relative(ROOT, currentBrentonPath),
        sha256Before: currentHashBefore,
        sha256After: currentHashAfter,
      },
    },
    targetInventory: {
      totalRows: placementRows.length,
      continuousEzraRows: continuousEzraRows.length,
      remainingGapRows: remainingGapRows.length,
      groups: groupSummaries.length,
    },
    placement: {
      textBackedExactRows: exactRows.length,
      textBackedProvisionalRows: provisionalRows.length,
      ambiguousRows: ambiguousRows.length,
      unresolvedRows: unresolvedRows.length,
      methodCounts: countBy(placementRows, "placementMethod"),
      statusCounts: countBy(placementRows, "placementStatus"),
      structuralCandidateConflicts: structuralConflicts.length,
    },
    continuousEzra: {
      rows: continuousEzraRows.length,
      exactRows: continuousEzraRows.filter(
        (row) => row.placementStatus === "text-backed-exact",
      ).length,
      provisionalRows: continuousEzraRows.filter(
        (row) => row.placementStatus === "text-backed-provisional",
      ).length,
      ambiguousRows: continuousEzraRows.filter(
        (row) => row.placementStatus === "ambiguous",
      ).length,
      unresolvedRows: continuousEzraRows.filter(
        (row) => row.placementStatus === "unresolved",
      ).length,
      structuralConflicts: structuralConflicts.length,
    },
    remainingGaps: {
      rows: remainingGapRows.length,
      exactRows: remainingGapRows.filter(
        (row) => row.placementStatus === "text-backed-exact",
      ).length,
      provisionalRows: remainingGapRows.filter(
        (row) => row.placementStatus === "text-backed-provisional",
      ).length,
      ambiguousRows: remainingGapRows.filter(
        (row) => row.placementStatus === "ambiguous",
      ).length,
      unresolvedRows: remainingGapRows.filter(
        (row) => row.placementStatus === "unresolved",
      ).length,
      bookCounts: countBy(remainingGapRows, "sourceBookId"),
    },
    gates: {
      p0512lChecksumsValid: true,
      p0512mChecksumsValid: true,
      stagedSourceHashVerified: true,
      all674TargetRowsReviewedExactlyOnce: true,
      productionBrentonModified: false,
      lxxCanonicalModified: false,
      alignmentsModified: false,
      safeToAuthorizeContinuousEzraOwnershipRule:
        continuousEzraRows.every(
          (row) => row.placementStatus === "text-backed-exact",
        ) && structuralConflicts.length === 0,
      safeToAuthorizeRemainingGapOwnershipRules: false,
      safeToBuildReaderAdapter: false,
      reason:
        "Only exact text-backed placements may become ownership rules. Provisional, ambiguous, unresolved, and structural-conflict rows remain fail-closed. Reader-schema work must wait until the ownership map is certified.",
    },
  };

  writeJson(
    path.join(args.output, "brenton-text-placement-summary.json"),
    summary,
  );

  writeCsv(
    path.join(args.output, "brenton-all-text-placement-results.csv"),
    placementRows,
    [
      "sourceId",
      "sourceBookId",
      "sourceBook",
      "sourceChapter",
      "sourceVerseLabel",
      "sourceReference",
      "classification",
      "targetCanonicalBook",
      "structuralCandidate",
      "placementStatus",
      "placementMethod",
      "placementConfidence",
      "placementSimilarity",
      "placementCanonicalKeys",
      "primaryPlacementCanonicalKey",
      "structuralCandidateAgrees",
      "exactCandidateCount",
      "groupId",
      "groupIndex",
      "groupSize",
      "visibleText",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-continuous-ezr-text-placement.csv"),
    continuousEzraRows,
    [
      "sourceId",
      "sourceReference",
      "structuralCandidate",
      "placementStatus",
      "placementMethod",
      "placementConfidence",
      "placementCanonicalKeys",
      "primaryPlacementCanonicalKey",
      "structuralCandidateAgrees",
      "visibleText",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-continuous-ezr-structural-conflicts.csv"),
    structuralConflicts,
    [
      "sourceId",
      "sourceReference",
      "structuralCandidate",
      "placementStatus",
      "placementMethod",
      "placementCanonicalKeys",
      "primaryPlacementCanonicalKey",
      "structuralCandidateAgrees",
      "visibleText",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-remaining-gap-text-placement.csv"),
    remainingGapRows,
    [
      "sourceId",
      "sourceBookId",
      "sourceBook",
      "sourceReference",
      "targetCanonicalBook",
      "placementStatus",
      "placementMethod",
      "placementConfidence",
      "placementSimilarity",
      "placementCanonicalKeys",
      "primaryPlacementCanonicalKey",
      "visibleText",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-text-placement-provisional.csv"),
    provisionalRows,
    [
      "sourceId",
      "sourceReference",
      "classification",
      "placementMethod",
      "placementConfidence",
      "placementSimilarity",
      "placementCanonicalKeys",
      "visibleText",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-text-placement-ambiguous.csv"),
    ambiguousRows,
    [
      "sourceId",
      "sourceReference",
      "classification",
      "placementMethod",
      "placementConfidence",
      "placementCanonicalKeys",
      "visibleText",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-text-placement-unresolved.csv"),
    unresolvedRows,
    [
      "sourceId",
      "sourceBookId",
      "sourceBook",
      "sourceReference",
      "classification",
      "targetCanonicalBook",
      "visibleText",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-text-placement-group-summary.csv"),
    groupSummaries,
    [
      "groupKey",
      "sourceRows",
      "targetRows",
      "canonicalRows",
      "exactAnchors",
      "exactTargetRows",
      "provisionalTargetRows",
      "ambiguousTargetRows",
      "unresolvedTargetRows",
    ],
  );

  const readme = [
    "# EMETSEES P05.12N Brenton Text-Backed Ownership Placement Audit",
    "",
    `Generated: ${summary.generatedAtUtc}`,
    "",
    "P05.12M proved that the simple continuous-EZR chapter-offset rule is only a structural candidate. P05.12N validates placement using Brenton text already attached to the locked Greek LXX canonical coordinates.",
    "",
    "## Methods",
    "",
    "- Exact unique normalized text with monotonic ordering",
    "- Exact duplicate text resolved between monotonic anchors",
    "- One Brenton source segment matched to multiple consecutive canonical verses",
    "- Multiple consecutive Brenton source segments matched to one canonical verse",
    "- High-similarity candidates preserved as provisional only",
    "- Ambiguous and unresolved rows remain fail-closed",
    "",
    "## Results",
    "",
    `- Rows reviewed: ${summary.targetInventory.totalRows}`,
    `- Exact text-backed placements: ${summary.placement.textBackedExactRows}`,
    `- Provisional placements: ${summary.placement.textBackedProvisionalRows}`,
    `- Ambiguous placements: ${summary.placement.ambiguousRows}`,
    `- Unresolved placements: ${summary.placement.unresolvedRows}`,
    `- Continuous-EZR structural conflicts: ${summary.placement.structuralCandidateConflicts}`,
    "",
    "## Safety",
    "",
    "- Production generatedBrenton.json was not modified.",
    "- Greek LXX canonical data was not modified.",
    "- WEB and KJV were not modified.",
    "- Display tokens and alignments were not rebuilt.",
    "- No ownership or reader-adapter apply step is authorized by this report.",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(args.output, "README.md"), readme, "utf8");
  writeChecksums(args.output);

  console.log("");
  console.log("[P05.12N] Brenton text-backed placement audit complete.");
  console.log(`[P05.12N] Rows reviewed: ${placementRows.length}`);
  console.log(`[P05.12N] Exact text-backed rows: ${exactRows.length}`);
  console.log(`[P05.12N] Provisional rows: ${provisionalRows.length}`);
  console.log(`[P05.12N] Ambiguous rows: ${ambiguousRows.length}`);
  console.log(`[P05.12N] Unresolved rows: ${unresolvedRows.length}`);
  console.log(
    `[P05.12N] Continuous-EZR structural conflicts: ${structuralConflicts.length}`,
  );
  console.log("[P05.12N] Production Brenton modified: NO");
  console.log("[P05.12N] Alignments modified: NO");
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
        : path.join(ROOT, ".private", "reports", "P05.12", "p0512n-fatal");

    ensureDir(output);
    fs.writeFileSync(
      path.join(output, "fatal-error.txt"),
      rendered + "\n",
      "utf8",
    );
  } catch {
    // Preserve the original failure.
  }

  process.exit(1);
}
