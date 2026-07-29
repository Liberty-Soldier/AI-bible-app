#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");

const EXPECTED = Object.freeze({
  milestone: "P05.12AN",
  ajMilestone: "P05.12AJ",
  amMilestone: "P05.12AM",
  visibleCoordinates: 31102,
  supportedCoordinates: 31085,
  failClosedCoordinates: 17,
  sourceTokens: 438452,
  sourceRouteEdges: 31091,
  visibleTokens: 789642,
  alignedVisibleTokens: 339549,
  routableVisibleTokens: 339548,
  nonTappableVisibleTokens: 450094,
  sourceTokensWithEntityId: 438341,
  sourceTokensWithoutEntityId: 111,
  suppressedAlignedRoutesMissingEntity: 1,
  runtimeChapterFiles: 1189,
  productionToKjv2006TextChanges: 3865,
  sourceOwnedBooks: 66,
  hebrewBooks: 39,
  greekNtBooks: 27,
  splitterSha256: "28f774632249bd3051c09ff9f7e20c0005f004de31e609794dfb4cdd1e335b79",
  readerAdapterSha256: "5d471e12279847cfd690f3cfbea5dda07ad241e794c683ee9dd787de9aa2cc6b",
  canonicalStoreSha256: "6ade11207b346e78c578c1733d1debb3cd4425f9b77c1408baba577a70dcc431",
  readerPageSha256: "70f2f07967c06feb0988b725ba283e2ec1901eb64ef13e982315bba2a0f74106",
  verseConsumerSha256: "f0fbc23c70b1d6afeb045b581583b9ab64ae59ff8bebe77dd89aee00914837a4",
  protectedPaths: [
    "app/data/scripture/generatedKJV.json",
    "app/data/scripture/generatedKJV.ts",
    "app/data/scripture/generatedKJV.integrity.json",
    "app/data/scripture/generatedWEB.json",
    "app/data/scripture/generatedWEB.ts",
    "app/data/scripture/generatedWEB.integrity.json",
    "app/data/scripture/generatedBrenton.json",
    "app/data/scripture/generatedBrenton.ts",
    "app/data/scripture/generatedBrenton.integrity.json",
    ".private/scripture/canonical",
    "app/data/bibleiq/canonical",
    ".private/alignment",
    "public/scripture/runtime/kjv",
    "public/scripture/runtime/web",
    "public/scripture/runtime/brenton",
    "public/data/bibleiq/word-study",
    "app/data/scripture/CanonicalVerseStore.ts",
    "app/data/scripture/ReaderVerseAdapter.ts",
    "scripts/split-scripture-runtime.js",
  ],
});

const NT_BOOKS = new Set([
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans",
  "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
  "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
  "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
]);

