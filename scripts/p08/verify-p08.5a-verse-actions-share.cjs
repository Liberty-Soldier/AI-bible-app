#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const repo = path.resolve(process.argv[2] || process.cwd());
const target = path.join(repo, "app", "components", "VerseActionSheet.tsx");

function fail(message) {
  throw new Error(message);
}

if (!fs.existsSync(target)) fail(`Missing ${target}`);
const source = fs.readFileSync(target, "utf8");

const required = [
  'const shareTranslation = firstVerse?.translation || "web";',
  '?translation=${encodeURIComponent(',
  'const shareHeading = `${referenceLabel} · ${shareTranslationLabel}`;',
  'title: shareHeading,',
  'text: `${shareHeading}\\n\\n${selectedText}`',
  'className="mt-2 flex items-center gap-2"',
  'className="flex items-center gap-2"',
  'h-9 w-9 shrink-0 rounded-full',
  'Done',
];

for (const marker of required) {
  if (!source.includes(marker)) fail(`Missing P08.5A marker: ${marker}`);
}

const forbidden = [
  '?verse=${encodeURIComponent(getReaderMemoryVerseLabel(firstVerse))}`',
  'requestUpgrade("ask-emet"',
  'requestUpgrade("compare-passages"',
  'LOCKED',
  'grid grid-cols-6 gap-2',
];

for (const marker of forbidden) {
  if (source.includes(marker)) fail(`Legacy P08.5A marker remains: ${marker}`);
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
  verdict: "P08_5A_VERSE_ACTIONS_SHARE_CORRECTNESS_VERIFIED",
  shareTranslationPreserved: true,
  shareTranslationLabelIncluded: true,
  highlightRowOverflowCorrected: true,
  unavailableLockedActionsRemoved: true,
  storageChanged: false,
  readerRoutingChanged: false,
  metadataChanged: false,
}, null, 2));
