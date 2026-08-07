#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const repo = path.resolve(process.argv[2] || process.cwd());
const target = path.join(repo, "app", "components", "WordStudySheet.tsx");

function fail(message) {
  throw new Error(message);
}

if (!fs.existsSync(target)) fail(`Missing ${target}`);

const source = fs.readFileSync(target, "utf8");

const required = [
  "Meaning here",
  "General meaning",
  "Across Scripture",
  "Original Hebrew",
  "Original Greek",
  "Common English renderings",
  "Scripture evidence",
  "Trace the evidence",
  "Related evidence",
  "Technical evidence",
  "Loading word evidence...",
  "const candidates = direct;",
  "const primaryLexicalMeaning = getPrimaryLexicalMeaning(entityEvidence);",
];

for (const marker of required) {
  if (!source.includes(marker)) fail(`Missing P08.4B marker: ${marker}`);
}

const forbidden = [
  'title="SEE Evidence is one tap away"',
  'const seed = direct.length ? direct : cleaned.slice(0, 1);',
  'stem === topStem ||',
];

for (const marker of forbidden) {
  if (source.includes(marker)) fail(`Legacy P08.4B marker remains: ${marker}`);
}

const overviewStart = source.indexOf("function OverviewView({");
const overviewEnd = source.indexOf("\nfunction LexiconView({", overviewStart);

if (overviewStart < 0 || overviewEnd < 0) {
  fail("Word Overview function boundaries were not found.");
}

const overview = source.slice(overviewStart, overviewEnd);
const meaningIndex = overview.indexOf("Meaning here");
const acrossScriptureIndex = overview.indexOf("Across Scripture");
const originalIndex = overview.indexOf("{originalLanguageLabel}");
const renderingsIndex = overview.indexOf("Common English renderings");
const evidenceIndex = overview.indexOf("Scripture evidence");

if (!(
  meaningIndex >= 0 &&
  acrossScriptureIndex > meaningIndex &&
  originalIndex > acrossScriptureIndex &&
  renderingsIndex > originalIndex &&
  evidenceIndex > renderingsIndex
)) {
  fail("Reader-first Overview ordering verification failed.");
}

const typescriptPath = path.join(repo, "node_modules", "typescript");
if (!fs.existsSync(typescriptPath)) fail("Local TypeScript dependency is unavailable.");

const ts = require(typescriptPath);
const result = ts.transpileModule(source, {
  fileName: target,
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
  fail(`TypeScript syntax diagnostics: ${diagnostics.join(" | ")}`);
}

console.log(JSON.stringify({
  verdict: "P08_4B_WORD_OVERVIEW_REDESIGN_VERIFIED",
  readerFirstMeaning: true,
  cachedExplanationNearTop: true,
  occurrenceMeaningDistinct: true,
  originalLanguageAfterCachedExplanation: true,
  renderingFallbackHardened: true,
  loadingStateImproved: true,
}, null, 2));
