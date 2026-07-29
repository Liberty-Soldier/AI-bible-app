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

function treeFingerprint(target) {
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
  const paths = [
    "app/data/scripture/generatedKJV.json",
    "app/data/scripture/generatedKJV.ts",
    "app/data/scripture/CanonicalVerseStore.ts",
    "public/scripture/runtime/kjv",
    "public/data/bibleiq/word-study-kjv-reader",
    "app/data/scripture/generatedWEB.json",
    "app/data/scripture/generatedWEB.integrity.json",
    "app/data/scripture/generatedBrenton.json",
    "app/data/scripture/generatedBrenton.integrity.json",
    ".gitattributes",
    "public/scripture/runtime/web",
    "public/scripture/runtime/brenton",
    "app/data/bibleiq/canonical",
    ".private/scripture/canonical",
    ".private/alignment"
  ];

  return paths.map(relative => ({
    path: relative,
    ...treeFingerprint(path.join(repositoryRoot, relative))
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
  const manifestPath = path.join(reportRoot, "checksums.sha256");
  if (!fs.existsSync(manifestPath)) {
    return {
      passed: false,
      checked: 0,
      failures: [{ reason: "missing-manifest" }]
    };
  }

  const failures = [];
  let checked = 0;

  for (const [index, line] of fs.readFileSync(manifestPath, "utf8").split(/\r?\n/).entries()) {
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

function findLatestFailedAp(repositoryRoot) {
  const reportsRoot = path.join(repositoryRoot, ".private", "reports", "P05.12");
  if (!fs.existsSync(reportsRoot)) return null;

  const candidates = [];

  for (const entry of fs.readdirSync(reportsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/controlled-kjv2006-production-promotion/i.test(entry.name)) {
      continue;
    }

    const root = path.join(reportsRoot, entry.name);
    const summaryPath = path.join(root, "p0512ap-summary.json");
    const stderrPath = path.join(root, "production-build.stderr.log");
    const candidateTsPath = path.join(
      root,
      "prepared-promotion-payload",
      "app",
      "data",
      "scripture",
      "generatedKJV.ts"
    );
    const candidateJsonPath = path.join(
      root,
      "prepared-promotion-payload",
      "app",
      "data",
      "scripture",
      "generatedKJV.json"
    );

    if (
      !fs.existsSync(summaryPath) ||
      !fs.existsSync(stderrPath) ||
      !fs.existsSync(candidateTsPath) ||
      !fs.existsSync(candidateJsonPath)
    ) {
      continue;
    }

    try {
      const summary = readJson(summaryPath);
      const stderr = fs.readFileSync(stderrPath, "utf8");

      if (
        summary?.milestone === "P05.12AP" &&
        summary?.postPromotion?.payload?.passed === true &&
        summary?.postPromotion?.kjvRuntime?.passed === true &&
        summary?.postPromotion?.productionBuild?.passed === false &&
        summary?.rollback?.verified === true &&
        summary?.rollback?.protectedStateRestored === true &&
        summary?.authorization?.productionPromotionSucceeded === false &&
        /tokenAvailabilityKey/.test(stderr) &&
        /does not exist in type 'Verse'/.test(stderr)
      ) {
        candidates.push({
          root,
          summaryPath,
          stderrPath,
          candidateTsPath,
          candidateJsonPath,
          summary,
          stderr,
          mtimeMs: fs.statSync(summaryPath).mtimeMs
        });
      }
    } catch {
      // Ignore malformed report directories.
    }
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0] || null;
}

function findVerseDeclaration(ts, sourceFile) {
  const matches = [];

  function visit(node) {
    if (
      ts.isInterfaceDeclaration(node) &&
      node.name &&
      node.name.text === "Verse"
    ) {
      matches.push({
        kind: "interface",
        node,
        members: node.members,
        closeBracePosition: node.end - 1
      });
    }

    if (
      ts.isTypeAliasDeclaration(node) &&
      node.name &&
      node.name.text === "Verse" &&
      ts.isTypeLiteralNode(node.type)
    ) {
      matches.push({
        kind: "type-alias",
        node,
        members: node.type.members,
        closeBracePosition: node.type.end - 1
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return matches;
}

function propertyNameText(ts, member) {
  if (!member.name) return null;
  if (ts.isIdentifier(member.name)) return member.name.text;
  if (ts.isStringLiteral(member.name)) return member.name.text;
  return null;
}

function patchVerseTypeText(sourceText, fileName = "types.ts") {
  const ts = require("typescript");
  const scriptKind = fileName.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );

  const parseDiagnostics = sourceFile.parseDiagnostics || [];
  if (parseDiagnostics.length) {
    throw new Error(
      `[P05.12AP-B6] TypeScript parse errors in ${fileName}: ` +
      parseDiagnostics.map(item => item.messageText).join("; ")
    );
  }

  const declarations = findVerseDeclaration(ts, sourceFile);
  if (declarations.length !== 1) {
    throw new Error(
      `[P05.12AP-B6] Expected exactly one Verse object declaration in ${fileName}; found ${declarations.length}.`
    );
  }

  const declaration = declarations[0];
  const existing = declaration.members.filter(
    member => propertyNameText(ts, member) === "tokenAvailabilityKey"
  );

  if (existing.length > 1) {
    throw new Error("[P05.12AP-B6] Verse has duplicate tokenAvailabilityKey declarations.");
  }

  if (existing.length === 1) {
    const member = existing[0];
    const printed = member.getText(sourceFile).replace(/\s+/g, " ");
    const optional = Boolean(member.questionToken);
    const typeText = member.type ? member.type.getText(sourceFile).replace(/\s+/g, "") : "";

    const acceptsStringAndNull =
      typeText === "string|null" ||
      typeText === "null|string" ||
      typeText === "string|null|undefined" ||
      typeText === "null|string|undefined" ||
      typeText === "undefined|string|null" ||
      typeText === "undefined|null|string";

    if (!optional || !acceptsStringAndNull) {
      throw new Error(
        `[P05.12AP-B6] Existing Verse.tokenAvailabilityKey is not the required optional string|null contract: ${printed}`
      );
    }

    return {
      changed: false,
      sourceText,
      declarationKind: declaration.kind,
      existingPropertyText: printed
    };
  }

  const newline = sourceText.includes("\r\n") ? "\r\n" : "\n";
  let indent = "  ";

  if (declaration.members.length > 0) {
    const firstStart = declaration.members[0].getStart(sourceFile);
    const lineStart = sourceText.lastIndexOf("\n", firstStart - 1) + 1;
    const prefix = sourceText.slice(lineStart, firstStart);
    const whitespace = /^[\t ]*/.exec(prefix)?.[0];
    if (whitespace) indent = whitespace;
  } else {
    const declarationStart = declaration.node.getStart(sourceFile);
    const lineStart = sourceText.lastIndexOf("\n", declarationStart - 1) + 1;
    const declarationIndent = /^[\t ]*/.exec(
      sourceText.slice(lineStart, declarationStart)
    )?.[0] || "";
    indent = `${declarationIndent}  `;
  }

  const close = declaration.closeBracePosition;
  const beforeClose = sourceText.slice(0, close);
  const afterClose = sourceText.slice(close);
  const needsLeadingNewline =
    !beforeClose.endsWith("\n") && !beforeClose.endsWith("\r");
  const insertion =
    `${needsLeadingNewline ? newline : ""}` +
    `${indent}tokenAvailabilityKey?: string | null;${newline}`;

  const patched = `${beforeClose}${insertion}${afterClose}`;

  const verificationFile = ts.createSourceFile(
    fileName,
    patched,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );
  const verifiedDeclarations = findVerseDeclaration(ts, verificationFile);
  if (verifiedDeclarations.length !== 1) {
    throw new Error("[P05.12AP-B6] Patched Verse declaration could not be re-read uniquely.");
  }

  const verifiedProperty = verifiedDeclarations[0].members.find(
    member => propertyNameText(ts, member) === "tokenAvailabilityKey"
  );

  if (!verifiedProperty || !verifiedProperty.questionToken || !verifiedProperty.type) {
    throw new Error("[P05.12AP-B6] Patched Verse property failed structural verification.");
  }

  const verifiedType = verifiedProperty.type
    .getText(verificationFile)
    .replace(/\s+/g, "");

  if (!(verifiedType === "string|null" || verifiedType === "null|string")) {
    throw new Error(
      `[P05.12AP-B6] Patched Verse property has unexpected type: ${verifiedType}`
    );
  }

  return {
    changed: true,
    sourceText: patched,
    declarationKind: declaration.kind,
    insertedProperty: "tokenAvailabilityKey?: string | null;"
  };
}

function validateCandidateJson(candidateJsonPath) {
  const rows = readJson(candidateJsonPath);
  if (!Array.isArray(rows) || rows.length !== 31102) {
    throw new Error(
      `[P05.12AP-B6] Candidate generatedKJV.json has ${Array.isArray(rows) ? rows.length : "non-array"} rows; expected 31,102.`
    );
  }

  let stringValues = 0;
  let nullValues = 0;
  let missingValues = 0;
  const invalid = [];

  rows.forEach((row, index) => {
    if (!Object.prototype.hasOwnProperty.call(row, "tokenAvailabilityKey")) {
      missingValues += 1;
      if (invalid.length < 20) invalid.push({ index, reason: "missing" });
      return;
    }

    if (typeof row.tokenAvailabilityKey === "string") {
      stringValues += 1;
      return;
    }

    if (row.tokenAvailabilityKey === null) {
      nullValues += 1;
      return;
    }

    if (invalid.length < 20) {
      invalid.push({
        index,
        reason: "invalid-type",
        type: typeof row.tokenAvailabilityKey,
        value: row.tokenAvailabilityKey
      });
    }
  });

  const passed =
    stringValues === 31085 &&
    nullValues === 17 &&
    missingValues === 0 &&
    invalid.length === 0;

  return {
    passed,
    totalRows: rows.length,
    stringValues,
    nullValues,
    missingValues,
    invalid
  };
}

function main() {
  const repositoryRoot = path.resolve(valueAfter("--repo", process.cwd()));
  const outputRoot = path.resolve(valueAfter("--output"));
  const apply = hasFlag("--apply");

  if (!outputRoot) throw new Error("--output is required");
  ensureDir(outputRoot);

  const report = {
    milestone: "P05.12AP-B6",
    purpose: "CONTROLLED KJV VERSE TYPE-CONTRACT RESTORE",
    generatedAt: new Date().toISOString(),
    repository: { root: repositoryRoot },
    requestedApplication: apply,
    sourceAp: {},
    preflight: {},
    transaction: {
      attempted: false,
      typeContractInstalled: false,
      candidateTypeCheckPerformed: false,
      temporaryCandidateRestored: false,
      rollbackAttempted: false,
      rollbackVerified: false
    },
    gates: {},
    authorization: {
      verseTypeContractFixSucceeded: false,
      safeToRerunFinalKjvPromotion: false
    }
  };

  const branch = run("git", ["branch", "--show-current"], repositoryRoot);
  report.preflight.git = {
    command: branch.command,
    status: branch.status,
    error: branch.error,
    branch: branch.stdout.trim(),
    stderr: branch.stderr
  };

  if (branch.status !== 0 || branch.stdout.trim() !== "main") {
    throw new Error(`[P05.12AP-B6] Expected branch main; found ${JSON.stringify(branch.stdout.trim())}.`);
  }

  const typesRelative = "app/data/types.ts";
  const productionKjvTsRelative = "app/data/scripture/generatedKJV.ts";
  const typesPath = path.join(repositoryRoot, typesRelative);
  const productionKjvTsPath = path.join(repositoryRoot, productionKjvTsRelative);

  if (!fs.existsSync(typesPath) || !fs.statSync(typesPath).isFile()) {
    throw new Error(`[P05.12AP-B6] Missing ${typesRelative}.`);
  }
  if (!fs.existsSync(productionKjvTsPath) || !fs.statSync(productionKjvTsPath).isFile()) {
    throw new Error(`[P05.12AP-B6] Missing ${productionKjvTsRelative}.`);
  }

  // Prove the TypeScript compiler dependency is available before any write.
  try {
    require.resolve("typescript", { paths: [repositoryRoot] });
  } catch {
    throw new Error("[P05.12AP-B6] The repository TypeScript compiler package could not be resolved.");
  }

  const failedAp = findLatestFailedAp(repositoryRoot);
  if (!failedAp) {
    throw new Error("[P05.12AP-B6] No exact failed AP report with verified rollback and the tokenAvailabilityKey type error was found.");
  }

  const apChecksums = verifyChecksumManifest(failedAp.root);
  if (!apChecksums.passed) {
    throw new Error(`[P05.12AP-B6] Failed AP report checksums are invalid: ${JSON.stringify(apChecksums.failures)}`);
  }

  const candidateValidation = validateCandidateJson(failedAp.candidateJsonPath);
  if (!candidateValidation.passed) {
    throw new Error(`[P05.12AP-B6] Candidate tokenAvailabilityKey values are invalid: ${JSON.stringify(candidateValidation)}`);
  }

  const candidateTsText = fs.readFileSync(failedAp.candidateTsPath, "utf8");
  if (
    !/^import type \{ Verse \} from "\.\.\/types";/m.test(candidateTsText) ||
    !/tokenAvailabilityKey/.test(candidateTsText)
  ) {
    throw new Error("[P05.12AP-B6] Candidate generatedKJV.ts does not use the expected shared Verse type contract.");
  }

  const protectedBefore = captureProtectedState(repositoryRoot);
  writeJson(path.join(outputRoot, "protected-state-before.json"), protectedBefore);

  const originalTypes = fs.readFileSync(typesPath);
  const originalKjvTs = fs.readFileSync(productionKjvTsPath);
  const patch = patchVerseTypeText(originalTypes.toString("utf8"), typesRelative);
  const patchedTypes = Buffer.from(patch.sourceText, "utf8");

  report.sourceAp = {
    reportRoot: relativePath(repositoryRoot, failedAp.root),
    summaryPath: relativePath(repositoryRoot, failedAp.summaryPath),
    summarySha256: sha256File(failedAp.summaryPath),
    reportChecksumEntries: apChecksums.checked,
    reportChecksumsPassed: apChecksums.passed,
    buildError: failedAp.stderr.trim(),
    candidateGeneratedKjvTs: {
      path: relativePath(repositoryRoot, failedAp.candidateTsPath),
      sha256: sha256File(failedAp.candidateTsPath)
    },
    candidateGeneratedKjvJson: {
      path: relativePath(repositoryRoot, failedAp.candidateJsonPath),
      sha256: sha256File(failedAp.candidateJsonPath),
      tokenAvailability: candidateValidation
    }
  };

  report.preflight.typeContract = {
    path: typesRelative,
    beforeSha256: sha256Buffer(originalTypes),
    afterSha256: sha256Buffer(patchedTypes),
    declarationKind: patch.declarationKind,
    changed: patch.changed,
    insertedProperty: patch.insertedProperty || null,
    existingPropertyText: patch.existingPropertyText || null
  };

  const expectedInsertionCount =
    (patch.sourceText.match(/tokenAvailabilityKey\?\s*:\s*string\s*\|\s*null\s*;/g) || []).length;

  report.gates = {
    runningOnMain: branch.stdout.trim() === "main",
    failedApChecksumsPassed: apChecksums.passed,
    failedApPayloadPassed:
      failedAp.summary?.postPromotion?.payload?.passed === true,
    failedApKjvRuntimePassed:
      failedAp.summary?.postPromotion?.kjvRuntime?.passed === true,
    failedApRollbackVerified:
      failedAp.summary?.rollback?.verified === true &&
      failedAp.summary?.rollback?.protectedStateRestored === true &&
      (failedAp.summary?.rollback?.differences || []).length === 0 &&
      (failedAp.summary?.rollback?.protectedDifferences || []).length === 0,
    exactBuildErrorConfirmed:
      /tokenAvailabilityKey/.test(failedAp.stderr) &&
      /does not exist in type 'Verse'/.test(failedAp.stderr),
    candidateHas31085StringKeys:
      candidateValidation.stringValues === 31085,
    candidateHas17NullFailClosedKeys:
      candidateValidation.nullValues === 17,
    candidateHasNoMissingOrInvalidKeys:
      candidateValidation.missingValues === 0 &&
      candidateValidation.invalid.length === 0,
    exactContractPresentOnce: expectedInsertionCount === 1,
    typePatchIsInsertionOnly:
      patch.changed
        ? patchedTypes.length > originalTypes.length &&
          patch.sourceText.replace(
            /[ \t]*tokenAvailabilityKey\?\s*:\s*string\s*\|\s*null\s*;\r?\n/,
            ""
          ) === originalTypes.toString("utf8")
        : true
  };

  if (!Object.values(report.gates).every(Boolean)) {
    throw new Error(`[P05.12AP-B6] Preflight gates failed: ${JSON.stringify(report.gates)}`);
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
    throw new Error("[P05.12AP-B6] npm launcher preflight failed.");
  }

  const rollbackRoot = path.join(outputRoot, "rollback-payload");
  ensureDir(path.join(rollbackRoot, path.dirname(typesRelative)));
  ensureDir(path.join(rollbackRoot, path.dirname(productionKjvTsRelative)));
  fs.writeFileSync(path.join(rollbackRoot, typesRelative), originalTypes);
  fs.writeFileSync(path.join(rollbackRoot, productionKjvTsRelative), originalKjvTs);
  fs.writeFileSync(path.join(outputRoot, "patched-types.preview.ts"), patchedTypes);

  if (!apply) {
    writeJson(path.join(outputRoot, "p0512ap-b6-summary.json"), report);
    writeJson(path.join(outputRoot, "verdict.json"), {
      milestone: "P05.12AP-B6",
      verdict: "APPLICATION_FLAG_REQUIRED",
      safeToRerunFinalKjvPromotion: false,
      nextStep: "Rerun this package with -Apply."
    });
    return;
  }

  report.transaction.attempted = true;
  let failure = null;

  try {
    // Install the shared optional metadata contract.
    fs.writeFileSync(typesPath, patchedTypes);
    report.transaction.typeContractInstalled = true;

    if (sha256File(typesPath) !== sha256Buffer(patchedTypes)) {
      throw new Error("[P05.12AP-B6] Installed app/data/types.ts hash mismatch.");
    }

    // Temporarily compile the exact approved candidate that failed previously.
    fs.writeFileSync(productionKjvTsPath, fs.readFileSync(failedAp.candidateTsPath));
    report.transaction.candidateTypeCheckPerformed = true;

    const build = runNpm(["run", "build"], repositoryRoot);
    fs.writeFileSync(path.join(outputRoot, "candidate-production-build.stdout.log"), build.stdout, "utf8");
    fs.writeFileSync(path.join(outputRoot, "candidate-production-build.stderr.log"), build.stderr, "utf8");
    writeJson(path.join(outputRoot, "candidate-production-build.result.json"), {
      command: build.command,
      status: build.status,
      signal: build.signal,
      error: build.error
    });

    // Always restore the currently promoted/rolled-back KJV TypeScript artifact.
    fs.writeFileSync(productionKjvTsPath, originalKjvTs);
    report.transaction.temporaryCandidateRestored =
      sha256File(productionKjvTsPath) === sha256Buffer(originalKjvTs);

    if (!report.transaction.temporaryCandidateRestored) {
      throw new Error("[P05.12AP-B6] Temporary candidate generatedKJV.ts was not restored.");
    }

    if (build.status !== 0) {
      throw new Error("[P05.12AP-B6] The exact approved KJV candidate still failed the production build after the Verse contract correction.");
    }

    const protectedAfter = captureProtectedState(repositoryRoot);
    const protectedDifferences = compareStates(protectedBefore, protectedAfter);
    report.protectedState = {
      before: protectedBefore,
      after: protectedAfter,
      differences: protectedDifferences
    };
    writeJson(path.join(outputRoot, "protected-state-after.json"), protectedAfter);

    if (protectedDifferences.length !== 0) {
      throw new Error(`[P05.12AP-B6] Protected Scripture state changed unexpectedly: ${JSON.stringify(protectedDifferences)}`);
    }

    if (sha256File(typesPath) !== sha256Buffer(patchedTypes)) {
      throw new Error("[P05.12AP-B6] Final Verse type-contract hash mismatch.");
    }

    report.authorization.verseTypeContractFixSucceeded = true;
    report.authorization.safeToRerunFinalKjvPromotion = true;
  } catch (error) {
    failure = error;
    report.transaction.failure = {
      message: error.message,
      stack: error.stack
    };
  } finally {
    // Never leave the temporary KJV candidate installed from this stage.
    try {
      fs.writeFileSync(productionKjvTsPath, originalKjvTs);
      report.transaction.temporaryCandidateRestored =
        sha256File(productionKjvTsPath) === sha256Buffer(originalKjvTs);
    } catch (restoreError) {
      report.transaction.temporaryCandidateRestoreError = {
        message: restoreError.message,
        stack: restoreError.stack
      };
      report.transaction.temporaryCandidateRestored = false;
      failure = failure || restoreError;
    }
  }

  if (failure) {
    report.transaction.rollbackAttempted = true;

    try {
      fs.writeFileSync(typesPath, originalTypes);
      fs.writeFileSync(productionKjvTsPath, originalKjvTs);

      const protectedAfterRollback = captureProtectedState(repositoryRoot);
      const rollbackDifferences = compareStates(
        protectedBefore,
        protectedAfterRollback
      );

      report.transaction.rollback = {
        typesRestored:
          sha256File(typesPath) === sha256Buffer(originalTypes),
        generatedKjvTsRestored:
          sha256File(productionKjvTsPath) === sha256Buffer(originalKjvTs),
        protectedDifferences: rollbackDifferences
      };

      report.transaction.rollbackVerified =
        report.transaction.rollback.typesRestored &&
        report.transaction.rollback.generatedKjvTsRestored &&
        rollbackDifferences.length === 0;
    } catch (rollbackError) {
      report.transaction.rollback = {
        error: rollbackError.message,
        stack: rollbackError.stack
      };
      report.transaction.rollbackVerified = false;
    }
  }

  writeJson(path.join(outputRoot, "p0512ap-b6-summary.json"), report);

  const verdict = report.authorization.safeToRerunFinalKjvPromotion
    ? {
        milestone: "P05.12AP-B6",
        verdict: "KJV_VERSE_TYPE_CONTRACT_FIX_PASSED",
        installedContract: "tokenAvailabilityKey?: string | null;",
        supportedReaderCoordinates: 31085,
        failClosedReaderCoordinates: 17,
        exactApprovedCandidateProductionBuildPassed: true,
        protectedScriptureStateUnchanged: true,
        safeToRerunFinalKjvPromotion: true,
        nextStep: "Rerun P05.12AP V3. The final promoter will install the same candidate that passed this exact production build."
      }
    : {
        milestone: "P05.12AP-B6",
        verdict: "TYPE_CONTRACT_FIX_FAILED_AND_ROLLBACK_EVALUATED",
        failure: report.transaction.failure || null,
        rollbackVerified: report.transaction.rollbackVerified,
        safeToRerunFinalKjvPromotion: false,
        nextStep: "Inspect the B6 report. Do not rerun the final KJV promotion."
      };

  writeJson(path.join(outputRoot, "verdict.json"), verdict);
  console.log(JSON.stringify(verdict, null, 2));

  if (!report.authorization.safeToRerunFinalKjvPromotion) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const output = valueAfter("--output");
    if (output) {
      try {
        ensureDir(path.resolve(output));
        writeJson(path.join(path.resolve(output), "fatal-error.json"), {
          milestone: "P05.12AP-B6",
          generatedAt: new Date().toISOString(),
          message: error.message,
          stack: error.stack
        });
      } catch {}
    }

    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  patchVerseTypeText
};