function fail(message) { throw new Error(`[P05.12AN] ${message}`); }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); }
function writeJson(file, value, space = 2) { ensureDir(path.dirname(file)); fs.writeFileSync(file, `${JSON.stringify(value, null, space)}\n`, "utf8"); }
function sha256Buffer(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function sha256File(file) { return sha256Buffer(fs.readFileSync(file)); }
function normalizeSlashes(value) { return String(value || "").replace(/\\/g, "/"); }
function relativeFromRoot(root, target) { return normalizeSlashes(path.relative(root, target)); }
function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    result[key] = next && !next.startsWith("--") ? (i += 1, next) : true;
  }
  return result;
}
function gitInfo(repoRoot) {
  function run(args) { return childProcess.execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim(); }
  return { branch: run(["branch", "--show-current"]), commit: run(["rev-parse", "HEAD"]) };
}
function listFilesRecursive(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out.sort((a, b) => normalizeSlashes(a).localeCompare(normalizeSlashes(b)));
}
function treeFingerprint(root) {
  if (!fs.existsSync(root)) return { exists: false };
  const stat = fs.statSync(root);
  if (stat.isFile()) return { exists: true, type: "file", bytes: stat.size, sha256: sha256File(root) };
  const files = listFilesRecursive(root);
  const entries = files.map((file) => ({
    path: relativeFromRoot(root, file),
    bytes: fs.statSync(file).size,
    sha256: sha256File(file),
  }));
  const sha256 = sha256Buffer(Buffer.from(entries.map((e) => `${e.path}\0${e.bytes}\0${e.sha256}\n`).join(""), "utf8"));
  return { exists: true, type: "directory", files: entries.length, sha256 };
}
function snapshotProtected(repoRoot) {
  return {
    items: EXPECTED.protectedPaths.map((rel) => ({ path: rel, ...treeFingerprint(path.join(repoRoot, ...rel.split("/"))) })),
  };
}
function compareProtected(a, b) {
  const left = new Map((a.items || []).map((x) => [x.path, x]));
  const right = new Map((b.items || []).map((x) => [x.path, x]));
  const paths = [...new Set([...left.keys(), ...right.keys()])].sort();
  const changes = [];
  for (const p of paths) {
    if (JSON.stringify(left.get(p)) !== JSON.stringify(right.get(p))) changes.push({ path: p, before: left.get(p), after: right.get(p) });
  }
  return { identical: changes.length === 0, changes };
}
function parseChecksumManifest(file) {
  const lines = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  return lines.map((line) => {
    const match = /^([0-9a-fA-F]{64})\s{2}(.+)$/.exec(line);
    if (!match) fail(`Malformed checksum line in ${file}: ${line}`);
    return { sha256: match[1].toLowerCase(), path: normalizeSlashes(match[2]) };
  });
}
function verifyReportManifest(reportDir) {
  const manifestFile = path.join(reportDir, "checksums.sha256");
  if (!fs.existsSync(manifestFile)) return { passed: false, entries: 0, errors: [{ reason: "missing-manifest" }], unexpected: [] };
  const entries = parseChecksumManifest(manifestFile);
  const errors = [];
  const listed = new Set();
  for (const entry of entries) {
    listed.add(entry.path);
    const file = path.join(reportDir, ...entry.path.split("/"));
    if (!fs.existsSync(file)) { errors.push({ path: entry.path, reason: "missing" }); continue; }
    const got = sha256File(file);
    if (got !== entry.sha256) errors.push({ path: entry.path, reason: "sha256", expected: entry.sha256, actual: got });
  }
  const unexpected = listFilesRecursive(reportDir)
    .map((f) => relativeFromRoot(reportDir, f))
    .filter((rel) => rel !== "checksums.sha256" && !listed.has(rel));
  return { passed: errors.length === 0 && unexpected.length === 0, entries: entries.length, errors, unexpected };
}
function findLatestReport(repoRoot, summaryName, milestone) {
  const root = path.join(repoRoot, ".private", "reports", "P05.12");
  if (!fs.existsSync(root)) fail(`Missing report root: ${root}`);
  const candidates = listFilesRecursive(root)
    .filter((f) => path.basename(f) === summaryName)
    .map((f) => ({ file: f, dir: path.dirname(f), data: readJson(f) }))
    .filter((x) => x.data?.milestone === milestone)
    .sort((a, b) => b.dir.localeCompare(a.dir));
  if (!candidates.length) fail(`No retained ${milestone} report with ${summaryName}`);
  return candidates[0];
}
function verifyAj(repoRoot) {
  const found = findLatestReport(repoRoot, "p0512aj-summary.json", EXPECTED.ajMilestone);
  const manifest = verifyReportManifest(found.dir);
  const summary = found.data;
  const candidate = path.join(repoRoot, ...normalizeSlashes(summary.retainedCandidate).split("/"));
  const blocksPath = path.join(candidate, "kjv-translation-blocks.json");
  const validationPath = path.join(candidate, "kjv-translation-block-validation.json");
  const buildPath = path.join(candidate, "build-summary.json");
  if (!fs.existsSync(blocksPath) || !fs.existsSync(validationPath) || !fs.existsSync(buildPath)) fail("Retained AJ candidate is incomplete.");
  const validation = readJson(validationPath);
  const build = readJson(buildPath);
  const gates = {
    manifest: manifest.passed,
    retainedAuthorized: summary.authorization?.safeToRetainStagedKjvTranslationBlocks === true,
    notPromotionAuthorized: summary.authorization?.safeToPromoteProductionKjv === false,
    notPromoted: summary.authorization?.productionPromotionPerformed === false,
    allSummaryGates: Object.values(summary.gates || {}).every(Boolean),
    allBuildGates: Object.values(build.gates || {}).every(Boolean),
    zeroValidationErrors: Array.isArray(validation.errors) && validation.errors.length === 0,
    exactCounts:
      build.totals?.blocks === EXPECTED.visibleCoordinates &&
      build.totals?.supportedBlocks === EXPECTED.supportedCoordinates &&
      build.totals?.readerOnlyFailClosedBlocks === EXPECTED.failClosedCoordinates &&
      build.totals?.routedSourceTokens === EXPECTED.sourceTokens &&
      build.totals?.sourceRouteEdges === EXPECTED.sourceRouteEdges &&
      build.totals?.visibleTokens === EXPECTED.visibleTokens &&
      build.totals?.alignedVisibleTokens === EXPECTED.alignedVisibleTokens,
  };
  return { passed: Object.values(gates).every(Boolean), reportDir: found.dir, summary, manifest, validation, build, blocksPath, gates };
}
function verifyAmDiagnostic(repoRoot) {
  const found = findLatestReport(repoRoot, "p0512am-summary.json", EXPECTED.amMilestone);
  const manifest = verifyReportManifest(found.dir);
  const summary = found.data;
  const candidate = path.join(found.dir, "candidate-a");
  const build = readJson(path.join(candidate, "build-summary.json"));
  const parity = readJson(path.join(candidate, "generated-kjv-vs-aj-parity.json"));
  const runtime = readJson(path.join(candidate, "public-runtime-inventory.json"));
  const flow = readJson(path.join(candidate, "dynamic-reader-flow.json"));
  const parseSchemaRecognized =
    runtime.parseErrors?.length === EXPECTED.visibleCoordinates &&
    runtime.parseErrors.slice(0, 50).every((x) => typeof x?.sample?.sources?.[0]?.text === "string");
  const gates = {
    manifest: manifest.passed,
    repeatedDeterministic: summary.deterministicBuild?.independentlyRepeated === true && summary.gates?.repeatedBuildArtifactsByteIdentical === true,
    expectedFailClosed: summary.authorization?.safeToCreateIsolatedKjvPublicRuntimeAdapterApplicationPreview === false,
    notPromoted: summary.authorization?.productionPromotionPerformed === false,
    protectedUnchanged: summary.gates?.protectedProductionStateUnchanged === true,
    exactCoordinateInputs: build.counts?.generatedKjvCoordinates === EXPECTED.visibleCoordinates && build.counts?.ajTranslationBlocks === EXPECTED.visibleCoordinates,
    exactRuntimeFileSet: build.counts?.runtimeChapterFiles === EXPECTED.runtimeChapterFiles && build.gates?.publicRuntimeChapterFileSetExact === true,
    exactMigrationDelta: parity.textMismatches?.length === EXPECTED.productionToKjv2006TextChanges && parity.missingGenerated?.length === 0 && parity.missingAj?.length === 0,
    runtimeVerifierBugSignature: build.counts?.runtimeCoordinates === 0 && runtime.parsedCoordinates === 0 && parseSchemaRecognized,
    splitterVerifierBugSignature: flow.evidence?.splitterReferencesGeneratedKjv === true && flow.evidence?.prebuildRunsSplitter === true && flow.evidence?.splitterReferencesRuntimeOutput === false,
  };
  return { passed: Object.values(gates).every(Boolean), reportDir: found.dir, summary, manifest, build, parity, runtime, flow, gates };
}
function coordinate(book, chapter, verseLabel) { return `${String(book).trim().toLowerCase()}:${Number(chapter)}:${String(verseLabel)}`; }
function verseLabelOf(row) { return String(row?.verseLabel ?? row?.display?.verseLabel ?? row?.verse ?? row?.display?.numericVerse ?? ""); }
function bookOf(row) { return String(row?.book ?? row?.display?.book ?? ""); }
function chapterOf(row) { return Number(row?.chapter ?? row?.display?.chapter ?? 0); }
function visibleTextOf(row) {
  if (typeof row?.text === "string") return row.text;
  if (typeof row?.sources?.[0]?.text === "string") return row.sources[0].text;
  return "";
}
function unwrapTranslationDocument(doc) {
  if (Array.isArray(doc)) return { verses: doc, superscriptions: [], structured: false };
  if (doc && typeof doc === "object" && Array.isArray(doc.verses)) return { verses: doc.verses, superscriptions: Array.isArray(doc.superscriptions) ? doc.superscriptions : [], structured: true };
  fail("Translation document must be an array or structured reader object.");
}
function rewrapTranslationDocument(original, verses) {
  if (Array.isArray(original)) return verses;
  return { ...original, verses };
}
function mapRows(doc) {
  const { verses } = unwrapTranslationDocument(doc);
  const map = new Map(), duplicates = [], malformed = [];
  for (const row of verses) {
    const book = bookOf(row), chapter = chapterOf(row), label = verseLabelOf(row);
    if (!book || !chapter || !label) { malformed.push(row); continue; }
    const key = coordinate(book, chapter, label);
    if (map.has(key)) duplicates.push(key);
    map.set(key, row);
  }
  return { rows: verses.length, map, duplicates, malformed };
}
function mapAjBlocks(blocks) {
  const map = new Map(), duplicates = [], malformed = [];
  for (const block of blocks) {
    const key = block?.readerCoordinate;
    if (typeof key !== "string" || typeof block?.translation?.text !== "string") { malformed.push(block); continue; }
    if (map.has(key)) duplicates.push(key);
    map.set(key, block);
  }
  return { blocks: blocks.length, map, duplicates, malformed };
}
function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
function setVisibleText(row, text) {
  const next = deepClone(row);
  let touched = false;
  if (Object.prototype.hasOwnProperty.call(next, "text")) { next.text = text; touched = true; }
  if (Array.isArray(next.sources) && next.sources.length) {
    next.sources = next.sources.map((source, i) => i === 0 ? { ...source, text } : source);
    touched = true;
  }
  if (!touched) next.sources = [{ sourceName: "King James Version", language: "english", text }];
  return next;
}
function canonicalizeWithoutAllowedFields(row) {
  const next = deepClone(row);
  delete next.tokenAvailabilityKey;
  if (Object.prototype.hasOwnProperty.call(next, "text")) next.text = "__TEXT__";
  if (Array.isArray(next.sources) && next.sources.length) next.sources[0].text = "__TEXT__";
  return next;
}
function buildStagedKjv(productionDoc, ajBlocks) {
  const production = mapRows(productionDoc);
  const aj = mapAjBlocks(ajBlocks);
  if (production.map.size !== EXPECTED.visibleCoordinates || aj.map.size !== EXPECTED.visibleCoordinates) fail("KJV/AJ coordinate count mismatch before staging.");
  const stagedRows = [];
  const textChanges = [];
  const metadataChanges = [];
  let supportedKeys = 0, failClosedKeys = 0;
  for (const row of unwrapTranslationDocument(productionDoc).verses) {
    const key = coordinate(bookOf(row), chapterOf(row), verseLabelOf(row));
    const block = aj.map.get(key);
    if (!block) fail(`AJ block missing for ${key}`);
    let next = setVisibleText(row, block.translation.text);
    next.tokenAvailabilityKey = block.failClosed ? null : String(block.verse);
    if (block.failClosed) failClosedKeys += 1; else supportedKeys += 1;
    if (visibleTextOf(row) !== block.translation.text) textChanges.push({ coordinate: key, before: visibleTextOf(row), after: block.translation.text });
    if (JSON.stringify(canonicalizeWithoutAllowedFields(row)) !== JSON.stringify(canonicalizeWithoutAllowedFields(next))) metadataChanges.push(key);
    stagedRows.push(next);
  }
  return { document: rewrapTranslationDocument(productionDoc, stagedRows), textChanges, metadataChanges, supportedKeys, failClosedKeys };
}
function safeBook(book) { return String(book || "").replace(/[^1-3A-Za-z ]/g, "").trim().replace(/\s+/g, "_"); }
function normalizeAlias(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^0-9A-Za-z]+/g, "").toLowerCase(); }
function corpusForBook(book) { return NT_BOOKS.has(book) ? "greek-nt" : "hebrew"; }
function copyFile(source, destination) { ensureDir(path.dirname(destination)); fs.copyFileSync(source, destination); }
function copyDir(source, destination) { ensureDir(destination); for (const file of listFilesRecursive(source)) copyFile(file, path.join(destination, relativeFromRoot(source, file))); }
function removeIfExists(target) { if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true }); }
function runExactSplitter(repoRoot, stagingRoot, logFile, errFile) {
  const splitter = path.join(repoRoot, "scripts", "split-scripture-runtime.js");
  if (sha256File(splitter) !== EXPECTED.splitterSha256) fail("Runtime splitter changed since retained contract; refusing assumed execution.");
  const stagedSplitter = path.join(stagingRoot, "scripts", "split-scripture-runtime.js");
  copyFile(splitter, stagedSplitter);
  const result = childProcess.spawnSync(process.execPath, [stagedSplitter], { cwd: stagingRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  fs.writeFileSync(logFile, result.stdout || "", "utf8");
  fs.writeFileSync(errFile, result.stderr || "", "utf8");
  if (result.status !== 0) fail(`Exact splitter failed with exit ${result.status}`);
}
function inventoryRuntime(root) {
  const files = listFilesRecursive(root).filter((f) => /^\d+\.json$/i.test(path.basename(f)));
  const map = new Map(), duplicates = [], malformed = [], profiles = [];
  for (const file of files) {
    let doc;
    try { doc = readJson(file); } catch (error) { malformed.push({ path: relativeFromRoot(root, file), reason: "json", message: String(error.message || error) }); continue; }
    const { verses } = unwrapTranslationDocument(doc);
    profiles.push({ path: relativeFromRoot(root, file), verses: verses.length, sha256: sha256File(file), bytes: fs.statSync(file).size });
    for (const row of verses) {
      const book = bookOf(row), chapter = chapterOf(row), label = verseLabelOf(row), text = visibleTextOf(row);
      if (!book || !chapter || !label || typeof text !== "string") { malformed.push({ path: relativeFromRoot(root, file), reason: "verse", sample: row }); continue; }
      const key = coordinate(book, chapter, label);
      if (map.has(key)) duplicates.push(key);
      map.set(key, row);
    }
  }
  return { files: files.length, map, duplicates, malformed, profiles, tree: treeFingerprint(root) };
}
function compareTextMaps(left, right) {
  const missingLeft = [], missingRight = [], mismatches = [];
  for (const [key, row] of left.entries()) {
    if (!right.has(key)) missingRight.push(key);
    else if (visibleTextOf(row) !== visibleTextOf(right.get(key))) mismatches.push({ coordinate: key, left: visibleTextOf(row), right: visibleTextOf(right.get(key)) });
  }
  for (const key of right.keys()) if (!left.has(key)) missingLeft.push(key);
  return { coordinatesCompared: Math.min(left.size, right.size), missingLeft, missingRight, mismatches, identical: missingLeft.length === 0 && missingRight.length === 0 && mismatches.length === 0 };
}
function locateWordStudyRuntime(repoRoot) {
  const root = path.join(repoRoot, "public", "data", "bibleiq", "word-study");
  if (!fs.existsSync(path.join(root, "manifest.json"))) fail(`Missing source-token runtime: ${root}`);
  return root;
}
function collectNeededSourceIds(blocks) {
  const ids = [];
  for (const block of blocks) for (const route of block.sourceRoutes || []) for (const id of route.sourceTokenIds || []) ids.push(id);
  return ids;
}
function resolveSourceTokens(runtimeRoot, neededIds) {
  const needed = new Set(neededIds);
  const found = new Map();
  const conflicts = [];
  const scannedFiles = [];
  for (const corpus of ["hebrew", "greek-nt"]) {
    const corpusRoot = path.join(runtimeRoot, corpus);
    if (!fs.existsSync(corpusRoot)) fail(`Missing runtime corpus directory: ${corpusRoot}`);
    for (const file of listFilesRecursive(corpusRoot).filter((f) => f.toLowerCase().endsWith(".json"))) {
      const doc = readJson(file);
      if (!doc || typeof doc !== "object" || !doc.verses) continue;
      let matched = 0;
      for (const verse of Object.values(doc.verses)) {
        for (const token of verse?.s || []) {
          const id = token?.[0];
          if (!needed.has(id)) continue;
          const record = { corpus: doc.corpus || corpus, token };
          if (found.has(id) && JSON.stringify(found.get(id)) !== JSON.stringify(record)) conflicts.push(id);
          else if (!found.has(id)) { found.set(id, record); matched += 1; }
        }
      }
      if (matched) scannedFiles.push({ path: relativeFromRoot(runtimeRoot, file), matched });
    }
  }
  const missing = [...needed].filter((id) => !found.has(id));
  return { found, missing, conflicts: [...new Set(conflicts)], scannedFiles };
}
function buildRouteOverlay(blocks, resolved, outputRoot) {
  removeIfExists(outputRoot); ensureDir(outputRoot);
  const books = new Map();
  const aliases = {};
  const routeMetadata = [];
  const suppressedRoutes = [];
  let overlaySourceTokens = 0, ajAlignedVisibleTokens = 0, routableMappings = 0, nonTappableTokens = 0, supportedZeroRoutable = 0;
  let sourceTokensWithEntityId = 0, sourceTokensWithoutEntityId = 0, suppressedMissingEntityRoutes = 0;
  for (const block of blocks) {
    const book = block.book;
    if (!books.has(book)) books.set(book, { version: 1, corpus: corpusForBook(book), book, verses: {} });
    const bookDoc = books.get(book);
    const sourceIds = [];
    for (const route of block.sourceRoutes || []) for (const id of route.sourceTokenIds || []) sourceIds.push(id);
    const localIndex = new Map();
    const sourceTuples = [];
    for (const id of sourceIds) {
      if (localIndex.has(id)) fail(`Duplicate source token within block ${block.readerCoordinate}: ${id}`);
      const record = resolved.get(id);
      if (!record) fail(`Unresolved source token ${id}`);
      if (record.corpus !== bookDoc.corpus) fail(`Corpus mismatch for ${id}: ${record.corpus} vs ${bookDoc.corpus}`);
      localIndex.set(id, sourceTuples.length);
      sourceTuples.push(record.token);
      const entityId = String(record.token?.[4] || "").trim();
      if (entityId) sourceTokensWithEntityId += 1;
      else sourceTokensWithoutEntityId += 1;
    }
    const alignment = {};
    let blockAjAligned = 0, blockRoutable = 0, blockSuppressed = 0;
    for (const token of block.translation.tokens || []) {
      const ids = token.alignedSourceTokenIds || [];
      if (ids.length > 1) fail(`Multiple source tokens on one visible token at ${block.readerCoordinate}#${token.index}`);
      if (ids.length === 1) {
        ajAlignedVisibleTokens += 1; blockAjAligned += 1;
        if (!token.tappable || token.alignmentStatus !== "aligned") fail(`Aligned token not marked tappable in retained AJ at ${block.readerCoordinate}#${token.index}`);
        if (!localIndex.has(ids[0])) fail(`Aligned source token absent from route list at ${block.readerCoordinate}#${token.index}`);
        const sourceIndex = localIndex.get(ids[0]);
        const entityId = String(sourceTuples[sourceIndex]?.[4] || "").trim();
        if (entityId) {
          alignment[String(token.index)] = sourceIndex;
          routableMappings += 1; blockRoutable += 1;
        } else {
          suppressedMissingEntityRoutes += 1; blockSuppressed += 1; nonTappableTokens += 1;
          suppressedRoutes.push({
            coordinate: block.readerCoordinate,
            tokenIndex: token.index,
            visibleToken: token.text,
            sourceTokenId: ids[0],
            sourceIndex,
            reason: "approved-source-token-has-no-entity-id",
          });
        }
      } else {
        nonTappableTokens += 1;
        if (token.tappable) fail(`Tappable token without source route at ${block.readerCoordinate}#${token.index}`);
      }
    }
    if (!block.failClosed && blockRoutable === 0) supportedZeroRoutable += 1;
    if (block.failClosed && (sourceTuples.length || Object.keys(alignment).length)) fail(`Fail-closed block carries routes: ${block.readerCoordinate}`);
    bookDoc.verses[`${block.chapter}:${block.verse}`] = { s: sourceTuples, a: { kjv: alignment } };
    overlaySourceTokens += sourceTuples.length;
    routeMetadata.push({
      readerCoordinate: block.readerCoordinate,
      routeStatus: block.routeStatus,
      failClosed: block.failClosed,
      sourceCoordinates: block.sourceCoordinates,
      topology: block.topology,
      sourceTokenCount: sourceTuples.length,
      ajAlignedVisibleTokens: blockAjAligned,
      routableVisibleTokens: blockRoutable,
      suppressedMissingEntityRoutes: blockSuppressed,
    });
  }
  const bookIndex = {};
  for (const [book, doc] of [...books.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const fileName = `${safeBook(book)}.json`;
    writeJson(path.join(outputRoot, fileName), doc, 0);
    aliases[normalizeAlias(book)] = fileName;
    bookIndex[fileName] = { book, corpus: doc.corpus, verses: Object.keys(doc.verses).length, sha256: sha256File(path.join(outputRoot, fileName)) };
  }
  writeJson(path.join(outputRoot, "manifest.json"), { version: 1, edition: "kjv2006-standardized-1769", aliases, books: bookIndex }, 2);
  writeJson(path.join(outputRoot, "route-metadata.json"), routeMetadata, 0);
  writeJson(path.join(outputRoot, "suppressed-routes.json"), suppressedRoutes, 2);
  return {
    books: books.size,
    overlaySourceTokens,
    ajAlignedVisibleTokens,
    alignedMappings: routableMappings,
    routableMappings,
    nonTappableTokens,
    supportedZeroRoutable,
    sourceTokensWithEntityId,
    sourceTokensWithoutEntityId,
    suppressedMissingEntityRoutes,
    suppressedRoutes,
    manifestSha256: sha256File(path.join(outputRoot, "manifest.json")),
    tree: treeFingerprint(outputRoot),
  };
}
function validateOverlay(blocks, outputRoot, resolved) {
  const manifest = readJson(path.join(outputRoot, "manifest.json"));
  const cache = new Map();
  const expectedBooks = new Set(blocks.map((block) => block.book));
  const manifestBooks = Object.values(manifest.books || {}).map((entry) => entry?.book).filter(Boolean);
  let blocksChecked = 0, visibleTokensChecked = 0, alignedChecked = 0, routableChecked = 0, nonTappableChecked = 0, failClosedChecked = 0;
  let sourceTuplesChecked = 0, exactSourceTuplesChecked = 0, sourceTokensWithEntityId = 0, sourceTokensWithoutEntityId = 0, suppressedMissingEntityChecked = 0;
  const errors = [];
  const errorReasonCounts = {};
  const missingEntitySourceTokens = [];
  const suppressedRoutes = [];
  function addError(error) {
    errors.push(error);
    const reason = String(error.reason || "unspecified");
    errorReasonCounts[reason] = (errorReasonCounts[reason] || 0) + 1;
  }
  function loadBook(book) {
    if (cache.has(book)) return cache.get(book);
    const file = manifest.aliases?.[normalizeAlias(book)];
    if (!file) { addError({ book, reason: "missing-alias" }); return null; }
    const filePath = path.join(outputRoot, file);
    if (!fs.existsSync(filePath)) { addError({ book, file, reason: "missing-book-file" }); return null; }
    const doc = readJson(filePath);
    cache.set(book, doc);
    return doc;
  }

  if (manifest.version !== 1) addError({ reason: "manifest-version", expected: 1, actual: manifest.version });
  if (manifest.edition !== "kjv2006-standardized-1769") addError({ reason: "manifest-edition", expected: "kjv2006-standardized-1769", actual: manifest.edition });
  if (new Set(manifestBooks).size !== expectedBooks.size) addError({ reason: "manifest-book-count", expected: expectedBooks.size, actual: new Set(manifestBooks).size });
  for (const book of expectedBooks) if (!manifestBooks.includes(book)) addError({ book, reason: "manifest-book-missing" });
  for (const book of manifestBooks) if (!expectedBooks.has(book)) addError({ book, reason: "manifest-book-unexpected" });

  const expectedVerseKeysByBook = new Map();
  for (const block of blocks) {
    if (!expectedVerseKeysByBook.has(block.book)) expectedVerseKeysByBook.set(block.book, new Set());
    expectedVerseKeysByBook.get(block.book).add(`${block.chapter}:${block.verse}`);

    const doc = loadBook(block.book); if (!doc) continue;
    const expectedCorpus = corpusForBook(block.book);
    if (doc.corpus !== expectedCorpus) addError({ book: block.book, reason: "book-corpus", expected: expectedCorpus, actual: doc.corpus });
    const verse = doc.verses?.[`${block.chapter}:${block.verse}`];
    if (!verse) { addError({ coordinate: block.readerCoordinate, reason: "missing-verse" }); continue; }
    const map = verse.a?.kjv || {};
    const actualSourceTuples = Array.isArray(verse.s) ? verse.s : [];
    const expectedSourceIds = [];
    for (const route of block.sourceRoutes || []) for (const id of route.sourceTokenIds || []) expectedSourceIds.push(id);
    blocksChecked += 1;

    if (actualSourceTuples.length !== expectedSourceIds.length) {
      addError({ coordinate: block.readerCoordinate, reason: "source-tuple-count", expected: expectedSourceIds.length, actual: actualSourceTuples.length });
    }
    const seenSourceIds = new Set();
    for (let sourceIndex = 0; sourceIndex < actualSourceTuples.length; sourceIndex += 1) {
      const tuple = actualSourceTuples[sourceIndex];
      const actualId = tuple?.[0];
      const expectedId = expectedSourceIds[sourceIndex];
      sourceTuplesChecked += 1;
      if (!actualId) addError({ coordinate: block.readerCoordinate, sourceIndex, reason: "source-token-id-empty" });
      if (seenSourceIds.has(actualId)) addError({ coordinate: block.readerCoordinate, sourceIndex, sourceTokenId: actualId, reason: "source-token-id-duplicate" });
      seenSourceIds.add(actualId);
      if (actualId !== expectedId) addError({ coordinate: block.readerCoordinate, sourceIndex, reason: "source-token-order", expected: expectedId, actual: actualId });
      const authoritative = actualId ? resolved.get(actualId) : null;
      if (!authoritative) {
        addError({ coordinate: block.readerCoordinate, sourceIndex, sourceTokenId: actualId, reason: "source-token-not-resolved" });
      } else if (JSON.stringify(tuple) !== JSON.stringify(authoritative.token)) {
        addError({ coordinate: block.readerCoordinate, sourceIndex, sourceTokenId: actualId, reason: "source-tuple-not-exact-runtime-copy" });
      } else {
        exactSourceTuplesChecked += 1;
      }
      const entityId = String(tuple?.[4] || "").trim();
      if (entityId) sourceTokensWithEntityId += 1;
      else {
        sourceTokensWithoutEntityId += 1;
        missingEntitySourceTokens.push({ coordinate: block.readerCoordinate, sourceIndex, sourceTokenId: actualId, sourceText: tuple?.[1] || "", strong: tuple?.[3] || "", morphology: tuple?.[5] || "" });
      }
    }

    if (block.failClosed) {
      failClosedChecked += 1;
      if (actualSourceTuples.length || Object.keys(map).length) addError({ coordinate: block.readerCoordinate, reason: "fail-closed-routed" });
    }
    for (const token of block.translation.tokens || []) {
      visibleTokensChecked += 1;
      const ids = token.alignedSourceTokenIds || [];
      const hasMap = Object.prototype.hasOwnProperty.call(map, String(token.index));
      const sourceIndex = map[String(token.index)];
      if (ids.length === 1) {
        alignedChecked += 1;
        const expectedSourceIndex = expectedSourceIds.indexOf(ids[0]);
        const expectedTuple = expectedSourceIndex >= 0 ? actualSourceTuples[expectedSourceIndex] : null;
        const entityId = String(expectedTuple?.[4] || "").trim();
        if (entityId) {
          routableChecked += 1;
          if (!Number.isInteger(sourceIndex) || sourceIndex !== expectedSourceIndex || actualSourceTuples?.[sourceIndex]?.[0] !== ids[0]) {
            addError({ coordinate: block.readerCoordinate, tokenIndex: token.index, reason: "routable-route-mismatch", expected: ids[0], actual: Number.isInteger(sourceIndex) ? actualSourceTuples?.[sourceIndex]?.[0] : null });
          }
        } else {
          suppressedMissingEntityChecked += 1;
          nonTappableChecked += 1;
          suppressedRoutes.push({ coordinate: block.readerCoordinate, tokenIndex: token.index, visibleToken: token.text, sourceTokenId: ids[0], reason: "approved-source-token-has-no-entity-id" });
          if (hasMap) addError({ coordinate: block.readerCoordinate, tokenIndex: token.index, sourceTokenId: ids[0], reason: "unsupported-entity-route-present" });
        }
      } else {
        nonTappableChecked += 1;
        if (hasMap) addError({ coordinate: block.readerCoordinate, tokenIndex: token.index, reason: "unexpected-route" });
      }
    }
  }

  let overlayVerses = 0;
  for (const [book, expectedKeys] of expectedVerseKeysByBook) {
    const doc = loadBook(book);
    if (!doc) continue;
    const actualKeys = Object.keys(doc.verses || {});
    overlayVerses += actualKeys.length;
    for (const key of expectedKeys) if (!Object.prototype.hasOwnProperty.call(doc.verses || {}, key)) addError({ book, verseKey: key, reason: "book-verse-missing" });
    for (const key of actualKeys) if (!expectedKeys.has(key)) addError({ book, verseKey: key, reason: "book-verse-unexpected" });
  }

  return {
    validatorVersion: "p0512an-route-overlay-validator@3",
    policy: "preserve every approved source tuple exactly; expose a visible-word route only when the approved tuple has a nonempty entity id; otherwise fail closed",
    manifestBooks: new Set(manifestBooks).size,
    overlayVerses,
    blocksChecked,
    visibleTokensChecked,
    alignedChecked,
    routableChecked,
    nonTappableChecked,
    failClosedChecked,
    sourceTuplesChecked,
    exactSourceTuplesChecked,
    sourceTokensWithEntityId,
    sourceTokensWithoutEntityId,
    suppressedMissingEntityChecked,
    missingEntitySourceTokens,
    suppressedRoutes,
    errorReasonCounts,
    errors,
  };
}
function extractTsJsonLiteral(source) {
  const equals = source.indexOf("=");
  if (equals < 0) fail("generatedKJV.ts has no assignment.");
  let start = -1;
  for (let i = equals + 1; i < source.length; i += 1) if (source[i] === "[" || source[i] === "{") { start = i; break; }
  if (start < 0) fail("generatedKJV.ts has no JSON literal.");
  const open = source[start], close = open === "[" ? "]" : "}";
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return { prefix: source.slice(0, start), literal: source.slice(start, i + 1), suffix: source.slice(i + 1) };
    }
  }
  fail("generatedKJV.ts JSON literal is unbalanced.");
}
function buildGeneratedTsCandidate(repoRoot, stagedDocument, outputFile) {
  const productionTs = path.join(repoRoot, "app", "data", "scripture", "generatedKJV.ts");
  const productionJson = readJson(path.join(repoRoot, "app", "data", "scripture", "generatedKJV.json"));
  const source = fs.readFileSync(productionTs, "utf8");
  const extracted = extractTsJsonLiteral(source);
  let parsed;
  try { parsed = JSON.parse(extracted.literal); } catch (error) { fail(`generatedKJV.ts literal is not JSON-compatible: ${error.message}`); }
  if (JSON.stringify(parsed) !== JSON.stringify(productionJson)) fail("generatedKJV.ts literal is not exact to generatedKJV.json.");
  const candidate = `${extracted.prefix}${JSON.stringify(stagedDocument)}${extracted.suffix}`;
  ensureDir(path.dirname(outputFile)); fs.writeFileSync(outputFile, candidate, "utf8");
  return { productionSha256: sha256File(productionTs), candidateSha256: sha256File(outputFile), wrapperPrefixSha256: sha256Buffer(Buffer.from(extracted.prefix)), wrapperSuffixSha256: sha256Buffer(Buffer.from(extracted.suffix)) };
}
function patchCanonicalStore(repoRoot, outputFile) {
  const sourceFile = path.join(repoRoot, "app", "data", "scripture", "CanonicalVerseStore.ts");
  const actualHash = sha256File(sourceFile);
  if (actualHash !== EXPECTED.canonicalStoreSha256) fail(`CanonicalVerseStore changed: ${actualHash}`);
  let source = fs.readFileSync(sourceFile, "utf8");
  const typeAnchor = [
    "type RuntimeManifest = {",
    "  version: number;",
    "  corpora: Record<BibleIQSource, RuntimeCorpusManifest>;",
    "};",
  ].join("\n");
  const typeInsert = [
    typeAnchor,
    "",
    "type KjvReaderRuntimeManifest = {",
    "  version: number;",
    "  aliases: Record<string, string>;",
    "  books: Record<string, unknown>;",
    "};",
  ].join("\n");
  if (!source.includes(typeAnchor)) fail("Canonical store type anchor missing.");
  source = source.replace(typeAnchor, typeInsert);

  const cacheAnchor = [
    'const RUNTIME_ROOT = "/data/bibleiq/word-study";',
    "const manifestCache = new Map<string, Promise<RuntimeManifest | null>>();",
    "const bookCache = new Map<string, Promise<CompactBook | null>>();",
  ].join("\n");
  const cacheInsert = [
    cacheAnchor,
    'const KJV_READER_RUNTIME_ROOT = "/data/bibleiq/word-study-kjv-reader";',
    "const kjvReaderManifestCache = new Map<string, Promise<KjvReaderRuntimeManifest | null>>();",
    "const kjvReaderBookCache = new Map<string, Promise<CompactBook | null>>();",
  ].join("\n");
  if (!source.includes(cacheAnchor)) fail("Canonical store cache anchor missing.");
  source = source.replace(cacheAnchor, cacheInsert);

  const runtimeUrlAnchor = [
    "function runtimeUrl(origin: string, relativePath: string) {",
    "  return new URL(",
    '    `${RUNTIME_ROOT}/${relativePath.replace(/^\\/+/, "")}`,',
    "    origin,",
    "  ).toString();",
    "}",
  ].join("\n");
  const runtimeUrlInsert = [
    runtimeUrlAnchor,
    "",
    "function kjvReaderRuntimeUrl(origin: string, relativePath: string) {",
    "  return new URL(",
    '    `${KJV_READER_RUNTIME_ROOT}/${relativePath.replace(/^\\/+/, "")}`,',
    "    origin,",
    "  ).toString();",
    "}",
  ].join("\n");
  if (!source.includes(runtimeUrlAnchor)) fail("Canonical store runtime URL anchor missing.");
  source = source.replace(runtimeUrlAnchor, runtimeUrlInsert);

  const loadBookEnd = ["  return pending;", "}", "", "function expandSourceToken("].join("\n");
  const helper = [
    "  return pending;",
    "}",
    "",
    "function loadKjvReaderManifest(origin: string) {",
    "  const key = new URL(origin).origin;",
    "  let pending = kjvReaderManifestCache.get(key);",
    "",
    "  if (!pending) {",
    "    pending = fetchJson<KjvReaderRuntimeManifest>(",
    '      kjvReaderRuntimeUrl(key, "manifest.json"),',
    "    );",
    "    kjvReaderManifestCache.set(key, pending);",
    "  }",
    "",
    "  return pending;",
    "}",
    "",
    "async function loadKjvReaderBook(",
    "  origin: string,",
    "  book: string,",
    "): Promise<CompactBook | null> {",
    "  const manifest = await loadKjvReaderManifest(origin);",
    "  const aliases = [book, canonicalBookName(book)]",
    "    .map(normalizeAlias)",
    "    .filter(Boolean);",
    "  const outputFile = aliases",
    "    .map((alias) => manifest?.aliases?.[alias])",
    "    .find(Boolean);",
    "",
    "  if (!outputFile) return null;",
    "",
    "  const originKey = new URL(origin).origin;",
    '  const cacheKey = `${originKey}|${outputFile}`;',
    "  let pending = kjvReaderBookCache.get(cacheKey);",
    "",
    "  if (!pending) {",
    "    pending = fetchJson<CompactBook>(",
    "      kjvReaderRuntimeUrl(originKey, outputFile),",
    "    );",
    "    kjvReaderBookCache.set(cacheKey, pending);",
    "  }",
    "",
    "  return pending;",
    "}",
    "",
    "function expandSourceToken(",
  ].join("\n");
  if (!source.includes(loadBookEnd)) fail("Canonical store load-book anchor missing.");
  source = source.replace(loadBookEnd, helper);

  const findAnchor = [
    "  const corpus = preferredCorpusForTranslation(translation, book);",
    "  const translationKey = safeTranslation(translation);",
    "  const runtimeBook = await loadRuntimeBook(origin, corpus, book);",
    '  const compactVerse = runtimeBook?.verses?.[`${chapter}:${verse}`];',
  ].join("\n");
  const findReplace = [
    "  const translationKey = safeTranslation(translation);",
    "  const kjvReaderBook =",
    '    translationKey === "kjv"',
    "      ? await loadKjvReaderBook(origin, book)",
    "      : null;",
    "  const corpus =",
    "    kjvReaderBook?.corpus ||",
    "    preferredCorpusForTranslation(translation, book);",
    "  const runtimeBook =",
    "    kjvReaderBook ||",
    "    (await loadRuntimeBook(origin, corpus, book));",
    '  const compactVerse = runtimeBook?.verses?.[`${chapter}:${verse}`];',
  ].join("\n");
  if (!source.includes(findAnchor)) fail("Canonical store find-hit anchor missing.");
  source = source.replace(findAnchor, findReplace);

  const availabilityAnchor = [
    "  const corpus = preferredCorpusForTranslation(translation, book);",
    "  const translationKey = safeTranslation(translation);",
    "  const runtimeBook = await loadRuntimeBook(origin, corpus, book);",
    "  const result: BibleIQChapterTokenAvailability = {};",
  ].join("\n");
  const availabilityReplace = [
    "  const translationKey = safeTranslation(translation);",
    "  const kjvReaderBook =",
    '    translationKey === "kjv"',
    "      ? await loadKjvReaderBook(origin, book)",
    "      : null;",
    "  const corpus =",
    "    kjvReaderBook?.corpus ||",
    "    preferredCorpusForTranslation(translation, book);",
    "  const runtimeBook =",
    "    kjvReaderBook ||",
    "    (await loadRuntimeBook(origin, corpus, book));",
    "  const result: BibleIQChapterTokenAvailability = {};",
  ].join("\n");
  if (!source.includes(availabilityAnchor)) fail("Canonical store availability anchor missing.");
  source = source.replace(availabilityAnchor, availabilityReplace);

  ensureDir(path.dirname(outputFile));
  fs.writeFileSync(outputFile, source, "utf8");
  return {
    productionSha256: actualHash,
    candidateSha256: sha256File(outputFile),
    overlayRoot: "/data/bibleiq/word-study-kjv-reader",
  };
}
function loadTypescript(repoRoot) {
  try { return require(require.resolve("typescript", { paths: [repoRoot] })); }
  catch { fail("TypeScript package is unavailable; cannot syntax-check staged adapter."); }
}
function transpileCheck(repoRoot, file, jsx = false) {
  const ts = loadTypescript(repoRoot);
  const source = fs.readFileSync(file, "utf8");
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  };
  if (jsx) compilerOptions.jsx = ts.JsxEmit.ReactJSX;
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions,
  });
  const diagnostics = (result.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
  return { diagnostics, outputBytes: Buffer.byteLength(result.outputText), passed: diagnostics.length === 0 };
}
function executeReaderAdapter(repoRoot, adapterFile, runtimeRoot) {
  const ts = loadTypescript(repoRoot);
  const source = fs.readFileSync(adapterFile, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const Module = module.constructor;
  const mod = new Module(adapterFile, module);
  mod.filename = adapterFile; mod.paths = module.paths;
  mod._compile(compiled, adapterFile);
  const normalize = mod.exports.normalizeReaderChapter;
  if (typeof normalize !== "function") fail("ReaderVerseAdapter normalizeReaderChapter export unavailable.");
  let verses = 0, supported = 0, failClosed = 0, textBytes = 0;
  const errors = [];
  for (const file of listFilesRecursive(runtimeRoot).filter((f) => /^\d+\.json$/i.test(path.basename(f)))) {
    const chapter = normalize(readJson(file));
    for (const verse of chapter.verses || []) {
      verses += 1; textBytes += Buffer.byteLength(verse.sources?.[0]?.text || "", "utf8");
      if (verse.tokenAvailabilityKey === null) failClosed += 1;
      else if (typeof verse.tokenAvailabilityKey === "string" && verse.tokenAvailabilityKey) supported += 1;
      else errors.push({ reference: verse.reference, reason: "invalid-token-key", value: verse.tokenAvailabilityKey });
    }
  }
  return { verses, supported, failClosed, textBytes, errors };
}
function writeDiff(repoRoot, oldFile, newFile, outputFile) {
  const result = childProcess.spawnSync("git", ["diff", "--no-index", "--", oldFile, newFile], { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (![0, 1].includes(result.status)) fail(`git diff failed: ${result.stderr}`);
  let text = result.stdout || "";
  const variants = [
    [normalizeSlashes(oldFile), "a/app/data/scripture/CanonicalVerseStore.ts"],
    [normalizeSlashes(newFile), "b/app/data/scripture/CanonicalVerseStore.ts"],
    [oldFile, "a/app/data/scripture/CanonicalVerseStore.ts"],
    [newFile, "b/app/data/scripture/CanonicalVerseStore.ts"],
  ];
  for (const [from, to] of variants) text = text.split(from).join(to);
  fs.writeFileSync(outputFile, text, "utf8");
}
function writeChecksumManifest(root, outputFile) {
  const lines = listFilesRecursive(root)
    .filter((f) => path.resolve(f) !== path.resolve(outputFile))
    .map((f) => `${sha256File(f)}  ${relativeFromRoot(root, f)}`);
  fs.writeFileSync(outputFile, `${lines.join("\n")}\n`, "utf8");
  return lines.length;
}

module.exports = {
  EXPECTED, NT_BOOKS, fail, ensureDir, readJson, writeJson, sha256File, sha256Buffer,
  normalizeSlashes, relativeFromRoot, parseArgs, gitInfo, listFilesRecursive,
  treeFingerprint, snapshotProtected, compareProtected, verifyReportManifest,
  verifyAj, verifyAmDiagnostic, coordinate, verseLabelOf, bookOf, chapterOf,
  visibleTextOf, unwrapTranslationDocument, mapRows, mapAjBlocks, buildStagedKjv,
  safeBook, normalizeAlias, corpusForBook, copyFile, copyDir, removeIfExists,
  runExactSplitter, inventoryRuntime, compareTextMaps, locateWordStudyRuntime,
  collectNeededSourceIds, resolveSourceTokens, buildRouteOverlay, validateOverlay,
  buildGeneratedTsCandidate, patchCanonicalStore, transpileCheck, executeReaderAdapter,
  writeDiff, writeChecksumManifest,
};
