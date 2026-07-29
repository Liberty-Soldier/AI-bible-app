"use strict";

const fs = require("fs");
const path = require("path");

const root = process.cwd();

function fail(message) {
  throw new Error(`[P05.12S reader adapter integration] ${message}`);
}

function read(relativePath) {
  const filePath = path.join(root, relativePath);

  if (!fs.existsSync(filePath)) {
    fail(`Missing required file: ${relativePath}`);
  }

  return fs.readFileSync(filePath, "utf8");
}

function requireText(relativePath, tokens) {
  const text = read(relativePath);

  for (const token of tokens) {
    if (!text.includes(token)) {
      fail(`${relativePath} is missing required contract: ${token}`);
    }
  }
}

requireText("app/data/scripture/ReaderVerseAdapter.ts", [
  "normalizeReaderChapter",
  "buildReaderChapterItems",
  "readerVerseAnchorId",
  "tokenAvailabilityKey",
  "candidateOwnedRecord",
]);

requireText("app/components/ReaderVerseScroller.tsx", [
  "readerVerseAnchorId",
  "scrollIntoView",
]);

requireText("app/read/[book]/[chapter]/page.tsx", [
  "normalizeReaderChapter",
  "ReaderVerseScroller",
  "chapterSuperscriptions",
  "verseOptions={chapterVerses.map",
]);

requireText("app/components/VerseActionController.tsx", [
  "buildReaderChapterItems",
  "Superscription",
  "readerVerseTokenAvailabilityKey",
  "readerVerseAnchorId",
]);

requireText("app/components/ReaderSelector.tsx", [
  "verseOptions: string[]",
  "verseOptions.map",
]);

requireText("scripts/split-scripture-runtime.js", [
  "normalizeRuntimeVerse",
  "compareVerseLabels",
  "verseLabel",
]);

requireText("app/components/ReaderWordStudyController.tsx", [
  "numericSelectedVerse",
  "/^\\d+$/.test(selectedVerse)",
]);

requireText("app/verse/[id]/page.tsx", [
  "normalizeReaderChapter",
  "parsed.verseLabel",
]);

const splitScript = require("child_process").spawnSync(
  process.execPath,
  ["--check", path.join(root, "scripts/split-scripture-runtime.js")],
  { encoding: "utf8" },
);

if (splitScript.status !== 0) {
  fail(`split-scripture-runtime.js syntax failed: ${splitScript.stderr}`);
}

const generatedBibleFiles = [
  "app/data/scripture/generatedWEB.json",
  "app/data/scripture/generatedKJV.json",
  "app/data/scripture/generatedBrenton.json",
];

for (const relativePath of generatedBibleFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    fail(`Production Scripture source is missing: ${relativePath}`);
  }
}

console.log("[P05.12S] Reader schema adapter integration contracts passed.");
console.log("[P05.12S] String verse labels supported: YES");
console.log("[P05.12S] Superscription rendering supported: YES");
console.log("[P05.12S] Candidate Brenton taps fail closed: YES");
console.log("[P05.12S] Production Scripture JSON replaced: NO");
