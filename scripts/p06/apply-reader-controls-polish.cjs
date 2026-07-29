#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");

function valueAfter(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
function hasFlag(name) { return process.argv.includes(name); }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}
function normalize(value) { return String(value || "").replace(/\\/g, "/"); }
function relative(root, target) { return normalize(path.relative(root, target)); }
function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function run(command, args, cwd) {
  const result = cp.spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env },
  });
  return {
    command: [command, ...args].join(" "),
    status: result.status,
    error: result.error ? { message: result.error.message, code: result.error.code || null } : null,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}
function runNpm(args, cwd) {
  if (process.platform === "win32") {
    return run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", ["npm", ...args].join(" ")], cwd);
  }
  return run("npm", args, cwd);
}
function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  return files.sort();
}
function fingerprint(target) {
  if (!fs.existsSync(target)) return { exists: false, type: null, sha256: null, files: 0 };
  const stat = fs.statSync(target);
  if (stat.isFile()) return { exists: true, type: "file", sha256: sha256File(target), files: 1 };
  const hash = crypto.createHash("sha256");
  const files = walkFiles(target);
  for (const file of files) {
    hash.update(relative(target, file));
    hash.update("\0");
    hash.update(sha256File(file));
    hash.update("\n");
  }
  return { exists: true, type: "directory", sha256: hash.digest("hex"), files: files.length };
}
function captureProtectedState(repo) {
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
    ".gitattributes",
  ];
  return paths.map(p => ({ path: p, ...fingerprint(path.join(repo, p)) }));
}
function compareStates(before, after) {
  const map = new Map(after.map(row => [row.path, row]));
  return before
    .map(left => ({ before: left, after: map.get(left.path) || null }))
    .filter(row => JSON.stringify(row.before) !== JSON.stringify(row.after));
}
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}
function verifyManifest(reportRoot) {
  const manifest = path.join(reportRoot, "checksums.sha256");
  if (!fs.existsSync(manifest)) return { passed: false, checked: 0 };
  let checked = 0;
  const failures = [];
  for (const line of fs.readFileSync(manifest, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{64})  (.+)$/i.exec(line);
    if (!match) { failures.push(line); continue; }
    checked += 1;
    const target = path.join(reportRoot, ...normalize(match[2]).split("/"));
    if (!fs.existsSync(target) || sha256File(target) !== match[1].toLowerCase()) {
      failures.push(match[2]);
    }
  }
  return { passed: failures.length === 0, checked, failures };
}
function findPassingP065(repo) {
  const base = path.join(repo, ".private", "reports", "P06.5");
  if (!fs.existsSync(base)) return null;
  const candidates = [];
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/first-use-reader-guidance/i.test(entry.name)) continue;
    const reportRoot = path.join(base, entry.name);
    const summaryFile = path.join(reportRoot, "p065-summary.json");
    const verdictFile = path.join(reportRoot, "verdict.json");
    if (!fs.existsSync(summaryFile) || !fs.existsSync(verdictFile)) continue;
    try {
      const summary = readJson(summaryFile);
      const verdict = readJson(verdictFile);
      const manifest = verifyManifest(reportRoot);
      if (
        manifest.passed &&
        summary?.build?.passed === true &&
        summary?.authorization?.safeToReviewOnDevice === true &&
        verdict?.verdict === "FIRST_USE_READER_GUIDANCE_PASSED"
      ) {
        candidates.push({
          reportRoot,
          summaryFile,
          manifest,
          mtime: fs.statSync(summaryFile).mtimeMs,
        });
      }
    } catch {}
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0] || null;
}
function backup(repo, report, rel) {
  const src = path.join(repo, rel);
  const dst = path.join(report, "rollback-payload", rel);
  if (!fs.existsSync(src)) {
    writeJson(dst + ".absence.json", { path: rel, existedBefore: false });
    return;
  }
  ensureDir(path.dirname(dst));
  fs.cpSync(src, dst, { recursive: true, force: true });
}
function restore(repo, report, rel) {
  const dst = path.join(repo, rel);
  const src = path.join(report, "rollback-payload", rel);
  fs.rmSync(dst, { recursive: true, force: true });
  if (fs.existsSync(src)) {
    ensureDir(path.dirname(dst));
    fs.cpSync(src, dst, { recursive: true, force: true });
  } else if (!fs.existsSync(src + ".absence.json")) {
    throw new Error(`[P06.6] Missing rollback payload for ${rel}.`);
  }
}
function replaceOnce(text, oldValue, newValue, label) {
  const count = text.split(oldValue).length - 1;
  if (count !== 1) throw new Error(`[P06.6] Expected one ${label}; found ${count}.`);
  return text.replace(oldValue, newValue);
}

