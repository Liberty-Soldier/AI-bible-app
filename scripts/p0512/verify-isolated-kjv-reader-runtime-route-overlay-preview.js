#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  EXPECTED, fail, readJson, writeJson, sha256File, relativeFromRoot, parseArgs,
  gitInfo, listFilesRecursive, snapshotProtected, compareProtected,
} = require("./p0512an-lib");

function same(a, b) { return fs.readFileSync(a).equals(fs.readFileSync(b)); }
function relativeFileSet(root) { return listFilesRecursive(root).map((f) => relativeFromRoot(root, f)).sort(); }

// Unified-diff headers necessarily embed each independent candidate's absolute
// staging path. Normalize only those metadata header lines. Diff hunks and all
// staged product files remain subject to exact byte comparison.
function normalizedPatchBuffer(file) {
  const normalized = fs.readFileSync(file, "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      if (line.startsWith("diff --git ") || line.startsWith("+++ ")) {
        return line.replace(/candidate-[ab]/g, "candidate-x");
      }
      return line;
    })
    .join("\n");
  return Buffer.from(normalized, "utf8");
}

function comparisonFor(rel, af, bf, existsA, existsB) {
  const rawIdentical = existsA && existsB && same(af, bf);
  let deterministicallyEquivalent = rawIdentical;
  let comparisonPolicy = "exact-bytes";
  let normalizedCandidateASha256 = null;
  let normalizedCandidateBSha256 = null;

  if (!rawIdentical && existsA && existsB && rel === "CanonicalVerseStore.patch") {
    comparisonPolicy = "normalize-unified-diff-candidate-path-headers";
    const normalizedA = normalizedPatchBuffer(af);
    const normalizedB = normalizedPatchBuffer(bf);
    normalizedCandidateASha256 = crypto.createHash("sha256").update(normalizedA).digest("hex");
    normalizedCandidateBSha256 = crypto.createHash("sha256").update(normalizedB).digest("hex");
    deterministicallyEquivalent = normalizedA.equals(normalizedB);
  }

  return {
    file: rel,
    existsA,
    existsB,
    identical: rawIdentical,
    deterministicallyEquivalent,
    comparisonPolicy,
    candidateASha256: existsA ? sha256File(af) : null,
    candidateBSha256: existsB ? sha256File(bf) : null,
    normalizedCandidateASha256,
    normalizedCandidateBSha256,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args["repo-root"] || process.cwd());
  const a = path.resolve(args["candidate-a"] || "");
  const b = path.resolve(args["candidate-b"] || "");
  const reportDir = path.resolve(args["report-dir"] || "");
  const beforeFile = path.resolve(args["protected-before"] || "");
  if (!args["candidate-a"] || !args["candidate-b"] || !args["report-dir"] || !args["protected-before"]) fail("--candidate-a, --candidate-b, --report-dir, and --protected-before are required.");

  const filesA = relativeFileSet(a);
  const filesB = relativeFileSet(b);
  const sameFileSet = JSON.stringify(filesA) === JSON.stringify(filesB);
  const comparisons = [];
  for (const rel of [...new Set([...filesA, ...filesB])].sort()) {
    const af = path.join(a, ...rel.split("/"));
    const bf = path.join(b, ...rel.split("/"));
    const existsA = fs.existsSync(af), existsB = fs.existsSync(bf);
    comparisons.push(comparisonFor(rel, af, bf, existsA, existsB));
  }

  const sa = readJson(path.join(a, "build-summary.json"));
  const sb = readJson(path.join(b, "build-summary.json"));
  const before = readJson(beforeFile);
  const after = snapshotProtected(repoRoot);
  const protectedComparison = compareProtected(before, after);

  const substantiveComparisons = comparisons.filter((x) => x.file !== "CanonicalVerseStore.patch");
  const rawByteDifferences = comparisons.filter((x) => !x.identical).map((x) => x.file);
  const deterministicDifferences = comparisons.filter((x) => !x.deterministicallyEquivalent).map((x) => x.file);

  const gates = {
    repeatedBuildFileSetsIdentical: sameFileSet,
    repeatedBuildSubstantiveArtifactsByteIdentical: substantiveComparisons.every((x) => x.identical),
    repeatedBuildDiagnosticArtifactsDeterministicallyEquivalent: comparisons.every((x) => x.deterministicallyEquivalent),
    repeatedBuildSummariesIdentical: JSON.stringify(sa) === JSON.stringify(sb),
    candidateAAllGatesPassed: Object.values(sa.gates || {}).every(Boolean),
    candidateBAllGatesPassed: Object.values(sb.gates || {}).every(Boolean),
    candidateAAuthorizedForRetentionOnly: sa.authorization?.safeToRetainIsolatedKjvReaderRuntimeAndRouteOverlayPreview === true && sa.authorization?.safeToPromoteProductionKjv === false,
    candidateBAuthorizedForRetentionOnly: sb.authorization?.safeToRetainIsolatedKjvReaderRuntimeAndRouteOverlayPreview === true && sb.authorization?.safeToPromoteProductionKjv === false,
    exactCounts:
      sa.counts?.visibleCoordinates === EXPECTED.visibleCoordinates &&
      sa.counts?.supportedCoordinates === EXPECTED.supportedCoordinates &&
      sa.counts?.failClosedCoordinates === EXPECTED.failClosedCoordinates &&
      sa.counts?.visibleTokens === EXPECTED.visibleTokens &&
      sa.counts?.ajAlignedVisibleTokens === EXPECTED.alignedVisibleTokens &&
      sa.counts?.routableVisibleTokens === EXPECTED.routableVisibleTokens &&
      sa.counts?.nonTappableVisibleTokens === EXPECTED.nonTappableVisibleTokens &&
      sa.counts?.sourceTokensWithEntityId === EXPECTED.sourceTokensWithEntityId &&
      sa.counts?.sourceTokensWithoutEntityId === EXPECTED.sourceTokensWithoutEntityId &&
      sa.counts?.suppressedAlignedRoutesMissingEntity === EXPECTED.suppressedAlignedRoutesMissingEntity &&
      sa.counts?.sourceTokens === EXPECTED.sourceTokens &&
      sa.counts?.sourceRouteEdges === EXPECTED.sourceRouteEdges &&
      sa.counts?.productionToKjv2006TextChanges === EXPECTED.productionToKjv2006TextChanges,
    protectedProductionStateUnchanged: protectedComparison.identical,
    stagingOnly: sa.authorization?.productionPromotionPerformed === false && sb.authorization?.productionPromotionPerformed === false,
    productionPromotionNotAuthorized: sa.authorization?.safeToPromoteProductionKjv === false && sb.authorization?.safeToPromoteProductionKjv === false,
  };

  const primaryFingerprint = crypto.createHash("sha256")
    .update(comparisons.map((x) => `${x.file}\0${x.candidateASha256}\n`).join(""))
    .digest("hex");
  const deterministicFingerprint = crypto.createHash("sha256")
    .update(comparisons.map((x) => `${x.file}\0${x.normalizedCandidateASha256 || x.candidateASha256}\n`).join(""))
    .digest("hex");
  const passed = Object.values(gates).every(Boolean);

  const summary = {
    milestone: EXPECTED.milestone,
    verifierVersion: "p0512an-determinism-verifier@4",
    generatedAtUtc: new Date().toISOString(),
    repository: gitInfo(repoRoot),
    purpose: "ISOLATED KJV2006 READER-RUNTIME AND ROUTE-OVERLAY APPLICATION PREVIEW",
    retainedCandidate: relativeFromRoot(repoRoot, a),
    deterministicBuild: {
      independentlyRepeated: true,
      filesCompared: comparisons.length,
      substantiveFilesCompared: substantiveComparisons.length,
      rawByteDifferences,
      deterministicDifferences,
      reportOnlyNormalizedDifferences: rawByteDifferences.filter((file) => !deterministicDifferences.includes(file)),
      fileComparisons: comparisons,
      rawPrimaryFingerprint: primaryFingerprint,
      deterministicFingerprint,
    },
    counts: sa.counts,
    topology: sa.topology,
    gates,
    authorization: {
      safeToRetainIsolatedKjvReaderRuntimeAndRouteOverlayPreview: passed,
      safeToCreateProductionPromotionPackage: passed,
      safeToPromoteProductionKjv: false,
      productionPromotionPerformed: false,
    },
    nextMilestoneContract: {
      milestone: "P05.12AO — ISOLATED KJV2006 PRODUCTION-PROMOTION CANDIDATE",
      authorizedOnlyIfThisReportPasses: true,
      productionPromotionStillRequiresSeparateExplicitStage: true,
    },
  };

  writeJson(path.join(reportDir, "p0512an-summary.json"), summary);
  writeJson(path.join(reportDir, "protected-state-after.json"), after);
  writeJson(path.join(reportDir, "protected-state-comparison.json"), protectedComparison);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
}

try { main(); }
catch (error) { process.stderr.write(`${error?.stack || error}\n`); process.exitCode = 1; }
