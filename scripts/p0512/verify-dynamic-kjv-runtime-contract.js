#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  EXPECTED,
  fail,
  readJson,
  writeJson,
  sha256File,
  parseArgs,
  gitInfo,
  relativeFromRoot,
  verifyAl,
  listFilesRecursive,
  snapshotItems,
  compareItems,
} = require("./p0512am-lib");

function same(a, b) { return fs.readFileSync(a).equals(fs.readFileSync(b)); }
function relativeFileSet(root) { return listFilesRecursive(root).map((file) => relativeFromRoot(root, file)).sort(); }

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args["repo-root"] || process.cwd());
  const a = path.resolve(args["candidate-a"] || "");
  const b = path.resolve(args["candidate-b"] || "");
  const reportDir = path.resolve(args["report-dir"] || "");
  if (!args["candidate-a"] || !args["candidate-b"] || !args["report-dir"]) fail("--candidate-a, --candidate-b, and --report-dir are required.");

  const filesA = relativeFileSet(a);
  const filesB = relativeFileSet(b);
  const sameFileSet = JSON.stringify(filesA) === JSON.stringify(filesB);
  const comparisons = [];
  for (const rel of [...new Set([...filesA, ...filesB])].sort()) {
    const af = path.join(a, ...rel.split("/"));
    const bf = path.join(b, ...rel.split("/"));
    const existsA = fs.existsSync(af); const existsB = fs.existsSync(bf);
    comparisons.push({
      file: rel,
      existsA,
      existsB,
      identical: existsA && existsB && same(af, bf),
      candidateASha256: existsA ? sha256File(af) : null,
      candidateBSha256: existsB ? sha256File(bf) : null,
    });
  }

  const sa = readJson(path.join(a, "build-summary.json"));
  const sb = readJson(path.join(b, "build-summary.json"));
  const al = verifyAl(repoRoot);
  const currentProtected = { items: snapshotItems(repoRoot, al.protectedCurrent.items) };
  const protectedComparison = compareItems(al.protectedCurrent.items, currentProtected.items);

  const gates = {
    repeatedBuildFileSetsIdentical: sameFileSet,
    repeatedBuildArtifactsByteIdentical: comparisons.every((item) => item.identical),
    repeatedBuildSummariesIdentical: JSON.stringify(sa) === JSON.stringify(sb),
    candidateAAllGatesPassed: Object.values(sa.gates || {}).every(Boolean),
    candidateBAllGatesPassed: Object.values(sb.gates || {}).every(Boolean),
    retainedAlStillValidFailClosed: al.passed,
    protectedProductionStateUnchanged: protectedComparison.identical,
    stagingOnly: sa.authorization?.productionPromotionPerformed === false && sb.authorization?.productionPromotionPerformed === false,
    productionPromotionNotAuthorized: sa.authorization?.safeToPromoteProductionKjv === false && sb.authorization?.safeToPromoteProductionKjv === false,
  };

  const primaryFingerprint = crypto.createHash("sha256")
    .update(comparisons.map((item) => `${item.file}\0${item.candidateASha256}\n`).join(""))
    .digest("hex");

  const summary = {
    milestone: EXPECTED.milestone,
    generatedAtUtc: new Date().toISOString(),
    repository: gitInfo(repoRoot),
    purpose: "DYNAMIC KJV PUBLIC-RUNTIME DATAFLOW AND GENERATOR CONTRACT",
    retainedCandidate: relativeFromRoot(repoRoot, a),
    deterministicBuild: {
      independentlyRepeated: true,
      filesCompared: comparisons.length,
      fileComparisons: comparisons,
      primaryFingerprint,
    },
    counts: sa.counts,
    exactFlow: sa.exactFlow,
    gates,
    authorization: {
      safeToCreateIsolatedKjvPublicRuntimeAdapterApplicationPreview: Object.values(gates).every(Boolean),
      safeToPromoteProductionKjv: false,
      productionPromotionPerformed: false,
    },
  };

  writeJson(path.join(reportDir, "p0512am-summary.json"), summary);
  writeJson(path.join(reportDir, "protected-state-final-comparison.json"), protectedComparison);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!Object.values(gates).every(Boolean)) process.exitCode = 1;
}

try { main(); }
catch (error) { process.stderr.write(`${error?.stack || error}\n`); process.exitCode = 1; }
