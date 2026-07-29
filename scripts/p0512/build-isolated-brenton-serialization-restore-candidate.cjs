#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length
    ? process.argv[index + 1]
    : fallback;
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
function rel(root, target) {
  return normalizeSlashes(path.relative(root, target));
}
function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}
function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) result.push(full);
    }
  }
  return result.sort((a, b) => a.localeCompare(b));
}
function treeFingerprint(target) {
  if (!fs.existsSync(target)) return { exists: false, type: null, sha256: null, files: 0 };
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
  const files = walkFiles(target);
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(rel(target, file), "utf8");
    hash.update("\0");
    hash.update(sha256File(file), "utf8");
    hash.update("\n");
  }
  return {
    exists: true,
    type: "directory",
    sha256: hash.digest("hex"),
    files: files.length
  };
}
function captureProtectedState(repo) {
  const paths = [
    "app/data/scripture/generatedKJV.json",
    "app/data/scripture/generatedKJV.ts",
    "app/data/scripture/CanonicalVerseStore.ts",
    "public/scripture/runtime/kjv",
    "public/data/bibleiq/word-study-kjv-reader",
    "app/data/scripture/generatedWEB.json",
    "app/data/scripture/generatedWEB.integrity.json",
    "public/scripture/runtime/web",
    "app/data/scripture/generatedBrenton.json",
    "app/data/scripture/generatedBrenton.ts",
    "app/data/scripture/generatedBrenton.integrity.json",
    "public/scripture/runtime/brenton",
    ".private/scripture/canonical",
    ".private/alignment"
  ];
  return paths.map(relativePath => ({
    path: relativePath,
    ...treeFingerprint(path.join(repo, relativePath))
  }));
}
function compareProtectedStates(before, after) {
  const byPath = new Map(after.map(row => [row.path, row]));
  const differences = [];
  for (const left of before) {
    const right = byPath.get(left.path);
    if (!right || JSON.stringify(left) !== JSON.stringify(right)) {
      differences.push({ before: left, after: right || null });
    }
  }
  return differences;
}
function run(command, args, cwd, options = {}) {
  const result = cp.spawnSync(command, args, {
    cwd,
    encoding: options.encoding === null ? null : "utf8",
    windowsHide: true,
    maxBuffer: 256 * 1024 * 1024
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
    stdout: result.stdout || (options.encoding === null ? Buffer.alloc(0) : ""),
    stderr: result.stderr || (options.encoding === null ? Buffer.alloc(0) : "")
  };
}
function parseChecksumManifest(file) {
  if (!fs.existsSync(file)) return { passed: false, reason: "missing", entries: [] };
  const root = path.dirname(file);
  const entries = [];
  const failures = [];
  for (const [index, line] of fs.readFileSync(file, "utf8").split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{64})  (.+)$/i.exec(line);
    if (!match) {
      failures.push({ line: index + 1, reason: "invalid-format" });
      continue;
    }
    const relativePath = normalizeSlashes(match[2]);
    const exact = path.join(root, ...relativePath.split("/"));
    const fallback = walkFiles(root).find(candidate => rel(root, candidate) === relativePath);
    const actualPath = fs.existsSync(exact) ? exact : fallback;
    if (!actualPath) {
      failures.push({ path: relativePath, reason: "missing" });
      continue;
    }
    const actual = sha256File(actualPath);
    const expected = match[1].toLowerCase();
    entries.push({ path: relativePath, expected, actual, match: actual === expected });
    if (actual !== expected) failures.push({ path: relativePath, expected, actual });
  }
  return {
    passed: failures.length === 0,
    checked: entries.length,
    entries,
    failures
  };
}
function findLatestReport(repo, directoryPattern, summaryName, predicate) {
  const root = path.join(repo, ".private", "reports", "P05.12");
  if (!fs.existsSync(root)) return null;
  const results = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !directoryPattern.test(entry.name)) continue;
    const summaryPath = path.join(root, entry.name, summaryName);
    if (!fs.existsSync(summaryPath)) continue;
    try {
      const summary = readJson(summaryPath);
      if (!predicate || predicate(summary)) {
        results.push({
          root: path.dirname(summaryPath),
          summaryPath,
          summary,
          mtimeMs: fs.statSync(summaryPath).mtimeMs
        });
      }
    } catch {}
  }
  results.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return results[0] || null;
}
function deepEqualJsonBuffers(leftBuffer, rightBuffer) {
  const left = JSON.parse(leftBuffer.toString("utf8").replace(/^\uFEFF/, ""));
  const right = JSON.parse(rightBuffer.toString("utf8").replace(/^\uFEFF/, ""));
  return JSON.stringify(left) === JSON.stringify(right);
}
function analyzeByteDifference(current, candidate) {
  const currentText = current.toString("utf8");
  const candidateText = candidate.toString("utf8");
  const normalizedCurrent = Buffer.from(currentText.replace(/\r\n/g, "\n"), "utf8");
  const normalizedCandidate = Buffer.from(candidateText.replace(/\r\n/g, "\n"), "utf8");
  const currentCrlfCount = (currentText.match(/\r\n/g) || []).length;
  const candidateCrlfCount = (candidateText.match(/\r\n/g) || []).length;
  const currentLfCount = (currentText.match(/(?<!\r)\n/g) || []).length;
  const candidateLfCount = (candidateText.match(/(?<!\r)\n/g) || []).length;

  let firstDifference = null;
  const max = Math.min(current.length, candidate.length);
  for (let index = 0; index < max; index += 1) {
    if (current[index] !== candidate[index]) {
      firstDifference = {
        offset: index,
        currentByte: current[index],
        candidateByte: candidate[index]
      };
      break;
    }
  }
  if (firstDifference === null && current.length !== candidate.length) {
    firstDifference = {
      offset: max,
      currentByte: current.length > max ? current[max] : null,
      candidateByte: candidate.length > max ? candidate[max] : null
    };
  }

  return {
    currentBytes: current.length,
    candidateBytes: candidate.length,
    byteDelta: current.length - candidate.length,
    currentSha256: sha256Buffer(current),
    candidateSha256: sha256Buffer(candidate),
    currentCrlfCount,
    candidateCrlfCount,
    currentBareLfCount: currentLfCount,
    candidateBareLfCount: candidateLfCount,
    firstDifference,
    normalizedCurrentSha256: sha256Buffer(normalizedCurrent),
    normalizedCandidateSha256: sha256Buffer(normalizedCandidate),
    normalizedBytesIdentical: normalizedCurrent.equals(normalizedCandidate),
    currentEqualsCandidateWithLfConvertedToCrlf:
      current.equals(Buffer.from(candidateText.replace(/\r?\n/g, "\r\n"), "utf8")),
    candidateEqualsCurrentWithCrlfConvertedToLf:
      candidate.equals(Buffer.from(currentText.replace(/\r\n/g, "\n"), "utf8")),
    exactDifferenceIsLineEndingsOnly: normalizedCurrent.equals(normalizedCandidate)
  };
}
function gitBlobEvidence(repo, relativePath, expectedHash) {
  const log = run("git", ["log", "--format=%H|%cI|%s", "--", relativePath], repo);
  const rows = [];
  if (log.status === 0) {
    for (const line of String(log.stdout).split(/\r?\n/).filter(Boolean).slice(0, 100)) {
      const [commit, date, ...subjectParts] = line.split("|");
      const blob = run("git", ["show", `${commit}:${normalizeSlashes(relativePath)}`], repo, { encoding: null });
      if (blob.status === 0 && Buffer.isBuffer(blob.stdout)) {
        const hash = sha256Buffer(blob.stdout);
        rows.push({
          commit,
          date,
          subject: subjectParts.join("|"),
          bytes: blob.stdout.length,
          sha256: hash,
          matchesExpected: hash === expectedHash
        });
      }
    }
  }
  return {
    logStatus: log.status,
    logError: log.error,
    logStderr: String(log.stderr || ""),
    rows,
    expectedMatches: rows.filter(row => row.matchesExpected)
  };
}
function parseGitAttributes(repo, relativePath) {
  const result = run("git", ["check-attr", "text", "eol", "--", relativePath], repo);
  const parsed = {};
  for (const line of String(result.stdout || "").split(/\r?\n/).filter(Boolean)) {
    const match = /^(.*?):\s+([^:]+):\s+(.*)$/.exec(line);
    if (match) parsed[match[2].trim()] = match[3].trim();
  }
  const autocrlf = run("git", ["config", "--get", "core.autocrlf"], repo);
  return {
    command: result.command,
    status: result.status,
    error: result.error,
    stderr: String(result.stderr || ""),
    attributes: parsed,
    coreAutocrlf: String(autocrlf.stdout || "").trim() || null
  };
}
function proposedGitAttributes(repo, relativePath) {
  const file = path.join(repo, ".gitattributes");
  const original = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const rule = `${normalizeSlashes(relativePath)} text eol=lf`;
  const lines = original.split(/\r?\n/);
  const alreadyPresent = lines.some(line => line.trim() === rule);
  const proposed = alreadyPresent
    ? original
    : `${original}${original && !original.endsWith("\n") ? "\n" : ""}${rule}\n`;
  return {
    exists: fs.existsSync(file),
    originalSha256: fs.existsSync(file) ? sha256File(file) : null,
    rule,
    alreadyPresent,
    original,
    proposed,
    proposedSha256: sha256Buffer(Buffer.from(proposed, "utf8"))
  };
}
function copyFileExact(source, target) {
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
}
function copyBuffer(buffer, target) {
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, buffer);
}
function listTree(root) {
  return walkFiles(root).map(file => ({
    path: rel(root, file),
    bytes: fs.statSync(file).size,
    sha256: sha256File(file)
  }));
}

