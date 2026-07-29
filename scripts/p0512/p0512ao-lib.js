#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const childProcess = require("child_process");

const EXPECTED = Object.freeze({
  milestone: "P05.12AO",
  sourceMilestone: "P05.12AN",
  sourceVerifierVersion: "p0512an-determinism-verifier@4",
  visibleCoordinates: 31102,
  supportedCoordinates: 31085,
  failClosedCoordinates: 17,
  visibleTokens: 789642,
  ajAlignedVisibleTokens: 339549,
  routableVisibleTokens: 339548,
  nonTappableVisibleTokens: 450094,
  sourceTokens: 438452,
  sourceTokensWithEntityId: 438341,
  sourceTokensWithoutEntityId: 111,
  suppressedRoutes: 1,
  sourceRouteEdges: 31091,
  productionToKjv2006TextChanges: 3865,
  runtimeFiles: 1189,
  overlayFiles: 69,
  promotionFiles: 1261,
  targets: [
    { path: "app/data/scripture/generatedKJV.json", type: "file" },
    { path: "app/data/scripture/generatedKJV.ts", type: "file" },
    { path: "app/data/scripture/CanonicalVerseStore.ts", type: "file" },
    { path: "public/scripture/runtime/kjv", type: "directory" },
    { path: "public/data/bibleiq/word-study-kjv-reader", type: "directory" },
  ],
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
    "public/data/bibleiq/word-study-kjv-reader",
    "app/data/scripture/CanonicalVerseStore.ts",
    "app/data/scripture/ReaderVerseAdapter.ts",
    "scripts/split-scripture-runtime.js",
  ],
});

