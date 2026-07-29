#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");

function valueAfter(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length
    ? process.argv[index + 1]
    : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function normalizeSlashes(value) {
  return String(value || "").replace(/\\/g, "/");
}

function relativePath(root, target) {
  return normalizeSlashes(path.relative(root, target));
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const stack = [directory];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) files.push(full);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function fingerprint(target) {
  if (!fs.existsSync(target)) {
    return { exists: false, type: null, sha256: null, bytes: null, files: 0 };
  }

  const stat = fs.statSync(target);
  if (stat.isFile()) {
    return {
      exists: true,
      type: "file",
      sha256: sha256File(target),
      bytes: stat.size,
      files: 1
    };
  }

  const hash = crypto.createHash("sha256");
  const files = listFiles(target);

  for (const file of files) {
    hash.update(relativePath(target, file), "utf8");
    hash.update("\0");
    hash.update(sha256File(file), "utf8");
    hash.update("\n");
  }

  return {
    exists: true,
    type: "directory",
    sha256: hash.digest("hex"),
    bytes: null,
    files: files.length
  };
}

function captureProtectedState(repositoryRoot) {
  const protectedPaths = [
    "app/data/scripture/generatedKJV.json",
    "app/data/scripture/generatedKJV.ts",
    "app/data/scripture/CanonicalVerseStore.ts",
    "public/scripture/runtime/kjv",
    "public/data/bibleiq/word-study-kjv-reader",
    "app/data/scripture/generatedWEB.json",
    "app/data/scripture/generatedWEB.integrity.json",
    "public/scripture/runtime/web",
    "app/data/scripture/generatedBrenton.ts",
    "app/data/scripture/generatedBrenton.integrity.json",
    "public/scripture/runtime/brenton",
    ".private/scripture/canonical",
    ".private/alignment"
  ];

  return protectedPaths.map(relative => ({
    path: relative,
    ...fingerprint(path.join(repositoryRoot, relative))
  }));
}

function compareStates(before, after) {
  const afterByPath = new Map(after.map(row => [row.path, row]));
  const differences = [];

  for (const left of before) {
    const right = afterByPath.get(left.path);
    if (!right || JSON.stringify(left) !== JSON.stringify(right)) {
      differences.push({ before: left, after: right || null });
    }
  }

  return differences;
}

function run(command, args, cwd, options = {}) {
  const result = cp.spawnSync(command, args, {
    cwd,
    encoding: options.binary ? null : "utf8",
    windowsHide: true,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, ...(options.env || {}) }
  });

  return {
    command: [command, ...args].join(" "),
    status: result.status,
    signal: result.signal,
    error: result.error
      ? {
          name: result.error.name,
          message: result.error.message,
          code: result.error.code || null
        }
      : null,
    stdout: result.stdout || (options.binary ? Buffer.alloc(0) : ""),
    stderr: result.stderr || (options.binary ? Buffer.alloc(0) : "")
  };
}

function runNpm(argumentsList, cwd) {
  if (process.platform === "win32") {
    const shell = process.env.ComSpec || "cmd.exe";
    return run(shell, ["/d", "/s", "/c", ["npm", ...argumentsList].join(" ")], cwd);
  }
  return run("npm", argumentsList, cwd);
}

function verifyChecksumManifest(reportRoot) {
  const manifest = path.join(reportRoot, "checksums.sha256");
  if (!fs.existsSync(manifest)) {
    return { passed: false, checked: 0, failures: [{ reason: "missing-manifest" }] };
  }

  const failures = [];
  let checked = 0;

  for (const [index, line] of fs.readFileSync(manifest, "utf8").split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{64})  (.+)$/i.exec(line);
    if (!match) {
      failures.push({ line: index + 1, reason: "invalid-format" });
      continue;
    }

    checked += 1;
    const relative = normalizeSlashes(match[2]);
    const target = path.join(reportRoot, ...relative.split("/"));

    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      failures.push({ path: relative, reason: "missing" });
      continue;
    }

    const expected = match[1].toLowerCase();
    const actual = sha256File(target);
    if (actual !== expected) {
      failures.push({ path: relative, expected, actual });
    }
  }

  return {
    passed: failures.length === 0,
    checked,
    failures
  };
}

