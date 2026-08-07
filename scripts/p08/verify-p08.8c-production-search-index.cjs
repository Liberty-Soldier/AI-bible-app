#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const repo = path.resolve(process.argv[2] || process.cwd());
const searchRoot = path.join(repo, "public", "scripture", "search");
const manifestPath = path.join(searchRoot, "manifest.json");

const EXPECTED = {
  web: 31098,
  kjv: 31102,
  brenton: 28548,
};

function fail(message) {
  throw new Error(message);
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

if (!fs.existsSync(manifestPath)) {
  fail(`Search manifest is missing: ${manifestPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

if (manifest.phase !== "P08.3" || manifest.schemaVersion !== 1) {
  fail("Search manifest schema/phase is invalid.");
}

if (manifest.sourceOfTruth !== "public/scripture/runtime") {
  fail(`Unexpected search source of truth: ${manifest.sourceOfTruth}`);
}

if (!Array.isArray(manifest.summaries) || manifest.summaries.length !== 3) {
  fail("Search manifest must contain exactly three translation summaries.");
}

const summaryByTranslation = new Map(
  manifest.summaries.map((summary) => [summary.translation, summary]),
);

const results = [];

for (const [translation, expectedVerses] of Object.entries(EXPECTED)) {
  const file = path.join(searchRoot, `${translation}.json`);

  if (!fs.existsSync(file)) {
    fail(`Search index missing: ${translation}.json`);
  }

  const size = fs.statSync(file).size;
  if (size < 500000) {
    fail(`Search index is unexpectedly small: ${translation}.json (${size} bytes)`);
  }

  const index = JSON.parse(fs.readFileSync(file, "utf8"));

  if (index.schemaVersion !== 1) {
    fail(`${translation} schemaVersion must be 1.`);
  }

  if (index.translation !== translation) {
    fail(
      `${translation} translation identity mismatch: ${index.translation}`,
    );
  }

  if (index.verseCount !== expectedVerses) {
    fail(
      `${translation} verseCount mismatch: expected ${expectedVerses}, found ${index.verseCount}`,
    );
  }

  if (!Array.isArray(index.records) || index.records.length !== expectedVerses) {
    fail(`${translation} records length mismatch.`);
  }

  if (!Array.isArray(index.books) || index.books.length < 50) {
    fail(`${translation} books list is missing or implausibly small.`);
  }

  if (
    typeof index.sourceFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(index.sourceFingerprint)
  ) {
    fail(`${translation} sourceFingerprint is invalid.`);
  }

  const sample = index.records[0];
  if (
    !Array.isArray(sample) ||
    sample.length !== 4 ||
    typeof sample[0] !== "string" ||
    !Number.isInteger(sample[1]) ||
    typeof sample[2] !== "string" ||
    typeof sample[3] !== "string" ||
    !sample[3].trim()
  ) {
    fail(`${translation} first search record is invalid.`);
  }

  const summary = summaryByTranslation.get(translation);
  if (!summary) {
    fail(`Manifest summary missing for ${translation}.`);
  }

  const actualHash = sha256File(file);

  if (summary.verseCount !== expectedVerses) {
    fail(`Manifest verseCount mismatch for ${translation}.`);
  }

  if (summary.output !== `public/scripture/search/${translation}.json`) {
    fail(`Manifest output path mismatch for ${translation}: ${summary.output}`);
  }

  if (summary.outputBytes !== size) {
    fail(
      `Manifest outputBytes mismatch for ${translation}: expected ${size}, found ${summary.outputBytes}`,
    );
  }

  if (summary.outputSha256 !== actualHash) {
    fail(`Manifest SHA256 mismatch for ${translation}.`);
  }

  results.push({
    translation,
    verseCount: index.verseCount,
    books: index.books.length,
    bytes: size,
    sha256: actualHash,
  });
}

console.log(
  JSON.stringify(
    {
      verdict: "P08_8C_PRODUCTION_SEARCH_INDEX_BUILD_GATE_VERIFIED",
      sourceOfTruth: manifest.sourceOfTruth,
      indexes: results,
    },
    null,
    2,
  ),
);