function fail(message) { throw new Error(`[P05.12AO] ${message}`); }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function normalizeSlashes(value) { return String(value || "").replace(/\\/g, "/"); }
function readText(file) { return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""); }
function readJson(file) { return JSON.parse(readText(file)); }
function writeJson(file, value, space = 2) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, space)}\n`, "utf8");
}
function sha256Buffer(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function sha256File(file) { return sha256Buffer(fs.readFileSync(file)); }
function relativeFromRoot(root, target) { return normalizeSlashes(path.relative(root, target)); }
function absoluteFromRelative(root, rel) { return path.join(root, ...normalizeSlashes(rel).split("/")); }
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
  function run(args) {
    return childProcess.execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
  }
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
      if (entry.isSymbolicLink()) fail(`Symbolic links are not permitted in promotion evidence: ${full}`);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out.sort((a, b) => normalizeSlashes(a).localeCompare(normalizeSlashes(b)));
}
function treeEntries(root) {
  return listFilesRecursive(root).map((file) => ({
    path: relativeFromRoot(root, file),
    bytes: fs.statSync(file).size,
    sha256: sha256File(file),
  }));
}
function treeFingerprint(root) {
  if (!fs.existsSync(root)) return { exists: false };
  const stat = fs.statSync(root);
  if (stat.isFile()) return { exists: true, type: "file", bytes: stat.size, sha256: sha256File(root) };
  if (!stat.isDirectory()) fail(`Unsupported filesystem object: ${root}`);
  const entries = treeEntries(root);
  const sha256 = sha256Buffer(Buffer.from(entries.map((e) => `${e.path}\0${e.bytes}\0${e.sha256}\n`).join(""), "utf8"));
  return { exists: true, type: "directory", files: entries.length, sha256 };
}
function snapshotPaths(repoRoot, paths = EXPECTED.protectedPaths) {
  return { items: paths.map((rel) => ({ path: rel, ...treeFingerprint(absoluteFromRelative(repoRoot, rel)) })) };
}
function compareSnapshots(a, b) {
  const left = new Map((a.items || []).map((x) => [x.path, x]));
  const right = new Map((b.items || []).map((x) => [x.path, x]));
  const paths = [...new Set([...left.keys(), ...right.keys()])].sort();
  const changes = [];
  for (const p of paths) {
    if (JSON.stringify(left.get(p)) !== JSON.stringify(right.get(p))) {
      changes.push({ path: p, before: left.get(p), after: right.get(p) });
    }
  }
  return { identical: changes.length === 0, changes };
}
function parseChecksumManifest(file) {
  return readText(file).split(/\r?\n/).filter(Boolean).map((line) => {
    const match = /^([0-9a-fA-F]{64})\s{2}(.+)$/.exec(line);
    if (!match) fail(`Malformed checksum line in ${file}: ${line}`);
    return { sha256: match[1].toLowerCase(), path: normalizeSlashes(match[2]) };
  });
}
function verifyReportManifest(reportDir) {
  const manifestFile = path.join(reportDir, "checksums.sha256");
  if (!fs.existsSync(manifestFile)) {
    return { passed: false, entries: 0, errors: [{ reason: "missing-manifest" }], unexpected: [] };
  }
  const entries = parseChecksumManifest(manifestFile);
  const listed = new Set();
  const errors = [];
  for (const entry of entries) {
    listed.add(entry.path);
    const file = absoluteFromRelative(reportDir, entry.path);
    if (!fs.existsSync(file)) {
      errors.push({ path: entry.path, reason: "missing" });
      continue;
    }
    const actual = sha256File(file);
    if (actual !== entry.sha256) errors.push({ path: entry.path, reason: "sha256", expected: entry.sha256, actual });
  }
  const unexpected = listFilesRecursive(reportDir)
    .map((file) => relativeFromRoot(reportDir, file))
    .filter((rel) => rel !== "checksums.sha256" && !listed.has(rel));
  return { passed: errors.length === 0 && unexpected.length === 0, entries: entries.length, errors, unexpected };
}
function sourceSummaryPasses(summary) {
  const counts = summary?.counts || {};
  const gates = summary?.gates || {};
  const auth = summary?.authorization || {};
  return (
    summary?.milestone === EXPECTED.sourceMilestone &&
    summary?.verifierVersion === EXPECTED.sourceVerifierVersion &&
    counts.visibleCoordinates === EXPECTED.visibleCoordinates &&
    counts.supportedCoordinates === EXPECTED.supportedCoordinates &&
    counts.failClosedCoordinates === EXPECTED.failClosedCoordinates &&
    counts.visibleTokens === EXPECTED.visibleTokens &&
    counts.ajAlignedVisibleTokens === EXPECTED.ajAlignedVisibleTokens &&
    counts.routableVisibleTokens === EXPECTED.routableVisibleTokens &&
    counts.nonTappableVisibleTokens === EXPECTED.nonTappableVisibleTokens &&
    counts.sourceTokens === EXPECTED.sourceTokens &&
    counts.sourceTokensWithEntityId === EXPECTED.sourceTokensWithEntityId &&
    counts.sourceTokensWithoutEntityId === EXPECTED.sourceTokensWithoutEntityId &&
    counts.suppressedAlignedRoutesMissingEntity === EXPECTED.suppressedRoutes &&
    counts.sourceRouteEdges === EXPECTED.sourceRouteEdges &&
    counts.productionToKjv2006TextChanges === EXPECTED.productionToKjv2006TextChanges &&
    Object.values(gates).every(Boolean) &&
    auth.safeToRetainIsolatedKjvReaderRuntimeAndRouteOverlayPreview === true &&
    auth.safeToCreateProductionPromotionPackage === true &&
    auth.safeToPromoteProductionKjv === false &&
    auth.productionPromotionPerformed === false
  );
}
function findLatestPassingAnReport(repoRoot) {
  const root = path.join(repoRoot, ".private", "reports", "P05.12");
  if (!fs.existsSync(root)) fail(`Missing P05.12 report root: ${root}`);
  const found = listFilesRecursive(root)
    .filter((file) => path.basename(file) === "p0512an-summary.json")
    .map((file) => ({ file, dir: path.dirname(file), summary: readJson(file) }))
    .filter((x) => sourceSummaryPasses(x.summary))
    .sort((a, b) => b.dir.localeCompare(a.dir));
  const attempts = [];
  for (const candidate of found) {
    const manifest = verifyReportManifest(candidate.dir);
    const protectedComparisonFile = path.join(candidate.dir, "protected-state-comparison.json");
    const protectedAfterFile = path.join(candidate.dir, "protected-state-after.json");
    const retained = absoluteFromRelative(repoRoot, candidate.summary.retainedCandidate || "");
    const stagingRoot = path.join(retained, "staging-candidate");
    const checks = {
      manifest: manifest.passed,
      protectedComparison: fs.existsSync(protectedComparisonFile) && readJson(protectedComparisonFile)?.identical === true,
      protectedAfter: fs.existsSync(protectedAfterFile),
      retainedCandidate: fs.existsSync(retained),
      stagingCandidate: fs.existsSync(stagingRoot),
    };
    attempts.push({ reportDir: candidate.dir, checks });
    if (Object.values(checks).every(Boolean)) {
      return {
        reportDir: candidate.dir,
        summaryFile: candidate.file,
        summary: candidate.summary,
        manifest,
        protectedAfter: readJson(protectedAfterFile),
        retainedCandidate: retained,
        stagingRoot,
        checks,
      };
    }
  }
  fail(`No passing retained P05.12AN report could be verified. Attempts=${JSON.stringify(attempts)}`);
}
function compareCurrentToAnProtected(current, anProtected) {
  const currentMap = new Map((current.items || []).map((x) => [x.path, x]));
  const expectedMap = new Map((anProtected.items || []).map((x) => [x.path, x]));
  const changes = [];
  for (const [rel, expected] of expectedMap.entries()) {
    const actual = currentMap.get(rel);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) changes.push({ path: rel, expected, actual });
  }
  const overlay = currentMap.get("public/data/bibleiq/word-study-kjv-reader");
  if (!overlay || overlay.exists !== false) {
    changes.push({
      path: "public/data/bibleiq/word-study-kjv-reader",
      expected: { path: "public/data/bibleiq/word-study-kjv-reader", exists: false },
      actual: overlay,
      reason: "promotion-target-must-not-already-exist",
    });
  }
  return { identical: changes.length === 0, changes };
}
function copyFileExact(source, destination) {
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
}
function copyDirExact(source, destination) {
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) fail(`Missing source directory: ${source}`);
  if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true });
  ensureDir(destination);
  for (const file of listFilesRecursive(source)) {
    copyFileExact(file, path.join(destination, relativeFromRoot(source, file)));
  }
}
function copyPathExact(source, destination) {
  if (!fs.existsSync(source)) fail(`Missing source path: ${source}`);
  const stat = fs.statSync(source);
  if (stat.isFile()) copyFileExact(source, destination);
  else if (stat.isDirectory()) copyDirExact(source, destination);
  else fail(`Unsupported source path: ${source}`);
}
function writeChecksumManifest(root, outputFile) {
  const lines = listFilesRecursive(root)
    .filter((file) => path.resolve(file) !== path.resolve(outputFile))
    .map((file) => `${sha256File(file)}  ${relativeFromRoot(root, file)}`);
  fs.writeFileSync(outputFile, `${lines.join("\n")}\n`, "utf8");
  return lines.length;
}
function verifyChecksumTree(root, manifestFile) {
  const entries = parseChecksumManifest(manifestFile);
  const errors = [];
  const listed = new Set();
  for (const entry of entries) {
    listed.add(entry.path);
    const file = absoluteFromRelative(root, entry.path);
    if (!fs.existsSync(file)) errors.push({ path: entry.path, reason: "missing" });
    else {
      const actual = sha256File(file);
      if (actual !== entry.sha256) errors.push({ path: entry.path, reason: "sha256", expected: entry.sha256, actual });
    }
  }
  const unexpected = listFilesRecursive(root)
    .map((file) => relativeFromRoot(root, file))
    .filter((rel) => rel !== relativeFromRoot(root, manifestFile) && !listed.has(rel));
  return { passed: errors.length === 0 && unexpected.length === 0, entries: entries.length, errors, unexpected };
}
function validateAnCandidate(stagingRoot, anSummary) {
  const generatedJson = path.join(stagingRoot, "app", "data", "scripture", "generatedKJV.json");
  const generatedTs = path.join(stagingRoot, "app", "data", "scripture", "generatedKJV.ts");
  const canonicalStore = path.join(stagingRoot, "app", "data", "scripture", "CanonicalVerseStore.ts");
  const runtimeRoot = path.join(stagingRoot, "public", "scripture", "runtime", "kjv");
  const overlayRoot = path.join(stagingRoot, "public", "data", "bibleiq", "word-study-kjv-reader");
  for (const file of [generatedJson, generatedTs, canonicalStore]) if (!fs.existsSync(file)) fail(`AN staging file is missing: ${file}`);
  const runtimeFiles = listFilesRecursive(runtimeRoot);
  const overlayFiles = listFilesRecursive(overlayRoot);
  const allStagingFiles = listFilesRecursive(stagingRoot);
  const allowed = allStagingFiles.every((file) => {
    const rel = relativeFromRoot(stagingRoot, file);
    return rel === "app/data/scripture/generatedKJV.json" ||
      rel === "app/data/scripture/generatedKJV.ts" ||
      rel === "app/data/scripture/CanonicalVerseStore.ts" ||
      rel.startsWith("public/scripture/runtime/kjv/") ||
      rel.startsWith("public/data/bibleiq/word-study-kjv-reader/");
  });
  const verses = readJson(generatedJson);
  const coordinateSet = new Set();
  let supported = 0;
  let failClosed = 0;
  const malformed = [];
  if (!Array.isArray(verses)) fail("AN generatedKJV.json must be an array.");
  for (const row of verses) {
    const key = `${String(row?.book || "").toLowerCase()}:${Number(row?.chapter || 0)}:${String(row?.verse ?? "")}`;
    const text = row?.sources?.[0]?.text;
    if (!row?.book || !Number(row?.chapter) || row?.verse == null || typeof text !== "string") malformed.push(key);
    if (coordinateSet.has(key)) malformed.push(`duplicate:${key}`);
    coordinateSet.add(key);
    if (row?.tokenAvailabilityKey == null) failClosed += 1;
    else supported += 1;
  }
  const manifest = readJson(path.join(overlayRoot, "manifest.json"));
  const routeMetadata = readJson(path.join(overlayRoot, "route-metadata.json"));
  const suppressed = readJson(path.join(overlayRoot, "suppressed-routes.json"));
  const gates = {
    onlyAllowedPromotionPaths: allowed,
    exactPromotionFileCount: allStagingFiles.length === EXPECTED.promotionFiles,
    exactRuntimeFileCount: runtimeFiles.length === EXPECTED.runtimeFiles,
    exactOverlayFileCount: overlayFiles.length === EXPECTED.overlayFiles,
    exactVisibleCoordinates: verses.length === EXPECTED.visibleCoordinates && coordinateSet.size === EXPECTED.visibleCoordinates,
    exactSupportedCoordinates: supported === EXPECTED.supportedCoordinates,
    exactFailClosedCoordinates: failClosed === EXPECTED.failClosedCoordinates,
    zeroMalformedVisibleRows: malformed.length === 0,
    exactOverlayBooks: Object.keys(manifest?.books || {}).length === 66 && Object.keys(manifest?.aliases || {}).length === 66,
    exactRouteMetadataCoordinates: Array.isArray(routeMetadata) && routeMetadata.length === EXPECTED.visibleCoordinates,
    exactSuppressedRoutes: Array.isArray(suppressed) && suppressed.length === EXPECTED.suppressedRoutes,
    exactSourceSummaryCounts: sourceSummaryPasses(anSummary),
  };
  return {
    passed: Object.values(gates).every(Boolean),
    gates,
    counts: {
      promotionFiles: allStagingFiles.length,
      runtimeFiles: runtimeFiles.length,
      overlayFiles: overlayFiles.length,
      visibleCoordinates: verses.length,
      uniqueCoordinates: coordinateSet.size,
      supportedCoordinates: supported,
      failClosedCoordinates: failClosed,
      overlayBooks: Object.keys(manifest?.books || {}).length,
      routeMetadataCoordinates: Array.isArray(routeMetadata) ? routeMetadata.length : null,
      suppressedRoutes: Array.isArray(suppressed) ? suppressed.length : null,
    },
    malformed: malformed.slice(0, 50),
    fingerprints: {
      stagingTree: treeFingerprint(stagingRoot),
      generatedKjvJson: treeFingerprint(generatedJson),
      generatedKjvTs: treeFingerprint(generatedTs),
      canonicalVerseStore: treeFingerprint(canonicalStore),
      runtimeTree: treeFingerprint(runtimeRoot),
      overlayTree: treeFingerprint(overlayRoot),
    },
  };
}
function compareDirectoryFiles(leftRoot, rightRoot) {
  const left = new Map(treeEntries(leftRoot).map((x) => [x.path, x]));
  const right = new Map(treeEntries(rightRoot).map((x) => [x.path, x]));
  const paths = [...new Set([...left.keys(), ...right.keys()])].sort();
  let identical = 0;
  let changed = 0;
  let added = 0;
  let removed = 0;
  const samples = [];
  for (const rel of paths) {
    const a = left.get(rel);
    const b = right.get(rel);
    if (!a) { added += 1; if (samples.length < 50) samples.push({ path: rel, operation: "add" }); }
    else if (!b) { removed += 1; if (samples.length < 50) samples.push({ path: rel, operation: "remove" }); }
    else if (a.sha256 === b.sha256 && a.bytes === b.bytes) identical += 1;
    else { changed += 1; if (samples.length < 50) samples.push({ path: rel, operation: "replace", before: a.sha256, after: b.sha256 }); }
  }
  return { identical, changed, added, removed, totalPaths: paths.length, samples };
}
function compareCandidateTrees(candidateA, candidateB) {
  const a = new Map(treeEntries(candidateA).map((x) => [x.path, x]));
  const b = new Map(treeEntries(candidateB).map((x) => [x.path, x]));
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  const differences = [];
  for (const rel of paths) {
    const left = a.get(rel);
    const right = b.get(rel);
    if (!left || !right || left.sha256 !== right.sha256 || left.bytes !== right.bytes) {
      differences.push({ path: rel, candidateA: left, candidateB: right });
    }
  }
  return { identical: differences.length === 0, filesCompared: paths.length, differences };
}

module.exports = {
  EXPECTED,
  fail,
  ensureDir,
  normalizeSlashes,
  readText,
  readJson,
  writeJson,
  sha256Buffer,
  sha256File,
  relativeFromRoot,
  absoluteFromRelative,
  parseArgs,
  gitInfo,
  listFilesRecursive,
  treeEntries,
  treeFingerprint,
  snapshotPaths,
  compareSnapshots,
  verifyReportManifest,
  sourceSummaryPasses,
  findLatestPassingAnReport,
  compareCurrentToAnProtected,
  copyPathExact,
  writeChecksumManifest,
  verifyChecksumTree,
  validateAnCandidate,
  compareDirectoryFiles,
  compareCandidateTrees,
};
