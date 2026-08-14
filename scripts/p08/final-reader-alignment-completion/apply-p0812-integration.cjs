#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(process.env.EMETSEES_REPO_ROOT || process.cwd());
const PACKAGE_FILE = path.join(ROOT, "package.json");

function fail(message) {
  throw new Error(`[P08.12 integration] ${message}`);
}
function eolOf(text) {
  return String(text || "").includes("\r\n") ? "\r\n" : "\n";
}
function withEol(text, eol) {
  return eol === "\r\n"
    ? String(text).replace(/\n/gu, "\r\n")
    : String(text);
}

const raw = fs.readFileSync(PACKAGE_FILE, "utf8");
const eol = eolOf(raw);
const pkg = JSON.parse(raw);
pkg.scripts = pkg.scripts || {};

const repairCmd =
  "node --max-old-space-size=4096 scripts/p08/final-reader-alignment-completion/repair-canonical-alignment-coverage.cjs";
const brentonCmd =
  "node --max-old-space-size=4096 scripts/p08/final-reader-alignment-completion/reconcile-brenton-reader-runtime.cjs";
const genericOwner =
  "node --max-old-space-size=4096 scripts/build-word-study-runtime.js";
const oldWebIntegrity = "scripts/translations/verify-web-production-integrity.js";
const newWebIntegrity = "scripts/translations/verify-web-production-integrity-v2.cjs";

pkg.scripts["preview:reader-alignment-completion"] = `${repairCmd} --preview`;
pkg.scripts["apply:reader-alignment-completion"] = `${repairCmd} --apply`;
pkg.scripts["reconcile:brenton-reader-runtime"] = brentonCmd;

let prebuild = String(pkg.scripts.prebuild || "");
if (!prebuild.includes(genericOwner)) {
  fail("Production prebuild generic Word Study runtime owner changed.");
}
if (!prebuild.includes("reconcile-brenton-reader-runtime.cjs")) {
  prebuild = prebuild.replace(
    genericOwner,
    `${genericOwner} && ${brentonCmd}`,
  );
}
if (prebuild.includes(oldWebIntegrity)) {
  prebuild = prebuild.split(oldWebIntegrity).join(newWebIntegrity);
} else if (!prebuild.includes(newWebIntegrity)) {
  fail("Production prebuild WEB integrity owner changed.");
}
pkg.scripts.prebuild = prebuild;

if (typeof pkg.scripts["verify:web-integrity"] === "string") {
  pkg.scripts["verify:web-integrity"] = pkg.scripts["verify:web-integrity"]
    .split(oldWebIntegrity)
    .join(newWebIntegrity);
}

fs.writeFileSync(
  PACKAGE_FILE,
  withEol(`${JSON.stringify(pkg, null, 2)}\n`, eol),
  "utf8",
);

console.log("P08.12 production integration applied.");
console.log("- canonical alignment repair commands registered");
console.log("- Brenton exact structural runtime reconciliation inserted after generic runtime build");
console.log("- WEB production integrity upgraded to alignment-aware v2 contract");
console.log("- no app routing owner replaced");
