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

  return result.sort((left, right) => left.localeCompare(right));
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

  const files = walkFiles(target);
  const hash = crypto.createHash("sha256");

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
    "app/data/scripture/generatedWEB.integrity.json",
    "app/data/scripture/generatedBrenton.ts",
    "app/data/scripture/generatedBrenton.integrity.json",
    "public/scripture/runtime/web",
    "public/scripture/runtime/brenton",
    "app/data/bibleiq/canonical",
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

function run(command, args, cwd) {
  const result = cp.spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env }
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
    stdout: result.stdout || "",
    stderr: result.stderr || ""
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
    return {
      passed: false,
      checked: 0,
      failures: [{ reason: "missing-manifest" }]
    };
  }

  let checked = 0;
  const failures = [];

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
    if (actual !== expected) failures.push({ path: relative, expected, actual });
  }

  return {
    passed: failures.length === 0,
    checked,
    failures
  };
}

function findLatestReport(repositoryRoot, directoryPattern, summaryName, predicate) {
  const reportsRoot = path.join(repositoryRoot, ".private", "reports", "P05.12");
  if (!fs.existsSync(reportsRoot)) return null;

  const candidates = [];

  for (const entry of fs.readdirSync(reportsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !directoryPattern.test(entry.name)) continue;

    const root = path.join(reportsRoot, entry.name);
    const summaryPath = path.join(root, summaryName);
    if (!fs.existsSync(summaryPath)) continue;

    try {
      const summary = readJson(summaryPath);
      if (!predicate || predicate(summary)) {
        candidates.push({
          root,
          summaryPath,
          summary,
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

function lineEndingAnalysis(current, candidate) {
  const currentText = current.toString("utf8");
  const candidateText = candidate.toString("utf8");
  const normalizedCurrent = Buffer.from(currentText.replace(/\r\n/g, "\n"), "utf8");
  const normalizedCandidate = Buffer.from(candidateText.replace(/\r\n/g, "\n"), "utf8");

  let jsonIdentical = false;
  try {
    const currentJson = JSON.parse(currentText.replace(/^\uFEFF/, ""));
    const candidateJson = JSON.parse(candidateText.replace(/^\uFEFF/, ""));
    jsonIdentical = JSON.stringify(currentJson) === JSON.stringify(candidateJson);
  } catch {
    jsonIdentical = false;
  }

  return {
    currentBytes: current.length,
    candidateBytes: candidate.length,
    byteDelta: current.length - candidate.length,
    currentSha256: sha256Buffer(current),
    candidateSha256: sha256Buffer(candidate),
    currentCrlfCount: (currentText.match(/\r\n/g) || []).length,
    candidateCrlfCount: (candidateText.match(/\r\n/g) || []).length,
    normalizedCurrentSha256: sha256Buffer(normalizedCurrent),
    normalizedCandidateSha256: sha256Buffer(normalizedCandidate),
    exactDifferenceIsLineEndingsOnly: normalizedCurrent.equals(normalizedCandidate),
    jsonDocumentsIdentical: jsonIdentical
  };
}

function collectStringValues(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }

  if (!value || typeof value !== "object") return output;

  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, output);
  } else {
    for (const item of Object.values(value)) collectStringValues(item, output);
  }

  return output;
}

function packageCandidatePath(repositoryRoot) {
  const packagePath = path.join(repositoryRoot, "package.json");
  if (!fs.existsSync(packagePath)) return null;

  try {
    const packageJson = readJson(packagePath);
    const prebuild = String(packageJson?.scripts?.prebuild || "");
    const match = /verify-web-production-integrity\.js[\s\S]*?--candidate\s+("[^"]+"|'[^']+'|[^\s&]+)/i.exec(prebuild);
    if (!match) return null;
    return match[1].replace(/^["']|["']$/g, "");
  } catch {
    return null;
  }
}

function resolveApprovedWebCandidate(repositoryRoot, manifest, expectedHash) {
  const candidates = new Set();

  const packageCandidate = packageCandidatePath(repositoryRoot);
  if (packageCandidate) candidates.add(normalizeSlashes(packageCandidate));

  for (const value of collectStringValues(manifest)) {
    if (/generatedWEB\.candidate\.json$/i.test(value)) {
      candidates.add(normalizeSlashes(value));
    }
  }

  const searchRoot = path.join(
    repositoryRoot,
    ".private",
    "generated",
    "translation-ingestion",
    "web"
  );

  for (const file of walkFiles(searchRoot)) {
    if (/generatedWEB\.candidate\.json$/i.test(file)) {
      candidates.add(relativePath(repositoryRoot, file));
    }
  }

  const evaluated = [];

  for (const relative of [...candidates].sort()) {
    const absolute = path.resolve(repositoryRoot, ...relative.split("/"));
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      evaluated.push({ path: relative, exists: false, sha256: null, matchesExpected: false });
      continue;
    }

    const hash = sha256File(absolute);
    evaluated.push({
      path: relativePath(repositoryRoot, absolute),
      exists: true,
      bytes: fs.statSync(absolute).size,
      sha256: hash,
      matchesExpected: hash === expectedHash
    });
  }

  const matches = evaluated.filter(row => row.matchesExpected);
  if (matches.length === 0) {
    return { selected: null, evaluated };
  }

  matches.sort((left, right) => left.path.localeCompare(right.path));
  return {
    selected: {
      ...matches[0],
      absolute: path.join(repositoryRoot, ...matches[0].path.split("/"))
    },
    evaluated
  };
}

function buildGitAttributes(currentBuffer, rules) {
  const currentText = currentBuffer ? currentBuffer.toString("utf8") : "";
  const existingLines = currentText.split(/\r?\n/);
  const conflicts = [];

  for (const rule of rules) {
    const target = rule.split(/\s+/)[0];
    for (const line of existingLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const first = trimmed.split(/\s+/)[0];
      if (first === target && trimmed !== rule) {
        conflicts.push({ target, existingRule: trimmed, requiredRule: rule });
      }
    }
  }

  if (conflicts.length) return { conflicts, proposed: null };

  let proposed = currentText;
  if (proposed && !proposed.endsWith("\n")) proposed += "\n";

  for (const rule of rules) {
    const present = proposed.split(/\r?\n/).some(line => line.trim() === rule);
    if (!present) proposed += `${rule}\n`;
  }

  return {
    conflicts: [],
    proposed: Buffer.from(proposed, "utf8")
  };
}

function gitAttributes(repositoryRoot, relativeFile) {
  const result = run(
    "git",
    ["check-attr", "text", "eol", "--", relativeFile],
    repositoryRoot
  );
  const attributes = {};

  for (const line of String(result.stdout || "").split(/\r?\n/).filter(Boolean)) {
    const match = /^(.*?):\s+([^:]+):\s+(.*)$/.exec(line);
    if (match) attributes[match[2].trim()] = match[3].trim();
  }

  return {
    command: result.command,
    status: result.status,
    error: result.error,
    stderr: result.stderr,
    attributes
  };
}

function writeExact(file, buffer) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, buffer);
}

function removeIfExists(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
}

function verifyInstalled(repositoryRoot, expected) {
  const result = {};

  for (const [relative, hash] of Object.entries(expected)) {
    const absolute = path.join(repositoryRoot, relative);
    result[relative] = {
      exists: fs.existsSync(absolute),
      sha256: fs.existsSync(absolute) ? sha256File(absolute) : null,
      matches: fs.existsSync(absolute) && sha256File(absolute) === hash
    };
  }

  return {
    files: result,
    passed: Object.values(result).every(row => row.matches)
  };
}

function main() {
  const repositoryRoot = path.resolve(valueAfter("--repo", process.cwd()));
  const outputRoot = path.resolve(valueAfter("--output"));
  const promote = hasFlag("--promote");

  if (!outputRoot) throw new Error("--output is required");
  ensureDir(outputRoot);

  const report = {
    milestone: "P05.12AP-B5",
    purpose: "CONTROLLED WEB AND BRENTON LF-SERIALIZATION STABILIZATION",
    generatedAt: new Date().toISOString(),
    repository: { root: repositoryRoot },
    requestedPromotion: promote,
    preflight: {},
    evidence: {},
    transaction: {
      attempted: false,
      installed: false,
      rollbackAttempted: false,
      rollbackVerified: false
    },
    gates: {},
    authorization: {
      serializationStabilizationSucceeded: false,
      safeToCreateRefreshedKjvPromotion: false
    }
  };

  const beforeProtected = captureProtectedState(repositoryRoot);
  writeJson(path.join(outputRoot, "protected-state-before.json"), beforeProtected);

  const branch = run("git", ["branch", "--show-current"], repositoryRoot);
  report.preflight.git = {
    command: branch.command,
    status: branch.status,
    error: branch.error,
    branch: branch.stdout.trim(),
    stderr: branch.stderr
  };

  if (branch.status !== 0 || branch.stdout.trim() !== "main") {
    throw new Error(`[P05.12AP-B5] Expected branch main; found ${JSON.stringify(branch.stdout.trim())}.`);
  }

  const b3 = findLatestReport(
    repositoryRoot,
    /isolated-brenton-serialization-restore-candidate/i,
    "p0512ap-b3-summary.json",
    summary =>
      summary?.milestone === "P05.12AP-B3" &&
      summary?.authorization?.safeToCreateControlledBrentonSerializationRestore === true
  );

  if (!b3) {
    throw new Error("[P05.12AP-B5] No passing B3 Brenton candidate report was found.");
  }

  const b3Checksums = verifyChecksumManifest(b3.root);
  if (!b3Checksums.passed) {
    throw new Error(`[P05.12AP-B5] B3 checksum verification failed: ${JSON.stringify(b3Checksums.failures)}`);
  }

  const b4 = findLatestReport(
    repositoryRoot,
    /controlled-brenton-serialization-restore/i,
    "p0512ap-b4-summary.json",
    summary =>
      summary?.milestone === "P05.12AP-B4" &&
      summary?.transaction?.rollbackVerified === true &&
      summary?.transaction?.rollback?.protectedDifferences?.length === 0
  );

  if (!b4) {
    throw new Error("[P05.12AP-B5] No verified B4 rollback report was found.");
  }

  const b4Checksums = verifyChecksumManifest(b4.root);
  if (!b4Checksums.passed) {
    throw new Error(`[P05.12AP-B5] B4 checksum verification failed: ${JSON.stringify(b4Checksums.failures)}`);
  }

  const brentonRelative = "app/data/scripture/generatedBrenton.json";
  const webRelative = "app/data/scripture/generatedWEB.json";
  const brentonManifestRelative = "app/data/scripture/generatedBrenton.integrity.json";
  const webManifestRelative = "app/data/scripture/generatedWEB.integrity.json";
  const attributesRelative = ".gitattributes";

  const brentonPath = path.join(repositoryRoot, brentonRelative);
  const webPath = path.join(repositoryRoot, webRelative);
  const brentonManifestPath = path.join(repositoryRoot, brentonManifestRelative);
  const webManifestPath = path.join(repositoryRoot, webManifestRelative);
  const attributesPath = path.join(repositoryRoot, attributesRelative);

  const brentonCandidatePath = path.join(
    b3.root,
    "promotion-candidate",
    "app",
    "data",
    "scripture",
    "generatedBrenton.json"
  );

  for (const required of [
    brentonPath,
    webPath,
    brentonManifestPath,
    webManifestPath,
    brentonCandidatePath,
    path.join(repositoryRoot, "scripts", "translations", "verify-brenton-production-integrity.js"),
    path.join(repositoryRoot, "scripts", "translations", "verify-web-production-integrity.js"),
    path.join(repositoryRoot, "app", "data", "bibleiq", "canonical"),
    path.join(repositoryRoot, ".private", "sources", "web-usfm", "eng-web")
  ]) {
    if (!fs.existsSync(required)) {
      throw new Error(`[P05.12AP-B5] Missing required path: ${relativePath(repositoryRoot, required)}`);
    }
  }

  const brentonManifest = readJson(brentonManifestPath);
  const webManifest = readJson(webManifestPath);
  const expectedBrentonHash = String(brentonManifest.productionSha256 || "").toLowerCase();
  const expectedWebHash = String(
    webManifest.productionSha256 ||
    webManifest.production?.sha256 ||
    webManifest.productionHash ||
    ""
  ).toLowerCase();

  if (!/^[0-9a-f]{64}$/.test(expectedBrentonHash)) {
    throw new Error("[P05.12AP-B5] Brenton manifest has no valid production SHA-256.");
  }
  if (!/^[0-9a-f]{64}$/.test(expectedWebHash)) {
    throw new Error("[P05.12AP-B5] WEB manifest has no valid production SHA-256.");
  }

  const webCandidateResolution = resolveApprovedWebCandidate(
    repositoryRoot,
    webManifest,
    expectedWebHash
  );
  if (!webCandidateResolution.selected) {
    throw new Error(
      `[P05.12AP-B5] No retained WEB candidate matches the approved manifest hash. Evaluated: ${JSON.stringify(webCandidateResolution.evaluated)}`
    );
  }

  const currentBrenton = fs.readFileSync(brentonPath);
  const approvedBrenton = fs.readFileSync(brentonCandidatePath);
  const currentWeb = fs.readFileSync(webPath);
  const approvedWeb = fs.readFileSync(webCandidateResolution.selected.absolute);

  const brentonAnalysis = lineEndingAnalysis(currentBrenton, approvedBrenton);
  const webAnalysis = lineEndingAnalysis(currentWeb, approvedWeb);

  const attributesExisted = fs.existsSync(attributesPath);
  const currentAttributes = attributesExisted
    ? fs.readFileSync(attributesPath)
    : Buffer.alloc(0);

  const requiredRules = [
    "app/data/scripture/generatedBrenton.json text eol=lf",
    "app/data/scripture/generatedWEB.json text eol=lf"
  ];
  const attributesBuild = buildGitAttributes(
    attributesExisted ? currentAttributes : null,
    requiredRules
  );

  if (attributesBuild.conflicts.length) {
    throw new Error(`[P05.12AP-B5] Conflicting .gitattributes rules: ${JSON.stringify(attributesBuild.conflicts)}`);
  }

  const proposedAttributes = attributesBuild.proposed;
  const expectedHashes = {
    [brentonRelative]: expectedBrentonHash,
    [webRelative]: expectedWebHash,
    [attributesRelative]: sha256Buffer(proposedAttributes)
  };

  report.evidence = {
    b3: {
      reportRoot: relativePath(repositoryRoot, b3.root),
      summarySha256: sha256File(b3.summaryPath),
      checksumCount: b3Checksums.checked,
      checksumsPassed: b3Checksums.passed
    },
    b4: {
      reportRoot: relativePath(repositoryRoot, b4.root),
      summarySha256: sha256File(b4.summaryPath),
      checksumCount: b4Checksums.checked,
      checksumsPassed: b4Checksums.passed,
      rollbackVerified: b4.summary?.transaction?.rollbackVerified === true
    },
    brenton: {
      manifestExpectedSha256: expectedBrentonHash,
      currentSha256: sha256Buffer(currentBrenton),
      candidateSha256: sha256Buffer(approvedBrenton),
      candidatePath: relativePath(repositoryRoot, brentonCandidatePath),
      analysis: brentonAnalysis
    },
    web: {
      manifestExpectedSha256: expectedWebHash,
      currentSha256: sha256Buffer(currentWeb),
      candidateSha256: sha256Buffer(approvedWeb),
      candidatePath: webCandidateResolution.selected.path,
      evaluatedCandidates: webCandidateResolution.evaluated,
      analysis: webAnalysis
    },
    gitattributes: {
      existed: attributesExisted,
      currentSha256: attributesExisted ? sha256Buffer(currentAttributes) : null,
      requiredRules,
      proposedSha256: sha256Buffer(proposedAttributes)
    }
  };

  report.gates = {
    runningOnMain: branch.stdout.trim() === "main",
    b3ChecksumsPassed: b3Checksums.passed,
    b3AuthorizedBrentonCandidate:
      b3.summary?.authorization?.safeToCreateControlledBrentonSerializationRestore === true,
    b4ChecksumsPassed: b4Checksums.passed,
    b4RollbackVerified:
      b4.summary?.transaction?.rollbackVerified === true &&
      b4.summary?.transaction?.rollback?.protectedDifferences?.length === 0,
    brentonCandidateMatchesManifest:
      sha256Buffer(approvedBrenton) === expectedBrentonHash,
    brentonJsonDocumentsIdentical: brentonAnalysis.jsonDocumentsIdentical,
    brentonDifferenceIsLineEndingsOnly:
      brentonAnalysis.exactDifferenceIsLineEndingsOnly,
    webCandidateMatchesManifest: sha256Buffer(approvedWeb) === expectedWebHash,
    webJsonDocumentsIdentical: webAnalysis.jsonDocumentsIdentical,
    webDifferenceIsLineEndingsOnly: webAnalysis.exactDifferenceIsLineEndingsOnly,
    gitattributesConflictFree: attributesBuild.conflicts.length === 0
  };

  if (!Object.values(report.gates).every(Boolean)) {
    throw new Error(`[P05.12AP-B5] Preflight gates failed: ${JSON.stringify(report.gates)}`);
  }

  const npmPreflight = runNpm(["--version"], repositoryRoot);
  fs.writeFileSync(path.join(outputRoot, "npm-preflight.stdout.log"), npmPreflight.stdout, "utf8");
  fs.writeFileSync(path.join(outputRoot, "npm-preflight.stderr.log"), npmPreflight.stderr, "utf8");
  report.preflight.npm = {
    command: npmPreflight.command,
    status: npmPreflight.status,
    error: npmPreflight.error
  };

  if (npmPreflight.status !== 0) {
    throw new Error("[P05.12AP-B5] npm launcher preflight failed.");
  }

  const rollbackRoot = path.join(outputRoot, "rollback-payload");
  writeExact(path.join(rollbackRoot, brentonRelative), currentBrenton);
  writeExact(path.join(rollbackRoot, webRelative), currentWeb);

  if (attributesExisted) {
    writeExact(path.join(rollbackRoot, attributesRelative), currentAttributes);
  } else {
    writeJson(path.join(rollbackRoot, "gitattributes-absence.json"), {
      path: attributesRelative,
      existedBefore: false
    });
  }

  if (!promote) {
    writeJson(path.join(outputRoot, "p0512ap-b5-summary.json"), report);
    writeJson(path.join(outputRoot, "verdict.json"), {
      milestone: "P05.12AP-B5",
      verdict: "PROMOTION_FLAG_REQUIRED",
      safeToCreateRefreshedKjvPromotion: false,
      nextStep: "Rerun this package with -Promote."
    });
    return;
  }

  report.transaction.attempted = true;
  let failure = null;

  try {
    writeExact(brentonPath, approvedBrenton);
    writeExact(webPath, approvedWeb);
    writeExact(attributesPath, proposedAttributes);
    report.transaction.installed = true;

    const installed = verifyInstalled(repositoryRoot, expectedHashes);
    report.transaction.installedState = installed;
    if (!installed.passed) {
      throw new Error(`[P05.12AP-B5] Installed file verification failed: ${JSON.stringify(installed)}`);
    }

    const brentonAttributes = gitAttributes(repositoryRoot, brentonRelative);
    const webAttributes = gitAttributes(repositoryRoot, webRelative);
    report.transaction.effectiveGitAttributes = {
      brenton: brentonAttributes,
      web: webAttributes
    };

    for (const [label, attributes] of Object.entries({
      brenton: brentonAttributes,
      web: webAttributes
    })) {
      if (
        attributes.status !== 0 ||
        attributes.attributes.text !== "set" ||
        attributes.attributes.eol !== "lf"
      ) {
        throw new Error(`[P05.12AP-B5] ${label} LF rule is not effective: ${JSON.stringify(attributes)}`);
      }
    }

    const brentonVerifier = run(
      process.execPath,
      ["scripts/translations/verify-brenton-production-integrity.js"],
      repositoryRoot
    );
    fs.writeFileSync(
      path.join(outputRoot, "brenton-verifier.stdout.log"),
      brentonVerifier.stdout,
      "utf8"
    );
    fs.writeFileSync(
      path.join(outputRoot, "brenton-verifier.stderr.log"),
      brentonVerifier.stderr,
      "utf8"
    );
    report.transaction.brentonVerifier = {
      command: brentonVerifier.command,
      status: brentonVerifier.status,
      error: brentonVerifier.error
    };

    if (brentonVerifier.status !== 0) {
      throw new Error("[P05.12AP-B5] Brenton integrity verifier failed.");
    }

    const webVerifier = run(
      process.execPath,
      [
        "scripts/translations/verify-web-production-integrity.js",
        "--verify",
        "--production",
        webRelative,
        "--canonical-root",
        "app/data/bibleiq/canonical",
        "--manifest",
        webManifestRelative,
        "--candidate",
        webCandidateResolution.selected.path,
        "--source-root",
        ".private/sources/web-usfm/eng-web"
      ],
      repositoryRoot
    );
    fs.writeFileSync(
      path.join(outputRoot, "web-verifier.stdout.log"),
      webVerifier.stdout,
      "utf8"
    );
    fs.writeFileSync(
      path.join(outputRoot, "web-verifier.stderr.log"),
      webVerifier.stderr,
      "utf8"
    );
    report.transaction.webVerifier = {
      command: webVerifier.command,
      status: webVerifier.status,
      error: webVerifier.error
    };

    if (webVerifier.status !== 0) {
      throw new Error("[P05.12AP-B5] WEB integrity verifier failed.");
    }

    const productionBuild = runNpm(["run", "build"], repositoryRoot);
    fs.writeFileSync(
      path.join(outputRoot, "production-build.stdout.log"),
      productionBuild.stdout,
      "utf8"
    );
    fs.writeFileSync(
      path.join(outputRoot, "production-build.stderr.log"),
      productionBuild.stderr,
      "utf8"
    );
    report.transaction.productionBuild = {
      command: productionBuild.command,
      status: productionBuild.status,
      error: productionBuild.error
    };

    if (productionBuild.status !== 0) {
      throw new Error("[P05.12AP-B5] Production build failed after translation serialization stabilization.");
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
      throw new Error(`[P05.12AP-B5] Protected state changed unexpectedly: ${JSON.stringify(protectedDifferences)}`);
    }

    const finalInstalled = verifyInstalled(repositoryRoot, expectedHashes);
    if (!finalInstalled.passed) {
      throw new Error("[P05.12AP-B5] Final installed-state verification failed.");
    }

    report.authorization.serializationStabilizationSucceeded = true;
    report.authorization.safeToCreateRefreshedKjvPromotion = true;
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
      writeExact(brentonPath, currentBrenton);
      writeExact(webPath, currentWeb);

      if (attributesExisted) {
        writeExact(attributesPath, currentAttributes);
      } else {
        removeIfExists(attributesPath);
      }

      const restored = {
        brenton:
          fs.existsSync(brentonPath) &&
          sha256File(brentonPath) === sha256Buffer(currentBrenton),
        web:
          fs.existsSync(webPath) &&
          sha256File(webPath) === sha256Buffer(currentWeb),
        gitattributes: attributesExisted
          ? (
              fs.existsSync(attributesPath) &&
              sha256File(attributesPath) === sha256Buffer(currentAttributes)
            )
          : !fs.existsSync(attributesPath)
      };

      const afterRollbackProtected = captureProtectedState(repositoryRoot);
      const protectedDifferences = compareStates(
        beforeProtected,
        afterRollbackProtected
      );

      report.transaction.rollback = {
        restored,
        protectedDifferences
      };
      report.transaction.rollbackVerified =
        Object.values(restored).every(Boolean) &&
        protectedDifferences.length === 0;
    } catch (rollbackError) {
      report.transaction.rollback = {
        error: rollbackError.message,
        stack: rollbackError.stack
      };
      report.transaction.rollbackVerified = false;
    }
  }

  writeJson(path.join(outputRoot, "p0512ap-b5-summary.json"), report);

  const verdict = report.authorization.safeToCreateRefreshedKjvPromotion
    ? {
        milestone: "P05.12AP-B5",
        verdict: "TRANSLATION_SERIALIZATION_STABILIZATION_PASSED",
        approvedBrentonSha256: expectedBrentonHash,
        approvedWebSha256: expectedWebHash,
        gitattributesSha256: sha256Buffer(proposedAttributes),
        productionBuildPassed: true,
        safeToCreateRefreshedKjvPromotion: true,
        nextStep:
          "Create the refreshed final KJV2006 controlled-promotion package using this stable WEB and Brenton state as protected preconditions."
      }
    : {
        milestone: "P05.12AP-B5",
        verdict: "STABILIZATION_FAILED_AND_ROLLBACK_EVALUATED",
        failure: report.transaction.failure || null,
        rollbackVerified: report.transaction.rollbackVerified,
        safeToCreateRefreshedKjvPromotion: false,
        nextStep: "Inspect the B5 logs. Do not rerun KJV promotion."
      };

  writeJson(path.join(outputRoot, "verdict.json"), verdict);
  console.log(JSON.stringify(verdict, null, 2));

  if (!report.authorization.safeToCreateRefreshedKjvPromotion) {
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
        milestone: "P05.12AP-B5",
        generatedAt: new Date().toISOString(),
        message: error.message,
        stack: error.stack
      });
    } catch {}
  }
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