function writeCompactTip(repo) {
  const file = path.join(repo, "app/components/ReaderFirstUseTip.tsx");
  const source = `"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "emetsees-reader-tip-dismissed-v1";
const OPEN_HELP_EVENT = "emetsees:open-reader-help";

function rememberDismissal() {
  localStorage.setItem(STORAGE_KEY, "true");
}

export default function ReaderFirstUseTip() {
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(localStorage.getItem(STORAGE_KEY) !== "true");
    setReady(true);

    function dismissAfterWordTap(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-word-token="true"]')) {
        rememberDismissal();
        setVisible(false);
      }
    }

    function reopenHelp() {
      setVisible(true);
    }

    document.addEventListener("pointerdown", dismissAfterWordTap, true);
    window.addEventListener(OPEN_HELP_EVENT, reopenHelp);

    return () => {
      document.removeEventListener("pointerdown", dismissAfterWordTap, true);
      window.removeEventListener(OPEN_HELP_EVENT, reopenHelp);
    };
  }, []);

  function dismiss() {
    rememberDismissal();
    setVisible(false);
  }

  if (!ready || !visible) {
    return null;
  }

  return (
    <aside
      className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-sm)]"
      aria-label="Reader tip"
    >
      <span
        aria-hidden="true"
        className="inline-block w-7 shrink-0 border-b border-dotted border-[var(--muted)]"
      />

      <p className="min-w-0 flex-1 text-xs leading-5 text-[var(--muted)]">
        <strong className="font-bold text-[var(--foreground)]">
          Dotted words open source evidence
        </strong>
        <span aria-hidden="true"> · </span>
        Verse numbers open tools
      </p>

      <button
        type="button"
        onClick={dismiss}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-base text-[var(--muted)] transition hover:bg-[var(--surface-soft)] active:scale-95"
        aria-label="Dismiss reader tip"
      >
        ×
      </button>
    </aside>
  );
}
`;
  fs.writeFileSync(file, source, "utf8");
}

function writeReaderHeader(repo) {
  const file = path.join(repo, "app/components/CollapsibleReaderHeader.tsx");
  const source = `"use client";

import { useState } from "react";
import EmetseesLogo from "@/app/components/branding/EmetseesLogo";
import { useReaderChromeVisibility } from "@/app/components/useReaderChromeVisibility";

const OPEN_HELP_EVENT = "emetsees:open-reader-help";

export default function CollapsibleReaderHeader({
  title,
  children,
  autoHide = false,
}: {
  title: string;
  children: React.ReactNode;
  autoHide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const visible = useReaderChromeVisibility();
  const shouldShow = !autoHide || visible || open;

  function openReaderHelp() {
    window.dispatchEvent(new Event(OPEN_HELP_EVENT));
  }

  return (
    <div
      className={\`transition-all duration-200 \${
        shouldShow ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"
      }\`}
    >
      <div className="flex items-center justify-between gap-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <EmetseesLogo size={30} className="shrink-0 text-amber-500" />

          <span className="truncate text-xl font-semibold tracking-tight">
            {title}
          </span>

          <span
            className={\`shrink-0 text-sm text-[var(--muted)] transition-transform \${
              open ? "rotate-180" : ""
            }\`}
          >
            ▼
          </span>
        </button>

        <button
          type="button"
          onClick={openReaderHelp}
          aria-label="Open reader help"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-sm font-bold text-[var(--muted)] transition active:scale-95"
        >
          ?
        </button>
      </div>

      {open ? (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}
`;
  fs.writeFileSync(file, source, "utf8");
}