function findPassingB3(repositoryRoot) {
  const reportsRoot = path.join(repositoryRoot, ".private", "reports", "P05.12");
  if (!fs.existsSync(reportsRoot)) return null;

  const candidates = [];

  for (const entry of fs.readdirSync(reportsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/isolated-brenton-serialization-restore-candidate/i.test(entry.name)) {
      continue;
    }

    const root = path.join(reportsRoot, entry.name);
    const summaryPath = path.join(root, "p0512ap-b3-summary.json");
    const verdictPath = path.join(root, "verdict.json");

    if (!fs.existsSync(summaryPath) || !fs.existsSync(verdictPath)) continue;

    try {
      const summary = readJson(summaryPath);
      const verdict = readJson(verdictPath);
      if (
        summary?.milestone === "P05.12AP-B3" &&
        summary?.authorization?.safeToCreateControlledBrentonSerializationRestore === true &&
        verdict?.verdict === "AUTHORIZE_CONTROLLED_BRENTON_SERIALIZATION_RESTORE"
      ) {
        candidates.push({
          root,
          summaryPath,
          verdictPath,
          summary,
          verdict,
          mtimeMs: fs.statSync(summaryPath).mtimeMs
        });
      }
    } catch {
      // Ignore malformed reports.
    }
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0] || null;
}

function exactJsonEquality(leftBuffer, rightBuffer) {
  const left = JSON.parse(leftBuffer.toString("utf8").replace(/^\uFEFF/, ""));
  const right = JSON.parse(rightBuffer.toString("utf8").replace(/^\uFEFF/, ""));
  return JSON.stringify(left) === JSON.stringify(right);
}

function lineEndingAnalysis(current, candidate) {
  const currentText = current.toString("utf8");
  const candidateText = candidate.toString("utf8");
  const normalizedCurrent = Buffer.from(currentText.replace(/\r\n/g, "\n"), "utf8");
  const normalizedCandidate = Buffer.from(candidateText.replace(/\r\n/g, "\n"), "utf8");

  return {
    currentBytes: current.length,
    candidateBytes: candidate.length,
    currentSha256: sha256Buffer(current),
    candidateSha256: sha256Buffer(candidate),
    currentCrlfCount: (currentText.match(/\r\n/g) || []).length,
    candidateCrlfCount: (candidateText.match(/\r\n/g) || []).length,
    normalizedCurrentSha256: sha256Buffer(normalizedCurrent),
    normalizedCandidateSha256: sha256Buffer(normalizedCandidate),
    exactDifferenceIsLineEndingsOnly: normalizedCurrent.equals(normalizedCandidate),
    currentAndCandidateJsonDocumentsIdentical: exactJsonEquality(current, candidate)
  };
}

function gitBranch(repositoryRoot) {
  const result = run("git", ["branch", "--show-current"], repositoryRoot);
  return {
    command: result.command,
    status: result.status,
    error: result.error,
    branch: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "")
  };
}

function gitAttributes(repositoryRoot, relativeFile) {
  const result = run("git", ["check-attr", "text", "eol", "--", relativeFile], repositoryRoot);
  const attributes = {};

  for (const line of String(result.stdout || "").split(/\r?\n/).filter(Boolean)) {
    const match = /^(.*?):\s+([^:]+):\s+(.*)$/.exec(line);
    if (match) attributes[match[2].trim()] = match[3].trim();
  }

  return {
    command: result.command,
    status: result.status,
    error: result.error,
    stderr: String(result.stderr || ""),
    attributes
  };
}

function writeExact(file, buffer) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, buffer);
}

