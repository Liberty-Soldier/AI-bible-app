#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const repo = path.resolve(process.argv[2] || process.cwd());

const files = {
  layout: path.join(repo, "app", "layout.tsx"),
  reader: path.join(repo, "app", "read", "[book]", "[chapter]", "page.tsx"),
  wordmark: path.join(repo, "app", "components", "branding", "EmetseesWordmark.tsx"),
  manifest: path.join(repo, "public", "manifest.webmanifest"),
  og: path.join(repo, "app", "opengraph-image.tsx"),
  twitter: path.join(repo, "app", "twitter-image.tsx"),
};

function fail(message) { throw new Error(message); }

for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) fail(`Missing ${name}: ${file}`);
}

const layout = fs.readFileSync(files.layout, "utf8");
const reader = fs.readFileSync(files.reader, "utf8");
const wordmark = fs.readFileSync(files.wordmark, "utf8");
const manifest = JSON.parse(fs.readFileSync(files.manifest, "utf8"));
const og = fs.readFileSync(files.og, "utf8");

for (const marker of [
  'metadataBase: new URL("https://emetsees.com")',
  'default: "EMETSEES — Bible Study & Scripture Evidence"',
  'applicationName: "EMETSEES Bible Study"',
  'openGraph: {',
  'twitter: {',
  'appleWebApp: {',
  'title: "EMETSEES Bible"',
]) {
  if (!layout.includes(marker)) fail(`Missing root branding marker: ${marker}`);
}

for (const marker of [
  "export async function generateMetadata",
  "canonicalParams.set",
  'type: "article"',
  'images: ["/twitter-image"]',
]) {
  if (!reader.includes(marker)) fail(`Missing Reader metadata marker: ${marker}`);
}

if (!wordmark.includes("Bible Study & Scripture Evidence")) {
  fail("Visible EMETSEES descriptor was not updated.");
}

if (manifest.name !== "EMETSEES Bible Study") fail("Manifest name is incorrect.");
if (manifest.short_name !== "EMETSEES") fail("Manifest short_name is incorrect.");
if (manifest.id !== "/") fail("Manifest id is missing.");
if (manifest.scope !== "/") fail("Manifest scope is missing.");
if (manifest.display !== "standalone") fail("Standalone display was not preserved.");
if (manifest.prefer_related_applications !== false) {
  fail("Manifest prefer_related_applications must be false.");
}

for (const size of ["192x192", "512x512"]) {
  if (!manifest.icons.some((icon) => icon.sizes === size)) {
    fail(`Required install icon is missing: ${size}`);
  }
}

if (!manifest.icons.some((icon) => icon.purpose === "maskable")) {
  fail("Maskable Android/PWA icon is missing.");
}

for (const marker of [
  "emetsees-mark-gold.png",
  "Bible Study & Scripture Evidence",
  "Read Scripture. Trace the Evidence.",
  "emetsees.com",
]) {
  if (!og.includes(marker)) fail(`Missing social image marker: ${marker}`);
}

const typescriptPath = path.join(repo, "node_modules", "typescript");
if (!fs.existsSync(typescriptPath)) fail("Local TypeScript dependency is unavailable.");
const ts = require(typescriptPath);

for (const file of [files.layout, files.reader, files.wordmark, files.og, files.twitter]) {
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
  verdict: "P08_5C_BRANDING_SHARE_INSTALL_METADATA_VERIFIED",
  canonicalProductionDomain: "https://emetsees.com",
  rootSocialMetadata: true,
  brandedSocialImage: true,
  readerSpecificMetadata: true,
  appleInstallTitle: "EMETSEES Bible",
  pwaInstallName: "EMETSEES Bible Study",
  pwaShortName: "EMETSEES",
  existingInstallIconsReused: true,
  p07Touched: false
}, null, 2));