function patchVerseActions(repo) {
  const file = path.join(repo, "app/components/VerseActionSheet.tsx");
  let text = fs.readFileSync(file, "utf8");

  const oldFunctions = `  async function copySelection() {
    try {
      await navigator.clipboard.writeText(shareText);
      showMessage(verses.length === 1 ? "Verse copied" : "Verses copied");
    } catch {
      showMessage("Copy failed");
    }
  }

  async function shareSelection() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: referenceLabel,
          text: \`\${referenceLabel}\\n\\n\${selectedText}\`,
          url: verseUrl,
        });
        showMessage("Share opened");
        return;
      }

      await navigator.clipboard.writeText(shareText);
      showMessage("Share text copied");
    } catch {
      showMessage("Share cancelled");
    }
  }`;

  const newFunctions = `  async function copyTextWithFallback(text: string) {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Continue to the legacy copy fallback.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    let copied = false;

    try {
      copied = document.execCommand("copy");
    } finally {
      textarea.remove();
    }

    return copied;
  }

  async function copySelection() {
    const copied = await copyTextWithFallback(shareText);
    showMessage(
      copied
        ? verses.length === 1
          ? "Verse copied"
          : "Verses copied"
        : "Copy unavailable",
    );
  }

  async function shareSelection() {
    if (window.isSecureContext && navigator.share) {
      try {
        await navigator.share({
          title: referenceLabel,
          text: \`\${referenceLabel}\\n\\n\${selectedText}\`,
          url: verseUrl,
        });
        showMessage("Share opened");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          showMessage("Share cancelled");
          return;
        }
      }
    }

    const copied = await copyTextWithFallback(shareText);

    showMessage(
      copied
        ? verses.length === 1
          ? "Verse copied for sharing"
          : "Verses copied for sharing"
        : "Sharing unavailable",
    );
  }`;

  const copySharePattern =
    /  async function copySelection\(\) \{[\s\S]*?(?=  function highlightSelection)/;

  const copyShareMatches = text.match(copySharePattern);

  if (!copyShareMatches || copyShareMatches.length !== 1) {
    throw new Error(
      `[P06.6] Expected one copy/share function block; found ${
        copyShareMatches ? copyShareMatches.length : 0
      }.`
    );
  }

  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const normalizedFunctions = newFunctions.replace(/\n/g, newline);

  text = text.replace(
    copySharePattern,
    `${normalizedFunctions}${newline}${newline}`,
  );

  const closeButtonPattern =
    /<button\b[\s\S]*?onClick=\{onClose\}[\s\S]*?<\/button>/g;

  const closeButtonMatches = text.match(closeButtonPattern);

  if (!closeButtonMatches || closeButtonMatches.length !== 1) {
    throw new Error(
      `[P06.6] Expected one onClose verse-action button; found ${
        closeButtonMatches ? closeButtonMatches.length : 0
      }.`
    );
  }

  const closeButton = closeButtonMatches[0];
  const clearLabelPattern = />\s*Clear\s*<\/button>/;

  if (!clearLabelPattern.test(closeButton)) {
    throw new Error(
      "[P06.6] The onClose verse-action button does not contain the Clear label."
    );
  }

  const updatedCloseButton = closeButton.replace(
    clearLabelPattern,
    `>${newline}                Close${newline}              </button>`,
  );

  text = text.replace(closeButton, updatedCloseButton);
  fs.writeFileSync(file, text, "utf8");
}

function patchUnifiedVerifier(repo) {
  const file = path.join(repo, "scripts/verify-p05-unified-reader.js");
  let text = fs.readFileSync(file, "utf8");

  if (!text.includes('const readerHeader = read("app/components/CollapsibleReaderHeader.tsx");')) {
    text = replaceOnce(
      text,
      'const readerFirstUseTip = read("app/components/ReaderFirstUseTip.tsx");',
      `const readerFirstUseTip = read("app/components/ReaderFirstUseTip.tsx");
const readerHeader = read("app/components/CollapsibleReaderHeader.tsx");
const verseActionSheet = read("app/components/VerseActionSheet.tsx");`,
      "reader-control verifier sources"
    );
  }

  text = replaceOnce(
    text,
    `assertPresent(
  readerFirstUseTip,
  /Dotted words open source evidence\\./,
  "reader first-use tip",
);`,
    `assertPresent(
  readerFirstUseTip,
  /Dotted words open source evidence/,
  "reader first-use tip",
);`,
    "compact dotted-word tip verifier contract"
  );

  text = replaceOnce(
    text,
    `assertPresent(
  readerFirstUseTip,
  /Verse numbers open reading tools\\./,
  "reader first-use tip",
);`,
    `assertPresent(
  readerFirstUseTip,
  /Verse numbers open tools/,
  "reader first-use tip",
);`,
    "compact verse-tools tip verifier contract"
  );

  text = replaceOnce(
    text,
    `assertPresent(
  readerFirstUseTip,
  /Reader help/,
  "reader first-use tip",
);`,
    `assertPresent(
  readerHeader,
  /Open reader help/,
  "reader header",
);
assertPresent(
  readerHeader,
  /emetsees:open-reader-help/,
  "reader header",
);
assertPresent(
  readerFirstUseTip,
  /emetsees:open-reader-help/,
  "reader first-use tip",
);
assertAbsent(
  readerFirstUseTip,
  /Reader help/,
  "reader first-use tip",
);
assertPresent(
  verseActionSheet,
  />\\s*Close\\s*</,
  "verse action sheet",
);
assertPresent(
  verseActionSheet,
  /document\\.execCommand\\("copy"\\)/,
  "verse action sheet",
);
assertPresent(
  verseActionSheet,
  /Verse copied for sharing/,
  "verse action sheet",
);`,
    "reader help verifier contract"
  );

  fs.writeFileSync(file, text, "utf8");
}

function patchWordStudyVerifier(repo) {
  const file = path.join(repo, "scripts/verify-p05-word-study-ux.js");
  let text = fs.readFileSync(file, "utf8");

  if (!text.includes('const readerHeader = read("app/components/CollapsibleReaderHeader.tsx");')) {
    text = replaceOnce(
      text,
      'const readerFirstUseTip = read("app/components/ReaderFirstUseTip.tsx");',
      `const readerFirstUseTip = read("app/components/ReaderFirstUseTip.tsx");
const readerHeader = read("app/components/CollapsibleReaderHeader.tsx");
const verseActionSheet = read("app/components/VerseActionSheet.tsx");`,
      "word-study reader-control sources"
    );
  }

  text = replaceOnce(
    text,
    `assert(
  /Dotted words open source evidence\\./.test(readerFirstUseTip),
  "First-use reader tip is missing.",
);`,
    `assert(
  /Dotted words open source evidence/.test(readerFirstUseTip),
  "First-use reader tip is missing.",
);`,
    "compact word-study dotted-tip verifier contract"
  );

  text = replaceOnce(
    text,
    'assert(/Verse numbers open reading tools\\./.test(readerFirstUseTip), "Reader instructions do not match the interaction.");',
    'assert(/Verse numbers open tools/.test(readerFirstUseTip), "Reader instructions do not match the interaction.");',
    "compact word-study verse-tools verifier contract"
  );

  const anchor = `assert(
  /\\[data-word-token="true"\\]/.test(readerFirstUseTip),
  "Reader-tip automatic dismissal after a word tap is missing.",
);`;

  if (!text.includes("Compact reader help is missing.")) {
    text = replaceOnce(
      text,
      anchor,
      `${anchor}
assert(
  /emetsees:open-reader-help/.test(readerHeader + readerFirstUseTip),
  "Compact reader help is missing.",
);
assert(
  />\\s*Close\\s*</.test(verseActionSheet),
  "Verse-action close label is missing.",
);
assert(
  /document\\.execCommand\\("copy"\\)/.test(verseActionSheet),
  "Share copy fallback is missing.",
);`,
      "word-study reader-control verifier anchor"
    );
  }

  fs.writeFileSync(file, text, "utf8");
}

function main() {
  const repo = path.resolve(valueAfter("--repo", process.cwd()));
  const output = path.resolve(valueAfter("--output"));
  const apply = hasFlag("--apply");
  if (!output) throw new Error("--output is required");
  ensureDir(output);

  const report = {
    milestone: "P06.6",
    purpose: "READER CONTROLS POLISH",
    generatedAt: new Date().toISOString(),
    p065Evidence: {},
    transaction: {
      attempted: false,
      installed: false,
      rollbackAttempted: false,
      rollbackVerified: false,
    },
    build: {},
    protectedState: {},
    authorization: {
      readerControlsPolishApplied: false,
      safeToReviewOnDevice: false,
    },
  };

  const branch = run("git", ["branch", "--show-current"], repo);
  if (branch.status !== 0 || branch.stdout.trim() !== "main") {
    throw new Error(`[P06.6] Expected branch main; found ${JSON.stringify(branch.stdout.trim())}.`);
  }

  const p065 = findPassingP065(repo);
  if (!p065) throw new Error("[P06.6] No passing P06.5 report with valid checksums was found.");

  report.p065Evidence = {
    reportRoot: relative(repo, p065.reportRoot),
    summarySha256: sha256File(p065.summaryFile),
    checksumEntries: p065.manifest.checked,
  };

  const managed = [
    "app/components/ReaderFirstUseTip.tsx",
    "app/components/CollapsibleReaderHeader.tsx",
    "app/components/VerseActionSheet.tsx",
    "scripts/verify-p05-unified-reader.js",
    "scripts/verify-p05-word-study-ux.js",
  ];

  for (const rel of managed) {
    const file = path.join(repo, rel);
    if (!fs.existsSync(file)) throw new Error(`[P06.6] Missing ${rel}.`);
    backup(repo, output, rel);
  }

  const before = captureProtectedState(repo);
  writeJson(path.join(output, "protected-state-before.json"), before);

  if (!apply) {
    writeJson(path.join(output, "p066-summary.json"), report);
    writeJson(path.join(output, "verdict.json"), {
      milestone: "P06.6",
      verdict: "APPLICATION_FLAG_REQUIRED",
      safeToReviewOnDevice: false,
    });
    return;
  }

  report.transaction.attempted = true;
  let failure = null;

  try {
    writeCompactTip(repo);
    writeReaderHeader(repo);
    patchVerseActions(repo);
    patchUnifiedVerifier(repo);
    patchWordStudyVerifier(repo);
    report.transaction.installed = true;

    const build = runNpm(["run", "build"], repo);
    fs.writeFileSync(path.join(output, "production-build.stdout.log"), build.stdout, "utf8");
    fs.writeFileSync(path.join(output, "production-build.stderr.log"), build.stderr, "utf8");
    report.build = { command: build.command, status: build.status, passed: build.status === 0, error: build.error };
    if (build.status !== 0) throw new Error("[P06.6] Production build failed.");

    const after = captureProtectedState(repo);
    const differences = compareStates(before, after);
    writeJson(path.join(output, "protected-state-after.json"), after);
    report.protectedState = { before, after, differences };
    if (differences.length) throw new Error(`[P06.6] Protected state changed: ${JSON.stringify(differences)}`);

    const status = run("git", ["status", "--short"], repo);
    const diff = run("git", ["diff", "--stat"], repo);
    fs.writeFileSync(path.join(output, "git-status.txt"), status.stdout, "utf8");
    fs.writeFileSync(path.join(output, "git-diff-stat.txt"), diff.stdout, "utf8");

    report.authorization.readerControlsPolishApplied = true;
    report.authorization.safeToReviewOnDevice = true;
  } catch (error) {
    failure = error;
    report.transaction.failure = { message: error.message, stack: error.stack };
  }

  if (failure) {
    report.transaction.rollbackAttempted = true;
    try {
      for (const rel of [...managed].reverse()) restore(repo, output, rel);
      const afterRollback = captureProtectedState(repo);
      const differences = compareStates(before, afterRollback);
      report.transaction.rollback = { protectedDifferences: differences };
      report.transaction.rollbackVerified = differences.length === 0;
    } catch (rollbackError) {
      report.transaction.rollback = { error: rollbackError.message };
      report.transaction.rollbackVerified = false;
    }
  }

  writeJson(path.join(output, "p066-summary.json"), report);

  const verdict = report.authorization.safeToReviewOnDevice
    ? {
        milestone: "P06.6",
        verdict: "READER_CONTROLS_POLISH_PASSED",
        compactFirstUseTip: true,
        headerHelpButton: true,
        verseActionCloseLabel: true,
        resilientShareFallback: true,
        productionBuildPassed: true,
        protectedScriptureStateUnchanged: true,
        safeToReviewOnDevice: true,
        safeToPrepareControlledGitCheckpointAfterPhoneReview: true,
      }
    : {
        milestone: "P06.6",
        verdict: "READER_CONTROLS_POLISH_FAILED_AND_ROLLBACK_EVALUATED",
        failure: report.transaction.failure || null,
        rollbackVerified: report.transaction.rollbackVerified,
        safeToReviewOnDevice: false,
      };

  writeJson(path.join(output, "verdict.json"), verdict);
  console.log(JSON.stringify(verdict, null, 2));
  if (!report.authorization.safeToReviewOnDevice) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  const output = valueAfter("--output");
  if (output) {
    try {
      ensureDir(path.resolve(output));
      writeJson(path.join(path.resolve(output), "fatal-error.json"), {
        milestone: "P06.6",
        message: error.message,
        stack: error.stack,
      });
    } catch {}
  }
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
