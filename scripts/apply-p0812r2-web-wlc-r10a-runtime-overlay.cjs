#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const OVERLAY_SCHEMA = "emet-p0812r2-web-wlc-r10a-runtime-overlay/v1";
const BOOK_SCHEMA = "emet-p0812r2-web-wlc-r10a-runtime-overlay-book/v1";
const BASE_R13 = "6a0a5bd5f222ba860a2fec74df9e30588932fefca093ee9bf184fca420149f4d";

function fail(message) {
  throw new Error(`[P08.12R2 R10A runtime overlay] ${message}`);
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`, "utf8");
}
function shaFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function shaText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}
function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function compactSourceId(token) {
  return String(Array.isArray(token) ? token[0] : "");
}
function countAlignedDisplayTokens(book) {
  let total = 0;
  for (const verse of Object.values(book?.verses || {})) {
    const translations = new Set([
      ...Object.keys(verse?.a || {}),
      ...Object.keys(verse?.v || {}),
    ]);
    for (const key of translations) {
      const indices = new Set([
        ...Object.keys(verse?.a?.[key] || {}),
        ...Object.keys(verse?.v?.[key] || {}),
      ]);
      total += indices.size;
    }
  }
  return total;
}
function recomputeRuntimeManifest(runtimeRoot) {
  const manifestPath = path.join(runtimeRoot, "manifest.json");
  const current = readJson(manifestPath);
  const manifest = { ...current };
  delete manifest.checksum;

  const totals = {
    books: 0,
    verses: 0,
    sourceTokens: 0,
    alignedDisplayTokens: 0,
    bytes: 0,
  };

  const corpora = {};
  for (const corpus of Object.keys(current.corpora || {}).sort()) {
    const currentCorpus = current.corpora[corpus] || {};
    const aliases = currentCorpus.aliases || {};
    const books = {};
    for (const file of Object.keys(currentCorpus.books || {}).sort()) {
      const full = path.join(runtimeRoot, corpus, file);
      if (!fs.existsSync(full)) fail(`Runtime book missing during manifest rebuild: ${corpus}/${file}`);
      const bytes = fs.readFileSync(full);
      const book = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
      const stats = {
        file,
        verses: Object.keys(book?.verses || {}).length,
        sourceTokens: Object.values(book?.verses || {}).reduce(
          (sum, verse) => sum + (Array.isArray(verse?.s) ? verse.s.length : 0),
          0,
        ),
        alignedDisplayTokens: countAlignedDisplayTokens(book),
        bytes: bytes.length,
        checksum: crypto.createHash("sha256").update(bytes).digest("hex"),
      };
      books[file] = stats;
      totals.books += 1;
      totals.verses += stats.verses;
      totals.sourceTokens += stats.sourceTokens;
      totals.alignedDisplayTokens += stats.alignedDisplayTokens;
      totals.bytes += stats.bytes;
    }
    corpora[corpus] = {
      ...currentCorpus,
      aliases,
      books,
    };
  }

  manifest.corpora = corpora;
  manifest.totals = totals;
  const withoutChecksum = JSON.stringify(manifest);
  manifest.checksum = shaText(withoutChecksum);
  writeJson(manifestPath, manifest);

  return {
    manifest,
    manifestBytes: fs.statSync(manifestPath).size,
    manifestSha256: shaFile(manifestPath),
  };
}
function verifyBookOverlayFile(file, expected) {
  if (!fs.existsSync(file)) fail(`Overlay book file missing: ${file}`);
  const stat = fs.statSync(file);
  if (stat.size !== expected.bytes) {
    fail(`Overlay book byte mismatch for ${path.basename(file)}. Expected ${expected.bytes}, found ${stat.size}`);
  }
  const digest = shaFile(file);
  if (digest !== expected.sha256) {
    fail(`Overlay book SHA mismatch for ${path.basename(file)}. Expected ${expected.sha256}, found ${digest}`);
  }
}
function preserveLegacyWebAvailability(verse) {
  if (verse?.v?.web && Object.keys(verse.v.web).length > 0) return 0;
  const legacy = verse?.a?.web && typeof verse.a.web === "object" ? verse.a.web : {};
  const entries = Object.entries(legacy);
  if (!entries.length) return 0;
  verse.v = verse.v && typeof verse.v === "object" ? verse.v : {};
  verse.v.web = verse.v.web && typeof verse.v.web === "object" ? verse.v.web : {};
  let preserved = 0;
  for (const [displayIndex, sourceIndexRaw] of entries) {
    const sourceIndex = Number(sourceIndexRaw);
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0) continue;
    const source = verse.s?.[sourceIndex];
    if (!Array.isArray(source)) continue;
    const occurrenceId = String(source[0] || "");
    const strong = String(source[3] || "");
    const entityId = String(source[4] || "");
    if (!/^H\d+$/.test(strong) || !/^word:hebrew:H\d+$/.test(entityId)) continue;
    verse.v.web[String(displayIndex)] = {
      mode: "exact-single",
      si: [sourceIndex],
      routes: [{ k: "lexical", o: occurrenceId, s: strong, e: entityId }],
      segment: {
        sourceOccurrenceIds: occurrenceId ? [occurrenceId] : [],
        sourceComponentIds: [],
        layer: "r13-legacy-a-preservation",
        lane: "R13_A_COMPAT_PRESERVATION",
        renderingStartTokenIndex: Number(displayIndex),
        renderingEndTokenIndex: Number(displayIndex),
      },
      d: "",
    };
    preserved += 1;
  }
  return preserved;
}
function applyBookOverlay(runtimeBook, overlayBook) {
  if (overlayBook.schemaVersion !== BOOK_SCHEMA) {
    fail(`Unsupported overlay book schema: ${overlayBook.schemaVersion}`);
  }
  if (!runtimeBook?.verses || typeof runtimeBook.verses !== "object") {
    fail(`Runtime book ${overlayBook.runtimeFile} has no verses object.`);
  }

  let appendedSources = 0;
  let routePositions = 0;
  let compatibilityPreservedPositions = 0;
  const compatibilityCheckedVerses = new Set();

  for (const [verseKey, sourceMap] of Object.entries(overlayBook.sources || {})) {
    const verse = runtimeBook.verses[verseKey];
    if (!verse) fail(`${overlayBook.runtimeFile} missing verse ${verseKey} required by overlay source map.`);
    if (!Array.isArray(verse.s)) verse.s = [];

    const byId = new Map();
    verse.s.forEach((token, index) => {
      const id = compactSourceId(token);
      if (id) byId.set(id, index);
    });

    for (const [id, compact] of Object.entries(sourceMap || {})) {
      if (!Array.isArray(compact) || compact.length !== 6 || String(compact[0]) !== id) {
        fail(`Invalid compact source contract at ${overlayBook.runtimeFile} ${verseKey} ${id}`);
      }
      const existingIndex = byId.get(id);
      if (existingIndex != null) {
        const existing = verse.s[existingIndex];
        if (String(existing?.[3] || "") !== String(compact?.[3] || "")) {
          fail(`Existing source Strong mismatch at ${overlayBook.runtimeFile} ${verseKey} ${id}`);
        }
        continue;
      }
      byId.set(id, verse.s.length);
      verse.s.push(compact);
      appendedSources += 1;
    }
  }

  for (const group of overlayBook.groups || []) {
    const verseKey = String(group.verseKey || "");
    const verse = runtimeBook.verses[verseKey];
    if (!verse) fail(`${overlayBook.runtimeFile} missing verse ${verseKey} required by overlay route group.`);
    if (!Array.isArray(verse.s)) fail(`${overlayBook.runtimeFile} ${verseKey} has no compact source array.`);
    if (!compatibilityCheckedVerses.has(verseKey)) {
      compatibilityPreservedPositions += preserveLegacyWebAvailability(verse);
      compatibilityCheckedVerses.add(verseKey);
    }

    const byId = new Map();
    verse.s.forEach((token, index) => {
      const id = compactSourceId(token);
      if (id) byId.set(id, index);
    });

    const sourceIds = Array.isArray(group.sourceIds) ? group.sourceIds.map(String) : [];
    const sourceIndices = sourceIds.map((id) => byId.get(id));
    if (sourceIndices.some((index) => index == null)) {
      fail(`${overlayBook.runtimeFile} ${verseKey} route group cannot resolve all WLC source IDs.`);
    }

    const display = Array.isArray(group.display) ? group.display : [];
    if (!display.length) fail(`${overlayBook.runtimeFile} ${verseKey} overlay group has no display positions.`);
    verse.v = verse.v && typeof verse.v === "object" ? verse.v : {};
    verse.v.web = verse.v.web && typeof verse.v.web === "object" ? verse.v.web : {};

    for (const pair of display) {
      if (!Array.isArray(pair) || !Number.isInteger(Number(pair[0]))) {
        fail(`${overlayBook.runtimeFile} ${verseKey} contains an invalid display pair.`);
      }
      const index = String(Number(pair[0]));
      const next = {
        mode: group.mode,
        si: sourceIndices,
        routes: Array.isArray(group.routes) ? group.routes : [],
        segment: group.segment || {},
        d: String(pair[1] || ""),
      };
      const existing = verse.v.web[index];
      if (existing && !same(existing, next)) {
        fail(`${overlayBook.runtimeFile} ${verseKey}:${index} already has a different WEB v3 route.`);
      }
      verse.v.web[index] = next;
      routePositions += 1;
    }
  }

  return { appendedSources, routePositions, compatibilityPreservedPositions };
}
function applyP0812R2R10ARuntimeOverlay(repositoryRoot = process.cwd(), options = {}) {
  const runtimeRoot = path.join(repositoryRoot, "public", "data", "bibleiq", "word-study");
  const overlayRoot = path.join(
    repositoryRoot,
    "app",
    "data",
    "bibleiq",
    "runtime-locks",
    "p0812r2-web-wlc-r10a",
  );
  const manifestFile = path.join(overlayRoot, "manifest.json");
  if (!fs.existsSync(manifestFile)) fail(`Overlay manifest missing: ${manifestFile}`);

  const overlay = readJson(manifestFile);
  if (overlay.schemaVersion !== OVERLAY_SCHEMA) fail(`Unsupported overlay schema: ${overlay.schemaVersion}`);
  if (overlay.baseRuntimeManifestChecksum !== BASE_R13) {
    fail(`Unexpected overlay base checksum: ${overlay.baseRuntimeManifestChecksum}`);
  }

  const currentManifest = readJson(path.join(runtimeRoot, "manifest.json"));
  if (currentManifest.checksum !== BASE_R13) {
    fail(`Overlay requires exact R13 base ${BASE_R13}, found ${currentManifest.checksum}`);
  }

  let totalAppendedSources = 0;
  let totalRoutePositions = 0;
  let totalCompatibilityPreservedPositions = 0;
  const affected = {};

  for (const file of Object.keys(overlay.books || {}).sort()) {
    const bookContract = overlay.books[file];
    const overlayBookFile = path.join(overlayRoot, "books", file);
    verifyBookOverlayFile(overlayBookFile, bookContract.overlayFile);
    const overlayBook = readJson(overlayBookFile);
    if (overlayBook.runtimeFile !== file) fail(`Overlay runtime filename mismatch for ${file}`);

    const runtimeFile = path.join(runtimeRoot, "hebrew", file);
    if (!fs.existsSync(runtimeFile)) fail(`R13 Hebrew runtime book missing: ${file}`);
    const runtimeBook = readJson(runtimeFile);
    const applied = applyBookOverlay(runtimeBook, overlayBook);
    writeJson(runtimeFile, runtimeBook);

    totalAppendedSources += applied.appendedSources;
    totalRoutePositions += applied.routePositions;
    totalCompatibilityPreservedPositions += applied.compatibilityPreservedPositions;
    affected[`hebrew/${file}`] = {
      bytes: fs.statSync(runtimeFile).size,
      sha256: shaFile(runtimeFile),
    };
  }

  const rebuilt = recomputeRuntimeManifest(runtimeRoot);
  const result = {
    manifestChecksum: rebuilt.manifest.checksum,
    manifestBytes: rebuilt.manifestBytes,
    manifestSha256: rebuilt.manifestSha256,
    affectedFiles: affected,
    appendedSources: totalAppendedSources,
    routePositions: totalRoutePositions,
    compatibilityPreservedPositions: totalCompatibilityPreservedPositions,
    totals: rebuilt.manifest.totals,
  };

  if (options.derive === true) {
    return result;
  }

  const expected = overlay.expectedFinal;
  if (!expected || typeof expected !== "object") fail("Overlay expectedFinal contract is missing.");
  if (result.manifestChecksum !== expected.manifestChecksum) {
    fail(`Final manifest checksum mismatch. Expected ${expected.manifestChecksum}, found ${result.manifestChecksum}`);
  }
  if (result.manifestBytes !== expected.manifestBytes || result.manifestSha256 !== expected.manifestSha256) {
    fail("Final manifest byte/SHA contract changed.");
  }
  if (result.appendedSources !== expected.appendedSources) {
    fail(`Appended source count mismatch. Expected ${expected.appendedSources}, found ${result.appendedSources}`);
  }
  if (result.routePositions !== expected.routePositions) {
    fail(`Overlay route-position count mismatch. Expected ${expected.routePositions}, found ${result.routePositions}`);
  }
  if (result.compatibilityPreservedPositions !== expected.compatibilityPreservedPositions) {
    fail(`Compatibility-preservation count mismatch. Expected ${expected.compatibilityPreservedPositions}, found ${result.compatibilityPreservedPositions}`);
  }
  if (!same(result.affectedFiles, expected.affectedFiles)) {
    fail("Affected Hebrew runtime file contract changed.");
  }

  console.log(
    `[P08.12R2 R10A runtime overlay] PASS: candidate ${overlay.candidate.rows} rows / ` +
      `${expected.routePositions} new display routes / ${expected.compatibilityPreservedPositions} preserved legacy positions / ` +
      `${expected.appendedSources} appended WLC sources / ` +
      `final ${expected.manifestChecksum}`,
  );
  return result;
}

if (require.main === module) {
  applyP0812R2R10ARuntimeOverlay(process.cwd());
}

module.exports = {
  applyP0812R2R10ARuntimeOverlay,
  recomputeRuntimeManifest,
};
