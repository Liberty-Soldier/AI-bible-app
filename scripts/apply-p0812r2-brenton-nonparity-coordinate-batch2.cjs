"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PLAN = "app/data/bibleiq/runtime-locks/p0812r2-brenton-nonparity-coordinate-batch2/manifest.json";
const RUNTIME = "public/data/bibleiq/word-study";
const OVERLAY = "public/data/bibleiq/word-study-brenton-reader-record/manifest.json";
const READER = "app/data/scripture/generatedBrenton.json";
const READER_INTEGRITY = "app/data/scripture/generatedBrenton.integrity.json";
const TOKENIZER = "scripts/canonical/utils/tokenize.js";

const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const parse = bytes => JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
const routable = v => /^word:lxx:L\d+$/.test(String(v || ""));
function fail(message) { throw new Error(`[Brenton non-parity coordinate batch 2] ${message}`); }
function checksum(document) {
  const { checksum: ignored, ...body } = document;
  return sha(Buffer.from(JSON.stringify(body)));
}
function routeOf(verse, index) {
  const raw = verse?.a?.brenton?.[String(index)];
  if (raw === undefined) return null;
  const sourceIndex = Number(raw);
  const row = verse?.s?.[sourceIndex];
  return {
    sourceIndex,
    sourceId: String(row?.[0] || ""),
    entityId: String(row?.[4] || ""),
    valid: Boolean(row && routable(row[4])),
  };
}
function comparable(route) {
  if (route == null) return null;
  return {
    sourceIndex: Number(route.sourceIndex),
    sourceId: String(route.sourceId || ""),
    entityId: String(route.entityId || ""),
  };
}
function sameRoute(a, b) {
  a = comparable(a); b = comparable(b);
  return JSON.stringify(a) === JSON.stringify(b);
}
function alignedCount(book) {
  let count = 0;
  for (const verse of Object.values(book.verses || {})) {
    for (const translation of new Set([
      ...Object.keys(verse.a || {}),
      ...Object.keys(verse.v || {}),
    ])) {
      count += new Set([
        ...Object.keys(verse.a?.[translation] || {}),
        ...Object.keys(verse.v?.[translation] || {}),
      ]).size;
    }
  }
  return count;
}
function verifyState(verse, state) {
  for (const [key, expected] of Object.entries(state)) {
    if (!sameRoute(routeOf(verse, Number(key)), expected)) return false;
  }
  return true;
}

