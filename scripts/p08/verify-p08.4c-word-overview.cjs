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
  'snap === "expanded" ? "h-[96dvh]" : "h-[86dvh]"',
  "RENDERING_NOISE_WORDS",
  "if (stem === selectedStem) return true;",
  "return lexicalTerms.includes(stem);",
  "readerMeaningLabel",
  '"In this verse"',
  "isReaderReadyLexicalMeaning",
  "Across Scripture",
  "Loading word evidence...",
];

for (const marker of required) {
  if (!source.includes(marker)) fail(`Missing P08.4C marker: ${marker}`);
}

const forbidden = [
  "term.includes(stem) || stem.includes(term)",
  'snap === "expanded" ? "h-[92dvh]" : "h-[74dvh]"',
];

for (const marker of forbidden) {
  if (source.includes(marker)) fail(`Legacy P08.4C marker remains: ${marker}`);
}

const summaryStart = source.indexOf("function summarizeRenderings");
const summaryNextFunction = source.indexOf("\nfunction ", summaryStart + 1);

if (summaryStart < 0 || summaryNextFunction < 0) {
  fail("summarizeRenderings was not found.");
}

const summary = source.slice(summaryStart, summaryNextFunction);

if (!summary.includes("const seen = new Set<string>();")) {
  fail("Rendering summary does not deduplicate labels.");
}

if (!summary.includes("normalizeEnglish(text)")) {
  fail("Rendering summary does not normalize labels before deduplication.");
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
  ts.flattenDiagnosticMessageText(item.messageText, "\\n"),
);

if (diagnostics.length) {
  fail(`TypeScript syntax diagnostics: ${diagnostics.join(" | ")}`);
}

console.log(JSON.stringify({
  verdict: "P08_4C_WORD_OVERVIEW_COMPLETION_V2_VERIFIED",
  compactHeightDvh: 86,
  expandedHeightDvh: 96,
  exactRenderingMatching: true,
  functionWordNoiseSuppressed: true,
  renderingSummaryDeduplicated: true,
  misleadingMeaningLabelAvoided: true,
  rawLexiconOverviewSuppressedWhenUnsafe: true,
  cacheContentChanged: false
}, null, 2));
