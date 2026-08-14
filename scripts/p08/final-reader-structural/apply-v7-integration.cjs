#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(process.env.EMETSEES_REPO_ROOT || process.cwd());

function fail(message) { throw new Error(`[P08.10 V7 integration] ${message}`); }
function eolOf(text) { return String(text || "").includes("\r\n") ? "\r\n" : "\n"; }
function lf(text) { return String(text || "").replace(/\r\n/gu, "\n"); }
function withEol(text, eol) { return eol === "\r\n" ? String(text).replace(/\n/gu, "\r\n") : String(text); }

function patchEvidenceMap() {
  const file = path.join(ROOT, "app", "data", "evidence", "evidenceBookMap.ts");
  const raw = fs.readFileSync(file, "utf8"), eol = eolOf(raw);
  let source = lf(raw);
  if (source.includes('"Song of Songs": "Song"')) return;
  const anchor = '  "Song of Solomon": "Song",';
  if (!source.includes(anchor)) fail("Song of Solomon central book-map anchor missing.");
  source = source.replace(anchor, `${anchor}\n  "Song of Songs": "Song",`);
  fs.writeFileSync(file, withEol(source, eol), "utf8");
}

function patchGenericRuntimeSongAliases() {
  const file = path.join(ROOT, "scripts", "build-word-study-runtime.js");
  const raw = fs.readFileSync(file, "utf8"), eol = eolOf(raw);
  let source = lf(raw);

  if (source.includes("p0810-v7-song-runtime-aliases")) {
    return;
  }

  const anchor = `  for (const bookName of [...bookNames].sort()) {
    registerAlias(aliasMap, bookName, outputFile);
    const normalized = normalizeBookName(bookName);
    if (normalized) registerAlias(aliasMap, normalized, outputFile);
  }
`;

  if (!source.includes(anchor)) {
    fail("Generic word-study runtime alias-registration owner changed.");
  }

  const replacement = `${anchor}
  // p0810-v7-song-runtime-aliases
  // The displayed reader uses "Song of Songs"; historical EMETSEES layers
  // also use "Song of Solomon", "Song", and "Canticles". They all own the
  // same canonical LXX SongofSongs.json runtime book.
  if (
    corpus === "lxx" &&
    normalizeAlias(path.basename(inputFile, ".json")) === "songofsongs"
  ) {
    for (const alias of [
      "Song of Songs",
      "Song of Solomon",
      "Song",
      "Canticles",
    ]) {
      registerAlias(aliasMap, alias, outputFile);
    }
  }
`;

  source = source.replace(anchor, replacement);
  fs.writeFileSync(file, withEol(source, eol), "utf8");
}

function patchPackageJson() {
  const file = path.join(ROOT, "package.json");
  const raw = fs.readFileSync(file, "utf8"), eol = eolOf(raw);
  const pkg = JSON.parse(raw);
  pkg.scripts = pkg.scripts || {};
  const buildCmd =
    "node --max-old-space-size=4096 scripts/p08/final-reader-structural/build-kjv-reader-runtime.cjs";
  const verifyCmd =
    "node scripts/p08/final-reader-structural/verify-structural-repair.cjs";

  pkg.scripts["build:kjv-reader-structural"] = buildCmd;
  pkg.scripts["verify:p0810-structural"] = verifyCmd;

  let prebuild = String(pkg.scripts.prebuild || "");
  if (!prebuild.includes("build-kjv-reader-runtime.cjs")) {
    const owner = "node --max-old-space-size=4096 scripts/build-word-study-runtime.js";
    if (!prebuild.includes(owner)) fail("Production prebuild word-study runtime owner changed.");
    prebuild = prebuild.replace(
      owner,
      `${owner} && ${buildCmd}`,
    );
  }
  pkg.scripts.prebuild = prebuild;
  fs.writeFileSync(
    file,
    withEol(`${JSON.stringify(pkg, null, 2)}\n`, eol),
    "utf8",
  );
}

patchEvidenceMap();
patchGenericRuntimeSongAliases();
patchPackageJson();
console.log("P08.10 V7 integration applied.");
console.log("- Song of Songs -> Song central evidence alias");
console.log("- Generic LXX runtime binds Song of Songs / Song of Solomon / Song / Canticles to SongofSongs.json");
console.log("- KJV structural runtime rebuild added to production prebuild");
console.log("- Bound P08.10 verifier remains transaction-only; it is NOT required on Vercel");
console.log("- CanonicalVerseStore unchanged");
console.log("- ReaderVerseAdapter unchanged");
