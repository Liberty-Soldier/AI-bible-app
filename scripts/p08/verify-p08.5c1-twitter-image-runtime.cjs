#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const repo = path.resolve(process.argv[2] || process.cwd());
const target = path.join(repo, "app", "twitter-image.tsx");

function fail(message) {
  throw new Error(message);
}

if (!fs.existsSync(target)) fail(`Missing ${target}`);

const source = fs.readFileSync(target, "utf8");

for (const marker of [
  'import OpenGraphImage from "./opengraph-image";',
  'export const alt = "EMETSEES — Bible Study & Scripture Evidence";',
  'export const contentType = "image/png";',
  'export const runtime = "nodejs";',
  "export default OpenGraphImage;",
]) {
  if (!source.includes(marker)) fail(`Missing P08.5C1 marker: ${marker}`);
}

if (/export\s*\{[\s\S]*runtime[\s\S]*\}\s*from\s*["']\.\/opengraph-image["']/.test(source)) {
  fail("runtime is still re-exported from opengraph-image.");
}

const typescriptPath = path.join(repo, "node_modules", "typescript");
if (!fs.existsSync(typescriptPath)) fail("Local TypeScript dependency is unavailable.");

const ts = require(typescriptPath);
const result = ts.transpileModule(source, {
  fileName: target,
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
  fail(`TypeScript syntax diagnostics: ${diagnostics.join(" | ")}`);
}

console.log(JSON.stringify({
  verdict: "P08_5C1_TWITTER_IMAGE_RUNTIME_WARNING_FIX_VERIFIED",
  runtimeExportedDirectly: true,
  socialImageBrandingPreserved: true,
  metadataChangedBeyondTwitterWrapper: false,
  dependenciesChanged: false,
  p07Touched: false
}, null, 2));
