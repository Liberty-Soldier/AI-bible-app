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
  verifyAl,
  verifyAj,
  snapshotItems,
  compareItems,
  extractGeneratedKjv,
  extractAjBlocks,
  compareVisibleMaps,
  resolveDynamicReaderFlow,
  inventoryPublicRuntime,
  writeSnapshots,
} = require("./p0512am-lib");

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

  const al = verifyAl(repoRoot);
  if (!al.passed) fail(`Retained P05.12AL is not the expected valid fail-closed result: ${JSON.stringify(al.gates)}`);
  const aj = verifyAj(repoRoot);
  if (!aj.passed) fail(`Retained P05.12AJ no longer passes: ${JSON.stringify(aj.gates)}`);

  const currentProtected = { items: snapshotItems(repoRoot, al.protectedCurrent.items) };
  const protectedComparison = compareItems(al.protectedCurrent.items, currentProtected.items);

  const generated = extractGeneratedKjv(repoRoot);
  const ajBlocks = extractAjBlocks(aj.blocksPath);
  const generatedVsAj = compareVisibleMaps(generated, ajBlocks);
  const flow = resolveDynamicReaderFlow(repoRoot);
  const runtime = inventoryPublicRuntime(repoRoot, generated);
  const snapshots = writeSnapshots(repoRoot, outputDir);

  const runtimeTextComparison = runtime.coordinateTextComparison;
  const allFlowEvidence = Object.values(flow.evidence).every(Boolean);
  const allSnapshotsCopied = snapshots.every((item) => item.copied === true);

  const gates = {
    retainedAlValidFailClosedVerified: al.passed,
    retainedAjPassVerified: aj.passed,
    protectedProductionStateStillMatchesAl: protectedComparison.identical,
    exactRequiredRuntimeFilesPresent: flow.missing.length === 0,
    dynamicReaderFetchResolved: flow.evidence.pageFetchesRuntimeTemplate === true,
    readerAdapterResolved: flow.evidence.pageImportsAdapter === true && flow.evidence.adapterExportsNormalizer === true,
    visibleVerseConsumerResolved: flow.evidence.pagePassesVersesToConsumer === true && flow.evidence.consumerAcceptsVerses === true,
    splitterResolved: flow.evidence.splitterReferencesGeneratedKjv === true && flow.evidence.splitterReferencesRuntimeOutput === true,
    prebuildRunsSplitter: flow.evidence.prebuildRunsSplitter === true,
    generatedKjvCoordinateCountExact: generated.rows === EXPECTED.visibleCoordinates && generated.map.size === EXPECTED.visibleCoordinates,
    generatedKjvHasNoDuplicates: generated.duplicates.length === 0,
    generatedKjvHasNoMalformedRows: generated.malformed.length === 0,
    ajBlockCoordinateCountExact: ajBlocks.blocks === EXPECTED.visibleCoordinates && ajBlocks.map.size === EXPECTED.visibleCoordinates,
    ajBlocksHaveNoDuplicates: ajBlocks.duplicates.length === 0,
    ajBlocksHaveNoMalformedRows: ajBlocks.malformed.length === 0,
    generatedKjvExactToAjVisibleText: generatedVsAj.identical === true,
    publicRuntimeChapterFileSetExact: runtime.missingFiles.length === 0 && runtime.unexpectedFiles.length === 0 && runtime.actualNumericChapterFiles === runtime.expectedChapterFiles,
    publicRuntimeParsedWithoutErrors: runtime.parseErrors.length === 0,
    publicRuntimeHasNoDuplicateCoordinates: runtime.duplicateCoordinates.length === 0,
    publicRuntimeCoordinateCountExact: runtime.parsedCoordinates === EXPECTED.visibleCoordinates,
    publicRuntimeExactToGeneratedKjv: runtimeTextComparison.identical === true,
    exactSourceSnapshotsCaptured: allSnapshotsCopied,
    stagingOnly: true,
    productionPromotionNotAuthorized: true,
  };

  const contract = {
    milestone: EXPECTED.milestone,
    purpose: "DYNAMIC KJV PUBLIC-RUNTIME DATAFLOW AND GENERATOR CONTRACT",
    repository,
    retainedAlReport: relativeFromRoot(repoRoot, al.report.reportDir),
    retainedAjReport: relativeFromRoot(repoRoot, aj.report.reportDir),
    finding: {
      alStatus: "valid-fail-closed",
      alMissedReason: "The visible KJV artifact is reached through a runtime URL fetch, not a local TypeScript import edge.",
      exactFlowResolved: allFlowEvidence,
      exactFlow: flow.exactFlow,
      productionVisibleSource: EXPECTED.generatedKjv,
      runtimeGenerator: EXPECTED.splitter,
      publicRuntimeRoot: EXPECTED.runtimeRoot,
      readerEntry: EXPECTED.readerPage,
      readerAdapter: EXPECTED.readerAdapter,
      visibleConsumer: EXPECTED.verseConsumer,
    },
    parity: {
      generatedKjv: {
        path: EXPECTED.generatedKjv,
        rows: generated.rows,
        coordinates: generated.map.size,
        bytes: generated.bytes,
        sha256: generated.sha256,
      },
      retainedAjBlocks: {
        path: relativeFromRoot(repoRoot, aj.blocksPath),
        blocks: ajBlocks.blocks,
        bytes: ajBlocks.bytes,
        sha256: ajBlocks.sha256,
      },
      generatedVsAj: generatedVsAj,
      publicRuntime: {
        path: EXPECTED.runtimeRoot,
        tree: runtime.tree,
        expectedChapterFiles: runtime.expectedChapterFiles,
        actualNumericChapterFiles: runtime.actualNumericChapterFiles,
        parsedCoordinates: runtime.parsedCoordinates,
        missingFiles: runtime.missingFiles,
        unexpectedFiles: runtime.unexpectedFiles,
        duplicateCoordinates: runtime.duplicateCoordinates,
        parseErrors: runtime.parseErrors,
        coordinateTextComparison: runtime.coordinateTextComparison,
      },
    },
    applicationContract: {
      nextMilestone: "P05.12AN — ISOLATED KJV PUBLIC-RUNTIME ADAPTER APPLICATION PREVIEW",
      requirements: [
        "Operate only on staging copies of app/data/scripture/generatedKJV.json and public/scripture/runtime/kjv.",
        "Use retained P05.12AJ translation blocks as the sole route and tappability input.",
        "Keep visible KJV2006 text exact at all 31,102 coordinates.",
        "Keep 31,085 supported coordinates routed and 17 reader-only coordinates visible but fail closed.",
        "Preserve explicit one-source-to-many and many-source-to-one topology.",
        "Use the existing scripts/split-scripture-runtime.js output contract; do not invent a parallel reader schema.",
        "Stage the adapter twice independently and compare every output byte.",
        "Run actual reader, word-study, P05.10, and P05.11 route gates against staging.",
        "Prove WEB, Brenton, live canonical, alignments, and production KJV remain byte-unchanged.",
        "Do not authorize or perform production promotion.",
      ],
      sourceSnapshots: snapshots,
    },
    stagingOnly: true,
    productionPromotionAuthorized: false,
  };

  writeJson(path.join(outputDir, "al-independent-verification.json"), {
    reportDir: relativeFromRoot(repoRoot, al.report.reportDir),
    manifest: al.manifest,
    gates: al.gates,
    passed: al.passed,
  });
  writeJson(path.join(outputDir, "aj-independent-verification.json"), {
    reportDir: relativeFromRoot(repoRoot, aj.report.reportDir),
    manifest: aj.manifest,
    gates: aj.gates,
    passed: aj.passed,
  });
  writeJson(path.join(outputDir, "dynamic-reader-flow.json"), flow);
  writeJson(path.join(outputDir, "generated-kjv-vs-aj-parity.json"), generatedVsAj);
  writeJson(path.join(outputDir, "public-runtime-inventory.json"), {
    path: EXPECTED.runtimeRoot,
    tree: runtime.tree,
    expectedChapterFiles: runtime.expectedChapterFiles,
    actualNumericChapterFiles: runtime.actualNumericChapterFiles,
    missingFiles: runtime.missingFiles,
    unexpectedFiles: runtime.unexpectedFiles,
    parsedCoordinates: runtime.parsedCoordinates,
    duplicateCoordinates: runtime.duplicateCoordinates,
    parseErrors: runtime.parseErrors,
    coordinateTextComparison: runtime.coordinateTextComparison,
    chapterProfiles: runtime.chapterProfiles,
  });
  writeJson(path.join(outputDir, "source-snapshot-index.json"), snapshots);
  writeJson(path.join(outputDir, "runtime-generator-contract.json"), contract);
  writeJson(path.join(outputDir, "protected-state-current.json"), currentProtected);
  writeJson(path.join(outputDir, "protected-state-vs-al.json"), protectedComparison);

  const summary = {
    milestone: EXPECTED.milestone,
    schemaVersion: "p0512am-summary@1",
    purpose: "DYNAMIC KJV PUBLIC-RUNTIME DATAFLOW AND GENERATOR CONTRACT",
    repository,
    retainedAlReport: relativeFromRoot(repoRoot, al.report.reportDir),
    retainedAjReport: relativeFromRoot(repoRoot, aj.report.reportDir),
    counts: {
      generatedKjvCoordinates: generated.map.size,
      ajTranslationBlocks: ajBlocks.map.size,
      runtimeChapterFiles: runtime.actualNumericChapterFiles,
      runtimeCoordinates: runtime.parsedCoordinates,
      sourceSnapshots: snapshots.filter((item) => item.copied).length,
    },
    exactFlow: flow.exactFlow,
    gates,
    authorization: {
      safeToCreateIsolatedKjvPublicRuntimeAdapterApplicationPreview: Object.values(gates).every(Boolean),
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
