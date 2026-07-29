"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");

const EXPECTED = Object.freeze({
  milestone: "P05.12AM",
  alMilestone: "P05.12AL",
  ajMilestone: "P05.12AJ",
  visibleCoordinates: 31102,
  supportedCoordinates: 31085,
  readerOnlyFailClosedCoordinates: 17,
  routedSourceTokens: 438452,
  sourceRouteEdges: 31091,
  readerPage: "app/read/[book]/[chapter]/page.tsx",
  readerAdapter: "app/data/scripture/ReaderVerseAdapter.ts",
  verseConsumer: "app/components/VerseActionController.tsx",
  generatedKjv: "app/data/scripture/generatedKJV.json",
  splitter: "scripts/split-scripture-runtime.js",
  runtimeRoot: "public/scripture/runtime/kjv",
});

function fail(message) { throw new Error(`[P05.12AM] ${message}`); }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); }
function writeJson(file, value) { ensureDir(path.dirname(file)); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function sha256Buffer(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function sha256File(file) { return sha256Buffer(fs.readFileSync(file)); }
function normalizeRel(value) { return String(value || "").split(path.sep).join("/"); }
function relativeFromRoot(repoRoot, target) { return normalizeRel(path.relative(repoRoot, target)); }
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) { out[key] = next; i += 1; }
    else out[key] = true;
  }
  return out;
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
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}
function hashTree(root) {
  if (!fs.existsSync(root)) return null;
  const files = listFilesRecursive(root);
  const digest = crypto.createHash("sha256");
  for (const file of files) {
    const rel = relativeFromRoot(root, file);
    digest.update(rel, "utf8"); digest.update("\0", "utf8");
    digest.update(sha256File(file), "utf8"); digest.update("\n", "utf8");
  }
  return { files: files.length, sha256: digest.digest("hex") };
}
function snapshotItems(repoRoot, templateItems) {
  return (templateItems || []).map((item) => {
    const rel = item.path;
    const full = path.join(repoRoot, ...String(rel).split("/"));
    if (!fs.existsSync(full)) return { path: rel, exists: false };
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      const tree = hashTree(full);
      return { path: rel, exists: true, type: "directory", files: tree.files, sha256: tree.sha256 };
    }
    return { path: rel, exists: true, type: "file", bytes: st.size, sha256: sha256File(full) };
  });
}
function compareItems(before, after) {
  const a = new Map((before || []).map((item) => [item.path, item]));
  const b = new Map((after || []).map((item) => [item.path, item]));
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  const changes = [];
  for (const p of paths) {
    if (JSON.stringify(a.get(p)) !== JSON.stringify(b.get(p))) changes.push({ path: p, before: a.get(p), after: b.get(p) });
  }
  return { identical: changes.length === 0, changes };
}
function verifyManifest(reportDir) {
  const manifestPath = path.join(reportDir, "checksums.sha256");
  if (!fs.existsSync(manifestPath)) fail(`Checksum manifest missing: ${manifestPath}`);
  const lines = fs.readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const entries = [];
  const errors = [];
  for (const line of lines) {
    const match = line.match(/^([0-9a-fA-F]{64})\s{2}(.+)$/);
    if (!match) { errors.push({ line, reason: "invalid-manifest-line" }); continue; }
    const expected = match[1].toLowerCase();
    const rel = match[2].replace(/\\/g, "/");
    const full = path.join(reportDir, ...rel.split("/"));
    if (!fs.existsSync(full)) { errors.push({ path: rel, reason: "missing" }); continue; }
    const actual = sha256File(full);
    entries.push({ path: rel, expected, actual, passed: expected === actual });
    if (expected !== actual) errors.push({ path: rel, reason: "checksum-mismatch", expected, actual });
  }
  const expectedSet = new Set(entries.map((item) => item.path));
  const unexpected = listFilesRecursive(reportDir)
    .map((file) => relativeFromRoot(reportDir, file))
    .filter((rel) => rel !== "checksums.sha256" && !expectedSet.has(rel));
  return { entries: entries.length, passed: errors.length === 0 && unexpected.length === 0, errors, unexpected };
}
function findLatestReport(repoRoot, suffix, summaryName, milestone) {
  const reportRoot = path.join(repoRoot, ".private", "reports", "P05.12");
  if (!fs.existsSync(reportRoot)) fail(`Report root missing: ${reportRoot}`);
  const dirs = fs.readdirSync(reportRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(suffix))
    .map((entry) => path.join(reportRoot, entry.name))
    .sort((a, b) => b.localeCompare(a));
  for (const dir of dirs) {
    const summaryPath = path.join(dir, summaryName);
    if (!fs.existsSync(summaryPath)) continue;
    try {
      const summary = readJson(summaryPath);
      if (summary.milestone === milestone) return { reportDir: dir, summaryPath, summary };
    } catch {}
  }
  fail(`No retained ${milestone} report found under ${reportRoot}`);
}
function falseKeys(object) { return Object.entries(object || {}).filter(([, value]) => value === false).map(([key]) => key).sort(); }
function verifyAl(repoRoot) {
  const report = findLatestReport(repoRoot, "-exact-kjv-reader-dataflow-contract", "p0512al-summary.json", EXPECTED.alMilestone);
  const manifest = verifyManifest(report.reportDir);
  const candidateSummaryPath = path.join(report.reportDir, "candidate-a", "build-summary.json");
  const candidateSummary = readJson(candidateSummaryPath);
  const protectedCurrent = readJson(path.join(report.reportDir, "candidate-a", "protected-state-current.json"));
  const protectedFinal = readJson(path.join(report.reportDir, "protected-state-final-comparison.json"));
  const expectedCandidateFalse = ["exactGeneratedKjvArtifactReached", "visibleKjvDataflowResolved"];
  const expectedTopFalse = ["candidateAAllGatesPassed", "candidateBAllGatesPassed"];
  const gates = {
    manifestPassed: manifest.passed,
    repeatedBuildArtifactsIdentical: (report.summary.deterministicBuild?.fileComparisons || []).every((item) => item.identical === true),
    candidateFalseGatesExpected: JSON.stringify(falseKeys(candidateSummary.gates)) === JSON.stringify(expectedCandidateFalse),
    topLevelFalseGatesExpected: JSON.stringify(falseKeys(report.summary.gates)) === JSON.stringify(expectedTopFalse),
    dynamicVisibleFlowWasNotResolved: candidateSummary.gates?.visibleKjvDataflowResolved === false,
    canonicalAvailabilityResolved: candidateSummary.gates?.canonicalAvailabilityDataflowResolved === true,
    protectedStateUnchanged: protectedFinal.identical === true,
    stagingOnly: candidateSummary.gates?.stagingOnly === true,
    promotionNotAuthorized: report.summary.authorization?.safeToPromoteProductionKjv === false,
    promotionNotPerformed: report.summary.authorization?.productionPromotionPerformed === false,
  };
  return { report, manifest, candidateSummary, protectedCurrent, protectedFinal, gates, passed: Object.values(gates).every(Boolean) };
}
function verifyAj(repoRoot) {
  const report = findLatestReport(repoRoot, "-isolated-kjv-translation-block-migration-preview", "p0512aj-summary.json", EXPECTED.ajMilestone);
  const manifest = verifyManifest(report.reportDir);
  const blocksPath = path.join(report.reportDir, "candidate-a", "kjv-translation-blocks.json");
  if (!fs.existsSync(blocksPath)) fail(`AJ translation blocks missing: ${blocksPath}`);
  const totals = report.summary.totals || {};
  const gates = {
    manifestPassed: manifest.passed,
    allTopGatesPassed: Object.values(report.summary.gates || {}).every(Boolean),
    coordinatesExact: totals.blocks === EXPECTED.visibleCoordinates,
    supportedExact: totals.supportedBlocks === EXPECTED.supportedCoordinates,
    failClosedExact: totals.readerOnlyFailClosedBlocks === EXPECTED.readerOnlyFailClosedCoordinates,
    routedTokensExact: totals.routedSourceTokens === EXPECTED.routedSourceTokens,
    routeEdgesExact: totals.sourceRouteEdges === EXPECTED.sourceRouteEdges,
    retainedBlocksAuthorized: report.summary.authorization?.safeToRetainStagedKjvTranslationBlocks === true,
    productionPromotionNotAuthorized: report.summary.authorization?.safeToPromoteProductionKjv === false,
    productionPromotionNotPerformed: report.summary.authorization?.productionPromotionPerformed === false,
  };
  return { report, manifest, blocksPath, gates, passed: Object.values(gates).every(Boolean) };
}
function safeBook(book) {
  return String(book || "").replace(/[^1-3A-Za-z ]/g, "").trim().replace(/\s+/g, "_");
}
function coordinate(book, chapter, verse) {
  return `${String(book).trim().toLowerCase()}:${Number(chapter)}:${Number(verse)}`;
}
function extractGeneratedKjv(repoRoot) {
  const file = path.join(repoRoot, ...EXPECTED.generatedKjv.split("/"));
  if (!fs.existsSync(file)) fail(`Production KJV artifact missing: ${EXPECTED.generatedKjv}`);
  const rows = readJson(file);
  if (!Array.isArray(rows)) fail(`${EXPECTED.generatedKjv} must be an array.`);
  const map = new Map();
  const duplicates = [];
  const malformed = [];
  for (const row of rows) {
    const text = Array.isArray(row?.sources) ? row.sources.find((source) => typeof source?.text === "string")?.text : null;
    if (!row || typeof row.book !== "string" || !Number.isInteger(Number(row.chapter)) || !Number.isInteger(Number(row.verse)) || typeof text !== "string") {
      malformed.push(row); continue;
    }
    const key = coordinate(row.book, row.chapter, row.verse);
    if (map.has(key)) duplicates.push(key);
    map.set(key, { key, book: row.book, chapter: Number(row.chapter), verse: Number(row.verse), text, id: row.id || null, reference: row.reference || null });
  }
  return { file, sha256: sha256File(file), bytes: fs.statSync(file).size, rows: rows.length, map, duplicates, malformed };
}
function extractAjBlocks(blocksPath) {
  const blocks = readJson(blocksPath);
  if (!Array.isArray(blocks)) fail(`AJ translation blocks must be an array: ${blocksPath}`);
  const map = new Map();
  const duplicates = [];
  const malformed = [];
  for (const block of blocks) {
    const key = block?.readerCoordinate;
    const text = block?.translation?.text;
    if (typeof key !== "string" || typeof text !== "string") { malformed.push(block); continue; }
    if (map.has(key)) duplicates.push(key);
    map.set(key, block);
  }
  return { blocks: blocks.length, map, duplicates, malformed, sha256: sha256File(blocksPath), bytes: fs.statSync(blocksPath).size };
}
function compareVisibleMaps(generated, aj) {
  const keys = [...new Set([...generated.map.keys(), ...aj.map.keys()])].sort();
  const missingGenerated = [];
  const missingAj = [];
  const textMismatches = [];
  for (const key of keys) {
    const g = generated.map.get(key);
    const a = aj.map.get(key);
    if (!g) { missingGenerated.push(key); continue; }
    if (!a) { missingAj.push(key); continue; }
    if (g.text !== a.translation.text) textMismatches.push({ coordinate: key, generatedText: g.text, ajText: a.translation.text });
  }
  return { coordinatesCompared: keys.length, missingGenerated, missingAj, textMismatches, identical: missingGenerated.length === 0 && missingAj.length === 0 && textMismatches.length === 0 };
}
function resolveDynamicReaderFlow(repoRoot) {
  const required = [EXPECTED.readerPage, EXPECTED.readerAdapter, EXPECTED.verseConsumer, EXPECTED.generatedKjv, EXPECTED.splitter, EXPECTED.runtimeRoot, "package.json"];
  const missing = required.filter((rel) => !fs.existsSync(path.join(repoRoot, ...rel.split("/"))));
  const pagePath = path.join(repoRoot, ...EXPECTED.readerPage.split("/"));
  const pageText = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, "utf8") : "";
  const splitterPath = path.join(repoRoot, ...EXPECTED.splitter.split("/"));
  const splitterText = fs.existsSync(splitterPath) ? fs.readFileSync(splitterPath, "utf8") : "";
  const adapterPath = path.join(repoRoot, ...EXPECTED.readerAdapter.split("/"));
  const adapterText = fs.existsSync(adapterPath) ? fs.readFileSync(adapterPath, "utf8") : "";
  const consumerPath = path.join(repoRoot, ...EXPECTED.verseConsumer.split("/"));
  const consumerText = fs.existsSync(consumerPath) ? fs.readFileSync(consumerPath, "utf8") : "";
  const packageJson = readJson(path.join(repoRoot, "package.json"));
  const prebuild = packageJson?.scripts?.prebuild || null;
  const evidence = {
    pageFetchesRuntimeTemplate: /\/scripture\/runtime\/\$\{translation\}\/\$\{safeBook\([^)]+\)\}\/\$\{chapter\}\.json/.test(pageText.replace(/\s+/g, "")),
    pageImportsAdapter: /ReaderVerseAdapter/.test(pageText) && /normalizeReaderChapter/.test(pageText),
    pagePassesVersesToConsumer: /<VerseActionController[\s\S]*?verses=\{chapterVerses\}/.test(pageText),
    splitterReferencesGeneratedKjv: /generatedKJV\.json/i.test(splitterText),
    splitterReferencesRuntimeOutput: /scripture[\\/]runtime/i.test(splitterText) || /runtimeRoot/i.test(splitterText),
    prebuildRunsSplitter: typeof prebuild === "string" && /scripts[\\/]split-scripture-runtime\.js/.test(prebuild),
    adapterExportsNormalizer: /export\s+(?:function|const)\s+normalizeReaderChapter|export\s*\{[^}]*normalizeReaderChapter/.test(adapterText),
    consumerAcceptsVerses: /verses/.test(consumerText),
  };
  return {
    missing,
    evidence,
    exactFlow: [
      EXPECTED.generatedKjv,
      EXPECTED.splitter,
      `${EXPECTED.runtimeRoot}/{safeBook}/{chapter}.json`,
      EXPECTED.readerPage,
      EXPECTED.readerAdapter,
      EXPECTED.verseConsumer,
    ],
    prebuild,
  };
}
function verseArrayFromChapter(root) {
  if (Array.isArray(root)) return root;
  if (root && Array.isArray(root.verses)) return root.verses;
  if (root && root.data && Array.isArray(root.data.verses)) return root.data.verses;
  return null;
}
function verseNumberFromItem(item) {
  const raw = item?.verse ?? item?.verseNumber ?? item?.number ?? item?.verseLabel ?? item?.label;
  const match = String(raw ?? "").match(/\d+/);
  return match ? Number(match[0]) : null;
}
function verseTextFromItem(item) {
  for (const key of ["text", "verseText", "content", "displayText"]) {
    if (typeof item?.[key] === "string") return item[key];
  }
  if (Array.isArray(item?.tokens)) {
    const values = item.tokens.map((token) => typeof token === "string" ? token : (typeof token?.text === "string" ? token.text : null));
    if (values.every((value) => value !== null)) return values.join(" ");
  }
  return null;
}
function inventoryPublicRuntime(repoRoot, generated) {
  const root = path.join(repoRoot, ...EXPECTED.runtimeRoot.split("/"));
  if (!fs.existsSync(root)) fail(`KJV public runtime root missing: ${EXPECTED.runtimeRoot}`);
  const expectedChapters = new Map();
  for (const row of generated.map.values()) {
    const rel = `${safeBook(row.book)}/${row.chapter}.json`;
    if (!expectedChapters.has(rel)) expectedChapters.set(rel, { book: row.book, chapter: row.chapter, verses: [] });
    expectedChapters.get(rel).verses.push(row);
  }
  for (const chapter of expectedChapters.values()) chapter.verses.sort((a, b) => a.verse - b.verse);
  const actualNumericJson = listFilesRecursive(root).filter((file) => /^\d+\.json$/i.test(path.basename(file)));
  const actualRelSet = new Set(actualNumericJson.map((file) => relativeFromRoot(root, file)));
  const missingFiles = [...expectedChapters.keys()].filter((rel) => !actualRelSet.has(rel)).sort();
  const unexpectedFiles = [...actualRelSet].filter((rel) => !expectedChapters.has(rel)).sort();
  const runtimeMap = new Map();
  const parseErrors = [];
  const duplicateCoordinates = [];
  const chapterProfiles = [];
  for (const [rel, expectedChapter] of [...expectedChapters.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const file = path.join(root, ...rel.split("/"));
    if (!fs.existsSync(file)) continue;
    try {
      const rootJson = readJson(file);
      const verses = verseArrayFromChapter(rootJson);
      if (!verses) { parseErrors.push({ path: rel, reason: "no-verse-array" }); continue; }
      chapterProfiles.push({ path: rel, sha256: sha256File(file), bytes: fs.statSync(file).size, rootType: Array.isArray(rootJson) ? "array" : "object", verses: verses.length, rootKeys: rootJson && !Array.isArray(rootJson) ? Object.keys(rootJson).sort() : [] });
      for (const item of verses) {
        const verse = verseNumberFromItem(item);
        const text = verseTextFromItem(item);
        if (!Number.isInteger(verse) || typeof text !== "string") { parseErrors.push({ path: rel, reason: "malformed-verse", sample: item }); continue; }
        const key = coordinate(expectedChapter.book, expectedChapter.chapter, verse);
        if (runtimeMap.has(key)) duplicateCoordinates.push(key);
        runtimeMap.set(key, { key, book: expectedChapter.book, chapter: expectedChapter.chapter, verse, text, path: rel });
      }
    } catch (error) {
      parseErrors.push({ path: rel, reason: "json-parse-error", message: String(error?.message || error) });
    }
  }
  const compare = compareVisibleMaps({ map: runtimeMap }, { map: new Map([...generated.map.entries()].map(([key, row]) => [key, { translation: { text: row.text } }])) });
  return {
    root,
    tree: hashTree(root),
    expectedChapterFiles: expectedChapters.size,
    actualNumericChapterFiles: actualNumericJson.length,
    missingFiles,
    unexpectedFiles,
    parsedCoordinates: runtimeMap.size,
    duplicateCoordinates,
    parseErrors,
    coordinateTextComparison: compare,
    chapterProfiles,
  };
}
function copySnapshot(repoRoot, outputDir, rel) {
  const source = path.join(repoRoot, ...rel.split("/"));
  const target = path.join(outputDir, "source-snapshots", ...rel.split("/"));
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return { path: rel, copied: false };
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
  return { path: rel, copied: true, bytes: fs.statSync(source).size, sha256: sha256File(source), snapshotPath: relativeFromRoot(outputDir, target) };
}
function writeSnapshots(repoRoot, outputDir) {
  return [EXPECTED.readerPage, EXPECTED.readerAdapter, EXPECTED.verseConsumer, EXPECTED.splitter, "package.json"].map((rel) => copySnapshot(repoRoot, outputDir, rel));
}

module.exports = {
  EXPECTED,
  fail,
  ensureDir,
  readJson,
  writeJson,
  sha256File,
  normalizeRel,
  relativeFromRoot,
  parseArgs,
  gitInfo,
  listFilesRecursive,
  hashTree,
  snapshotItems,
  compareItems,
  verifyManifest,
  verifyAl,
  verifyAj,
  extractGeneratedKjv,
  extractAjBlocks,
  compareVisibleMaps,
  resolveDynamicReaderFlow,
  inventoryPublicRuntime,
  writeSnapshots,
};
