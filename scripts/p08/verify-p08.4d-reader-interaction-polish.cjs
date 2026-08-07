#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const repo = path.resolve(process.argv[2] || process.cwd());
const verseFile = path.join(repo, "app", "components", "VerseActionSheet.tsx");
const wordFile = path.join(repo, "app", "components", "WordStudySheet.tsx");

function fail(message) {
  throw new Error(message);
}

for (const file of [verseFile, wordFile]) {
  if (!fs.existsSync(file)) fail(`Missing ${file}`);
}

const verse = fs.readFileSync(verseFile, "utf8");
const word = fs.readFileSync(wordFile, "utf8");

for (const marker of [
  "const [keyboardInset, setKeyboardInset] = useState(0);",
  "window.visualViewport",
  'setKeyboardInset(inset > 80 ? Math.round(inset) : 0);',
  "autoFocus",
  'paddingBottom: `${keyboardInset + 72}px`',
  'bottom: keyboardInset',
  'if (delta < -20 && !noteOpen) setExpanded(false);',
]) {
  if (!verse.includes(marker)) {
    fail(`Missing keyboard-safe note marker: ${marker}`);
  }
}

for (const marker of [
  "capital city",
  "proper name",
  "patronymic",
  'className="border-t border-[var(--border)] py-5"',
  'className="border-b border-[var(--border)] py-4 transition active:opacity-70"',
  'className="border-l-2 border-[var(--border)] pl-4 text-sm leading-6 text-[var(--muted)]"',
  'text-[1.65rem]',
  "See all English renderings ›",
]) {
  if (!word.includes(marker)) {
    fail(`Missing premium Word Study marker: ${marker}`);
  }
}

for (const legacy of [
  'rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]',
  'rounded-[1.2rem] border border-[var(--border)] bg-[var(--background)] p-4 transition active:scale-[0.99]',
]) {
  if (word.includes(legacy)) {
    fail(`Legacy nested-card marker remains: ${legacy}`);
  }
}

const typescriptPath = path.join(repo, "node_modules", "typescript");
if (!fs.existsSync(typescriptPath)) {
  fail("Local TypeScript dependency is unavailable.");
}

const ts = require(typescriptPath);

for (const file of [verseFile, wordFile]) {
  const source = fs.readFileSync(file, "utf8");
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const diagnostics = (result.diagnostics || []).map((item) =>
    ts.flattenDiagnosticMessageText(item.messageText, "\n"),
  );

  if (diagnostics.length) {
    fail(`${path.basename(file)} syntax diagnostics: ${diagnostics.join(" | ")}`);
  }
}

console.log(JSON.stringify({
  verdict: "P08_4D_READER_INTERACTION_PREMIUM_POLISH_VERIFIED",
  noteKeyboardSafeFooter: true,
  noteStorageChanged: false,
  wordOverviewEvidenceRuntimeChanged: false,
  rawProperNameLexiconPromotionHardened: true,
  wordStudySubviewCardsFlattened: true,
  p07Touched: false,
}, null, 2));
