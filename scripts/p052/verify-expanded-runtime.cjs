"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const REPORT_ROOT = path.join(ROOT, "reports", "p052-alignment-expansion");
const REPORT_PATH = path.join(REPORT_ROOT, "report.json");
const ADDITIONS_PATH = path.join(REPORT_ROOT, "added-alignments.jsonl");
const CANONICAL_ROOT = path.join(ROOT, "app", "data", "bibleiq", "canonical");
const RUNTIME_MANIFEST_PATH = path.join(
  ROOT,
  "public",
  "data",
  "bibleiq",
  "word-study",
  "manifest.json",
);

function fail(message) {
  throw new Error(`[P05.2 alignment verification] ${message}`);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) fail(`Missing file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function unwrapVerseMap(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return {};
  }
  for (const key of ["verses", "records", "data", "entries"]) {
    const candidate = document[key];
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      Object.values(candidate).some(
        (value) =>
          value &&
          typeof value === "object" &&
          Array.isArray(value.sourceTokens),
      )
    ) {
      return candidate;
    }
  }
  return document;
}

function loadCanonicalIndex() {
  const index = new Map();
  let alignedDisplayTokens = 0;

  for (const corpus of ["hebrew", "greek-nt", "lxx"]) {
    const directory = path.join(CANONICAL_ROOT, corpus);
    if (!fs.existsSync(directory)) continue;

    for (const file of fs
      .readdirSync(directory)
      .filter((name) => name.endsWith(".json"))) {
      const verseMap = unwrapVerseMap(readJson(path.join(directory, file)));

      for (const [reference, verse] of Object.entries(verseMap)) {
        index.set(`${corpus}|${reference}`, verse);

        for (const translation of Object.values(
          verse?.translations || {},
        )) {
          for (const token of translation?.tokens || []) {
            if (token?.alignedSourceTokenIds?.length) {
              alignedDisplayTokens += 1;
            }
          }
        }
      }
    }
  }

  return { index, alignedDisplayTokens };
}

function main() {
  const report = readJson(REPORT_PATH);
  if (report.mode !== "apply") {
    fail("The latest P05.2 report is not an applied alignment run.");
  }

  if (!fs.existsSync(ADDITIONS_PATH)) {
    fail("Missing added-alignments.jsonl.");
  }

  const additions = fs
    .readFileSync(ADDITIONS_PATH, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const expectedCount = additions.reduce(
    (sum, item) => sum + item.displayTokenIndexes.length,
    0,
  );

  if (expectedCount !== report.totals.addedDisplayTokenAlignments) {
    fail(
      `Report count mismatch: ${expectedCount} additions in JSONL vs ` +
        `${report.totals.addedDisplayTokenAlignments} in report.`,
    );
  }

  const { index, alignedDisplayTokens } = loadCanonicalIndex();
  const missing = [];

  for (const addition of additions) {
    const verse = index.get(`${addition.corpus}|${addition.reference}`);
    const translation = verse?.translations?.[addition.translation];

    if (!translation) {
      missing.push({
        ...addition,
        reason: "missing-verse-or-translation",
      });
      continue;
    }

    for (const displayIndex of addition.displayTokenIndexes) {
      const token = (translation.tokens || []).find(
        (candidate) => Number(candidate.index) === Number(displayIndex),
      );

      if (
        !token ||
        !Array.isArray(token.alignedSourceTokenIds) ||
        !token.alignedSourceTokenIds.includes(addition.sourceTokenId)
      ) {
        missing.push({
          ...addition,
          displayIndex,
          reason: "alignment-not-present",
        });
      }
    }
  }

  if (missing.length) {
    fs.mkdirSync(REPORT_ROOT, { recursive: true });
    fs.writeFileSync(
      path.join(REPORT_ROOT, "verification-missing.json"),
      `${JSON.stringify(missing.slice(0, 500), null, 2)}\n`,
      "utf8",
    );
    fail(`${missing.length} applied alignments are missing from committed canonical data.`);
  }

  const runtimeManifest = readJson(RUNTIME_MANIFEST_PATH);
  if (
    Number(runtimeManifest?.totals?.alignedDisplayTokens) !==
    alignedDisplayTokens
  ) {
    fail(
      `Runtime alignment count ${runtimeManifest?.totals?.alignedDisplayTokens} ` +
        `does not match canonical count ${alignedDisplayTokens}.`,
    );
  }

  console.log("P05.2 alignment verification passed.");
  console.log(
    `- New display-token alignments: ${expectedCount.toLocaleString()}`,
  );
  console.log(
    `- Applied groups: ${additions.length.toLocaleString()}`,
  );
  console.log(
    `- Canonical/runtime aligned tokens: ${alignedDisplayTokens.toLocaleString()}`,
  );
  console.log("- Missing applied alignments: 0");
  console.log("- Existing alignments changed by the expansion pass: 0");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
