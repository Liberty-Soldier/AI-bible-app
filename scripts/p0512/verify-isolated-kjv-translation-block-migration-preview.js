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
  compareProtectedStates,
  snapshotProtectedState,
  gitInfo,
  relativeFromRoot,
} = require("./p0512aj-lib");

function sameBytes(a, b) {
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

function hashObject(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args["repo-root"] || process.cwd());
  const candidateA = path.resolve(args["candidate-a"] || "");
  const candidateB = path.resolve(args["candidate-b"] || "");
  const beforePath = path.resolve(args["protected-before"] || "");
  const reportDir = path.resolve(args["report-dir"] || "");
  if (!args["candidate-a"] || !args["candidate-b"] || !args["protected-before"] || !args["report-dir"]) {
    fail("--candidate-a, --candidate-b, --protected-before, and --report-dir are required.");
  }

  const comparedFiles = [
    "kjv-translation-blocks.json",
    "kjv-translation-block-topology.json",
    "kjv-translation-block-validation.json",
    "build-summary.json",
  ];
  const fileComparisons = comparedFiles.map((name) => {
    const a = path.join(candidateA, name);
    const b = path.join(candidateB, name);
    if (!fs.existsSync(a) || !fs.existsSync(b)) fail(`Missing repeated-build artifact: ${name}`);
    return {
      file: name,
      identical: sameBytes(a, b),
      candidateASha256: sha256File(a),
      candidateBSha256: sha256File(b),
    };
  });

  const summaryA = readJson(path.join(candidateA, "build-summary.json"));
  const summaryB = readJson(path.join(candidateB, "build-summary.json"));
  const validationA = readJson(path.join(candidateA, "kjv-translation-block-validation.json"));
  const validationB = readJson(path.join(candidateB, "kjv-translation-block-validation.json"));
  const blocksA = readJson(path.join(candidateA, "kjv-translation-blocks.json"));
  const topologyA = readJson(path.join(candidateA, "kjv-translation-block-topology.json"));

  const protectedBefore = readJson(beforePath);
  const protectedAfter = {
    milestone: EXPECTED.milestone,
    generatedAtUtc: new Date().toISOString(),
    repository: gitInfo(repoRoot),
    ...snapshotProtectedState(repoRoot),
  };
  const protectedAfterPath = path.join(reportDir, "protected-state-after.json");
  writeJson(protectedAfterPath, protectedAfter);
  const protectedComparison = compareProtectedStates(protectedBefore, protectedAfter);
  writeJson(path.join(reportDir, "protected-state-comparison.json"), protectedComparison);

  const unsupported = blocksA.filter((x) => x.readerOnly);
  const supported = blocksA.filter((x) => !x.readerOnly);
  const multiSourceReaders = blocksA.filter((x) => x.topology?.manySourceToOneReader);

  const gates = {
    repeatedBuildArtifactsByteIdentical: fileComparisons.every((x) => x.identical),
    repeatedBuildSummariesIdentical: hashObject(summaryA) === hashObject(summaryB),
    repeatedBuildValidationsIdentical: hashObject(validationA) === hashObject(validationB),
    allCandidateAGatesPassed: Object.values(summaryA.gates || {}).every(Boolean),
    allCandidateBGatesPassed: Object.values(summaryB.gates || {}).every(Boolean),
    candidateAValidationHasZeroErrors: Number(summaryA.validationErrorCount || 0) === 0,
    candidateBValidationHasZeroErrors: Number(summaryB.validationErrorCount || 0) === 0,
    visibleCoordinatesExact: blocksA.length === EXPECTED.readerCoordinates,
    supportedCoordinatesExact: supported.length === EXPECTED.mappedReaderCoordinates,
    readerOnlyFailClosedCoordinatesExact:
      unsupported.length === EXPECTED.unsupportedReaderCoordinates &&
      unsupported.every((x) => x.failClosed && x.sourceRoutes.length === 0),
    oneSourceToManyTopologyExplicit:
      Array.isArray(topologyA.multiTargetSources) &&
      topologyA.multiTargetSources.length === EXPECTED.multiTargetSourceCoordinates &&
      topologyA.multiTargetSources.every((source) =>
        Array.isArray(source.readerTargets) && source.readerTargets.length > 1
      ),
    manySourceToOneTopologyExplicit: multiSourceReaders.length === EXPECTED.multiSourceReaderCoordinates,
    protectedProductionStateUnchanged: protectedComparison.identical,
    stagingOnly: summaryA.stagingOnly === true && summaryB.stagingOnly === true,
    productionPromotionNotAuthorized:
      summaryA.safeToPromoteProductionKjv === false && summaryB.safeToPromoteProductionKjv === false,
  };

  const productionPaths = new Map((protectedComparison.changes || []).map((x) => [x.path, x]));
  const production = {
    kjvModified: [...productionPaths.keys()].some((p) => p.includes("generatedKJV")),
    webModified: [...productionPaths.keys()].some((p) => p.includes("generatedWEB")),
    brentonModified: [...productionPaths.keys()].some((p) => p.includes("generatedBrenton")),
    liveCanonicalModified: [...productionPaths.keys()].some((p) =>
      p === ".private/scripture/canonical" || p === "app/data/bibleiq/canonical"
    ),
    alignmentsModified: [...productionPaths.keys()].some((p) => p === ".private/alignment"),
  };

  const repository = gitInfo(repoRoot);
  const summary = {
    milestone: EXPECTED.milestone,
    generatedAtUtc: new Date().toISOString(),
    repository,
    purpose: "ISOLATED KJV TRANSLATION-BLOCK MIGRATION PREVIEW",
    retainedCandidate: relativeFromRoot(repoRoot, candidateA),
    inputs: summaryA.inputs,
    deterministicBuild: {
      independentlyRepeated: true,
      fileComparisons,
      primaryTreeSha256: crypto
        .createHash("sha256")
        .update(fileComparisons.map((x) => `${x.file}\0${x.candidateASha256}\n`).join(""))
        .digest("hex"),
    },
    totals: summaryA.totals,
    topology: summaryA.topology,
    routeGates: {
      p0510SourceOwnershipGate: summaryA.gates?.p0510SourceOwnershipGate === true,
      p0511AlignedRouteGate: summaryA.gates?.p0511AlignedRouteGate === true,
      p0511ReaderOnlyFailClosedGate: summaryA.gates?.p0511ReaderOnlyFailClosedGate === true,
      p0511TappabilityClassificationGate:
        summaryA.gates?.p0511TappabilityClassificationGate === true,
    },
    production,
    gates,
    authorization: {
      safeToRetainStagedKjvTranslationBlocks: Object.values(gates).every(Boolean),
      safeToPromoteProductionKjv: false,
      productionPromotionPerformed: false,
    },
  };
  writeJson(path.join(reportDir, "p0512aj-summary.json"), summary);

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!Object.values(gates).every(Boolean)) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
}
