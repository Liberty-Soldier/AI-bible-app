#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(process.env.EMETSEES_REPO_ROOT || process.cwd());
const REPORT_DIR = path.resolve(
  process.env.EMETSEES_P0812_REPORT_DIR ||
  path.join(ROOT, ".private", "reports", "P08.12", "manual"),
);
const CANONICAL_ROOT = path.join(ROOT, "app", "data", "bibleiq", "canonical", "lxx");
const DISPLAY_FILE = path.join(ROOT, "app", "data", "scripture", "generatedBrenton.json");
const RUNTIME_ROOT = path.join(ROOT, "public", "data", "bibleiq", "word-study");
const MANIFEST_FILE = path.join(RUNTIME_ROOT, "manifest.json");

function fail(message) {
  throw new Error(`[P08.12 Brenton runtime reconciliation] ${message}`);
}
function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); }
function existsFile(file) { try { return fs.statSync(file).isFile(); } catch { return false; } }
function readJson(file) {
  if (!existsFile(file)) fail(`Required JSON missing: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
}
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function normalizeAlias(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^0-9A-Za-z]+/gu, "")
    .toLowerCase();
}
function tokenIdentity(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/æ/giu, "ae")
    .replace(/œ/giu, "oe")
    .replace(/[§¶†‡]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
}
function joined(tokens, start, length) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += tokenIdentity(tokens[start + i]?.text ?? tokens[start + i]);
  }
  return out;
}
function alignTokens(displayTokens, canonicalTokens) {
  const groups = [];
  let i = 0, j = 0;
  const LOOK = 8, SPAN = 4;

  while (i < displayTokens.length && j < canonicalTokens.length) {
    const left = tokenIdentity(displayTokens[i]?.text);
    const right = tokenIdentity(canonicalTokens[j]?.text);

    if (left && left === right) {
      groups.push({
        displayStart: i, displayLength: 1,
        canonicalStart: j, canonicalLength: 1,
        kind: "exact-token",
      });
      i += 1; j += 1; continue;
    }

    let span = null;
    for (let di = 1; di <= SPAN && i + di <= displayTokens.length; di += 1) {
      const dl = joined(displayTokens, i, di);
      if (!dl) continue;
      for (let cj = 1; cj <= SPAN && j + cj <= canonicalTokens.length; cj += 1) {
        if (di === 1 && cj === 1) continue;
        const cr = joined(canonicalTokens, j, cj);
        if (!cr || dl !== cr) continue;
        const score = di + cj + Math.abs(di - cj) * 0.1;
        if (!span || score < span.score) {
          span = {
            displayStart: i, displayLength: di,
            canonicalStart: j, canonicalLength: cj,
            kind: "exact-joined-span",
            score,
          };
        }
      }
    }
    if (span) {
      groups.push(span);
      i += span.displayLength;
      j += span.canonicalLength;
      continue;
    }

    let anchor = null;
    for (let di = 0; di <= LOOK && i + di < displayTokens.length; di += 1) {
      const d = tokenIdentity(displayTokens[i + di]?.text);
      if (!d) continue;
      for (let cj = 0; cj <= LOOK && j + cj < canonicalTokens.length; cj += 1) {
        if (di === 0 && cj === 0) continue;
        const c = tokenIdentity(canonicalTokens[j + cj]?.text);
        if (!c || d !== c) continue;
        const score = di + cj + Math.abs(di - cj) * 0.25;
        if (!anchor || score < anchor.score) anchor = { di, cj, score };
      }
    }
    if (anchor) {
      if (anchor.di > 0 || anchor.cj > 0) {
        groups.push({
          displayStart: i, displayLength: anchor.di,
          canonicalStart: j, canonicalLength: anchor.cj,
          kind: "unmatched-gap",
        });
      }
      i += anchor.di; j += anchor.cj; continue;
    }

    groups.push({
      displayStart: i, displayLength: 1,
      canonicalStart: j, canonicalLength: 0,
      kind: "unmatched-display-token",
    });
    i += 1;
  }

  if (i < displayTokens.length || j < canonicalTokens.length) {
    groups.push({
      displayStart: i,
      displayLength: displayTokens.length - i,
      canonicalStart: j,
      canonicalLength: canonicalTokens.length - j,
      kind: "unmatched-tail",
    });
  }
  return groups;
}
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function nonEmpty(value) {
  const text = String(value ?? "").trim();
  return text || null;
}
function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function verseSortNumber(label) {
  const m = /^(\d+)/u.exec(String(label || ""));
  return m ? Number(m[1]) : 0;
}
function recordText(raw) {
  if (typeof raw?.text === "string" && raw.text.trim()) return raw.text;
  if (Array.isArray(raw?.sources) && raw.sources.length) {
    const value = raw.sources[0]?.text;
    if (typeof value === "string") return value;
  }
  return "";
}
function looksLikeVerseRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const raw = value;
  const display = asRecord(raw.display);
  const source = asRecord(raw.sourceIdentity || raw.source);
  const book = nonEmpty(display.book ?? raw.book ?? source.book);
  const chapter = finiteNumber(display.chapter ?? raw.chapter ?? source.chapter, NaN);
  const verseLabel =
    nonEmpty(display.verseLabel ?? raw.verseLabel ?? source.verseLabel) ||
    nonEmpty(display.numericVerse ?? raw.verse ?? source.numericVerse);
  return Boolean(book && Number.isFinite(chapter) && verseLabel && recordText(raw));
}
function collectVerseRecords(document) {
  const out = [], seen = new Set();
  function visit(value, depth = 0) {
    if (depth > 8 || value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    if (looksLikeVerseRecord(value)) {
      const raw = value;
      const display = asRecord(raw.display);
      const source = asRecord(raw.sourceIdentity || raw.source);
      const book = nonEmpty(display.book ?? raw.book ?? source.book) || "";
      const chapter = finiteNumber(display.chapter ?? raw.chapter ?? source.chapter);
      const verseLabel =
        nonEmpty(display.verseLabel ?? raw.verseLabel ?? source.verseLabel) ||
        String(finiteNumber(display.numericVerse ?? raw.verse ?? source.numericVerse));
      const key = [nonEmpty(raw.id) || "", book, chapter, verseLabel, recordText(raw)].join("|");
      if (!seen.has(key)) {
        seen.add(key);
        out.push(raw);
      }
      return;
    }
    for (const child of Object.values(value)) visit(child, depth + 1);
  }
  visit(document);
  return out;
}
function normalizeReaderRecord(raw) {
  const display = asRecord(raw.display);
  const source = asRecord(raw.sourceIdentity || raw.source);
  const lxx = asRecord(raw.lxxOwnership);
  const book =
    nonEmpty(display.book) ||
    nonEmpty(raw.book) ||
    nonEmpty(source.book) ||
    "";
  const chapter = finiteNumber(display.chapter ?? raw.chapter ?? source.chapter);
  const verseLabel =
    nonEmpty(display.verseLabel) ||
    nonEmpty(raw.verseLabel) ||
    nonEmpty(source.verseLabel) ||
    String(finiteNumber(display.numericVerse ?? raw.verse ?? source.numericVerse));
  const verse = finiteNumber(
    display.numericVerse ?? raw.verse ?? source.numericVerse ?? verseSortNumber(verseLabel),
  );
  const hasTokenKey = Object.prototype.hasOwnProperty.call(raw, "tokenAvailabilityKey");
  const explicitKey =
    raw.tokenAvailabilityKey === null ? null : nonEmpty(raw.tokenAvailabilityKey);
  const defensibleLxx = Boolean(
    lxx.directLxxCoordinateExists === true &&
    lxx.entityRoutingEligible === true &&
    nonEmpty(lxx.authoritativeOwnershipKey) &&
    !nonEmpty(lxx.exclusionReason),
  );
  const candidateOwned = raw.translationId === "brenton" || Boolean(raw.lxxOwnership);
  const tokenAvailabilityKey =
    hasTokenKey && explicitKey
      ? explicitKey
      : defensibleLxx
        ? String(verse)
        : hasTokenKey
          ? null
          : candidateOwned
            ? null
            : String(verse);
  return { raw, book, chapter, verse, verseLabel, text: recordText(raw), tokenAvailabilityKey };
}
function unwrapVerseMap(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) return {};
  for (const key of ["verses","records","data","entries"]) {
    const candidate = document[key];
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      Object.values(candidate).some(
        (value) => value && typeof value === "object" && Array.isArray(value.sourceTokens),
      )
    ) return candidate;
  }
  return document;
}
function coordinateMap(document) {
  const out = new Map();
  for (const [fallback, verse] of Object.entries(unwrapVerseMap(document))) {
    if (!verse || typeof verse !== "object") continue;
    const m = /(?:^|[.:])(\d+)[.:](\d+)$/u.exec(String(fallback || ""));
    const chapter = Number(verse.chapter ?? m?.[1]);
    const verseNumber = Number(verse.verse ?? m?.[2]);
    if (Number.isInteger(chapter) && Number.isInteger(verseNumber)) {
      out.set(`${chapter}:${verseNumber}`, { verse, fallback });
    }
  }
  return out;
}
function safeBase(file) {
  return path.basename(file, ".json").replace(/[^0-9A-Za-z]+/gu, "").toLowerCase();
}
function canonicalFileIndex() {
  const out = new Map();
  for (const file of fs.readdirSync(CANONICAL_ROOT).filter((f) => f.endsWith(".json"))) {
    out.set(safeBase(file), path.join(CANONICAL_ROOT, file));
  }
  return out;
}
function runtimeSourceIndexById(compactVerse) {
  const out = new Map();
  (Array.isArray(compactVerse?.s) ? compactVerse.s : []).forEach((row, index) => {
    if (Array.isArray(row) && row[0]) out.set(String(row[0]), index);
  });
  return out;
}
function alignedIds(token) {
  return Array.isArray(token?.alignedSourceTokenIds)
    ? token.alignedSourceTokenIds.map(String).filter(Boolean)
    : [];
}
function mapGroup(group, canonicalTokens, sourceIndexById, outputMap, methods) {
  if (!group || String(group.kind).startsWith("unmatched")) return;

  const cIndexes = Array.from(
    { length: group.canonicalLength },
    (_, offset) => group.canonicalStart + offset,
  );
  const canonicalGroup = cIndexes.map((index) => canonicalTokens[index]).filter(Boolean);

  if (group.displayLength === group.canonicalLength) {
    for (let offset = 0; offset < group.displayLength; offset += 1) {
      const token = canonicalTokens[group.canonicalStart + offset];
      const ids = alignedIds(token);
      if (ids.length !== 1) continue;
      const sourceIndex = sourceIndexById.get(ids[0]);
      if (!Number.isInteger(sourceIndex)) continue;
      outputMap[String(group.displayStart + offset)] = sourceIndex;
      methods[String(group.displayStart + offset)] = "exact-display-canonical-position";
    }
    return;
  }

  const allIds = [...new Set(canonicalGroup.flatMap(alignedIds))];
  if (allIds.length !== 1) return;
  const sourceIndex = sourceIndexById.get(allIds[0]);
  if (!Number.isInteger(sourceIndex)) return;

  for (let offset = 0; offset < group.displayLength; offset += 1) {
    outputMap[String(group.displayStart + offset)] = sourceIndex;
    methods[String(group.displayStart + offset)] = "exact-joined-display-canonical-span";
  }
}
function applyCollisionSafeSuppression(compactVerse, candidatesByIndex) {
  const conflicts = [];
  const mapped = compactVerse?.a?.brenton || {};
  const methods = compactVerse?.m?.brenton || {};

  for (const [displayIndex, sourceIndexes] of candidatesByIndex.entries()) {
    const unique = [...sourceIndexes].filter(Number.isInteger).sort((a, b) => a - b);
    if (unique.length <= 1) continue;

    const key = String(displayIndex);
    const hadRoute = Object.prototype.hasOwnProperty.call(mapped, key);
    const removedSourceIndex = hadRoute ? mapped[key] : null;
    delete mapped[key];
    delete methods[key];

    conflicts.push({
      displayIndex: key,
      candidateSourceIndexes: unique,
      removedSourceIndex,
      routeRemoved: hadRoute,
    });
  }

  return conflicts;
}

function writeJson(file, value) {
  ensure(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function main() {
  ensure(REPORT_DIR);
  const { tokenizeDisplayText } = require(
    path.join(ROOT, "scripts", "canonical", "utils", "tokenize.js"),
  );
  const manifest = readJson(MANIFEST_FILE);
  const lxxManifest = manifest?.corpora?.lxx;
  if (!lxxManifest) fail("Generic runtime manifest has no LXX corpus.");

  const displayRecords = collectVerseRecords(readJson(DISPLAY_FILE))
    .map(normalizeReaderRecord)
    .filter((record) => record.tokenAvailabilityKey != null);

  const canonicalIndex = canonicalFileIndex();
  const cache = new Map();
  function loadBundle(outputFile) {
    if (cache.has(outputFile)) return cache.get(outputFile);
    const runtimeFile = path.join(RUNTIME_ROOT, "lxx", outputFile);
    if (!existsFile(runtimeFile)) fail(`LXX runtime book missing: ${runtimeFile}`);
    const canonicalFile = canonicalIndex.get(safeBase(outputFile));
    if (!canonicalFile) fail(`LXX canonical book missing for runtime ${outputFile}`);
    const bundle = {
      runtimeFile,
      runtimeBook: readJson(runtimeFile),
      canonicalFile,
      canonicalMap: coordinateMap(readJson(canonicalFile)),
      touched: false,
    };
    cache.set(outputFile, bundle);
    return bundle;
  }

  const routeStates = new Map();
  const stats = {
    displayRecords: displayRecords.length,
    structurallyMatchedDisplayTokens: 0,
    routedDisplayTokens: 0,
    unmatchedDisplayTokens: 0,
    booksTouched: 0,
    genesis1Routes: 0,
    methods: {},
    sharedRuntimeVerseKeys: 0,
    collisionSuppressedRoutes: 0,
    collisionConflicts: [],
  };

  for (const record of displayRecords) {
    const aliases = [
      record.book,
      record.book === "Song of Songs" ? "Song of Solomon" : "",
      record.book === "Song of Songs" ? "Song" : "",
      record.book === "Song of Songs" ? "Canticles" : "",
    ].map(normalizeAlias).filter(Boolean);
    const outputFile = aliases
      .map((alias) => lxxManifest.aliases?.[alias])
      .find(Boolean);
    if (!outputFile) continue;

    const bundle = loadBundle(outputFile);
    const runtimeVerseKey = `${record.chapter}:${Number(record.tokenAvailabilityKey)}`;
    const canonicalHit = bundle.canonicalMap.get(runtimeVerseKey);
    const compactVerse = bundle.runtimeBook?.verses?.[runtimeVerseKey];
    if (!canonicalHit || !compactVerse) continue;

    const canonicalTokens = Array.isArray(canonicalHit.verse?.translations?.brenton?.tokens)
      ? canonicalHit.verse.translations.brenton.tokens
      : [];
    const displayTokens = tokenizeDisplayText(record.text);
    const groups = alignTokens(displayTokens, canonicalTokens);
    const sourceIndexById = runtimeSourceIndexById(compactVerse);
    const mapped = {};
    const methods = {};

    for (const group of groups) {
      if (!String(group.kind).startsWith("unmatched")) {
        stats.structurallyMatchedDisplayTokens += group.displayLength;
      } else {
        stats.unmatchedDisplayTokens += group.displayLength;
      }
      mapGroup(group, canonicalTokens, sourceIndexById, mapped, methods);
    }

    const routeStateKey = `${outputFile}|${runtimeVerseKey}`;
    let routeState = routeStates.get(routeStateKey);
    if (!routeState) {
      routeState = {
        outputFile,
        runtimeVerseKey,
        compactVerse,
        recordCount: 0,
        candidatesByIndex: new Map(),
      };
      routeStates.set(routeStateKey, routeState);
    }
    routeState.recordCount += 1;
    for (const [displayIndex, sourceIndex] of Object.entries(mapped)) {
      if (!Number.isInteger(sourceIndex)) continue;
      let candidates = routeState.candidatesByIndex.get(String(displayIndex));
      if (!candidates) {
        candidates = new Set();
        routeState.candidatesByIndex.set(String(displayIndex), candidates);
      }
      candidates.add(sourceIndex);
    }

    // Preserve V8's last-record structural map as the starting point, then
    // suppress only positions for which multiple visible Brenton records
    // sharing the same numeric runtime verse prove competing source routes.
    compactVerse.a = compactVerse.a || {};
    compactVerse.a.brenton = mapped;
    compactVerse.m = compactVerse.m || {};
    compactVerse.m.brenton = methods;
    bundle.touched = true;
    stats.routedDisplayTokens += Object.keys(mapped).length;

    for (const method of Object.values(methods)) {
      stats.methods[method] = (stats.methods[method] || 0) + 1;
    }

    if (record.book === "Genesis" && record.chapter === 1) {
      stats.genesis1Routes += Object.keys(mapped).length;
    }
  }

  for (const routeState of routeStates.values()) {
    if (routeState.recordCount > 1) stats.sharedRuntimeVerseKeys += 1;
    const conflicts = applyCollisionSafeSuppression(
      routeState.compactVerse,
      routeState.candidatesByIndex,
    );
    for (const conflict of conflicts) {
      if (conflict.routeRemoved) stats.collisionSuppressedRoutes += 1;
      stats.collisionConflicts.push({
        outputFile: routeState.outputFile,
        runtimeVerseKey: routeState.runtimeVerseKey,
        displayIndex: conflict.displayIndex,
        candidateSourceIndexes: conflict.candidateSourceIndexes,
        candidateSourceIds: conflict.candidateSourceIndexes.map(
          (index) => String(routeState.compactVerse?.s?.[index]?.[0] || ""),
        ),
        removedSourceIndex: conflict.removedSourceIndex,
        removedSourceId:
          conflict.removedSourceIndex == null
            ? null
            : String(routeState.compactVerse?.s?.[conflict.removedSourceIndex]?.[0] || ""),
        routeRemoved: conflict.routeRemoved,
      });
    }
  }

  for (const [outputFile, bundle] of cache) {
    if (!bundle.touched) continue;
    stats.booksTouched += 1;
    const serialized = `${JSON.stringify(bundle.runtimeBook)}\n`;
    fs.writeFileSync(bundle.runtimeFile, serialized, "utf8");

    if (lxxManifest.books?.[outputFile] && typeof lxxManifest.books[outputFile] === "object") {
      lxxManifest.books[outputFile].bytes = Buffer.byteLength(serialized);
      lxxManifest.books[outputFile].sha256 = sha256(serialized);
      lxxManifest.books[outputFile].verses = Object.keys(bundle.runtimeBook.verses || {}).length;
    }
  }

  manifest.p0812 = {
    brentonActualDisplayReconciled: true,
    method: "exact-structural-display-to-canonical-with-shared-key-collision-suppression",
    sharedKeyCollisionSuppression: true,
    semanticGuessing: false,
    stopWordListUsed: false,
    generatedAt: new Date().toISOString(),
  };
  writeJson(MANIFEST_FILE, manifest);
  writeJson(path.join(REPORT_DIR, "brenton-runtime-reconciliation.json"), stats);

  if (stats.genesis1Routes < 226) {
    fail(`Brenton Genesis 1 route count regressed below 226: ${stats.genesis1Routes}.`);
  }

  console.log("");
  console.log("P08.12 Brenton runtime structural reconciliation complete.");
  console.log(`Visible owned records: ${stats.displayRecords}`);
  console.log(`Structurally matched display tokens: ${stats.structurallyMatchedDisplayTokens}`);
  console.log(`Routed display tokens: ${stats.routedDisplayTokens}`);
  console.log(`Genesis 1 routes: ${stats.genesis1Routes}`);
  console.log(`Shared runtime verse keys: ${stats.sharedRuntimeVerseKeys}`);
  console.log(`Collision-suppressed routes: ${stats.collisionSuppressedRoutes}`);
  console.log("Semantic guessing: NO");
  console.log("");
}
if (require.main === module) main();
module.exports = { applyCollisionSafeSuppression };
