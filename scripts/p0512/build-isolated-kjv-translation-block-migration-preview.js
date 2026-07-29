#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  EXPECTED,
  fail,
  readJson,
  writeJson,
  ensureDir,
  sha256File,
  hashTree,
  parseArgs,
  relativeFromRoot,
  findP0512AiEvidence,
  loadReaderCandidate,
  loadCanonicalStaging,
  validateAiMaps,
  gitInfo,
  requireTokenizer,
  buildBlocks,
  validateBuiltBlocks,
} = require("./p0512aj-lib");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args["repo-root"] || process.cwd());
  const outputDir = path.resolve(args["output-dir"] || "");
  const label = String(args.label || "candidate");

  if (!args["output-dir"]) fail("--output-dir is required.");
  const allowedRoot = path.join(repoRoot, ".private", "reports", "P05.12");
  const rel = path.relative(allowedRoot, outputDir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    fail(`Output must stay under ${allowedRoot}. Refusing ${outputDir}`);
  }

  ensureDir(outputDir);
  const repository = gitInfo(repoRoot);
  if (repository.branch !== "main") {
    fail(`P05.12AJ must run on main; current branch is ${repository.branch || "(detached)"}.`);
  }

  const ai = findP0512AiEvidence(repoRoot);
  const readerCandidate = loadReaderCandidate(ai.kjvCandidatePath);
  const canonical = loadCanonicalStaging(ai.canonicalRoot);
  const aiMaps = validateAiMaps(
    ai.readerMapPath,
    ai.sourceMapPath,
    readerCandidate,
    canonical
  );
  const tokenizer = requireTokenizer(repoRoot);

  const built = buildBlocks({
    readerCandidate,
    canonical,
    aiMaps,
    tokenizeDisplayText: tokenizer.tokenizeDisplayText,
    kjvCandidateSha256: ai.kjvCandidateSha256,
  });
  const validation = validateBuiltBlocks({
    blocks: built.blocks,
    readerCandidate,
    canonical,
    aiMaps,
  });
  const gates = {
    ...validation.gates,
    p0512aiKjvSourceOwnedInventoryExact: canonical.inventory.exact === true,
  };

  const blocksPath = path.join(outputDir, "kjv-translation-blocks.json");
  const topologyPath = path.join(outputDir, "kjv-translation-block-topology.json");
  const validationPath = path.join(outputDir, "kjv-translation-block-validation.json");
  const summaryPath = path.join(outputDir, "build-summary.json");
  const metadataPath = path.join(outputDir, "run-metadata.json");

  writeJson(blocksPath, built.blocks);
  writeJson(topologyPath, built.topology);
  writeJson(validationPath, validation);

  const outputHashes = {
    blocksSha256: sha256File(blocksPath),
    topologySha256: sha256File(topologyPath),
    validationSha256: sha256File(validationPath),
  };

  const buildSummary = {
    milestone: EXPECTED.milestone,
    schemaVersion: "p0512aj-build-summary@4",
    inputs: {
      p0512aiTopSummary: {
        path: relativeFromRoot(repoRoot, ai.topSummaryPath),
        sha256: sha256File(ai.topSummaryPath),
      },
      p0512aiApplicationSummary: {
        path: relativeFromRoot(repoRoot, ai.applicationSummaryPath),
        sha256: sha256File(ai.applicationSummaryPath),
      },
      p0512aiReaderMap: {
        path: relativeFromRoot(repoRoot, ai.readerMapPath),
        sha256: sha256File(ai.readerMapPath),
      },
      p0512aiSourceMap: {
        path: relativeFromRoot(repoRoot, ai.sourceMapPath),
        sha256: sha256File(ai.sourceMapPath),
      },
      retainedCanonical: {
        path: relativeFromRoot(repoRoot, ai.canonicalRoot),
        tree: hashTree(ai.canonicalRoot),
        kjvSourceOwnership: canonical.inventory,
      },
      kjv2006Candidate: {
        path: relativeFromRoot(repoRoot, ai.kjvCandidatePath),
        sha256: ai.kjvCandidateSha256,
      },
      canonicalTokenizer: {
        path: relativeFromRoot(repoRoot, tokenizer.tokenizerPath),
        sha256: tokenizer.tokenizerSha256,
      },
    },
    totals: {
      ...built.totals,
      ownedFiles: canonical.files.length,
      ownedFilesByEmbeddedCorpus: canonical.inventory.ownedFilesByEmbeddedCorpus,
      selectedCanonicalTopLevelGroups: canonical.inventory.selectedTopLevelGroups,
      canonicalTopLevelGroups: canonical.inventory.topLevelGroups,
      allCanonicalJsonFiles: canonical.inventory.allJsonFiles,
      excludedNonKjvCanonicalJsonFiles: canonical.inventory.excludedNonKjvFiles,
      ownedRecords: canonical.recordCount,
      sourceTokens: canonical.sourceTokenById.size,
      readerCoordinates: readerCandidate.verses.length,
    },
    topology: {
      multiTargetSourceCoordinates: built.topology.multiTargetSources.length,
      multiSourceReaderCoordinates: built.topology.multiSourceReaders.length,
      unsupportedReaderCoordinates: built.topology.unsupportedReaders.length,
      fingerprint: ai.topSummary.application.topologyFingerprint,
    },
    gates,
    validationErrorCount: validation.errors.length,
    outputs: outputHashes,
    stagingOnly: true,
    safeToPromoteProductionKjv: false,
  };
  writeJson(summaryPath, buildSummary);

  writeJson(metadataPath, {
    milestone: EXPECTED.milestone,
    label,
    generatedAtUtc: new Date().toISOString(),
    repository,
    outputDir: relativeFromRoot(repoRoot, outputDir),
  });

  const allGatesPass = Object.values(gates).every(Boolean);
  const output = {
    milestone: EXPECTED.milestone,
    label,
    outputDir,
    counts: validation.counts,
    gates,
    validationErrorCount: validation.errors.length,
    blocksSha256: outputHashes.blocksSha256,
    stagingOnly: true,
    safeToPromoteProductionKjv: false,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

  if (!allGatesPass || validation.errors.length) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
}
