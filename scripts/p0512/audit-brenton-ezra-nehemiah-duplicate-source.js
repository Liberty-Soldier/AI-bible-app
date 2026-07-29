#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");

const ROOT = process.cwd();

function fail(message) {
  throw new Error(`[P05.12O Ezra-Nehemiah duplicate audit] ${message}`);
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
    fail(`No completed ${milestone} ${basename} was found.`);
  }

  candidates.sort((left, right) =>
    fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs
  );

  return candidates[0];
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

function normalizedText(value) {
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
    .replace(/Æ/g, "Ae")
    .replace(/æ/g, "ae")
    .replace(/Œ/g, "Oe")
    .replace(/œ/g, "oe")
    .replace(/ſ/g, "s")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US")
    .match(/[\p{L}\p{N}]+/gu) || [];
}

function wordDice(leftText, rightText) {
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

function bigramDice(leftText, rightText) {
  const left = normalizedText(leftText);
  const right = normalizedText(rightText);

  if (left === right && left) return 1;
  if (left.length < 2 || right.length < 2) return 0;

  const counts = new Map();

  for (let index = 0; index < left.length - 1; index += 1) {
    const gram = left.slice(index, index + 2);
    counts.set(gram, (counts.get(gram) || 0) + 1);
  }

  let intersection = 0;

  for (let index = 0; index < right.length - 1; index += 1) {
    const gram = right.slice(index, index + 2);
    const available = counts.get(gram) || 0;

    if (available > 0) {
      intersection += 1;
      counts.set(gram, available - 1);
    }
  }

  return (
    (2 * intersection) /
    (Math.max(0, left.length - 1) + Math.max(0, right.length - 1))
  );
}

function similarity(leftText, rightText) {
  const left = normalizedText(leftText);
  const right = normalizedText(rightText);

  if (left && left === right) return 1;

  return Number(
    (
      0.65 * wordDice(leftText, rightText) +
      0.35 * bigramDice(leftText, rightText)
    ).toFixed(6),
  );
}

function verseLabelSort(value) {
  const match = /^(\d+)([A-Za-z]*)$/.exec(String(value || ""));

  return {
    number: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
    suffix: match ? match[2] : String(value || ""),
  };
}

function compareSegments(left, right) {
  const chapterDelta =
    Number(left.source.chapter) - Number(right.source.chapter);

  if (chapterDelta) return chapterDelta;

  const a = verseLabelSort(left.source.verseLabel);
  const b = verseLabelSort(right.source.verseLabel);

  return a.number - b.number || a.suffix.localeCompare(b.suffix);
}

function sourceCoordinate(segment) {
  return `${segment.source.bookId}.${segment.source.chapter}:${segment.source.verseLabel}`;
}

function nehemiahCoordinate(segment) {
  return `NEH.${segment.source.chapter}:${segment.source.verseLabel}`;
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
  const p0512nSummaryPath = findLatestReportFile(
    "brenton-text-placement-summary.json",
    "P05.12N",
  );

  const p0512lRoot = path.dirname(p0512lSummaryPath);
  const p0512nRoot = path.dirname(p0512nSummaryPath);
  const p0512l = readJson(p0512lSummaryPath);
  const p0512n = readJson(p0512nSummaryPath);

  const lChecksums = verifyReportChecksums(p0512lRoot);
  const nChecksums = verifyReportChecksums(p0512nRoot);

  if (!lChecksums.passed) {
    fail(`P05.12L checksum failure: ${JSON.stringify(lChecksums.failures)}`);
  }
  if (!nChecksums.passed) {
    fail(`P05.12N checksum failure: ${JSON.stringify(nChecksums.failures)}`);
  }

  if (
    Number(p0512n.targetInventory?.continuousEzraRows) !== 389 ||
    Number(p0512n.targetInventory?.totalRows) !== 674
  ) {
    fail(`Unexpected P05.12N inventory: ${JSON.stringify(p0512n.targetInventory)}`);
  }

  const sourceArtifact = verifyStagedFile(
    p0512l.stagedArtifacts?.files?.sourceSegments,
    "P05.12L source segments",
  );
  const sourceSegments = readNdjson(sourceArtifact.filePath);

  if (sourceSegments.length !== 29004) {
    fail(`Expected 29,004 Brenton source segments, found ${sourceSegments.length}`);
  }

  const continuousEzra = sourceSegments
    .filter(
      (segment) =>
        segment.source.bookId === "EZR" &&
        Number(segment.source.chapter) >= 11 &&
        Number(segment.source.chapter) <= 23,
    )
    .sort(compareSegments);

  const separateNehemiah = sourceSegments
    .filter((segment) => segment.source.bookId === "NEH")
    .sort(compareSegments);

  if (continuousEzra.length !== 389 || separateNehemiah.length !== 389) {
    fail(
      `Expected 389 continuous-EZR and 389 separate-Nehemiah segments, found ${continuousEzra.length} and ${separateNehemiah.length}`,
    );
  }

  console.log("[P05.12O] Comparing continuous EZR 11-23 with separate NEH 1-13...");

  const nehemiahExactIndex = new Map();

  for (let index = 0; index < separateNehemiah.length; index += 1) {
    const signature = normalizedText(separateNehemiah[index].visibleText);

    if (!signature) continue;
    if (!nehemiahExactIndex.has(signature)) nehemiahExactIndex.set(signature, []);
    nehemiahExactIndex.get(signature).push(index);
  }

  const exactPairs = [];

  for (let sourceIndex = 0; sourceIndex < continuousEzra.length; sourceIndex += 1) {
    const source = continuousEzra[sourceIndex];
    const signature = normalizedText(source.visibleText);
    const candidates = nehemiahExactIndex.get(signature) || [];

    if (signature && candidates.length === 1) {
      exactPairs.push({
        sourceIndex,
        targetIndex: candidates[0],
      });
    }
  }

  if (exactPairs.length !== 375) {
    fail(`Expected 375 unique exact source-to-source anchors, found ${exactPairs.length}`);
  }

  exactPairs.sort(
    (left, right) =>
      left.sourceIndex - right.sourceIndex ||
      left.targetIndex - right.targetIndex,
  );

  for (let index = 1; index < exactPairs.length; index += 1) {
    if (
      exactPairs[index].sourceIndex <= exactPairs[index - 1].sourceIndex ||
      exactPairs[index].targetIndex <= exactPairs[index - 1].targetIndex
    ) {
      fail(`Exact Ezra-Nehemiah anchors are not strictly monotonic at index ${index}.`);
    }
  }

  const rows = [];
  const gapSummaries = [];
  let previousSourceIndex = -1;
  let previousTargetIndex = -1;
  let gapId = 0;

  function addExactPair(pair) {
    const source = continuousEzra[pair.sourceIndex];
    const target = separateNehemiah[pair.targetIndex];

    rows.push({
      aliasSourceId: source.id,
      aliasSourceCoordinate: sourceCoordinate(source),
      aliasSourceReference: source.source.reference,
      primarySourceId: target.id,
      primarySourceCoordinate: nehemiahCoordinate(target),
      primarySourceReference: target.source.reference,
      mappingType: "exact-normalized-source-text",
      confidence: 1,
      similarity: 1,
      gapId: null,
      gapIndex: null,
      gapSize: null,
      sourceText: source.visibleText,
      primaryText: target.visibleText,
    });
  }

  for (const pair of [
    ...exactPairs,
    {
      sourceIndex: continuousEzra.length,
      targetIndex: separateNehemiah.length,
      sentinel: true,
    },
  ]) {
    const sourceStart = previousSourceIndex + 1;
    const sourceEnd = pair.sourceIndex;
    const targetStart = previousTargetIndex + 1;
    const targetEnd = pair.targetIndex;
    const sourceGap = continuousEzra.slice(sourceStart, sourceEnd);
    const targetGap = separateNehemiah.slice(targetStart, targetEnd);

    if (sourceGap.length || targetGap.length) {
      gapId += 1;

      if (sourceGap.length !== targetGap.length) {
        fail(
          `Anchor-bounded gap ${gapId} is unbalanced: ${sourceGap.length} source versus ${targetGap.length} target segments.`,
        );
      }

      const combinedSourceText = sourceGap
        .map((segment) => segment.visibleText)
        .join(" ");
      const combinedTargetText = targetGap
        .map((segment) => segment.visibleText)
        .join(" ");
      const combinedExact =
        normalizedText(combinedSourceText) === normalizedText(combinedTargetText);
      const combinedSimilarity = similarity(
        combinedSourceText,
        combinedTargetText,
      );

      if (combinedSimilarity < 0.88) {
        fail(
          `Anchor-bounded gap ${gapId} has insufficient combined similarity: ${combinedSimilarity}`,
        );
      }

      const pairSimilarities = [];

      for (let index = 0; index < sourceGap.length; index += 1) {
        const source = sourceGap[index];
        const target = targetGap[index];
        const pairSimilarity = similarity(
          source.visibleText,
          target.visibleText,
        );

        if (pairSimilarity < 0.78) {
          fail(
            `Low-confidence duplicate pair ${source.source.reference} → ${target.source.reference}: ${pairSimilarity}`,
          );
        }

        pairSimilarities.push(pairSimilarity);

        rows.push({
          aliasSourceId: source.id,
          aliasSourceCoordinate: sourceCoordinate(source),
          aliasSourceReference: source.source.reference,
          primarySourceId: target.id,
          primarySourceCoordinate: nehemiahCoordinate(target),
          primarySourceReference: target.source.reference,
          mappingType: combinedExact
            ? "sequence-bounded-boundary-variant"
            : "sequence-bounded-wording-variant",
          confidence: pairSimilarity,
          similarity: pairSimilarity,
          gapId,
          gapIndex: index,
          gapSize: sourceGap.length,
          sourceText: source.visibleText,
          primaryText: target.visibleText,
        });
      }

      gapSummaries.push({
        gapId,
        sourceStartReference: sourceGap[0].source.reference,
        sourceEndReference: sourceGap[sourceGap.length - 1].source.reference,
        targetStartReference: targetGap[0].source.reference,
        targetEndReference: targetGap[targetGap.length - 1].source.reference,
        sourceSegments: sourceGap.length,
        targetSegments: targetGap.length,
        combinedExact,
        combinedSimilarity,
        minimumPairSimilarity: Math.min(...pairSimilarities),
        maximumPairSimilarity: Math.max(...pairSimilarities),
      });
    }

    if (!pair.sentinel) {
      addExactPair(pair);
    }

    previousSourceIndex = pair.sourceIndex;
    previousTargetIndex = pair.targetIndex;
  }

  rows.sort((left, right) => {
    const leftIndex = continuousEzra.findIndex(
      (segment) => segment.id === left.aliasSourceId,
    );
    const rightIndex = continuousEzra.findIndex(
      (segment) => segment.id === right.aliasSourceId,
    );

    return leftIndex - rightIndex;
  });

  if (rows.length !== 389) {
    fail(`Expected 389 alias mappings, found ${rows.length}`);
  }

  const aliasIds = new Set(rows.map((row) => row.aliasSourceId));
  const primaryIds = new Set(rows.map((row) => row.primarySourceId));

  if (aliasIds.size !== 389 || primaryIds.size !== 389) {
    fail(
      `Alias map is not one-to-one: ${aliasIds.size} alias IDs and ${primaryIds.size} primary IDs.`,
    );
  }

  const exactRows = rows.filter(
    (row) => row.mappingType === "exact-normalized-source-text",
  );
  const boundaryVariantRows = rows.filter(
    (row) => row.mappingType === "sequence-bounded-boundary-variant",
  );
  const wordingVariantRows = rows.filter(
    (row) => row.mappingType === "sequence-bounded-wording-variant",
  );

  const candidate = {
    schemaVersion: "brenton-alternate-source-alias-map@1",
    generatedAtUtc: new Date().toISOString(),
    decision: {
      visiblePrimaryBooks: {
        Ezra: "EZR chapters 1-10",
        Nehemiah: "NEH chapters 1-13",
      },
      preservedAlternateSource:
        "EZR chapters 11-23 retained as an alternate Ezra-Nehemiah source-versification alias",
      duplicateVisibleReaderRowsSuppressedInFutureCandidate: 389,
      sourceTextDeleted: false,
    },
    mappings: rows.map((row) => ({
      aliasSourceId: row.aliasSourceId,
      aliasSourceCoordinate: row.aliasSourceCoordinate,
      primarySourceId: row.primarySourceId,
      primarySourceCoordinate: row.primarySourceCoordinate,
      mappingType: row.mappingType,
      confidence: row.confidence,
    })),
  };

  const candidateText = JSON.stringify(candidate, null, 2) + "\n";
  const fingerprint = sha256Text(candidateText);
  const stagingRoot = path.join(
    ROOT,
    ".private",
    "generated",
    "P05.12",
    "brenton-ezra-nehemiah-alias",
    fingerprint.slice(0, 16),
  );

  if (fs.existsSync(stagingRoot)) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }

  ensureDir(stagingRoot);

  const stagedAliasMap = writeNdjson(
    path.join(stagingRoot, "brenton-ezr11-23-to-nehemiah-alias.ndjson"),
    rows.map((row) => ({
      aliasSourceId: row.aliasSourceId,
      aliasSourceCoordinate: row.aliasSourceCoordinate,
      primarySourceId: row.primarySourceId,
      primarySourceCoordinate: row.primarySourceCoordinate,
      mappingType: row.mappingType,
      confidence: row.confidence,
    })),
  );

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

  const currentHashAfter = sha256File(currentBrentonPath);

  const summary = {
    milestone: "P05.12O",
    generatedAtUtc: new Date().toISOString(),
    status: "brenton-ezra-nehemiah-duplicate-source-audit-complete",
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
      p0512n: {
        report: relative(ROOT, p0512nRoot),
        summarySha256: sha256File(p0512nSummaryPath),
        checksumsVerified: nChecksums.checked,
      },
      currentBrenton: {
        path: relative(ROOT, currentBrentonPath),
        sha256Before: currentHashBefore,
        sha256After: currentHashAfter,
      },
    },
    duplicateSourceInventory: {
      continuousEzraSegments: continuousEzra.length,
      separateNehemiahSegments: separateNehemiah.length,
      exactUniqueMonotonicPairs: exactRows.length,
      sequenceBoundedBoundaryVariantPairs: boundaryVariantRows.length,
      sequenceBoundedWordingVariantPairs: wordingVariantRows.length,
      anchorBoundedGaps: gapSummaries.length,
      minimumGapCombinedSimilarity: Math.min(
        ...gapSummaries.map((gap) => Number(gap.combinedSimilarity)),
      ),
      minimumVariantPairSimilarity: Math.min(
        ...rows
          .filter((row) => row.mappingType !== "exact-normalized-source-text")
          .map((row) => Number(row.similarity)),
      ),
      aliasMappings: rows.length,
      uniqueAliasIds: aliasIds.size,
      uniquePrimaryIds: primaryIds.size,
      unmappedAliasSegments: continuousEzra.length - aliasIds.size,
      unmappedPrimarySegments: separateNehemiah.length - primaryIds.size,
    },
    readerDecisionCandidate: {
      visibleEzraChapters: "1-10",
      visibleNehemiahChapters: "1-13",
      alternateEzraChaptersPreservedAsAliases: "11-23",
      futureDuplicateVisibleRowsSuppressed: 389,
      sourceTextDeleted: false,
    },
    stagedAliasMap: {
      root: relative(ROOT, stagingRoot),
      fingerprint,
      path: relative(ROOT, stagedAliasMap.path),
      sha256: stagedAliasMap.sha256,
      bytes: stagedAliasMap.bytes,
      records: stagedAliasMap.records,
    },
    gates: {
      p0512lChecksumsValid: true,
      p0512nChecksumsValid: true,
      sourceSegmentHashVerified: true,
      exactAnchorCountLocked: exactRows.length === 375,
      exactAnchorsStrictlyMonotonic: true,
      allAnchorGapsBalanced: true,
      all389AliasSegmentsMappedExactlyOnce: aliasIds.size === 389,
      all389PrimarySegmentsMappedExactlyOnce: primaryIds.size === 389,
      noUniqueContinuousEzraSegmentLeftUnmapped: aliasIds.size === 389,
      productionBrentonModified: false,
      lxxCanonicalModified: false,
      alignmentsModified: false,
      safeToBuildDeduplicatedBrentonReaderCandidate: true,
      safeToApplyProductionBrenton: false,
      reason:
        "The source package contains two complete representations of the same Nehemiah content. A staged reader candidate may retain EZR chapters 1-10 as Ezra, retain NEH chapters 1-13 as the visible Nehemiah book, and preserve EZR chapters 11-23 as alternate source-versification aliases. Production apply still requires a full candidate/source census and reader-schema audit.",
    },
  };

  writeJson(
    path.join(args.output, "brenton-ezra-nehemiah-duplicate-summary.json"),
    summary,
  );

  writeCsv(
    path.join(args.output, "brenton-ezr11-23-to-nehemiah-alias-map.csv"),
    rows,
    [
      "aliasSourceId",
      "aliasSourceCoordinate",
      "aliasSourceReference",
      "primarySourceId",
      "primarySourceCoordinate",
      "primarySourceReference",
      "mappingType",
      "confidence",
      "similarity",
      "gapId",
      "gapIndex",
      "gapSize",
      "sourceText",
      "primaryText",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-ezra-nehemiah-variant-gaps.csv"),
    gapSummaries,
    [
      "gapId",
      "sourceStartReference",
      "sourceEndReference",
      "targetStartReference",
      "targetEndReference",
      "sourceSegments",
      "targetSegments",
      "combinedExact",
      "combinedSimilarity",
      "minimumPairSimilarity",
      "maximumPairSimilarity",
    ],
  );

  writeCsv(
    path.join(args.output, "brenton-ezra-nehemiah-wording-variants.csv"),
    rows.filter((row) => row.mappingType !== "exact-normalized-source-text"),
    [
      "aliasSourceReference",
      "primarySourceReference",
      "mappingType",
      "confidence",
      "similarity",
      "gapId",
      "sourceText",
      "primaryText",
    ],
  );

  const readme = [
    "# EMETSEES P05.12O Brenton Ezra-Nehemiah Duplicate Source Audit",
    "",
    `Generated: ${summary.generatedAtUtc}`,
    "",
    "The locked Brenton source contains two complete representations of Nehemiah:",
    "",
    "- EZR chapters 11-23, continuing the combined Ezra-Nehemiah source book",
    "- NEH chapters 1-13, the separate English reader book",
    "",
    "This audit compares the two official source paths directly. It does not use legacy canonical placement as the deciding evidence.",
    "",
    "## Results",
    "",
    `- Continuous EZR segments: ${summary.duplicateSourceInventory.continuousEzraSegments}`,
    `- Separate NEH segments: ${summary.duplicateSourceInventory.separateNehemiahSegments}`,
    `- Exact unique monotonic pairs: ${summary.duplicateSourceInventory.exactUniqueMonotonicPairs}`,
    `- Boundary-variant pairs: ${summary.duplicateSourceInventory.sequenceBoundedBoundaryVariantPairs}`,
    `- Wording-variant pairs: ${summary.duplicateSourceInventory.sequenceBoundedWordingVariantPairs}`,
    `- Alias mappings: ${summary.duplicateSourceInventory.aliasMappings}`,
    `- Unmapped continuous-EZR segments: ${summary.duplicateSourceInventory.unmappedAliasSegments}`,
    `- Unmapped NEH segments: ${summary.duplicateSourceInventory.unmappedPrimarySegments}`,
    "",
    "## Candidate reader decision",
    "",
    "- Display Ezra chapters 1-10.",
    "- Display Nehemiah chapters 1-13 from the separate NEH source.",
    "- Preserve EZR chapters 11-23 as alternate source-versification aliases.",
    "- Do not show the same Nehemiah content twice.",
    "- Delete no source text.",
    "",
    "## Safety",
    "",
    "- Production generatedBrenton.json was not modified.",
    "- Greek LXX canonical data was not modified.",
    "- WEB and KJV were not modified.",
    "- Display tokens and alignments were not rebuilt.",
    "- No production apply step is authorized.",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(args.output, "README.md"), readme, "utf8");
  writeChecksums(args.output);

  console.log("");
  console.log("[P05.12O] Brenton Ezra-Nehemiah duplicate source audit complete.");
  console.log(`[P05.12O] Exact source pairs: ${exactRows.length}`);
  console.log(
    `[P05.12O] Sequence-bounded variant pairs: ${
      boundaryVariantRows.length + wordingVariantRows.length
    }`,
  );
  console.log(`[P05.12O] Alias mappings: ${rows.length}/389`);
  console.log("[P05.12O] Production Brenton modified: NO");
  console.log("[P05.12O] Alignments modified: NO");
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
        : path.join(ROOT, ".private", "reports", "P05.12", "p0512o-fatal");

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
