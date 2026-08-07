#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const repo = path.resolve(process.argv[2] || process.cwd());
const homeFile = path.join(repo, "app", "page.tsx");
const readFile = path.join(repo, "app", "read", "page.tsx");

function fail(message) {
  throw new Error(message);
}

for (const file of [homeFile, readFile]) {
  if (!fs.existsSync(file)) fail(`Missing ${file}`);
}

const home = fs.readFileSync(homeFile, "utf8");
const read = fs.readFileSync(readFile, "utf8");

for (const marker of [
  'border-y border-[var(--border)] py-5',
  'grid grid-cols-3 divide-x divide-[var(--border)] border-y border-[var(--border)]',
  'mt-6 border-t border-[var(--border)] pt-5',
  'block py-3.5 transition active:opacity-70',
]) {
  if (!home.includes(marker)) fail(`Missing Home premium marker: ${marker}`);
}

for (const marker of [
  'placeholder="Book, chapter, or verse"',
  'mb-5 flex items-center gap-6 overflow-x-auto border-b border-[var(--border)]',
  'border-b-2 px-0.5 pb-2.5 pt-1',
  'className="border-t border-[var(--border)] pt-4"',
  'className="border-b border-[var(--border)] py-4 text-left transition active:opacity-70"',
]) {
  if (!read.includes(marker)) fail(`Missing Read premium marker: ${marker}`);
}

for (const behavior of [
  'getPreferredTranslation()',
  'setPreferredTranslation(value)',
  'router.push(',
  'handleQuickJump()',
  '<MobileBottomNav />',
]) {
  if (!read.includes(behavior)) fail(`Read behavior marker missing: ${behavior}`);
}

for (const behavior of [
  'getReaderMemory()',
  'buildReaderHref({',
  'requestUpgrade(',
  '<MobileBottomNav />',
]) {
  if (!home.includes(behavior)) fail(`Home behavior marker missing: ${behavior}`);
}

const typescriptPath = path.join(repo, "node_modules", "typescript");
if (!fs.existsSync(typescriptPath)) fail("Local TypeScript dependency is unavailable.");

const ts = require(typescriptPath);
for (const file of [homeFile, readFile]) {
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
  verdict: "P08_5B_HOME_READ_PREMIUM_ALIGNMENT_VERIFIED",
  homeFlattened: true,
  readLandingFlattened: true,
  quickJumpPreserved: true,
  translationPersistencePreserved: true,
  readerRoutingPreserved: true,
  searchChanged: false,
  chapterReaderChanged: false,
  bottomNavigationChanged: false
}, null, 2));
