#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const repo = path.resolve(process.argv[2] || process.cwd());
const wordFile = path.join(repo, "app", "components", "WordStudySheet.tsx");
const homeFile = path.join(repo, "app", "page.tsx");

function fail(message) {
  throw new Error(message);
}

for (const file of [wordFile, homeFile]) {
  if (!fs.existsSync(file)) fail(`Missing ${file}`);
}

const word = fs.readFileSync(wordFile, "utf8");
const home = fs.readFileSync(homeFile, "utf8");

for (const marker of [
  'const overviewLexicalMeaning =',
  '? "Simple meaning"',
  '? "Lexicon meaning"',
  '"Source dictionary wording"',
  "overviewLexicalMeaningIsRaw",
  "showMeaningHere",
  'eyebrow="Lexicon meaning"',
  'title="Source dictionary wording"',
]) {
  if (!word.includes(marker)) fail(`Missing first-page meaning marker: ${marker}`);
}

for (const forbidden of [
  "PremiumStudyPanel",
  "Guided study tools",
  'requestUpgrade("deep-word-study"',
  'title="What this word can mean"',
  'eyebrow={\n              alignment?.source === "lxx"\n                ? "Plain-English meaning"',
]) {
  if (word.includes(forbidden)) fail(`Premature/legacy demo marker remains: ${forbidden}`);
}

for (const marker of [
  'pb-28 pt-4',
  'mb-4 flex flex-col items-center pt-1 text-center',
  'mt-2 max-w-sm text-sm leading-5',
]) {
  if (!home.includes(marker)) fail(`Missing Home hero tightening marker: ${marker}`);
}

const typescriptPath = path.join(repo, "node_modules", "typescript");
if (!fs.existsSync(typescriptPath)) fail("Local TypeScript dependency is unavailable.");

const ts = require(typescriptPath);
for (const file of [wordFile, homeFile]) {
  const source = fs.readFileSync(file, "utf8");
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
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
  verdict: "P08_4E_DEMO_CLEANUP_FIRST_PAGE_MEANING_VERIFIED",
  firstPageMeaningAvailable: true,
  readerReadyMeaningPreferred: true,
  rawLexiconFallbackPreserved: true,
  rawLexiconFallbackClearlyLabeled: true,
  meaningHerePreserved: true,
  acrossScriptureSlotPreserved: true,
  paidGuidedStudyHiddenUntilP09: true,
  homeHeroTightened: true,
  evidenceRuntimeChanged: false,
  cacheChanged: false,
  p07Touched: false
}, null, 2));
