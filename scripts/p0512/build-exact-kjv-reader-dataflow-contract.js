#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  EXPECTED,
  fail,
  ensureDir,
  writeJson,
  parseArgs,
  gitInfo,
  relativeFromRoot,
  verifyAk,
  snapshotItems,
  compareItems,
  buildModuleGraph,
  findDataflowPaths,
  writeSourceSnapshots,
  buildAdapterContract,
} = require("./p0512al-lib");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args["repo-root"] || process.cwd());
  const outputDir = path.resolve(args["output-dir"] || "");
  if (!args["output-dir"]) fail("--output-dir is required.");
  const allowed = path.join(repoRoot, ".private", "reports", "P05.12");
  const rel = path.relative(allowed, outputDir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) fail(`Output must stay under ${allowed}`);
  ensureDir(outputDir);

  const repository = gitInfo(repoRoot);
  if (repository.branch !== "main") fail(`Must run on main; current branch=${repository.branch}`);

  const ak = verifyAk(repoRoot);
  if (!ak.passed) fail(`Latest P05.12AK report did not match the expected valid fail-closed state: ${JSON.stringify(ak.gates)}`);

  const currentProtected = { items: snapshotItems(repoRoot, ak.protectedCurrent.items) };
  const protectedComparison = compareItems(ak.protectedCurrent.items, currentProtected.items);

  const graph = buildModuleGraph(repoRoot);
  const paths = findDataflowPaths(repoRoot, graph);
  const snapshots = writeSourceSnapshots(repoRoot, outputDir, graph, paths);
  const contract = buildAdapterContract(repoRoot, ak, graph, paths, snapshots);

  const visiblePathResolved = paths.visibleKjvPaths.length > 0;
  const canonicalPathResolved = paths.canonicalAvailabilityPaths.length > 0;
  const readerEntryResolved = paths.entryPoints.includes("app/read/[book]/[chapter]/page.tsx");
  const exactKjvArtifactReached = paths.visibleKjvPaths.some((item) => /^app\/data\/scripture\/generatedKJV\.(?:json|ts|js)$/i.test(item.files.at(-1) || ""));
  const canonicalStoreReached = paths.canonicalAvailabilityPaths.some((item) => /(?:^|\/)CanonicalVerseStore\.(?:ts|tsx|js|jsx)$/i.test(item.files.at(-1) || ""));
  const allPathSourceSnapshotsCaptured = [...new Set([
    ...paths.visibleKjvPaths.flatMap((item) => item.files),
    ...paths.canonicalAvailabilityPaths.flatMap((item) => item.files),
  ])].every((file) => {
    if (/^app\/data\/scripture\/generatedKJV\.(?:json|ts|js)$/i.test(file)) return true;
    return snapshots.some((item) => item.path === file && item.copied === true);
  });

  const gates = {
    akValidFailClosedStateVerified: ak.passed,
    akManifestPassed: ak.manifest.passed,
    akRepeatedBuildArtifactsIdentical: ak.comparisons.every((item) => item.identical),
    ajStillPassesInsideAk: ak.ajVerification.passed === true,
    protectedProductionStateStillMatchesAk: protectedComparison.identical,
    readerEntryResolved,
    moduleGraphBuilt: graph.nodes.length > 0 && graph.edges.length > 0,
    visibleKjvDataflowResolved: visiblePathResolved,
    exactGeneratedKjvArtifactReached: exactKjvArtifactReached,
    canonicalAvailabilityDataflowResolved: canonicalPathResolved,
    exactCanonicalStoreReached: canonicalStoreReached,
    pathSourceSnapshotsCaptured: allPathSourceSnapshotsCaptured,
    stagingOnly: true,
    productionPromotionNotAuthorized: true,
  };

  writeJson(path.join(outputDir, "ak-independent-verification.json"), {
    reportDir: relativeFromRoot(repoRoot, ak.report.reportDir),
    summaryPath: relativeFromRoot(repoRoot, ak.report.summaryPath),
    manifest: {
      entries: ak.manifest.entries,
      passed: ak.manifest.passed,
      errors: ak.manifest.errors,
      unexpected: ak.manifest.unexpected,
      missing: ak.manifest.missing,
    },
    comparisons: ak.comparisons,
    falseCandidateGates: ak.falseCandidateGates,
    expectedFinalFalseGates: ak.expectedFinalFalseGates,
    gates: ak.gates,
    passed: ak.passed,
  });
  writeJson(path.join(outputDir, "module-graph.json"), graph);
  writeJson(path.join(outputDir, "reader-dataflow-paths.json"), paths);
  writeJson(path.join(outputDir, "source-snapshot-index.json"), snapshots);
  writeJson(path.join(outputDir, "runtime-adapter-contract.json"), contract);
  writeJson(path.join(outputDir, "protected-state-current.json"), currentProtected);
  writeJson(path.join(outputDir, "protected-state-vs-ak.json"), protectedComparison);

  const summary = {
    milestone: EXPECTED.milestone,
    schemaVersion: "p0512al-summary@1",
    purpose: "EXACT KJV READER DATAFLOW AND ADAPTER CONTRACT",
    repository,
    retainedAkReport: relativeFromRoot(repoRoot, ak.report.reportDir),
    counts: {
      runtimeCodeNodes: graph.nodes.length,
      localModuleEdges: graph.edges.filter((edge) => edge.local).length,
      unresolvedExternalOrDynamicEdges: graph.edges.filter((edge) => !edge.local).length,
      entryPoints: paths.entryPoints.length,
      visibleKjvPaths: paths.visibleKjvPaths.length,
      canonicalAvailabilityPaths: paths.canonicalAvailabilityPaths.length,
      sourceSnapshots: snapshots.filter((item) => item.copied).length,
    },
    selectedFlows: contract.exactFlows,
    gates,
    authorization: {
      safeToCreateIsolatedKjvRuntimeAdapterApplicationPreview: Object.values(gates).every(Boolean),
      safeToPromoteProductionKjv: false,
      productionPromotionPerformed: false,
    },
  };
  writeJson(path.join(outputDir, "build-summary.json"), summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!Object.values(gates).every(Boolean)) process.exitCode = 1;
}

try { main(); }
catch (error) { process.stderr.write(`${error?.stack || error}\n`); process.exitCode = 1; }