function removeIfExists(target) {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

function verifyInstalled(repositoryRoot, expectedBrentonHash, expectedAttributesHash) {
  const brentonPath = path.join(repositoryRoot, "app", "data", "scripture", "generatedBrenton.json");
  const attributesPath = path.join(repositoryRoot, ".gitattributes");

  return {
    brentonExists: fs.existsSync(brentonPath),
    brentonSha256: fs.existsSync(brentonPath) ? sha256File(brentonPath) : null,
    brentonHashMatches: fs.existsSync(brentonPath) && sha256File(brentonPath) === expectedBrentonHash,
    gitattributesExists: fs.existsSync(attributesPath),
    gitattributesSha256: fs.existsSync(attributesPath) ? sha256File(attributesPath) : null,
    gitattributesHashMatches:
      fs.existsSync(attributesPath) && sha256File(attributesPath) === expectedAttributesHash
  };
}

function main() {
  const repositoryRoot = path.resolve(valueAfter("--repo", process.cwd()));
  const outputRoot = path.resolve(valueAfter("--output"));
  const promote = hasFlag("--promote");

  if (!outputRoot) throw new Error("--output is required");
  ensureDir(outputRoot);

  const report = {
    milestone: "P05.12AP-B4",
    purpose: "CONTROLLED BRENTON EXACT-SERIALIZATION RESTORE",
    generatedAt: new Date().toISOString(),
    repository: { root: repositoryRoot },
    requestedPromotion: promote,
    preflight: {},
    sourceEvidence: {},
    transaction: {
      attempted: false,
      installed: false,
      rollbackAttempted: false,
      rollbackVerified: false
    },
    gates: {},
    authorization: {
      brentonSerializationRestoreSucceeded: false,
      safeToRerunKjvPromotion: false
    }
  };

  const beforeProtected = captureProtectedState(repositoryRoot);
  writeJson(path.join(outputRoot, "protected-state-before.json"), beforeProtected);

  const branch = gitBranch(repositoryRoot);
  report.preflight.git = branch;
  if (branch.status !== 0 || branch.branch !== "main") {
    throw new Error(`[P05.12AP-B4] Expected branch main; found ${JSON.stringify(branch.branch)}.`);
  }

  const b3 = findPassingB3(repositoryRoot);
  if (!b3) {
    throw new Error("[P05.12AP-B4] No passing P05.12AP-B3 report was found.");
  }

  const b3Checksums = verifyChecksumManifest(b3.root);
  report.sourceEvidence = {
    b3ReportRoot: relativePath(repositoryRoot, b3.root),
    b3Summary: relativePath(repositoryRoot, b3.summaryPath),
    b3SummarySha256: sha256File(b3.summaryPath),
    b3Verdict: relativePath(repositoryRoot, b3.verdictPath),
    b3VerdictSha256: sha256File(b3.verdictPath),
    b3Checksums
  };

  if (!b3Checksums.passed) {
    throw new Error(`[P05.12AP-B4] B3 checksum verification failed: ${JSON.stringify(b3Checksums.failures)}`);
  }

  const productionRelative = "app/data/scripture/generatedBrenton.json";
  const manifestRelative = "app/data/scripture/generatedBrenton.integrity.json";
  const verifierRelative = "scripts/translations/verify-brenton-production-integrity.js";
  const gitattributesRelative = ".gitattributes";

  const currentBrentonPath = path.join(repositoryRoot, productionRelative);
  const integrityManifestPath = path.join(repositoryRoot, manifestRelative);
  const verifierPath = path.join(repositoryRoot, verifierRelative);
  const currentAttributesPath = path.join(repositoryRoot, gitattributesRelative);

  const candidateBrentonPath = path.join(
    b3.root,
    "promotion-candidate",
    "app",
    "data",
    "scripture",
    "generatedBrenton.json"
  );
  const candidateAttributesPath = path.join(b3.root, "promotion-candidate", ".gitattributes");

  for (const required of [
    currentBrentonPath,
    integrityManifestPath,
    verifierPath,
    candidateBrentonPath,
    candidateAttributesPath
  ]) {
    if (!fs.existsSync(required) || !fs.statSync(required).isFile()) {
      throw new Error(`[P05.12AP-B4] Missing required file: ${relativePath(repositoryRoot, required)}`);
    }
  }

  const integrityManifest = readJson(integrityManifestPath);
  const expectedBrentonHash = String(integrityManifest.productionSha256 || "").toLowerCase();
  const candidateBrenton = fs.readFileSync(candidateBrentonPath);
  const currentBrenton = fs.readFileSync(currentBrentonPath);
  const candidateAttributes = fs.readFileSync(candidateAttributesPath);
  const currentAttributesExisted = fs.existsSync(currentAttributesPath);
  const currentAttributes = currentAttributesExisted
    ? fs.readFileSync(currentAttributesPath)
    : null;

  const expectedAttributesHash = sha256Buffer(candidateAttributes);
  const candidateBrentonHash = sha256Buffer(candidateBrenton);
  const currentBrentonHash = sha256Buffer(currentBrenton);
  const analysis = lineEndingAnalysis(currentBrenton, candidateBrenton);

  report.preflight.files = {
    integrityManifest: {
      path: manifestRelative,
      sha256: sha256File(integrityManifestPath),
      expectedBrentonHash
    },
    currentBrenton: {
      path: productionRelative,
      bytes: currentBrenton.length,
      sha256: currentBrentonHash
    },
    candidateBrenton: {
      path: relativePath(repositoryRoot, candidateBrentonPath),
      bytes: candidateBrenton.length,
      sha256: candidateBrentonHash
    },
    currentGitattributes: {
      path: gitattributesRelative,
      existed: currentAttributesExisted,
      bytes: currentAttributes ? currentAttributes.length : null,
      sha256: currentAttributes ? sha256Buffer(currentAttributes) : null
    },
    candidateGitattributes: {
      path: relativePath(repositoryRoot, candidateAttributesPath),
      bytes: candidateAttributes.length,
      sha256: expectedAttributesHash
    }
  };
  report.preflight.lineEndingAnalysis = analysis;

  const summaryExpectedHash = String(b3.summary?.sources?.integrityManifest?.expectedProductionSha256 || "").toLowerCase();
  const summaryCurrentHash = String(b3.summary?.currentProduction?.sha256 || "").toLowerCase();
  const summaryCandidateHash = String(b3.summary?.rebuiltCandidate?.sha256 || "").toLowerCase();
  const summaryAttributesHash = String(
    b3.summary?.lineEndingPolicy?.proposedGitattributesSha256 || ""
  ).toLowerCase();

  const currentAttributesAllowed =
    !currentAttributesExisted ||
    (currentAttributes && sha256Buffer(currentAttributes) === expectedAttributesHash);

  report.gates = {
    runningOnMain: branch.branch === "main",
    b3ChecksumsValid: b3Checksums.passed,
    b3AuthorizedControlledRestore:
      b3.summary?.authorization?.safeToCreateControlledBrentonSerializationRestore === true,
    manifestHashMatchesB3: expectedBrentonHash === summaryExpectedHash,
    currentBrentonMatchesB3Precondition: currentBrentonHash === summaryCurrentHash,
    candidateBrentonMatchesB3: candidateBrentonHash === summaryCandidateHash,
    candidateBrentonMatchesIntegrityManifest: candidateBrentonHash === expectedBrentonHash,
    candidateGitattributesMatchesB3: expectedAttributesHash === summaryAttributesHash,
    currentAndCandidateJsonIdentical: analysis.currentAndCandidateJsonDocumentsIdentical,
    rawDifferenceIsOnlyLineEndings: analysis.exactDifferenceIsLineEndingsOnly,
    currentGitattributesStateAllowed: currentAttributesAllowed
  };

  if (!Object.values(report.gates).every(Boolean)) {
    throw new Error(`[P05.12AP-B4] Preflight gates failed: ${JSON.stringify(report.gates)}`);
  }

  const npmPreflight = runNpm(["--version"], repositoryRoot);
  fs.writeFileSync(path.join(outputRoot, "npm-preflight.stdout.log"), String(npmPreflight.stdout || ""), "utf8");
  fs.writeFileSync(path.join(outputRoot, "npm-preflight.stderr.log"), String(npmPreflight.stderr || ""), "utf8");
  report.preflight.npm = {
    command: npmPreflight.command,
    status: npmPreflight.status,
    error: npmPreflight.error
  };

  if (npmPreflight.status !== 0) {
    throw new Error("[P05.12AP-B4] npm launcher preflight failed.");
  }

  const rollbackRoot = path.join(outputRoot, "rollback-payload");
  writeExact(path.join(rollbackRoot, productionRelative), currentBrenton);
  if (currentAttributesExisted) {
    writeExact(path.join(rollbackRoot, gitattributesRelative), currentAttributes);
  } else {
    writeJson(path.join(rollbackRoot, "gitattributes-absence.json"), {
      path: gitattributesRelative,
      existedBefore: false
    });
  }

  if (!promote) {
    writeJson(path.join(outputRoot, "p0512ap-b4-summary.json"), report);
    writeJson(path.join(outputRoot, "verdict.json"), {
      milestone: "P05.12AP-B4",
      verdict: "PROMOTION_FLAG_REQUIRED",
      safeToRerunKjvPromotion: false,
      nextStep: "Rerun this package with -Promote."
    });
    console.log(JSON.stringify(readJson(path.join(outputRoot, "verdict.json")), null, 2));
    return;
  }

  report.transaction.attempted = true;
  let failure = null;

  try {
    writeExact(currentBrentonPath, candidateBrenton);
    writeExact(currentAttributesPath, candidateAttributes);
    report.transaction.installed = true;

    const installed = verifyInstalled(
      repositoryRoot,
      expectedBrentonHash,
      expectedAttributesHash
    );
    report.transaction.installedState = installed;

    if (!installed.brentonHashMatches || !installed.gitattributesHashMatches) {
      throw new Error(`[P05.12AP-B4] Installed file verification failed: ${JSON.stringify(installed)}`);
    }

    const effectiveAttributes = gitAttributes(repositoryRoot, productionRelative);
    report.transaction.effectiveGitAttributes = effectiveAttributes;
    if (
      effectiveAttributes.status !== 0 ||
      effectiveAttributes.attributes.text !== "set" ||
      effectiveAttributes.attributes.eol !== "lf"
    ) {
      throw new Error(
        `[P05.12AP-B4] LF rule is not effective: ${JSON.stringify(effectiveAttributes)}`
      );
    }

    const verifier = run(process.execPath, [verifierRelative], repositoryRoot);
    fs.writeFileSync(path.join(outputRoot, "brenton-verifier.stdout.log"), String(verifier.stdout || ""), "utf8");
    fs.writeFileSync(path.join(outputRoot, "brenton-verifier.stderr.log"), String(verifier.stderr || ""), "utf8");
    report.transaction.brentonVerifier = {
      command: verifier.command,
      status: verifier.status,
      error: verifier.error
    };

    if (verifier.status !== 0) {
      throw new Error("[P05.12AP-B4] Brenton production-integrity verifier failed.");
    }

    const productionBuild = runNpm(["run", "build"], repositoryRoot);
    fs.writeFileSync(path.join(outputRoot, "production-build.stdout.log"), String(productionBuild.stdout || ""), "utf8");
    fs.writeFileSync(path.join(outputRoot, "production-build.stderr.log"), String(productionBuild.stderr || ""), "utf8");
    report.transaction.productionBuild = {
      command: productionBuild.command,
      status: productionBuild.status,
      error: productionBuild.error
    };

    if (productionBuild.status !== 0) {
      throw new Error("[P05.12AP-B4] Production build failed after Brenton serialization restore.");
    }

    const afterProtected = captureProtectedState(repositoryRoot);
    const protectedDifferences = compareStates(beforeProtected, afterProtected);
    report.protectedState = {
      before: beforeProtected,
      after: afterProtected,
      differences: protectedDifferences
    };
    writeJson(path.join(outputRoot, "protected-state-after.json"), afterProtected);

    if (protectedDifferences.length !== 0) {
      throw new Error(
        `[P05.12AP-B4] Protected production state changed unexpectedly: ${JSON.stringify(protectedDifferences)}`
      );
    }

    const finalInstalled = verifyInstalled(
      repositoryRoot,
      expectedBrentonHash,
      expectedAttributesHash
    );
    if (!finalInstalled.brentonHashMatches || !finalInstalled.gitattributesHashMatches) {
      throw new Error("[P05.12AP-B4] Final installed-state verification failed.");
    }

    report.authorization.brentonSerializationRestoreSucceeded = true;
    report.authorization.safeToRerunKjvPromotion = true;
  } catch (error) {
    failure = error;
    report.transaction.failure = {
      message: error.message,
      stack: error.stack
    };
  }

  if (failure) {
    report.transaction.rollbackAttempted = true;

    try {
      writeExact(currentBrentonPath, currentBrenton);
      if (currentAttributesExisted) {
        writeExact(currentAttributesPath, currentAttributes);
      } else {
        removeIfExists(currentAttributesPath);
      }

      const restoredBrentonHash = sha256File(currentBrentonPath);
      const attributesRestored = currentAttributesExisted
        ? (
            fs.existsSync(currentAttributesPath) &&
            sha256File(currentAttributesPath) === sha256Buffer(currentAttributes)
          )
        : !fs.existsSync(currentAttributesPath);

      const afterRollbackProtected = captureProtectedState(repositoryRoot);
      const rollbackProtectedDifferences = compareStates(beforeProtected, afterRollbackProtected);

      report.transaction.rollback = {
        restoredBrentonHash,
        expectedBrentonHash: currentBrentonHash,
        brentonRestored: restoredBrentonHash === currentBrentonHash,
        gitattributesRestored: attributesRestored,
        protectedDifferences: rollbackProtectedDifferences
      };

      report.transaction.rollbackVerified =
        restoredBrentonHash === currentBrentonHash &&
        attributesRestored &&
        rollbackProtectedDifferences.length === 0;
    } catch (rollbackError) {
      report.transaction.rollback = {
        error: rollbackError.message,
        stack: rollbackError.stack
      };
      report.transaction.rollbackVerified = false;
    }
  }

  writeJson(path.join(outputRoot, "p0512ap-b4-summary.json"), report);

  const verdict = report.authorization.safeToRerunKjvPromotion
    ? {
        milestone: "P05.12AP-B4",
        verdict: "BRENTON_SERIALIZATION_RESTORE_PASSED",
        approvedBrentonSha256: expectedBrentonHash,
        gitattributesSha256: expectedAttributesHash,
        productionBuildPassed: true,
        safeToRerunKjvPromotion: true,
        nextStep: "Create a refreshed controlled KJV2006 promotion package using this repaired Brenton state as the protected precondition."
      }
    : {
        milestone: "P05.12AP-B4",
        verdict: "RESTORE_FAILED_AND_ROLLBACK_EVALUATED",
        failure: report.transaction.failure || null,
        rollbackVerified: report.transaction.rollbackVerified,
        safeToRerunKjvPromotion: false,
        nextStep: "Inspect the B4 logs. Do not rerun the KJV promotion."
      };

  writeJson(path.join(outputRoot, "verdict.json"), verdict);
  console.log(JSON.stringify(verdict, null, 2));

  if (!report.authorization.safeToRerunKjvPromotion) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  const output = valueAfter("--output");
  if (output) {
    try {
      ensureDir(path.resolve(output));
      writeJson(path.join(path.resolve(output), "fatal-error.json"), {
        milestone: "P05.12AP-B4",
        generatedAt: new Date().toISOString(),
        message: error.message,
        stack: error.stack
      });
    } catch {}
  }
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
