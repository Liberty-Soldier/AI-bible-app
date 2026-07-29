#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  EXPECTED,
  fail,
  ensureDir,
  readJson,
  writeJson,
  sha256File,
  relativeFromRoot,
  absoluteFromRelative,
  parseArgs,
  gitInfo,
  listFilesRecursive,
  treeFingerprint,
  snapshotPaths,
  findLatestPassingAnReport,
  compareCurrentToAnProtected,
  copyPathExact,
  writeChecksumManifest,
  verifyChecksumTree,
  validateAnCandidate,
  compareDirectoryFiles,
} = require("./p0512ao-lib");

function operationFor(target, current) {
  if (!current.exists) return "create";
  return target.type === "directory" ? "replace-directory-exact" : "replace-file-exact";
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (!args["output-dir"]) fail("--output-dir is required.");
  const repoRoot = path.resolve(args["repo-root"] || process.cwd());
  const outputDir = path.resolve(args["output-dir"]);
  ensureDir(outputDir);

  const repository = gitInfo(repoRoot);
  if (repository.branch !== "main") fail(`P05.12AO must run on main. Current branch: ${repository.branch}`);

  const source = findLatestPassingAnReport(repoRoot);
  if (source.summary?.repository?.commit !== repository.commit) {
    fail(`Repository HEAD ${repository.commit} differs from retained passing AN commit ${source.summary?.repository?.commit}.`);
  }

  const currentProtected = snapshotPaths(repoRoot);
  const productionPrecondition = compareCurrentToAnProtected(currentProtected, source.protectedAfter);
  if (!productionPrecondition.identical) {
    writeJson(path.join(outputDir, "production-precondition-failure.json"), productionPrecondition);
    fail("Current protected production state no longer matches the passing P05.12AN baseline.");
  }

  const sourceValidation = validateAnCandidate(source.stagingRoot, source.summary);
  writeJson(path.join(outputDir, "source-an-candidate-validation.json"), sourceValidation);
  if (!sourceValidation.passed) fail("The retained P05.12AN staging candidate failed AO source validation.");

  const promotionRoot = path.join(outputDir, "promotion-payload");
  const rollbackRoot = path.join(outputDir, "rollback-payload");
  ensureDir(promotionRoot);
  ensureDir(rollbackRoot);

  const currentMap = new Map(currentProtected.items.map((x) => [x.path, x]));
  const installMap = [];
  for (const target of EXPECTED.targets) {
    const sourcePath = absoluteFromRelative(source.stagingRoot, target.path);
    const promotionPath = absoluteFromRelative(promotionRoot, target.path);
    copyPathExact(sourcePath, promotionPath);

    const current = currentMap.get(target.path) || { path: target.path, exists: false };
    if (current.exists) {
      const currentPath = absoluteFromRelative(repoRoot, target.path);
      const rollbackPath = absoluteFromRelative(rollbackRoot, target.path);
      copyPathExact(currentPath, rollbackPath);
    }

    installMap.push({
      targetPath: target.path,
      targetType: target.type,
      operation: operationFor(target, current),
      currentState: current,
      promotionState: treeFingerprint(promotionPath),
      rollbackIncluded: current.exists === true,
      rollbackOperation: current.exists === true ? "restore-exact" : "delete-created-target",
    });
  }

  const promotionManifestFile = path.join(outputDir, "promotion-payload.sha256");
  const rollbackManifestFile = path.join(outputDir, "rollback-payload.sha256");
  const promotionManifestEntries = writeChecksumManifest(promotionRoot, promotionManifestFile);
  const rollbackManifestEntries = writeChecksumManifest(rollbackRoot, rollbackManifestFile);
  const promotionManifestVerification = verifyChecksumTree(promotionRoot, promotionManifestFile);
  const rollbackManifestVerification = verifyChecksumTree(rollbackRoot, rollbackManifestFile);

  const runtimeDelta = compareDirectoryFiles(
    path.join(repoRoot, "public", "scripture", "runtime", "kjv"),
    path.join(promotionRoot, "public", "scripture", "runtime", "kjv"),
  );
  const overlayCurrent = path.join(repoRoot, "public", "data", "bibleiq", "word-study-kjv-reader");
  const overlayPromotion = path.join(promotionRoot, "public", "data", "bibleiq", "word-study-kjv-reader");
  const overlayDelta = fs.existsSync(overlayCurrent)
    ? compareDirectoryFiles(overlayCurrent, overlayPromotion)
    : { identical: 0, changed: 0, added: listFilesRecursive(overlayPromotion).length, removed: 0, totalPaths: listFilesRecursive(overlayPromotion).length, samples: [] };

  const fileDeltas = [
    "app/data/scripture/generatedKJV.json",
    "app/data/scripture/generatedKJV.ts",
    "app/data/scripture/CanonicalVerseStore.ts",
  ].map((rel) => {
    const before = treeFingerprint(absoluteFromRelative(repoRoot, rel));
    const after = treeFingerprint(absoluteFromRelative(promotionRoot, rel));
    return { path: rel, changed: JSON.stringify(before) !== JSON.stringify(after), before, after };
  });

  const targetDiff = {
    files: fileDeltas,
    runtimeDirectory: runtimeDelta,
    readerRouteOverlayDirectory: overlayDelta,
  };
  writeJson(path.join(outputDir, "target-diff-summary.json"), targetDiff);
  writeJson(path.join(outputDir, "install-map.json"), installMap);

  const promotionPlan = {
    milestone: EXPECTED.milestone,
    planOnly: true,
    productionWritesPerformed: false,
    controlledPromotionRequiredInSeparateStage: true,
    preconditions: [
      "Run on main at the exact retained P05.12AN commit.",
      "Recompute and match every current production precondition hash in install-map.json.",
      "Create a timestamped rollback backup before changing any target.",
      "Verify every staged payload hash before installation.",
    ],
    installationOrder: [
      "Stage all five target roots beside production without altering production.",
      "Verify the staged copy against promotion-payload.sha256.",
      "Replace generatedKJV.json and generatedKJV.ts as a matched pair.",
      "Replace public/scripture/runtime/kjv as an exact directory, never merge.",
      "Create public/data/bibleiq/word-study-kjv-reader as an exact directory, never merge.",
      "Replace CanonicalVerseStore.ts last so the adapter cannot point at an incomplete overlay.",
      "Run post-promotion KJV, WEB, Brenton, route, runtime-parity, build, and protected-state gates.",
      "On any failure, restore the rollback payload and delete targets that were absent before promotion.",
    ],
    explicitNonTargets: [
      "WEB visible text and runtime",
      "Brenton visible text and runtime",
      "live canonical source data",
      "alignment data",
      "existing source-token word-study runtime",
      "ReaderVerseAdapter",
      "runtime splitter",
    ],
  };
  writeJson(path.join(outputDir, "promotion-plan.json"), promotionPlan);

  const afterBuildProtected = snapshotPaths(repoRoot);
  const stagingOnlyComparison = {
    identical: JSON.stringify(currentProtected) === JSON.stringify(afterBuildProtected),
    before: currentProtected,
    after: afterBuildProtected,
  };
  if (!stagingOnlyComparison.identical) {
    writeJson(path.join(outputDir, "staging-only-failure.json"), stagingOnlyComparison);
    fail("Building the promotion candidate changed protected production state.");
  }

  const gates = {
    sourceAnManifestPassed: source.manifest.passed,
    sourceAnSummaryPassed: sourceValidation.gates.exactSourceSummaryCounts,
    sourceAnCandidatePassed: sourceValidation.passed,
    exactRepositoryCommit: source.summary.repository.commit === repository.commit,
    exactProductionPreconditions: productionPrecondition.identical,
    promotionPayloadExact: promotionManifestVerification.passed,
    rollbackPayloadExact: rollbackManifestVerification.passed,
    exactPromotionFileCount: promotionManifestEntries === EXPECTED.promotionFiles,
    exactRuntimeFileCount: sourceValidation.counts.runtimeFiles === EXPECTED.runtimeFiles,
    exactOverlayFileCount: sourceValidation.counts.overlayFiles === EXPECTED.overlayFiles,
    rollbackCoversEveryExistingTarget: installMap.every((x) => x.currentState.exists ? x.rollbackIncluded : x.rollbackOperation === "delete-created-target"),
    onlyFiveProductionTargetRoots: installMap.length === EXPECTED.targets.length,
    stagingOnly: stagingOnlyComparison.identical,
    productionPromotionNotPerformed: true,
  };

  const buildSummary = {
    milestone: EXPECTED.milestone,
    builderVersion: "p0512ao-promotion-candidate-builder@1",
    purpose: "ISOLATED KJV2006 PRODUCTION-PROMOTION CANDIDATE",
    repository,
    sourceAn: {
      reportDir: relativeFromRoot(repoRoot, source.reportDir),
      summarySha256: sha256File(source.summaryFile),
      reportManifestEntries: source.manifest.entries,
      retainedCandidate: relativeFromRoot(repoRoot, source.retainedCandidate),
      stagingCandidateFingerprint: sourceValidation.fingerprints.stagingTree,
    },
    counts: {
      promotionTargetRoots: installMap.length,
      promotionFiles: promotionManifestEntries,
      rollbackFiles: rollbackManifestEntries,
      visibleCoordinates: sourceValidation.counts.visibleCoordinates,
      supportedCoordinates: sourceValidation.counts.supportedCoordinates,
      failClosedCoordinates: sourceValidation.counts.failClosedCoordinates,
      runtimeFiles: sourceValidation.counts.runtimeFiles,
      overlayFiles: sourceValidation.counts.overlayFiles,
      routableVisibleTokens: source.summary.counts.routableVisibleTokens,
      sourceTokens: source.summary.counts.sourceTokens,
      productionToKjv2006TextChanges: source.summary.counts.productionToKjv2006TextChanges,
    },
    fingerprints: {
      promotionPayload: treeFingerprint(promotionRoot),
      rollbackPayload: treeFingerprint(rollbackRoot),
      promotionManifestSha256: sha256File(promotionManifestFile),
      rollbackManifestSha256: sha256File(rollbackManifestFile),
    },
    gates,
    authorization: {
      safeToRetainIsolatedProductionPromotionCandidate: Object.values(gates).every(Boolean),
      safeToCreateControlledProductionPromotionStage: Object.values(gates).every(Boolean),
      safeToPromoteProductionKjv: false,
      productionPromotionPerformed: false,
    },
  };
  writeJson(path.join(outputDir, "build-summary.json"), buildSummary);
  process.stdout.write(`${JSON.stringify(buildSummary, null, 2)}\n`);
  if (!Object.values(gates).every(Boolean)) fail("One or more P05.12AO candidate gates failed.");
} catch (error) {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
}
