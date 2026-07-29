#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  EXPECTED,
  fail,
  readJson,
  writeJson,
  sha256File,
  relativeFromRoot,
  parseArgs,
  gitInfo,
  snapshotPaths,
  compareSnapshots,
  compareCandidateTrees,
  verifyChecksumTree,
} = require("./p0512ao-lib");

try {
  const args = parseArgs(process.argv.slice(2));
  for (const key of ["candidate-a", "candidate-b", "report-dir", "protected-before"]) {
    if (!args[key]) fail(`--${key} is required.`);
  }
  const repoRoot = path.resolve(args["repo-root"] || process.cwd());
  const candidateA = path.resolve(args["candidate-a"]);
  const candidateB = path.resolve(args["candidate-b"]);
  const reportDir = path.resolve(args["report-dir"]);
  const protectedBefore = readJson(path.resolve(args["protected-before"]));

  const summaryA = readJson(path.join(candidateA, "build-summary.json"));
  const summaryB = readJson(path.join(candidateB, "build-summary.json"));
  const treeComparison = compareCandidateTrees(candidateA, candidateB);
  const promotionA = verifyChecksumTree(path.join(candidateA, "promotion-payload"), path.join(candidateA, "promotion-payload.sha256"));
  const promotionB = verifyChecksumTree(path.join(candidateB, "promotion-payload"), path.join(candidateB, "promotion-payload.sha256"));
  const rollbackA = verifyChecksumTree(path.join(candidateA, "rollback-payload"), path.join(candidateA, "rollback-payload.sha256"));
  const rollbackB = verifyChecksumTree(path.join(candidateB, "rollback-payload"), path.join(candidateB, "rollback-payload.sha256"));

  const protectedAfter = snapshotPaths(repoRoot);
  const protectedComparison = compareSnapshots(protectedBefore, protectedAfter);
  writeJson(path.join(reportDir, "protected-state-after.json"), protectedAfter);
  writeJson(path.join(reportDir, "protected-state-comparison.json"), protectedComparison);

  const deterministicSummary = JSON.stringify(summaryA) === JSON.stringify(summaryB);
  const expectedCounts = summaryA.counts?.promotionFiles === EXPECTED.promotionFiles &&
    summaryA.counts?.visibleCoordinates === EXPECTED.visibleCoordinates &&
    summaryA.counts?.supportedCoordinates === EXPECTED.supportedCoordinates &&
    summaryA.counts?.failClosedCoordinates === EXPECTED.failClosedCoordinates &&
    summaryA.counts?.runtimeFiles === EXPECTED.runtimeFiles &&
    summaryA.counts?.overlayFiles === EXPECTED.overlayFiles &&
    summaryA.counts?.routableVisibleTokens === EXPECTED.routableVisibleTokens &&
    summaryA.counts?.sourceTokens === EXPECTED.sourceTokens &&
    summaryA.counts?.productionToKjv2006TextChanges === EXPECTED.productionToKjv2006TextChanges;

  const gates = {
    repeatedCandidateFileSetsAndBytesIdentical: treeComparison.identical,
    repeatedBuildSummariesIdentical: deterministicSummary,
    candidateAAllGatesPassed: Object.values(summaryA.gates || {}).every(Boolean),
    candidateBAllGatesPassed: Object.values(summaryB.gates || {}).every(Boolean),
    candidateAAuthorizedForRetentionOnly: summaryA.authorization?.safeToRetainIsolatedProductionPromotionCandidate === true,
    candidateBAuthorizedForRetentionOnly: summaryB.authorization?.safeToRetainIsolatedProductionPromotionCandidate === true,
    promotionPayloadAExact: promotionA.passed,
    promotionPayloadBExact: promotionB.passed,
    rollbackPayloadAExact: rollbackA.passed,
    rollbackPayloadBExact: rollbackB.passed,
    exactCounts: expectedCounts,
    protectedProductionStateUnchanged: protectedComparison.identical,
    stagingOnly: protectedComparison.identical,
    productionPromotionNotPerformed: true,
  };

  const repository = gitInfo(repoRoot);
  const report = {
    milestone: EXPECTED.milestone,
    verifierVersion: "p0512ao-determinism-verifier@1",
    repository,
    purpose: "ISOLATED KJV2006 PRODUCTION-PROMOTION CANDIDATE",
    retainedCandidate: relativeFromRoot(repoRoot, candidateA),
    deterministicBuild: {
      independentlyRepeated: true,
      filesCompared: treeComparison.filesCompared,
      differences: treeComparison.differences,
      candidateASummarySha256: sha256File(path.join(candidateA, "build-summary.json")),
      candidateBSummarySha256: sha256File(path.join(candidateB, "build-summary.json")),
    },
    counts: summaryA.counts,
    fingerprints: summaryA.fingerprints,
    gates,
    authorization: {
      safeToRetainIsolatedProductionPromotionCandidate: Object.values(gates).every(Boolean),
      safeToCreateControlledProductionPromotionStage: Object.values(gates).every(Boolean),
      safeToPromoteProductionKjv: false,
      productionPromotionPerformed: false,
    },
    nextMilestoneContract: {
      milestone: "P05.12AP — CONTROLLED KJV2006 PRODUCTION PROMOTION AND POST-PROMOTION VERIFICATION",
      authorizedOnlyIfThisReportPasses: true,
      requiresSeparateExplicitExecution: true,
      mustRollbackAutomaticallyOnAnyPostPromotionGateFailure: true,
    },
  };
  writeJson(path.join(reportDir, "p0512ao-summary.json"), report);
  writeJson(path.join(reportDir, "candidate-comparison.json"), treeComparison);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!Object.values(gates).every(Boolean)) fail("P05.12AO verification failed closed.");
} catch (error) {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
}