function prepareBatch2(root = process.cwd()) {
  const read = relative => fs.readFileSync(path.join(root, relative));
  const plan = parse(read(PLAN));
  if (
    plan.batchId !== "p0812r2-brenton-nonparity-coordinate-batch2" ||
    plan.correctness.components !== 484 ||
    plan.correctness.setActions !== 490 ||
    plan.correctness.removeActions !== 484 ||
    plan.transactions.length !== 484 ||
    checksum(plan) !== plan.checksum
  ) fail("Sealed plan changed.");

  if (sha(read(READER)) !== plan.lockedInputs.generatedBrentonSha256) fail("Locked Brenton reader changed.");
  if (sha(read(READER_INTEGRITY)) !== plan.lockedInputs.generatedBrentonIntegritySha256) fail("Locked Brenton integrity changed.");
  if (sha(read(OVERLAY)) !== plan.lockedInputs.overlaySha256) fail("Reader-record overlay changed.");
  if (sha(read("app/data/bibleiq/runtime-locks/p0812r2-brenton-compact-batch1/manifest.json")) !== plan.lockedInputs.batch1ManifestSha256) fail("Batch 1 manifest changed.");
  if (sha(read("scripts/apply-p0812r2-brenton-compact-batch1.cjs")) !== plan.lockedInputs.batch1ApplySha256) fail("Batch 1 replay script changed.");

  for (const [file, expected] of Object.entries(plan.lockedInputs.canonicalAffectedBookSha256 || {})) {
    if (sha(read(`app/data/bibleiq/canonical/lxx/${file}`)) !== expected) {
      fail(`Locked canonical LXX changed: ${file}`);
    }
  }

  const reader = parse(read(READER));
  const readers = new Map((reader.verses || []).map(r => [String(r.id), r]));
  const { tokenizeDisplayText } = require(path.join(root, TOKENIZER));

  const original = new Map();
  function load(relative) {
    const bytes = read(relative);
    original.set(relative, bytes);
    return parse(bytes);
  }

  const manifest = load(`${RUNTIME}/manifest.json`);
  const books = new Map();
  for (const file of plan.affectedRuntimeFiles) {
    books.set(file, load(`${RUNTIME}/lxx/${file}`));
  }

  // Every component must be wholly PRE or wholly POST. Mixed/unknown states fail closed.
  const componentStates = [];
  for (const tx of plan.transactions) {
    const book = books.get(tx.runtimeFile);
    const verse = book?.verses?.[tx.runtimeVerseKey];
    if (!verse) fail(`Runtime verse missing: ${tx.runtimeFile} ${tx.runtimeVerseKey}`);

    const pre = verifyState(verse, tx.pre);
    const post = verifyState(verse, tx.post);
    if (!pre && !post) fail(`Transaction is in an unknown/mixed state: ${tx.reference}`);
    componentStates.push(post ? "POST" : "PRE");

    const record = readers.get(tx.readerRecordId);
    if (!record) fail(`Reader record missing: ${tx.readerRecordId}`);
    const tokens = tokenizeDisplayText(String(record.text ?? record.display?.text ?? record.content ?? record.verseText ?? ""));

    for (const action of tx.actions) {
      const key = String(action.displayIndex);
      if (action.action === "SET") {
        const expectedText = tx.setDisplayText[key];
        if (String(tokens[action.displayIndex]?.text ?? "") !== expectedText) {
          fail(`Reader display token changed: ${tx.reference} index ${action.displayIndex}`);
        }
        if (verse.v?.brenton?.[key] !== undefined) {
          fail(`SET target has an existing Brenton span route: ${tx.reference} index ${action.displayIndex}`);
        }
        const row = verse.s?.[Number(action.to.sourceIndex)];
        if (
          !row ||
          String(row[0] || "") !== action.to.sourceId ||
          String(row[4] || "") !== action.to.entityId ||
          !routable(row[4])
        ) fail(`SET source identity changed: ${tx.reference} index ${action.displayIndex}`);
      } else if (action.action === "REMOVE") {
        if (verse.v?.brenton?.[key] !== undefined) {
          fail(`REMOVE origin also has a Brenton span route: ${tx.reference} index ${action.displayIndex}`);
        }
      } else {
        fail(`Unexpected action type: ${action.action}`);
      }
    }
  }

  // All state/source checks complete before changing the in-memory maps.
  for (let i = 0; i < plan.transactions.length; i++) {
    if (componentStates[i] === "POST") continue;
    const tx = plan.transactions[i];
    const verse = books.get(tx.runtimeFile).verses[tx.runtimeVerseKey];
    verse.a ||= {};
    verse.a.brenton ||= {};
    verse.m ||= {};
    verse.m.brenton ||= {};

    // Removes first, then final SETs.
    for (const action of tx.actions) {
      if (action.action === "REMOVE") {
        delete verse.a.brenton[String(action.displayIndex)];
        delete verse.m.brenton[String(action.displayIndex)];
      }
    }
    for (const action of tx.actions) {
      if (action.action === "SET") {
        verse.a.brenton[String(action.displayIndex)] = Number(action.to.sourceIndex);
        verse.m.brenton[String(action.displayIndex)] = "p0812r2-nonparity-coordinate-batch2";
      }
    }
  }

  // Final state must exactly equal the sealed post-state and each expected source
  // must have one numeric Brenton owner in that runtime verse.
  for (const tx of plan.transactions) {
    const verse = books.get(tx.runtimeFile).verses[tx.runtimeVerseKey];
    if (!verifyState(verse, tx.post)) fail(`Final transaction state is not exact: ${tx.reference}`);

    for (const source of tx.sources) {
      const owners = [];
      for (const [displayIndex, sourceIndex] of Object.entries(verse.a?.brenton || {})) {
        const row = verse.s?.[Number(sourceIndex)];
        if (row && String(row[0] || "") === source.sourceId) owners.push(Number(displayIndex));
      }
      if (owners.length !== 1) {
        fail(`Final source ownership is not unique: ${tx.reference} ${source.sourceId} owners=${owners.join(",")}`);
      }
    }
  }

  const proposed = new Map();
  for (const [file, book] of books) {
    const relative = `${RUNTIME}/lxx/${file}`;
    const bytes = Buffer.from(JSON.stringify(book) + "\n");
    proposed.set(relative, bytes);

    const stats = manifest.corpora?.lxx?.books?.[file];
    if (!stats) fail(`Runtime manifest book missing: ${file}`);
    stats.bytes = bytes.length;
    stats.checksum = sha(bytes);
    if (Object.hasOwn(stats, "sha256")) stats.sha256 = sha(bytes);
    stats.alignedDisplayTokens = alignedCount(book);
  }

  for (const field of ["verses", "sourceTokens", "alignedDisplayTokens", "bytes"]) {
    manifest.totals[field] = Object.values(manifest.corpora || {})
      .flatMap(c => Object.values(c.books || {}))
      .reduce((n, b) => n + Number(b[field] || 0), 0);
  }
  manifest.checksum = checksum(manifest);
  proposed.set(`${RUNTIME}/manifest.json`, Buffer.from(JSON.stringify(manifest) + "\n"));

  const changes = [...proposed].filter(([relative, bytes]) => !original.get(relative)?.equals(bytes));
  return { plan, original, proposed, changes, componentStates };
}

function applyBatch2(root = process.cwd(), { verifyOnly = false } = {}) {
  const prepared = prepareBatch2(root);

  if (verifyOnly && prepared.changes.length) {
    fail(`Batch 2 is not fully applied: ${prepared.changes.length} files differ.`);
  }

  if (!verifyOnly) {
    const written = [];
    try {
      for (const [relative, bytes] of prepared.changes) {
        written.push(relative);
        fs.writeFileSync(path.join(root, relative), bytes);
      }
    } catch (error) {
      for (const relative of written.reverse()) {
        const original = prepared.original.get(relative);
        if (original) fs.writeFileSync(path.join(root, relative), original);
      }
      throw error;
    }
  }

  return {
    approvedComponents: prepared.plan.correctness.components,
    setActions: prepared.plan.correctness.setActions,
    removeActions: prepared.plan.correctness.removeActions,
    componentsAlreadyPost: prepared.componentStates.filter(x => x === "POST").length,
    componentsAppliedFromPre: prepared.componentStates.filter(x => x === "PRE").length,
    changedFiles: prepared.changes.length,
    verifyOnly,
  };
}

if (require.main === module) {
  console.log(JSON.stringify(
    applyBatch2(process.cwd(), { verifyOnly: process.argv.includes("--verify") }),
    null, 2
  ));
}

module.exports = { prepareBatch2, applyBatch2 };
