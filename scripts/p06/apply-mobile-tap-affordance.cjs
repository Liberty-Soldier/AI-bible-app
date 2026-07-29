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

function runNpm(args, cwd) {
  if (process.platform === "win32") {
    const shell = process.env.ComSpec || "cmd.exe";
    return run(shell, ["/d", "/s", "/c", ["npm", ...args].join(" ")], cwd);
  }

  return run("npm", args, cwd);
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

  return files.sort((a, b) => a.localeCompare(b));
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
  const paths = [
    "app/data/scripture/generatedKJV.json",
    "app/data/scripture/generatedKJV.ts",
    "app/data/scripture/generatedWEB.json",
    "app/data/scripture/generatedBrenton.json",
    "app/data/scripture/CanonicalVerseStore.ts",
    "public/scripture/runtime/kjv",
    "public/scripture/runtime/web",
    "public/scripture/runtime/brenton",
    "public/data/bibleiq/word-study-kjv-reader",
    "app/data/bibleiq/canonical",
    ".private/scripture/canonical",
    ".private/alignment",
    ".gitattributes"
  ];

  return paths.map(relative => ({
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

function findPassingP063(repositoryRoot) {
  const reportsRoot = path.join(repositoryRoot, ".private", "reports", "P06.3");

  if (!fs.existsSync(reportsRoot)) return null;

  const candidates = [];

  for (const entry of fs.readdirSync(reportsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/reader-first-correction/i.test(entry.name)) {
      continue;
    }

    const root = path.join(reportsRoot, entry.name);
    const summaryPath = path.join(root, "p063-summary.json");
    const verdictPath = path.join(root, "verdict.json");

    if (!fs.existsSync(summaryPath) || !fs.existsSync(verdictPath)) continue;

    try {
      const summary = readJson(summaryPath);
      const verdict = readJson(verdictPath);
      const checksums = verifyChecksumManifest(root);

      if (
        checksums.passed &&
        summary?.milestone === "P06.3" &&
        summary?.build?.passed === true &&
        summary?.authorization?.safeToReviewOnDevice === true &&
        verdict?.verdict === "READER_FIRST_CORRECTION_PASSED"
      ) {
        candidates.push({
          root,
          summaryPath,
          verdictPath,
          summary,
          verdict,
          checksums,
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

function backupPath(repositoryRoot, reportRoot, relative) {
  const source = path.join(repositoryRoot, relative);
  const backup = path.join(reportRoot, "rollback-payload", relative);

  if (!fs.existsSync(source)) {
    writeJson(`${backup}.absence.json`, {
      path: relative,
      existedBefore: false
    });
    return;
  }

  ensureDir(path.dirname(backup));
  fs.cpSync(source, backup, { recursive: true, force: true });
}

function restorePath(repositoryRoot, reportRoot, relative) {
  const target = path.join(repositoryRoot, relative);
  const backup = path.join(reportRoot, "rollback-payload", relative);
  const absence = `${backup}.absence.json`;

  fs.rmSync(target, { recursive: true, force: true });

  if (fs.existsSync(backup)) {
    ensureDir(path.dirname(target));
    fs.cpSync(backup, target, { recursive: true, force: true });
  } else if (!fs.existsSync(absence)) {
    throw new Error(`[P06.4] Missing rollback evidence for ${relative}.`);
  }
}

function replaceExactlyOnce(text, oldValue, newValue, label) {
  const count = text.split(oldValue).length - 1;

  if (count !== 1) {
    throw new Error(`[P06.4] Expected one ${label}; found ${count}.`);
  }

  return text.replace(oldValue, newValue);
}

function replaceRegexExactlyOnce(text, regex, replacement, label) {
  const matches = text.match(regex);

  if (!matches || matches.length !== 1) {
    throw new Error(
      `[P06.4] Expected one regex match for ${label}; found ${matches ? matches.length : 0}.`
    );
  }

  return text.replace(regex, replacement);
}

function patchMobileAffordanceStyles(repositoryRoot) {
  const file = path.join(repositoryRoot, "app/globals.css");
  let text = fs.readFileSync(file, "utf8");

  if (text.includes("MOBILE SOURCE-WORD AFFORDANCE")) {
    return;
  }

  const block = `/* MOBILE SOURCE-WORD AFFORDANCE
   Touch devices have no hover state. A faint dotted underline identifies
   source-supported words without turning the reader into an annotated page. */
@media (hover: none) and (pointer: coarse) {
  [data-word-token="true"] {
    text-decoration-line: underline !important;
    text-decoration-style: dotted !important;
    text-decoration-thickness: 1px !important;
    text-decoration-color: color-mix(
      in srgb,
      var(--muted) 31%,
      transparent
    ) !important;
    text-underline-offset: 0.2em !important;
    text-decoration-skip-ink: auto;
    touch-action: manipulation;
  }

  [data-word-token="true"][data-word-kind="function"] {
    text-decoration-color: color-mix(
      in srgb,
      var(--muted) 19%,
      transparent
    ) !important;
  }

  [data-word-token="true"][data-word-focused="true"] {
    text-decoration-style: solid !important;
    text-decoration-color: var(--brand) !important;
  }
}

`;

  text = replaceExactlyOnce(
    text,
    "@media (prefers-reduced-motion: reduce) {",
    `${block}@media (prefers-reduced-motion: reduce) {`,
    "reduced-motion CSS anchor"
  );

  fs.writeFileSync(file, text, "utf8");
}

function patchResponsiveReaderInstruction(repositoryRoot) {
  const file = path.join(
    repositoryRoot,
    "app/read/[book]/[chapter]/page.tsx"
  );
  let text = fs.readFileSync(file, "utf8");

  text = replaceRegexExactlyOnce(
    text,
    /Tap a word to see what it means here and trace its source evidence\.\s*Tap a verse number for highlights, notes, bookmarks, copy, and share\./,
    `<span className="md:hidden">
                  A faint dotted underline marks words you can tap for source
                  evidence. Tap a verse number for highlights and notes.
                </span>
                <span className="hidden md:inline">
                  Hover over or click a word for source evidence. Click a verse
                  number for highlights and notes.
                </span>`,
    "responsive reader instruction"
  );

  fs.writeFileSync(file, text, "utf8");
}

function patchUnifiedReaderVerifier(repositoryRoot) {
  const file = path.join(
    repositoryRoot,
    "scripts/verify-p05-unified-reader.js"
  );
  let text = fs.readFileSync(file, "utf8");

  if (!text.includes('const globalStyles = read("app/globals.css");')) {
    text = replaceExactlyOnce(
      text,
      'const scriptureText = read("app/components/ScriptureText.tsx");',
      `const scriptureText = read("app/components/ScriptureText.tsx");
const globalStyles = read("app/globals.css");`,
      "unified-reader global style source"
    );
  }

  text = replaceRegexExactlyOnce(
    text,
    /assertPresent\(\s*readerPage,\s*\/Tap a word to see what it means here and trace its source evidence\/,\s*"reader page",\s*\);/,
    `assertPresent(
  readerPage,
  /A faint dotted underline marks words you can tap for source/,
  "reader page",
);
assertPresent(
  readerPage,
  /Hover over or click a word for source evidence/,
  "reader page",
);`,
    "unified-reader responsive instruction contract"
  );

  if (!text.includes("Touch-only mobile word affordance is missing")) {
    const anchor = `assertAbsent(
  scriptureText,
  /textDecorationStyle:\\s*"dotted"/,
  "ScriptureText",
);`;

    const replacement = `${anchor}
assertPresent(
  globalStyles,
  /@media\\s*\\(hover:\\s*none\\)\\s*and\\s*\\(pointer:\\s*coarse\\)/,
  "global styles",
);
assertPresent(
  globalStyles,
  /MOBILE SOURCE-WORD AFFORDANCE[\\s\\S]*?text-decoration-style:\\s*dotted/,
  "global styles",
);`;

    text = replaceExactlyOnce(
      text,
      anchor,
      replacement,
      "unified-reader mobile affordance verifier anchor"
    );
  }

  fs.writeFileSync(file, text, "utf8");
}

function patchWordStudyUxVerifier(repositoryRoot) {
  const file = path.join(
    repositoryRoot,
    "scripts/verify-p05-word-study-ux.js"
  );
  let text = fs.readFileSync(file, "utf8");

  if (!text.includes('const globalStyles = read("app/globals.css");')) {
    text = replaceExactlyOnce(
      text,
      'const scripture = read("app/components/ScriptureText.tsx");',
      `const scripture = read("app/components/ScriptureText.tsx");
const globalStyles = read("app/globals.css");`,
      "word-study global style source"
    );
  }

  if (!text.includes("Mobile touch affordance is missing.")) {
    const anchor = `assert(
  !/textDecorationStyle:\\s*"dotted"/.test(scripture),
  "Obsolete dotted word hint remains.",
);`;

    const replacement = `${anchor}
assert(
  /@media\\s*\\(hover:\\s*none\\)\\s*and\\s*\\(pointer:\\s*coarse\\)/.test(globalStyles),
  "Mobile touch affordance is missing.",
);
assert(
  /MOBILE SOURCE-WORD AFFORDANCE[\\s\\S]*?text-decoration-style:\\s*dotted/.test(globalStyles),
  "Mobile source-word cue is missing.",
);`;

    text = replaceExactlyOnce(
      text,
      anchor,
      replacement,
      "word-study mobile affordance verifier anchor"
    );
  }

  text = text.replace(
    'console.log("- Only the selected word receives persistent emphasis");',
    `console.log("- Only the selected word receives persistent emphasis");
console.log("- Touch devices receive a subtle source-word cue");`
  );

  fs.writeFileSync(file, text, "utf8");
}

function main() {
  const repositoryRoot = path.resolve(valueAfter("--repo", process.cwd()));
  const outputRoot = path.resolve(valueAfter("--output"));
  const apply = hasFlag("--apply");

  if (!outputRoot) throw new Error("--output is required");
  ensureDir(outputRoot);

  const report = {
    milestone: "P06.4",
    purpose: "MOBILE SOURCE-WORD TAP AFFORDANCE",
    generatedAt: new Date().toISOString(),
    repository: { root: repositoryRoot },
    requestedApplication: apply,
    p063Evidence: {},
    transaction: {
      attempted: false,
      installed: false,
      rollbackAttempted: false,
      rollbackVerified: false
    },
    changedFiles: [],
    build: {},
    protectedState: {},
    authorization: {
      mobileTapAffordanceApplied: false,
      safeToReviewOnDevice: false
    }
  };

  const branch = run("git", ["branch", "--show-current"], repositoryRoot);

  if (branch.status !== 0 || branch.stdout.trim() !== "main") {
    throw new Error(
      `[P06.4] Expected branch main; found ${JSON.stringify(branch.stdout.trim())}.`
    );
  }

  const p063 = findPassingP063(repositoryRoot);

  if (!p063) {
    throw new Error("[P06.4] No passing P06.3 report with valid checksums was found.");
  }

  report.p063Evidence = {
    reportRoot: relativePath(repositoryRoot, p063.root),
    summarySha256: sha256File(p063.summaryPath),
    checksumEntries: p063.checksums.checked,
    checksumsPassed: p063.checksums.passed
  };

  const managedFiles = [
    "app/globals.css",
    "app/read/[book]/[chapter]/page.tsx",
    "scripts/verify-p05-unified-reader.js",
    "scripts/verify-p05-word-study-ux.js"
  ];

  for (const relative of managedFiles) {
    const absolute = path.join(repositoryRoot, relative);

    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new Error(`[P06.4] Missing required file ${relative}.`);
    }
  }

  const npmPreflight = runNpm(["--version"], repositoryRoot);

  if (npmPreflight.status !== 0) {
    throw new Error("[P06.4] npm launcher preflight failed.");
  }

  const protectedBefore = captureProtectedState(repositoryRoot);
  writeJson(path.join(outputRoot, "protected-state-before.json"), protectedBefore);

  for (const relative of managedFiles) {
    backupPath(repositoryRoot, outputRoot, relative);
  }

  if (!apply) {
    writeJson(path.join(outputRoot, "p064-summary.json"), report);
    writeJson(path.join(outputRoot, "verdict.json"), {
      milestone: "P06.4",
      verdict: "APPLICATION_FLAG_REQUIRED",
      safeToReviewOnDevice: false,
      nextStep: "Rerun with -Apply."
    });
    return;
  }

  report.transaction.attempted = true;
  let failure = null;

  try {
    patchMobileAffordanceStyles(repositoryRoot);
    patchResponsiveReaderInstruction(repositoryRoot);
    patchUnifiedReaderVerifier(repositoryRoot);
    patchWordStudyUxVerifier(repositoryRoot);
    report.transaction.installed = true;

    const build = runNpm(["run", "build"], repositoryRoot);

    fs.writeFileSync(
      path.join(outputRoot, "production-build.stdout.log"),
      build.stdout,
      "utf8"
    );
    fs.writeFileSync(
      path.join(outputRoot, "production-build.stderr.log"),
      build.stderr,
      "utf8"
    );

    report.build = {
      command: build.command,
      status: build.status,
      error: build.error,
      passed: build.status === 0
    };

    if (build.status !== 0) {
      throw new Error("[P06.4] Production build failed.");
    }

    const protectedAfter = captureProtectedState(repositoryRoot);
    const protectedDifferences = compareStates(protectedBefore, protectedAfter);

    writeJson(path.join(outputRoot, "protected-state-after.json"), protectedAfter);

    report.protectedState = {
      before: protectedBefore,
      after: protectedAfter,
      differences: protectedDifferences
    };

    if (protectedDifferences.length !== 0) {
      throw new Error(
        `[P06.4] Protected Scripture state changed: ${JSON.stringify(protectedDifferences)}`
      );
    }

    const status = run("git", ["status", "--short"], repositoryRoot);
    const diff = run("git", ["diff", "--stat"], repositoryRoot);

    fs.writeFileSync(path.join(outputRoot, "git-status.txt"), status.stdout, "utf8");
    fs.writeFileSync(path.join(outputRoot, "git-diff-stat.txt"), diff.stdout, "utf8");

    report.changedFiles = managedFiles;
    report.authorization.mobileTapAffordanceApplied = true;
    report.authorization.safeToReviewOnDevice = true;
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
      for (const relative of [...managedFiles].reverse()) {
        restorePath(repositoryRoot, outputRoot, relative);
      }

      const protectedAfterRollback = captureProtectedState(repositoryRoot);
      const protectedDifferences = compareStates(
        protectedBefore,
        protectedAfterRollback
      );

      report.transaction.rollback = {
        protectedDifferences
      };
      report.transaction.rollbackVerified = protectedDifferences.length === 0;
    } catch (rollbackError) {
      report.transaction.rollback = {
        error: rollbackError.message,
        stack: rollbackError.stack
      };
      report.transaction.rollbackVerified = false;
    }
  }

  writeJson(path.join(outputRoot, "p064-summary.json"), report);

  const verdict = report.authorization.safeToReviewOnDevice
    ? {
        milestone: "P06.4",
        verdict: "MOBILE_TAP_AFFORDANCE_PASSED",
        mobileOnlyCue: true,
        sourceSupportedWordsUseFaintDottedUnderline: true,
        functionWordsUseLighterCue: true,
        desktopRemainsHoverDriven: true,
        selectedWordRetainsGoldEmphasis: true,
        productionBuildPassed: true,
        protectedScriptureStateUnchanged: true,
        safeToReviewOnDevice: true,
        nextStep:
          "Restart the production server and review several chapters on the actual phone. The cue should be visible enough to discover but quiet enough that Scripture remains the visual focus."
      }
    : {
        milestone: "P06.4",
        verdict: "MOBILE_TAP_AFFORDANCE_FAILED_AND_ROLLBACK_EVALUATED",
        failure: report.transaction.failure || null,
        rollbackVerified: report.transaction.rollbackVerified,
        safeToReviewOnDevice: false,
        nextStep: "Upload this report. Do not commit or continue visual review."
      };

  writeJson(path.join(outputRoot, "verdict.json"), verdict);
  console.log(JSON.stringify(verdict, null, 2));

  if (!report.authorization.safeToReviewOnDevice) {
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
        milestone: "P06.4",
        generatedAt: new Date().toISOString(),
        message: error.message,
        stack: error.stack
      });
    } catch {}
  }

  console.error(error.stack || error.message);
  process.exitCode = 1;
}
