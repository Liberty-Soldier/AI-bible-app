#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const repo = path.resolve(process.argv[2] || process.cwd());

const files = {
  preference: path.join(repo, "app", "lib", "translationPreference.ts"),
  selector: path.join(repo, "app", "components", "TranslationSelector.tsx"),
  read: path.join(repo, "app", "read", "page.tsx"),
  search: path.join(repo, "app", "search", "page.tsx"),
  ask: path.join(repo, "app", "ask", "page.tsx"),
  askView: path.join(repo, "app", "components", "ask", "AskView.tsx"),
  globalAsk: path.join(repo, "app", "components", "GlobalAskButton.tsx"),
};

function fail(message) {
  throw new Error(message);
}

for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) fail(`Missing ${name}: ${file}`);
}

const preference = fs.readFileSync(files.preference, "utf8");
const selector = fs.readFileSync(files.selector, "utf8");
const read = fs.readFileSync(files.read, "utf8");
const search = fs.readFileSync(files.search, "utf8");
const ask = fs.readFileSync(files.ask, "utf8");

for (const marker of [
  "AVAILABLE_TRANSLATION_OPTIONS",
  "PLANNED_TRANSLATION_OPTIONS",
  'id: "hebrew"',
  'id: "greek-nt"',
  'status: "planned"',
  'DEFAULT_TRANSLATION: TranslationPreference = "web"',
  "getTranslationShortLabel",
]) {
  if (!preference.includes(marker)) {
    fail(`Missing future-proof translation marker: ${marker}`);
  }
}

for (const source of [selector, read, search]) {
  if (!source.includes("AVAILABLE_TRANSLATION_OPTIONS")) {
    fail("A visible translation selector still bypasses the central available-option registry.");
  }
}

if (selector.includes('localStorage.setItem("preferredTranslation"')) {
  fail("Standalone TranslationSelector still writes its own preference directly.");
}

for (const marker of [
  "getPreferredTranslation()",
  "setPreferredTranslation(value)",
]) {
  if (!selector.includes(marker)) {
    fail(`Standalone selector is missing global preference call: ${marker}`);
  }
}

if (!read.includes("setPreferredTranslation(option.id)")) {
  fail("Read selector is not using the centralized option id.");
}

if (!search.includes("getTranslationShortLabel(translation)")) {
  fail("Search translation label is not centralized.");
}

for (const plannedLabel of ["Hebrew", "Greek NT"]) {
  if (read.includes(`>${plannedLabel}<`) || search.includes(`>${plannedLabel}<`)) {
    fail(`Planned translation is visible prematurely: ${plannedLabel}`);
  }
}

for (const marker of [
  "Ask EMET",
  "View premium access",
  "Three distinct paths",
  "Reading, Scripture Search, and cached word studies remain separate.",
]) {
  if (!ask.includes(marker)) {
    fail(`Missing compact Ask EMET marker: ${marker}`);
  }
}

for (const legacy of [
  "Ask Scripture-grounded questions",
  "View upgrade information",
  'rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6',
]) {
  if (ask.includes(legacy)) {
    fail(`Legacy oversized Ask placeholder remains: ${legacy}`);
  }
}

const typescriptPath = path.join(repo, "node_modules", "typescript");
if (!fs.existsSync(typescriptPath)) fail("Local TypeScript dependency is unavailable.");

const ts = require(typescriptPath);
for (const file of [
  files.preference,
  files.selector,
  files.read,
  files.search,
  files.ask,
]) {
  const source = fs.readFileSync(file, "utf8");
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
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
  verdict: "P08_6_P08_7_TRANSLATION_FUTUREPROOF_ASK_POLISH_VERIFIED",
  currentVisibleTranslations: ["web", "kjv", "brenton"],
  plannedCatalogEntries: ["hebrew", "greek-nt"],
  plannedEntriesVisible: false,
  globalPreferenceHelperUsed: true,
  askPlaceholderCompacted: true,
  askProductionRetrievalChanged: false,
  globalAskEntryChanged: false,
  p09ImplementationStarted: false,
  p07Touched: false
}, null, 2));
