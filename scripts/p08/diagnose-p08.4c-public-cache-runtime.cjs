#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const repo = path.resolve(process.argv[2] || process.cwd());
const out = path.resolve(process.argv[3]);

function readJson(relative) {
  const file = path.join(repo, relative);
  if (!fs.existsSync(file)) return { exists: false, path: relative, value: null };
  try {
    return {
      exists: true,
      path: relative,
      value: JSON.parse(fs.readFileSync(file, "utf8")),
    };
  } catch (error) {
    return {
      exists: true,
      path: relative,
      parseError: String(error && error.message ? error.message : error),
      value: null,
    };
  }
}

function inspectText(relative) {
  const file = path.join(repo, relative);
  if (!fs.existsSync(file)) return { exists: false, path: relative };
  const text = fs.readFileSync(file, "utf8");
  return {
    exists: true,
    path: relative,
    referencesEmetApproved: /emet-approved/i.test(text),
    referencesCachedExplanation: /cached.*explanation|explanation.*cache/i.test(text),
    referencesP04: /P04|p04/i.test(text),
    referencesPromptVersion: /prompt.*version|EXPECTED_P04_PROMPT_VERSION/i.test(text),
    referencesEntityEmet: /\\.emet\\b|emet\\s*:/i.test(text),
  };
}

const approvedManifest = readJson(
  "public/data/bibleiq/word-study/emet-approved/manifest.json",
);
const entityManifest = readJson(
  "public/data/bibleiq/word-study/entities/manifest.json",
);
const wordStudyManifest = readJson(
  "public/data/bibleiq/word-study/manifest.json",
);

const store = inspectText("app/data/lexicon/WordStudyEntityStore.ts");
const engine = inspectText("app/data/lexicon/BibleIQEngine.ts");

const approvedTotals =
  approvedManifest.value && approvedManifest.value.totals
    ? approvedManifest.value.totals
    : null;

let diagnosis = "runtime-cache-path-needs-review";

if (
  approvedTotals &&
  Number(approvedTotals.approved || 0) === 0 &&
  Number(approvedTotals.shards || 0) === 0
) {
  diagnosis =
    "current-public-emet-approved-runtime-is-empty; this can explain why Across Scripture is absent even though private cache generation exists";
}

const report = {
  verdict: "P08_4C_PUBLIC_CACHE_RUNTIME_DIAGNOSTIC_COMPLETE",
  scope: "application source and public runtime only",
  protectedPathsAccessed: 0,
  p07PathsAccessed: 0,
  p01ToP04PrivateContentAccessed: 0,
  approvedManifest: {
    exists: approvedManifest.exists,
    totals: approvedTotals,
    corpora:
      approvedManifest.value && approvedManifest.value.corpora
        ? approvedManifest.value.corpora
        : null,
    source:
      approvedManifest.value && approvedManifest.value.source
        ? approvedManifest.value.source
        : null,
  },
  entityManifest: {
    exists: entityManifest.exists,
    totals:
      entityManifest.value && entityManifest.value.totals
        ? entityManifest.value.totals
        : null,
  },
  wordStudyManifest: {
    exists: wordStudyManifest.exists,
    version:
      wordStudyManifest.value && wordStudyManifest.value.version
        ? wordStudyManifest.value.version
        : null,
  },
  sourceOwnership: {
    wordStudyEntityStore: store,
    bibleIQEngine: engine,
  },
  diagnosis,
  note:
    "This diagnostic does not inspect, modify, stop, or read the active P07 full-cache-generation paths."
};

fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\\n", "utf8");
console.log(JSON.stringify(report, null, 2));
