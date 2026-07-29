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

function findPassingP064(repositoryRoot) {
  const reportsRoot = path.join(repositoryRoot, ".private", "reports", "P06.4");

  if (!fs.existsSync(reportsRoot)) return null;

  const candidates = [];

  for (const entry of fs.readdirSync(reportsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/mobile-tap-affordance/i.test(entry.name)) {
      continue;
    }

    const root = path.join(reportsRoot, entry.name);
    const summaryPath = path.join(root, "p064-summary.json");
    const verdictPath = path.join(root, "verdict.json");

    if (!fs.existsSync(summaryPath) || !fs.existsSync(verdictPath)) continue;

    try {
      const summary = readJson(summaryPath);
      const verdict = readJson(verdictPath);
      const checksums = verifyChecksumManifest(root);

      if (
        checksums.passed &&
        summary?.milestone === "P06.4" &&
        summary?.build?.passed === true &&
        summary?.authorization?.safeToReviewOnDevice === true &&
        verdict?.verdict === "MOBILE_TAP_AFFORDANCE_PASSED"
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
    throw new Error(`[P06.5] Missing rollback evidence for ${relative}.`);
  }
}

function replaceExactlyOnce(text, oldValue, newValue, label) {
  const count = text.split(oldValue).length - 1;

  if (count !== 1) {
    throw new Error(`[P06.5] Expected one ${label}; found ${count}.`);
  }

  return text.replace(oldValue, newValue);
}

function replaceRegexExactlyOnce(text, regex, replacement, label) {
  const matches = text.match(regex);

  if (!matches || matches.length !== 1) {
    throw new Error(
      `[P06.5] Expected one regex match for ${label}; found ${matches ? matches.length : 0}.`
    );
  }

  return text.replace(regex, replacement);
}

function insertImportWithTypeScript(repositoryRoot, file, importLine) {
  const ts = require(require.resolve("typescript", { paths: [repositoryRoot] }));
  const text = fs.readFileSync(file, "utf8");

  if (text.includes(importLine)) return;

  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const imports = sourceFile.statements.filter(statement =>
    ts.isImportDeclaration(statement)
  );

  if (imports.length === 0) {
    throw new Error(`[P06.5] ${relativePath(repositoryRoot, file)} has no import declarations.`);
  }

  const lastImport = imports[imports.length - 1];
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const insertionPoint = lastImport.end;

  const updated =
    text.slice(0, insertionPoint) +
    newline +
    importLine +
    text.slice(insertionPoint);

  fs.writeFileSync(file, updated, "utf8");
}

function writeReaderFirstUseTip(repositoryRoot) {
  const file = path.join(
    repositoryRoot,
    "app/components/ReaderFirstUseTip.tsx"
  );

  const source = `"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "emetsees-reader-tip-dismissed-v1";

function rememberDismissal() {
  localStorage.setItem(STORAGE_KEY, "true");
}

export default function ReaderFirstUseTip() {
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY) === "true";
    setVisible(!dismissed);
    setReady(true);

    function dismissAfterWordTap(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest('[data-word-token="true"]')) {
        rememberDismissal();
        setVisible(false);
      }
    }

    document.addEventListener("pointerdown", dismissAfterWordTap, true);

    return () => {
      document.removeEventListener("pointerdown", dismissAfterWordTap, true);
    };
  }, []);

  function dismiss() {
    rememberDismissal();
    setVisible(false);
  }

  function reopen() {
    setVisible(true);
  }

  if (!ready) {
    return <div className="mb-4 h-8" aria-hidden="true" />;
  }

  if (!visible) {
    return (
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={reopen}
          className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-bold text-[var(--muted)] transition active:scale-[0.98]"
          aria-label="Open reader help"
        >
          <span
            aria-hidden="true"
            className="grid h-5 w-5 place-items-center rounded-full border border-[var(--border)] text-[0.7rem]"
          >
            ?
          </span>
          Reader help
        </button>
      </div>
    );
  }

  return (
    <aside
      className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-sm)]"
      aria-label="Reader tip"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-1 inline-block h-4 w-4 shrink-0 border-b border-dotted border-[var(--muted)]"
        />

        <p className="min-w-0 flex-1 text-sm leading-6 text-[var(--muted)]">
          <strong className="font-bold text-[var(--foreground)]">
            Dotted words open source evidence.
          </strong>{" "}
          Verse numbers open reading tools.
        </p>

        <button
          type="button"
          onClick={dismiss}
          className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-[var(--muted)] transition hover:bg-[var(--surface-soft)] active:scale-95"
          aria-label="Dismiss reader tip"
        >
          ×
        </button>
      </div>
    </aside>
  );
}
`;

  ensureDir(path.dirname(file));
  fs.writeFileSync(file, source, "utf8");
}

function patchReaderPage(repositoryRoot) {
  const file = path.join(
    repositoryRoot,
    "app/read/[book]/[chapter]/page.tsx"
  );

  const importLine =
    'import ReaderFirstUseTip from "@/app/components/ReaderFirstUseTip";';

  insertImportWithTypeScript(repositoryRoot, file, importLine);

  let text = fs.readFileSync(file, "utf8");

  const instructionBlock =
    /<p\b[^>]*>\s*<span className="md:hidden">\s*A faint dotted underline marks words you can tap for source\s*evidence\. Tap a verse number for highlights and notes\.\s*<\/span>\s*<span className="hidden md:inline">\s*Hover over or click a word for source evidence\. Click a verse\s*number for highlights and notes\.\s*<\/span>\s*<\/p>/;

  text = replaceRegexExactlyOnce(
    text,
    instructionBlock,
    "<ReaderFirstUseTip />",
    "permanent responsive reader instructions"
  );

  fs.writeFileSync(file, text, "utf8");
}

function patchUnifiedReaderVerifier(repositoryRoot) {
  const file = path.join(
    repositoryRoot,
    "scripts/verify-p05-unified-reader.js"
  );

  let text = fs.readFileSync(file, "utf8");

  if (!text.includes('const readerFirstUseTip = read("app/components/ReaderFirstUseTip.tsx");')) {
    text = replaceExactlyOnce(
      text,
      'const globalStyles = read("app/globals.css");',
      `const globalStyles = read("app/globals.css");
const readerFirstUseTip = read("app/components/ReaderFirstUseTip.tsx");`,
      "unified-reader first-use tip source"
    );
  }

  text = replaceRegexExactlyOnce(
    text,
    /assertPresent\(\s*readerPage,\s*\/A faint dotted underline marks words you can tap for source\/,\s*"reader page",\s*\);\s*assertPresent\(\s*readerPage,\s*\/Hover over or click a word for source evidence\/,\s*"reader page",\s*\);\s*assertPresent\(\s*readerPage,\s*\/Tap a verse number for highlights\/,\s*"reader page",\s*\);/,
    `assertPresent(
  readerPage,
  /ReaderFirstUseTip/,
  "reader page",
);
assertPresent(
  readerFirstUseTip,
  /Dotted words open source evidence\\./,
  "reader first-use tip",
);
assertPresent(
  readerFirstUseTip,
  /Verse numbers open reading tools\\./,
  "reader first-use tip",
);
assertPresent(
  readerFirstUseTip,
  /emetsees-reader-tip-dismissed-v1/,
  "reader first-use tip",
);
assertPresent(
  readerFirstUseTip,
  /\\[data-word-token="true"\\]/,
  "reader first-use tip",
);
assertPresent(
  readerFirstUseTip,
  /Reader help/,
  "reader first-use tip",
);`,
    "unified-reader permanent instruction assertions"
  );

  fs.writeFileSync(file, text, "utf8");
}

function patchWordStudyUxVerifier(repositoryRoot) {
  const file = path.join(
    repositoryRoot,
    "scripts/verify-p05-word-study-ux.js"
  );

  let text = fs.readFileSync(file, "utf8");

  if (!text.includes('const readerFirstUseTip = read("app/components/ReaderFirstUseTip.tsx");')) {
    text = replaceExactlyOnce(
      text,
      'const globalStyles = read("app/globals.css");',
      `const globalStyles = read("app/globals.css");
const readerFirstUseTip = read("app/components/ReaderFirstUseTip.tsx");`,
      "word-study first-use tip source"
    );
  }

  if (!text.includes("First-use reader tip is missing.")) {
    text = replaceExactlyOnce(
      text,
      'assert(/Tap a verse number/.test(readerPage), "Reader instructions do not match the interaction.");',
      'assert(/Verse numbers open reading tools\\./.test(readerFirstUseTip), "Reader instructions do not match the interaction.");',
      "obsolete permanent reader instruction verifier"
    );

    const anchor = `assert(
  /MOBILE SOURCE-WORD AFFORDANCE[\\s\\S]*?text-decoration-style:\\s*dotted/.test(globalStyles),
  "Mobile source-word cue is missing.",
);`;

    const replacement = `${anchor}
assert(
  /Dotted words open source evidence\\./.test(readerFirstUseTip),
  "First-use reader tip is missing.",
);
assert(
  /emetsees-reader-tip-dismissed-v1/.test(readerFirstUseTip),
  "Reader-tip persistence is missing.",
);
assert(
  /\\[data-word-token="true"\\]/.test(readerFirstUseTip),
  "Reader-tip automatic dismissal after a word tap is missing.",
);`;

    text = replaceExactlyOnce(
      text,
      anchor,
      replacement,
      "word-study first-use tip verifier anchor"
    );
  }

  text = text.replace(
    'console.log("- Touch devices receive a subtle source-word cue");',
    `console.log("- Touch devices receive a subtle source-word cue");
console.log("- First-use guidance dismisses after the first word tap");`
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
    milestone: "P06.5",
    purpose: "FIRST-USE READER GUIDANCE",
    generatedAt: new Date().toISOString(),
    repository: { root: repositoryRoot },
    requestedApplication: apply,
    p064Evidence: {},
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
      firstUseReaderGuidanceApplied: false,
      safeToReviewOnDevice: false
    }
  };

  const branch = run("git", ["branch", "--show-current"], repositoryRoot);

  if (branch.status !== 0 || branch.stdout.trim() !== "main") {
    throw new Error(
      `[P06.5] Expected branch main; found ${JSON.stringify(branch.stdout.trim())}.`
    );
  }

  try {
    require.resolve("typescript", { paths: [repositoryRoot] });
  } catch {
    throw new Error("[P06.5] The repository TypeScript package could not be resolved.");
  }

  const p064 = findPassingP064(repositoryRoot);

  if (!p064) {
    throw new Error("[P06.5] No passing P06.4 report with valid checksums was found.");
  }

  report.p064Evidence = {
    reportRoot: relativePath(repositoryRoot, p064.root),
    summarySha256: sha256File(p064.summaryPath),
    checksumEntries: p064.checksums.checked,
    checksumsPassed: p064.checksums.passed
  };

  const managedFiles = [
    "app/read/[book]/[chapter]/page.tsx",
    "app/components/ReaderFirstUseTip.tsx",
    "scripts/verify-p05-unified-reader.js",
    "scripts/verify-p05-word-study-ux.js"
  ];

  for (const relative of managedFiles.filter(relative =>
    relative !== "app/components/ReaderFirstUseTip.tsx"
  )) {
    const absolute = path.join(repositoryRoot, relative);

    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new Error(`[P06.5] Missing required file ${relative}.`);
    }
  }

  const npmPreflight = runNpm(["--version"], repositoryRoot);

  if (npmPreflight.status !== 0) {
    throw new Error("[P06.5] npm launcher preflight failed.");
  }

  const protectedBefore = captureProtectedState(repositoryRoot);
  writeJson(path.join(outputRoot, "protected-state-before.json"), protectedBefore);

  for (const relative of managedFiles) {
    backupPath(repositoryRoot, outputRoot, relative);
  }

  if (!apply) {
    writeJson(path.join(outputRoot, "p065-summary.json"), report);
    writeJson(path.join(outputRoot, "verdict.json"), {
      milestone: "P06.5",
      verdict: "APPLICATION_FLAG_REQUIRED",
      safeToReviewOnDevice: false,
      nextStep: "Rerun with -Apply."
    });
    return;
  }

  report.transaction.attempted = true;
  let failure = null;

  try {
    writeReaderFirstUseTip(repositoryRoot);
    patchReaderPage(repositoryRoot);
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
      throw new Error("[P06.5] Production build failed.");
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
        `[P06.5] Protected Scripture state changed: ${JSON.stringify(protectedDifferences)}`
      );
    }

    const status = run("git", ["status", "--short"], repositoryRoot);
    const diff = run("git", ["diff", "--stat"], repositoryRoot);

    fs.writeFileSync(path.join(outputRoot, "git-status.txt"), status.stdout, "utf8");
    fs.writeFileSync(path.join(outputRoot, "git-diff-stat.txt"), diff.stdout, "utf8");

    report.changedFiles = managedFiles;
    report.authorization.firstUseReaderGuidanceApplied = true;
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

  writeJson(path.join(outputRoot, "p065-summary.json"), report);

  const verdict = report.authorization.safeToReviewOnDevice
    ? {
        milestone: "P06.5",
        verdict: "FIRST_USE_READER_GUIDANCE_PASSED",
        permanentTutorialRemoved: true,
        firstUseTipInstalled: true,
        dismissButtonInstalled: true,
        dismissesAfterFirstWordTap: true,
        dismissalPersistsOnDevice: true,
        readerHelpCanReopenTip: true,
        productionBuildPassed: true,
        protectedScriptureStateUnchanged: true,
        safeToReviewOnDevice: true,
        nextStep:
          "Restart the production server. In an Incognito tab the tip should appear. Tap a dotted word; the tip should disappear and be replaced by a small Reader help control."
      }
    : {
        milestone: "P06.5",
        verdict: "FIRST_USE_READER_GUIDANCE_FAILED_AND_ROLLBACK_EVALUATED",
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
        milestone: "P06.5",
        generatedAt: new Date().toISOString(),
        message: error.message,
        stack: error.stack
      });
    } catch {}
  }

  console.error(error.stack || error.message);
  process.exitCode = 1;
}
