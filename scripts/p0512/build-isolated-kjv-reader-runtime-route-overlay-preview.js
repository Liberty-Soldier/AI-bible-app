#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  EXPECTED, fail, ensureDir, readJson, writeJson, sha256File, relativeFromRoot,
  parseArgs, gitInfo, treeFingerprint, verifyAj, verifyAmDiagnostic,
  mapRows, mapAjBlocks, buildStagedKjv, copyFile, removeIfExists,
  runExactSplitter, inventoryRuntime, compareTextMaps, locateWordStudyRuntime,
  collectNeededSourceIds, resolveSourceTokens, buildRouteOverlay, validateOverlay,
  buildGeneratedTsCandidate, patchCanonicalStore, transpileCheck, executeReaderAdapter,
  writeDiff,
} = require("./p0512an-lib");

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

  const aj = verifyAj(repoRoot);
  if (!aj.passed) fail(`Retained AJ failed independent verification: ${JSON.stringify(aj.gates)}`);
  const am = verifyAmDiagnostic(repoRoot);
  if (!am.passed) fail(`Retained AM does not match the verified fail-closed diagnostic signature: ${JSON.stringify(am.gates)}`);

  const blocks = readJson(aj.blocksPath);
  const ajIndex = mapAjBlocks(blocks);
  if (ajIndex.blocks !== EXPECTED.visibleCoordinates || ajIndex.map.size !== EXPECTED.visibleCoordinates || ajIndex.duplicates.length || ajIndex.malformed.length) fail("AJ blocks are not an exact unique 31,102-coordinate set.");

  const productionJsonPath = path.join(repoRoot, "app", "data", "scripture", "generatedKJV.json");
  const productionDoc = readJson(productionJsonPath);
  const productionIndex = mapRows(productionDoc);
  if (productionIndex.rows !== EXPECTED.visibleCoordinates || productionIndex.map.size !== EXPECTED.visibleCoordinates || productionIndex.duplicates.length || productionIndex.malformed.length) fail("Production generatedKJV is not an exact unique 31,102-coordinate set.");

  const staged = buildStagedKjv(productionDoc, blocks);
  if (staged.textChanges.length !== EXPECTED.productionToKjv2006TextChanges) fail(`Expected ${EXPECTED.productionToKjv2006TextChanges} KJV2006 visible-text changes; found ${staged.textChanges.length}.`);
  if (staged.metadataChanges.length) fail(`Fields outside visible text and tokenAvailabilityKey changed at ${staged.metadataChanges.slice(0, 10).join(", ")}`);
  if (staged.supportedKeys !== EXPECTED.supportedCoordinates || staged.failClosedKeys !== EXPECTED.failClosedCoordinates) fail("Explicit tokenAvailabilityKey classification count mismatch.");

  const candidateRoot = path.join(outputDir, "staging-candidate");
  removeIfExists(candidateRoot); ensureDir(candidateRoot);
  const stagedScriptureDir = path.join(candidateRoot, "app", "data", "scripture");
  ensureDir(stagedScriptureDir);
  const stagedJsonPath = path.join(stagedScriptureDir, "generatedKJV.json");
  writeJson(stagedJsonPath, staged.document, 0);
  const stagedTsPath = path.join(stagedScriptureDir, "generatedKJV.ts");
  const tsCandidate = buildGeneratedTsCandidate(repoRoot, staged.document, stagedTsPath);

  const workRoot = path.join(outputDir, ".splitter-work");
  removeIfExists(workRoot);
  ensureDir(path.join(workRoot, "app", "data", "scripture"));
  copyFile(stagedJsonPath, path.join(workRoot, "app", "data", "scripture", "generatedKJV.json"));
  copyFile(path.join(repoRoot, "app", "data", "scripture", "generatedWEB.json"), path.join(workRoot, "app", "data", "scripture", "generatedWEB.json"));
  copyFile(path.join(repoRoot, "app", "data", "scripture", "generatedBrenton.json"), path.join(workRoot, "app", "data", "scripture", "generatedBrenton.json"));
  runExactSplitter(repoRoot, workRoot, path.join(outputDir, "splitter.stdout.log"), path.join(outputDir, "splitter.stderr.log"));

  const stagedRuntimeRoot = path.join(candidateRoot, "public", "scripture", "runtime", "kjv");
  ensureDir(path.dirname(stagedRuntimeRoot));
  fs.renameSync(path.join(workRoot, "public", "scripture", "runtime", "kjv"), stagedRuntimeRoot);
  const workWeb = treeFingerprint(path.join(workRoot, "public", "scripture", "runtime", "web"));
  const workBrenton = treeFingerprint(path.join(workRoot, "public", "scripture", "runtime", "brenton"));
  const productionWeb = treeFingerprint(path.join(repoRoot, "public", "scripture", "runtime", "web"));
  const productionBrenton = treeFingerprint(path.join(repoRoot, "public", "scripture", "runtime", "brenton"));
  removeIfExists(workRoot);

  const runtime = inventoryRuntime(stagedRuntimeRoot);
  const stagedIndex = mapRows(staged.document);
  const runtimeVsStaged = compareTextMaps(runtime.map, stagedIndex.map);
  if (runtime.files !== EXPECTED.runtimeChapterFiles || runtime.map.size !== EXPECTED.visibleCoordinates || runtime.duplicates.length || runtime.malformed.length || !runtimeVsStaged.identical) fail("Exact splitter did not produce an exact 31,102-coordinate KJV2006 runtime.");

  const runtimeTokenKeys = { supported: 0, failClosed: 0, invalid: [] };
  for (const [key, row] of runtime.map) {
    const block = ajIndex.map.get(key);
    const actual = Object.prototype.hasOwnProperty.call(row, "tokenAvailabilityKey") ? row.tokenAvailabilityKey : undefined;
    if (block.failClosed) {
      if (actual === null) runtimeTokenKeys.failClosed += 1;
      else runtimeTokenKeys.invalid.push({ coordinate: key, expected: null, actual });
    } else {
      if (actual === String(block.verse)) runtimeTokenKeys.supported += 1;
      else runtimeTokenKeys.invalid.push({ coordinate: key, expected: String(block.verse), actual });
    }
  }
  if (runtimeTokenKeys.supported !== EXPECTED.supportedCoordinates || runtimeTokenKeys.failClosed !== EXPECTED.failClosedCoordinates || runtimeTokenKeys.invalid.length) fail("Staged runtime tokenAvailabilityKey classification is not exact.");

  const sourceRuntimeRoot = locateWordStudyRuntime(repoRoot);
  const neededIds = collectNeededSourceIds(blocks);
  if (neededIds.length !== EXPECTED.sourceTokens || new Set(neededIds).size !== EXPECTED.sourceTokens) fail("AJ source-token inventory is not exact and unique.");
  const resolution = resolveSourceTokens(sourceRuntimeRoot, neededIds);
  if (resolution.missing.length || resolution.conflicts.length || resolution.found.size !== EXPECTED.sourceTokens) fail(`Source-token resolution failed: missing=${resolution.missing.length}, conflicts=${resolution.conflicts.length}, found=${resolution.found.size}`);

  const overlayRoot = path.join(candidateRoot, "public", "data", "bibleiq", "word-study-kjv-reader");
  const overlay = buildRouteOverlay(blocks, resolution.found, overlayRoot);
  const overlayValidation = validateOverlay(blocks, overlayRoot, resolution.found);
  const overlayActual = {
    books: overlay.books,
    overlaySourceTokens: overlay.overlaySourceTokens,
    ajAlignedVisibleTokens: overlay.ajAlignedVisibleTokens,
    routableMappings: overlay.routableMappings,
    nonTappableTokens: overlay.nonTappableTokens,
    sourceTokensWithEntityId: overlay.sourceTokensWithEntityId,
    sourceTokensWithoutEntityId: overlay.sourceTokensWithoutEntityId,
    suppressedMissingEntityRoutes: overlay.suppressedMissingEntityRoutes,
    blocksChecked: overlayValidation.blocksChecked,
    visibleTokensChecked: overlayValidation.visibleTokensChecked,
    alignedChecked: overlayValidation.alignedChecked,
    routableChecked: overlayValidation.routableChecked,
    nonTappableChecked: overlayValidation.nonTappableChecked,
    failClosedChecked: overlayValidation.failClosedChecked,
    sourceTuplesChecked: overlayValidation.sourceTuplesChecked,
    exactSourceTuplesChecked: overlayValidation.exactSourceTuplesChecked,
    sourceTokensWithEntityIdChecked: overlayValidation.sourceTokensWithEntityId,
    sourceTokensWithoutEntityIdChecked: overlayValidation.sourceTokensWithoutEntityId,
    suppressedMissingEntityChecked: overlayValidation.suppressedMissingEntityChecked,
    validationErrors: overlayValidation.errors.length,
  };
  const overlayExpected = {
    books: EXPECTED.sourceOwnedBooks,
    overlaySourceTokens: EXPECTED.sourceTokens,
    ajAlignedVisibleTokens: EXPECTED.alignedVisibleTokens,
    routableMappings: EXPECTED.routableVisibleTokens,
    nonTappableTokens: EXPECTED.nonTappableVisibleTokens,
    sourceTokensWithEntityId: EXPECTED.sourceTokensWithEntityId,
    sourceTokensWithoutEntityId: EXPECTED.sourceTokensWithoutEntityId,
    suppressedMissingEntityRoutes: EXPECTED.suppressedAlignedRoutesMissingEntity,
    blocksChecked: EXPECTED.visibleCoordinates,
    visibleTokensChecked: EXPECTED.visibleTokens,
    alignedChecked: EXPECTED.alignedVisibleTokens,
    routableChecked: EXPECTED.routableVisibleTokens,
    nonTappableChecked: EXPECTED.nonTappableVisibleTokens,
    failClosedChecked: EXPECTED.failClosedCoordinates,
    sourceTuplesChecked: EXPECTED.sourceTokens,
    exactSourceTuplesChecked: EXPECTED.sourceTokens,
    sourceTokensWithEntityIdChecked: EXPECTED.sourceTokensWithEntityId,
    sourceTokensWithoutEntityIdChecked: EXPECTED.sourceTokensWithoutEntityId,
    suppressedMissingEntityChecked: EXPECTED.suppressedAlignedRoutesMissingEntity,
    validationErrors: 0,
  };
  const overlayGateFailures = Object.keys(overlayExpected)
    .filter((key) => overlayActual[key] !== overlayExpected[key])
    .map((key) => ({ gate: key, expected: overlayExpected[key], actual: overlayActual[key] }));
  writeJson(path.join(outputDir, "route-overlay-build.json"), overlay, 2);
  writeJson(path.join(outputDir, "route-overlay-validation.json"), overlayValidation, 2);
  writeJson(path.join(outputDir, "route-overlay-gate-diagnostic.json"), {
    validatorVersion: overlayValidation.validatorVersion,
    policy: overlayValidation.policy,
    expected: overlayExpected,
    actual: overlayActual,
    failures: overlayGateFailures,
    errorReasonCounts: overlayValidation.errorReasonCounts,
    firstErrors: overlayValidation.errors.slice(0, 200),
  }, 2);
  writeJson(path.join(outputDir, "source-token-resolution.json"), { required: neededIds.length, uniqueRequired: new Set(neededIds).size, resolved: resolution.found.size, missing: resolution.missing, conflicts: resolution.conflicts, scannedFiles: resolution.scannedFiles }, 2);
  if (overlayGateFailures.length) fail(`KJV reader route overlay validation failed: ${JSON.stringify({ failures: overlayGateFailures, errorReasonCounts: overlayValidation.errorReasonCounts, firstErrors: overlayValidation.errors.slice(0, 10) })}`);

  const stagedCanonicalStore = path.join(candidateRoot, "app", "data", "scripture", "CanonicalVerseStore.ts");
  const canonicalPatch = patchCanonicalStore(repoRoot, stagedCanonicalStore);
  const canonicalTranspile = transpileCheck(repoRoot, stagedCanonicalStore, false);
  if (!canonicalTranspile.passed) fail(`Staged CanonicalVerseStore syntax check failed: ${canonicalTranspile.diagnostics.join(" | ")}`);
  const canonicalPatchFile = path.join(outputDir, "CanonicalVerseStore.patch");
  writeDiff(repoRoot, path.join(repoRoot, "app", "data", "scripture", "CanonicalVerseStore.ts"), stagedCanonicalStore, canonicalPatchFile);

  const adapterFile = path.join(repoRoot, "app", "data", "scripture", "ReaderVerseAdapter.ts");
  if (sha256File(adapterFile) !== EXPECTED.readerAdapterSha256) fail("ReaderVerseAdapter changed since the retained dataflow contract.");
  const readerExecution = executeReaderAdapter(repoRoot, adapterFile, stagedRuntimeRoot);
  if (readerExecution.verses !== EXPECTED.visibleCoordinates || readerExecution.supported !== EXPECTED.supportedCoordinates || readerExecution.failClosed !== EXPECTED.failClosedCoordinates || readerExecution.errors.length) fail("Actual ReaderVerseAdapter did not normalize staged KJV runtime exactly.");

  const currentHashes = {
    splitter: sha256File(path.join(repoRoot, "scripts", "split-scripture-runtime.js")),
    readerAdapter: sha256File(adapterFile),
    canonicalStore: sha256File(path.join(repoRoot, "app", "data", "scripture", "CanonicalVerseStore.ts")),
    readerPage: sha256File(path.join(repoRoot, "app", "read", "[book]", "[chapter]", "page.tsx")),
    verseConsumer: sha256File(path.join(repoRoot, "app", "components", "VerseActionController.tsx")),
  };
  const consumerHashesExact = currentHashes.splitter === EXPECTED.splitterSha256 && currentHashes.readerAdapter === EXPECTED.readerAdapterSha256 && currentHashes.canonicalStore === EXPECTED.canonicalStoreSha256 && currentHashes.readerPage === EXPECTED.readerPageSha256 && currentHashes.verseConsumer === EXPECTED.verseConsumerSha256;
  if (!consumerHashesExact) fail(`Reader consumer hash drift: ${JSON.stringify(currentHashes)}`);

  const gates = {
    retainedAjPassVerified: aj.passed,
    retainedAmValidFailClosedDiagnosticVerified: am.passed,
    productionKjvCoordinatesExact: productionIndex.map.size === EXPECTED.visibleCoordinates,
    productionToKjv2006DeltaExact: staged.textChanges.length === EXPECTED.productionToKjv2006TextChanges,
    onlyVisibleTextAndTokenAvailabilityKeyChanged: staged.metadataChanges.length === 0,
    stagedKjv2006CoordinatesExact: stagedIndex.map.size === EXPECTED.visibleCoordinates,
    exactSplitterExecutedUnmodified: currentHashes.splitter === EXPECTED.splitterSha256,
    stagedRuntimeChapterFilesExact: runtime.files === EXPECTED.runtimeChapterFiles,
    stagedRuntimeCoordinatesExact: runtime.map.size === EXPECTED.visibleCoordinates,
    stagedRuntimeExactToKjv2006: runtimeVsStaged.identical,
    stagedRuntimeParsedWithoutErrors: runtime.malformed.length === 0,
    stagedRuntimeNoDuplicateCoordinates: runtime.duplicates.length === 0,
    supportedTokenKeysExact: runtimeTokenKeys.supported === EXPECTED.supportedCoordinates,
    failClosedTokenKeysExact: runtimeTokenKeys.failClosed === EXPECTED.failClosedCoordinates,
    allAjSourceTokensResolvedFromExistingRuntime: resolution.found.size === EXPECTED.sourceTokens && resolution.missing.length === 0 && resolution.conflicts.length === 0,
    overlayBooksExact: overlay.books === EXPECTED.sourceOwnedBooks,
    overlaySourceTokensExact: overlay.overlaySourceTokens === EXPECTED.sourceTokens,
    overlayAjAlignmentInventoryExact: overlay.ajAlignedVisibleTokens === EXPECTED.alignedVisibleTokens,
    overlayRoutableMappingsExact: overlay.routableMappings === EXPECTED.routableVisibleTokens,
    overlayNonTappableTokensExact: overlay.nonTappableTokens === EXPECTED.nonTappableVisibleTokens,
    overlayMissingEntityInventoryExact: overlay.sourceTokensWithoutEntityId === EXPECTED.sourceTokensWithoutEntityId && overlay.sourceTokensWithEntityId === EXPECTED.sourceTokensWithEntityId,
    overlayMissingEntityRouteFailsClosed: overlay.suppressedMissingEntityRoutes === EXPECTED.suppressedAlignedRoutesMissingEntity,
    overlayRoutesPreserveAjAndFailClosedUnsupportedEntities: overlayValidation.errors.length === 0,
    overlayFailClosedCoordinatesExact: overlayValidation.failClosedChecked === EXPECTED.failClosedCoordinates,
    actualReaderAdapterNormalizesAllCoordinates: readerExecution.verses === EXPECTED.visibleCoordinates,
    actualReaderAdapterPreservesSupportedAndFailClosedKeys: readerExecution.supported === EXPECTED.supportedCoordinates && readerExecution.failClosed === EXPECTED.failClosedCoordinates,
    canonicalStorePatchSyntaxValid: canonicalTranspile.passed,
    exactConsumerSourcesUnchangedAndPinned: consumerHashesExact,
    stagedWebRegenerationExactToProduction: JSON.stringify(workWeb) === JSON.stringify(productionWeb),
    stagedBrentonRegenerationExactToProduction: JSON.stringify(workBrenton) === JSON.stringify(productionBrenton),
    stagingOnly: true,
    productionPromotionNotAuthorized: true,
  };

  const summary = {
    milestone: EXPECTED.milestone,
    schemaVersion: "p0512an-build-summary@3",
    purpose: "ISOLATED KJV2006 READER-RUNTIME AND ROUTE-OVERLAY APPLICATION PREVIEW",
    repository,
    retainedInputs: {
      p0512aj: { report: relativeFromRoot(repoRoot, aj.reportDir), blocks: relativeFromRoot(repoRoot, aj.blocksPath), blocksSha256: sha256File(aj.blocksPath) },
      p0512am: { report: relativeFromRoot(repoRoot, am.reportDir), status: "valid-fail-closed-diagnostic", verifierDefects: ["runtime text was read from a nonexistent top-level field instead of sources[0].text", "the 3,865 production-to-KJV2006 differences were incorrectly treated as a parity failure", "splitter output was searched as a literal instead of executed"] },
    },
    productionBaseline: {
      generatedKjvSha256: sha256File(productionJsonPath),
      coordinates: productionIndex.map.size,
      visibleTextChangesRequiredForKjv2006: staged.textChanges.length,
    },
    stagedKjv: {
      generatedJson: { path: "staging-candidate/app/data/scripture/generatedKJV.json", sha256: sha256File(stagedJsonPath), bytes: fs.statSync(stagedJsonPath).size },
      generatedTs: { path: "staging-candidate/app/data/scripture/generatedKJV.ts", sha256: sha256File(stagedTsPath), bytes: fs.statSync(stagedTsPath).size, wrapper: tsCandidate },
      runtime: { path: "staging-candidate/public/scripture/runtime/kjv", files: runtime.files, coordinates: runtime.map.size, tree: runtime.tree },
      explicitTokenAvailabilityKeys: runtimeTokenKeys,
    },
    routeOverlay: {
      path: "staging-candidate/public/data/bibleiq/word-study-kjv-reader",
      sourceRuntime: relativeFromRoot(repoRoot, sourceRuntimeRoot),
      sourceResolution: { required: neededIds.length, resolved: resolution.found.size, missing: resolution.missing, conflicts: resolution.conflicts, filesContributing: resolution.scannedFiles },
      build: overlay,
      validation: overlayValidation,
    },
    stagedAdapter: {
      canonicalVerseStore: { path: "staging-candidate/app/data/scripture/CanonicalVerseStore.ts", ...canonicalPatch, transpile: canonicalTranspile, patchFile: "CanonicalVerseStore.patch" },
      actualReaderAdapterExecution: readerExecution,
      currentConsumerHashes: currentHashes,
    },
    topology: aj.summary.topology,
    counts: {
      visibleCoordinates: EXPECTED.visibleCoordinates,
      supportedCoordinates: EXPECTED.supportedCoordinates,
      failClosedCoordinates: EXPECTED.failClosedCoordinates,
      visibleTokens: EXPECTED.visibleTokens,
      ajAlignedVisibleTokens: EXPECTED.alignedVisibleTokens,
      routableVisibleTokens: EXPECTED.routableVisibleTokens,
      nonTappableVisibleTokens: EXPECTED.nonTappableVisibleTokens,
      sourceTokensWithEntityId: EXPECTED.sourceTokensWithEntityId,
      sourceTokensWithoutEntityId: EXPECTED.sourceTokensWithoutEntityId,
      suppressedAlignedRoutesMissingEntity: EXPECTED.suppressedAlignedRoutesMissingEntity,
      sourceTokens: EXPECTED.sourceTokens,
      sourceRouteEdges: EXPECTED.sourceRouteEdges,
      productionToKjv2006TextChanges: staged.textChanges.length,
      supportedCoordinatesWithZeroRoutableVisibleTokens: overlay.supportedZeroRoutable,
    },
    protectedNonKjvRegeneration: { web: { staged: workWeb, production: productionWeb }, brenton: { staged: workBrenton, production: productionBrenton } },
    gates,
    authorization: {
      safeToRetainIsolatedKjvReaderRuntimeAndRouteOverlayPreview: Object.values(gates).every(Boolean),
      safeToPromoteProductionKjv: false,
      productionPromotionPerformed: false,
    },
  };

  writeJson(path.join(outputDir, "build-summary.json"), summary);
  writeJson(path.join(outputDir, "production-to-kjv2006-text-changes.json"), staged.textChanges, 0);
  writeJson(path.join(outputDir, "runtime-validation.json"), { runtimeFiles: runtime.files, runtimeCoordinates: runtime.map.size, duplicates: runtime.duplicates, malformed: runtime.malformed, runtimeVsStaged, tokenAvailabilityKeys: runtimeTokenKeys }, 2);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!Object.values(gates).every(Boolean)) process.exitCode = 1;
}

try { main(); }
catch (error) { process.stderr.write(`${error?.stack || error}\n`); process.exitCode = 1; }