function main() {
  const repo = path.resolve(argValue("--repo", process.cwd()));
  const out = path.resolve(argValue("--output"));
  if (!out) throw new Error("--output is required");
  ensureDir(out);

  const before = captureProtectedState(repo);
  writeJson(path.join(out, "protected-state-before.json"), before);

  const b2 = findLatestReport(
    repo,
    /exact-brenton-artifact-reconciliation/i,
    "p0512ap-b2-summary.json",
    summary =>
      summary?.milestone === "P05.12AP-B2" &&
      summary?.authorization?.safeToCreateProductionRestoreCandidate === true
  );
  if (!b2) {
    throw new Error("[P05.12AP-B3] No passing P05.12AP-B2 reconciliation report found.");
  }
  const b2Checksums = parseChecksumManifest(path.join(b2.root, "checksums.sha256"));
  if (!b2Checksums.passed) {
    throw new Error(`[P05.12AP-B3] B2 report checksum failure: ${JSON.stringify(b2Checksums.failures)}`);
  }

  const latestAp = findLatestReport(
    repo,
    /controlled-kjv2006-production-promotion/i,
    "p0512ap-summary.json",
    summary =>
      summary?.rollback?.verified === true &&
      summary?.rollback?.protectedStateRestored === true &&
      (summary?.rollback?.differences || []).length === 0 &&
      (summary?.rollback?.protectedDifferences || []).length === 0
  );
  if (!latestAp) {
    throw new Error("[P05.12AP-B3] No fully verified AP rollback report found.");
  }

  const productionRel = "app/data/scripture/generatedBrenton.json";
  const manifestRel = "app/data/scripture/generatedBrenton.integrity.json";
  const builderRel = "scripts/translations/build-brenton-production-from-candidate.js";
  const productionPath = path.join(repo, productionRel);
  const manifestPath = path.join(repo, manifestRel);
  const builderPath = path.join(repo, builderRel);

  for (const required of [productionPath, manifestPath, builderPath]) {
    if (!fs.existsSync(required)) {
      throw new Error(`[P05.12AP-B3] Missing required file: ${rel(repo, required)}`);
    }
  }

  const manifest = readJson(manifestPath);
  const expectedHash = String(manifest.productionSha256 || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedHash)) {
    throw new Error("[P05.12AP-B3] Brenton integrity manifest has no valid production SHA-256.");
  }

  const candidates = [];
  for (const label of ["candidate-a", "candidate-b"]) {
    const root = path.join(out, label);
    const generated = path.join(root, "staging-candidate", "app", "data", "scripture", "generatedBrenton.json");
    const integrity = path.join(root, "staging-candidate", "app", "data", "scripture", "generatedBrenton.integrity.json");
    const decisions = path.join(root, "coordinate-decisions.ndjson");
    ensureDir(path.dirname(generated));

    const build = run(process.execPath, [
      builderRel,
      "--output", generated,
      "--integrity-output", integrity,
      "--decision-output", decisions
    ], repo);

    fs.writeFileSync(path.join(root, "builder.stdout.log"), String(build.stdout || ""), "utf8");
    fs.writeFileSync(path.join(root, "builder.stderr.log"), String(build.stderr || ""), "utf8");
    if (build.status !== 0) {
      throw new Error(`[P05.12AP-B3] ${label} builder failed: ${String(build.stderr || build.stdout)}`);
    }

    candidates.push({
      label,
      root,
      generated,
      integrity,
      decisions,
      files: listTree(root)
    });
  }

  const a = candidates[0];
  const b = candidates[1];
  const aBytes = fs.readFileSync(a.generated);
  const bBytes = fs.readFileSync(b.generated);
  const currentBytes = fs.readFileSync(productionPath);
  const byteAnalysis = analyzeByteDifference(currentBytes, aBytes);
  const currentJsonEqualsCandidate = deepEqualJsonBuffers(currentBytes, aBytes);

  const candidateComparisons = {
    generatedBrentonByteIdentical: aBytes.equals(bBytes),
    integrityManifestByteIdentical:
      fs.readFileSync(a.integrity).equals(fs.readFileSync(b.integrity)),
    coordinateDecisionsByteIdentical:
      fs.readFileSync(a.decisions).equals(fs.readFileSync(b.decisions)),
    fullCandidateTreesIdentical:
      JSON.stringify(a.files.map(x => ({ path: x.path.replace(/^candidate-a\//, ""), bytes: x.bytes, sha256: x.sha256 }))) ===
      JSON.stringify(b.files.map(x => ({ path: x.path.replace(/^candidate-b\//, ""), bytes: x.bytes, sha256: x.sha256 })))
  };

  const gitEvidence = gitBlobEvidence(repo, productionRel, expectedHash);
  const attributes = parseGitAttributes(repo, productionRel);
  const gitattributes = proposedGitAttributes(repo, productionRel);

  const payloadRoot = path.join(out, "promotion-candidate");
  copyBuffer(aBytes, path.join(payloadRoot, productionRel));
  copyBuffer(currentBytes, path.join(out, "rollback-payload", productionRel));
  if (gitattributes.proposed !== gitattributes.original) {
    copyBuffer(Buffer.from(gitattributes.proposed, "utf8"), path.join(payloadRoot, ".gitattributes"));
    if (gitattributes.exists) {
      copyBuffer(Buffer.from(gitattributes.original, "utf8"), path.join(out, "rollback-payload", ".gitattributes"));
    } else {
      writeJson(path.join(out, "rollback-payload", "gitattributes-absence.json"), {
        path: ".gitattributes",
        existedBefore: false
      });
    }
  }

  const stagedManifest = readJson(a.integrity);
  const candidateHash = sha256Buffer(aBytes);
  const currentHash = sha256Buffer(currentBytes);

  const gates = {
    b2ReportChecksumsValid: b2Checksums.passed,
    b2AuthorizedProductionRestoreCandidate:
      b2.summary?.authorization?.safeToCreateProductionRestoreCandidate === true,
    latestApRollbackVerified:
      latestAp.summary?.rollback?.verified === true &&
      latestAp.summary?.rollback?.protectedStateRestored === true,
    candidateBuildsByteIdentical: Object.values(candidateComparisons).every(Boolean),
    candidateHashMatchesIntegrityManifest: candidateHash === expectedHash,
    candidateGeneratedIntegrityMatchesProductionManifestHash:
      String(stagedManifest.productionSha256 || "").toLowerCase() === expectedHash,
    currentAndCandidateJsonDocumentsIdentical: currentJsonEqualsCandidate,
    exactRawDifferenceIsLineEndingsOnly: byteAnalysis.exactDifferenceIsLineEndingsOnly,
    currentNormalizesToExactApprovedCandidate:
      byteAnalysis.normalizedCurrentSha256 === candidateHash,
    historicalGitBlobMatchesApprovedCandidate:
      gitEvidence.expectedMatches.length >= 1,
    currentProductionNotModifiedByThisStage: null,
    protectedProductionNotModifiedByThisStage: null
  };

  const after = captureProtectedState(repo);
  const protectedDifferences = compareProtectedStates(before, after);
  gates.currentProductionNotModifiedByThisStage =
    before.find(x => x.path === productionRel)?.sha256 ===
    after.find(x => x.path === productionRel)?.sha256;
  gates.protectedProductionNotModifiedByThisStage = protectedDifferences.length === 0;

  const safeToCreateControlledRestore =
    Object.values(gates).every(Boolean);

  const report = {
    milestone: "P05.12AP-B3",
    purpose: "ISOLATED BRENTON EXACT-SERIALIZATION RESTORE CANDIDATE",
    generatedAt: new Date().toISOString(),
    repository: { root: repo },
    sources: {
      b2Summary: rel(repo, b2.summaryPath),
      b2SummarySha256: sha256File(b2.summaryPath),
      b2Checksums: {
        path: rel(repo, path.join(b2.root, "checksums.sha256")),
        checked: b2Checksums.checked,
        passed: b2Checksums.passed
      },
      latestApRollbackSummary: rel(repo, latestAp.summaryPath),
      builder: {
        path: builderRel,
        sha256: sha256File(builderPath)
      },
      integrityManifest: {
        path: manifestRel,
        sha256: sha256File(manifestPath),
        expectedProductionSha256: expectedHash
      }
    },
    currentProduction: {
      path: productionRel,
      bytes: currentBytes.length,
      sha256: currentHash
    },
    rebuiltCandidate: {
      bytes: aBytes.length,
      sha256: candidateHash,
      verses: JSON.parse(aBytes.toString("utf8")).verses?.length || null,
      superscriptions: JSON.parse(aBytes.toString("utf8")).superscriptions?.length || null
    },
    byteDifference: byteAnalysis,
    candidateComparisons,
    gitEvidence,
    lineEndingPolicy: {
      checkAttr: attributes,
      gitattributesExists: gitattributes.exists,
      currentGitattributesSha256: gitattributes.originalSha256,
      requiredRule: gitattributes.rule,
      ruleAlreadyPresent: gitattributes.alreadyPresent,
      proposedGitattributesSha256: gitattributes.proposedSha256,
      promotionCandidateIncludesGitattributes:
        gitattributes.proposed !== gitattributes.original
    },
    payload: {
      files: listTree(payloadRoot),
      rollbackFiles: listTree(path.join(out, "rollback-payload"))
    },
    gates,
    protectedState: {
      before,
      after,
      differences: protectedDifferences
    },
    authorization: {
      safeToCreateControlledBrentonSerializationRestore:
        safeToCreateControlledRestore,
      safeToModifyBrentonProduction: false,
      safeToModifyGitattributes: false,
      safeToRerunKjvPromotion: false
    }
  };

  writeJson(path.join(out, "p0512ap-b3-summary.json"), report);
  writeJson(path.join(out, "verdict.json"), {
    milestone: "P05.12AP-B3",
    verdict: safeToCreateControlledRestore
      ? "AUTHORIZE_CONTROLLED_BRENTON_SERIALIZATION_RESTORE"
      : "FAIL_CLOSED",
    manifestExpectedSha256: expectedHash,
    currentProductionSha256: currentHash,
    exactApprovedCandidateSha256: candidateHash,
    currentAndCandidateJsonDocumentsIdentical: currentJsonEqualsCandidate,
    exactDifferenceIsLineEndingsOnly: byteAnalysis.exactDifferenceIsLineEndingsOnly,
    requiredGitAttributesRule: gitattributes.rule,
    safeToCreateControlledBrentonSerializationRestore:
      safeToCreateControlledRestore,
    safeToModifyBrentonProduction: false,
    safeToModifyGitattributes: false,
    safeToRerunKjvPromotion: false,
    nextStep: safeToCreateControlledRestore
      ? "Create a controlled transactional package that installs the exact approved Brenton bytes and the LF checkout rule, reruns the Brenton integrity gate and production build, and automatically rolls back both files on any failure."
      : "Inspect the failed B3 gates. Do not alter Brenton or rerun KJV promotion."
  });

  console.log(JSON.stringify(readJson(path.join(out, "verdict.json")), null, 2));
}

try {
  main();
} catch (error) {
  const out = argValue("--output");
  if (out) {
    try {
      ensureDir(path.resolve(out));
      writeJson(path.join(path.resolve(out), "fatal-error.json"), {
        milestone: "P05.12AP-B3",
        generatedAt: new Date().toISOString(),
        message: error.message,
        stack: error.stack
      });
    } catch {}
  }
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
