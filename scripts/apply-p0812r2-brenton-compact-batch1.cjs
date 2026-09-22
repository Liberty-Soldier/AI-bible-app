"use strict";

// Replay only the sealed, independently checked Brenton batch. Never rebuild text.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const PLAN = "app/data/bibleiq/runtime-locks/p0812r2-brenton-compact-batch1/manifest.json";
const PLAN_SHA = "e4036b82b6adf45c6e16fb83d1c20a2938923dd525dc01fd0598bd8876729b58";
const RUNTIME = "public/data/bibleiq/word-study";
const OVERLAY = "public/data/bibleiq/word-study-brenton-reader-record/manifest.json";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const parse = bytes => JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
const normalize = value => String(value ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").toLowerCase().trim().replace(/\s+/g, " ");
function fail(message) { throw new Error(`[Brenton compact batch 1] ${message}`); }
function checksum(document) { const { checksum: ignored, ...body } = document; return sha(JSON.stringify(body)); }
function alignedCount(book) {
  let count = 0;
  for (const verse of Object.values(book.verses || {})) {
    for (const translation of new Set([...Object.keys(verse.a || {}), ...Object.keys(verse.v || {})])) {
      count += new Set([...Object.keys(verse.a?.[translation] || {}), ...Object.keys(verse.v?.[translation] || {})]).size;
    }
  }
  return count;
}

function prepareBrentonCompactBatch1(root = process.cwd()) {
  const read = relative => fs.readFileSync(path.join(root, relative));
  const plan = parse(read(PLAN));
  if (plan.checksum !== PLAN_SHA || checksum(plan) !== PLAN_SHA || plan.count !== 37 || plan.candidates.length !== 37) fail("Approved plan changed.");
  for (const [relative, expected] of Object.entries(plan.inputHashes)) {
    if (sha(read(relative)) !== expected) fail(`Locked input changed: ${relative}`);
  }
  const original = new Map();
  function load(relative) {
    const bytes = read(relative);
    original.set(relative, bytes);
    return parse(bytes);
  }
  const manifest = load(`${RUNTIME}/manifest.json`);
  const overlay = load(OVERLAY);
  if (checksum(overlay) !== overlay.checksum || Object.keys(overlay.records || {}).length !== 2017) fail("Overlay seal is invalid.");
  const routeCount = Object.values(overlay.records).reduce((n, r) => n + Object.keys(r.routes || {}).length, 0);
  if (routeCount !== overlay.counts.routes || ![9913, 9915].includes(routeCount)) fail("Unexpected overlay route population.");
  const reader = parse(read("app/data/scripture/generatedBrenton.json"));
  const readers = new Map(reader.verses.map(r => [r.id, r]));
  const { tokenizeDisplayText } = require(path.join(root, "scripts/canonical/utils/tokenize.js"));
  const books = new Map(), canonical = new Map(), candidates = new Set();
  for (const candidate of plan.candidates) {
    const key = `${candidate.readerRecordId}|${candidate.displayIndex}`;
    if (candidates.has(key)) fail(`Duplicate target: ${key}`);
    candidates.add(key);
    if (!/^[A-Za-z0-9]+\.json$/.test(candidate.runtimeFile)) fail("Invalid runtime file.");
    if (!books.has(candidate.runtimeFile)) {
      books.set(candidate.runtimeFile, load(`${RUNTIME}/lxx/${candidate.runtimeFile}`));
      canonical.set(candidate.runtimeFile, parse(read(`app/data/bibleiq/canonical/lxx/${candidate.runtimeFile}`)));
    }
    const book = books.get(candidate.runtimeFile), verse = book.verses?.[candidate.runtimeVerseKey];
    const row = verse?.s?.[candidate.sourceIndex];
    if (!row || row[0] !== candidate.occurrenceId || row[4] !== candidate.entityId) fail(`Source identity changed: ${key}`);
    const document = canonical.get(candidate.runtimeFile);
    const sourceVerses = Object.values(document.verses || document).filter(v => v.sourceTokens?.some(s => s.id === candidate.occurrenceId));
    if (sourceVerses.length !== 1) fail(`Canonical occurrence is not unique: ${key}`);
    const sourceVerse = sourceVerses[0], source = sourceVerse.sourceTokens.find(s => s.id === candidate.occurrenceId);
    if (source.entityId !== candidate.entityId || !String(source.gloss || "").split(/[;,/|]/).some(g => normalize(g) === normalize(candidate.displayText))) fail(`Exact source evidence changed: ${key}`);
    if ((sourceVerse.translations?.brenton?.tokens || []).some(t => t.alignedSourceTokenIds?.includes(candidate.occurrenceId))) fail(`Canonical occurrence already has an English owner: ${key}`);
    const record = readers.get(candidate.readerRecordId);
    const tokens = tokenizeDisplayText(record?.text ?? record?.display?.text ?? "");
    if (String(tokens[candidate.displayIndex]?.text ?? "") !== candidate.displayText) fail(`Reader token changed: ${key}`);
    if (!Number.isInteger(candidate.displayIndex) || !Number.isInteger(candidate.sourceIndex)) fail(`Invalid index: ${key}`);
    const isOverlay = candidate.topologyMode === "OVERLAY";
    const overlayRecord = overlay.records[candidate.readerRecordId];
    if (isOverlay) {
      if (!overlayRecord || overlayRecord.runtimeFile !== candidate.runtimeFile || overlayRecord.runtimeVerseKey !== candidate.runtimeVerseKey) fail(`Overlay topology changed: ${key}`);
    } else if (candidate.topologyMode !== "NUMERIC_FALLBACK" || overlayRecord) fail(`Numeric topology changed: ${key}`);
    for (const boundary of Object.values(candidate.boundaries)) {
      const index = isOverlay ? overlayRecord.routes[boundary.displayIndex]?.[0] : verse.a?.brenton?.[boundary.displayIndex];
      if (index !== boundary.sourceIndex || verse.s[index]?.[0] !== boundary.sourceOccurrenceId) fail(`Proved span boundary changed: ${key}`);
    }
    if (!(candidate.boundaries.left.sourceIndex < candidate.sourceIndex && candidate.sourceIndex < candidate.boundaries.right.sourceIndex)) fail(`Candidate is outside its source span: ${key}`);
    for (const token of candidate.englishSpan.tokens) {
      if (String(tokens[token.index]?.text ?? "") !== token.text) fail(`Span text changed: ${key}`);
    }
    const matchingSources = candidate.sourceSegment.occurrences.filter(s => String(s.gloss || "").split(/[;,/|]/).some(g => normalize(g) === normalize(candidate.displayText)));
    if (matchingSources.length !== 1 || matchingSources[0].occurrenceId !== candidate.occurrenceId) fail(`Competing exact source evidence: ${key}`);
    for (const [index, sourceIndex] of Object.entries(verse.a?.brenton || {})) {
      if (sourceIndex === candidate.sourceIndex && (isOverlay || Number(index) !== candidate.displayIndex)) fail(`Numeric source owner conflict: ${key}`);
    }
    for (const [id, ownerRecord] of Object.entries(overlay.records)) {
      if (ownerRecord.runtimeFile !== candidate.runtimeFile || ownerRecord.runtimeVerseKey !== candidate.runtimeVerseKey) continue;
      for (const [index, route] of Object.entries(ownerRecord.routes || {})) {
        if (route[1] === candidate.occurrenceId && (!isOverlay || id !== candidate.readerRecordId || Number(index) !== candidate.displayIndex)) fail(`Record-specific source owner conflict: ${key}`);
      }
    }
    const target = isOverlay ? overlayRecord.routes[candidate.displayIndex] : verse.a?.brenton?.[candidate.displayIndex];
    const expected = isOverlay ? [candidate.sourceIndex, candidate.occurrenceId, candidate.entityId] : candidate.sourceIndex;
    if (target !== undefined && JSON.stringify(target) !== JSON.stringify(expected)) fail(`Target route conflicts: ${key}`);
    if (!isOverlay && verse.v?.brenton?.[candidate.displayIndex] !== undefined) fail(`Existing span route: ${key}`);
  }
  // All checks complete before changing even the in-memory maps.
  for (const c of plan.candidates) {
    if (c.topologyMode === "OVERLAY") overlay.records[c.readerRecordId].routes[c.displayIndex] = [c.sourceIndex, c.occurrenceId, c.entityId];
    else {
      const verse = books.get(c.runtimeFile).verses[c.runtimeVerseKey];
      verse.a ||= {}; verse.a.brenton ||= {}; verse.a.brenton[c.displayIndex] = c.sourceIndex;
    }
  }
  overlay.counts.routes = Object.values(overlay.records).reduce((n, r) => n + Object.keys(r.routes).length, 0);
  if (overlay.counts.routes !== 9915) fail("Final overlay count is incorrect.");
  overlay.checksum = checksum(overlay);
  const proposed = new Map([[OVERLAY, Buffer.from(JSON.stringify(overlay) + "\n")]]);
  for (const [file, book] of books) {
    if (!plan.candidates.some(c => c.runtimeFile === file && c.topologyMode === "NUMERIC_FALLBACK")) continue;
    const bytes = Buffer.from(JSON.stringify(book) + "\n");
    proposed.set(`${RUNTIME}/lxx/${file}`, bytes);
    const stats = manifest.corpora.lxx.books[file];
    if (!stats) fail(`Manifest book is missing: ${file}`);
    stats.bytes = bytes.length; stats.checksum = sha(bytes);
    if (Object.hasOwn(stats, "sha256")) stats.sha256 = sha(bytes);
    stats.alignedDisplayTokens = alignedCount(book);
  }
  for (const field of ["verses", "sourceTokens", "alignedDisplayTokens", "bytes"]) {
    manifest.totals[field] = Object.values(manifest.corpora).flatMap(c => Object.values(c.books)).reduce((n, b) => n + b[field], 0);
  }
  manifest.checksum = checksum(manifest);
  proposed.set(`${RUNTIME}/manifest.json`, Buffer.from(JSON.stringify(manifest) + "\n"));
  const changes = [...proposed].filter(([relative, bytes]) => !bytes.equals(original.get(relative)));
  return { plan, changes, original };
}

function applyBrentonCompactBatch1(root = process.cwd(), { verifyOnly = false } = {}) {
  const prepared = prepareBrentonCompactBatch1(root);
  if (verifyOnly && prepared.changes.length) fail(`Batch is not applied: ${prepared.changes.length} files differ.`);
  if (!verifyOnly) {
    const written = [];
    try {
      for (const [relative, bytes] of prepared.changes) {
        written.push(relative);
        fs.writeFileSync(path.join(root, relative), bytes);
      }
    } catch (error) {
      for (const relative of written.reverse()) fs.writeFileSync(path.join(root, relative), prepared.original.get(relative));
      throw error;
    }
  }
  return { approvedRoutes: 37, numericRoutes: 35, recordSpecificRoutes: 2, changedFiles: prepared.changes.length, verifyOnly };
}
if (require.main === module) console.log(JSON.stringify(applyBrentonCompactBatch1(process.cwd(), { verifyOnly: process.argv.includes("--verify") })));
module.exports = { prepareBrentonCompactBatch1, applyBrentonCompactBatch1 };
