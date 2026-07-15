#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function read(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`Missing ${relativePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const store = read("app/data/lexicon/WordStudyEntityStore.ts");
const engine = read("app/data/lexicon/BibleIQEngine.ts");
const sheet = read("app/components/WordStudySheet.tsx");
const route = read("app/api/word-study/route.ts");
const askView = read("app/components/ask/AskView.tsx");
const loader = read("app/components/BibleIQLoader.tsx");

assert(/export function normalizeWordEntityId/.test(store), "Entity normalization helper is missing.");
assert(/`word:\$\{corpus\}:\$\{lexicalId\}`/.test(store), "Canonical word entity format is missing.");
assert(/canonicalEntityId/.test(engine), "Engine does not normalize canonical entity IDs.");
assert(/loadWordStudyEntity\(\s*origin,\s*canonicalEntityId/.test(engine), "Engine does not load by canonical entity ID.");
assert(/SEE Evidence/.test(sheet), "Word study sheet is missing SEE Evidence branding.");
assert(!/eyebrow="Entity Evidence"/.test(sheet), "Legacy Entity Evidence label remains.");
assert(!/locked\s+cached P04/i.test(sheet), "Internal P04 language remains visible.");
assert(!/compact P05 entity record/i.test(engine), "Internal P05 language remains visible.");
assert(!/Status:\s*\{status/.test(sheet), "Internal cache status remains visible.");
assert(/alignment\.strong !== alignment\.lexicalId/.test(sheet), "Duplicate Strong/lexical ID guard is missing.");
assert(/deriveReaderTransliteration/.test(sheet), "Reader transliteration fallback is missing.");
assert(sheet.indexOf("<PremiumStudyPanel") > sheet.indexOf('eyebrow="Occurrences"'), "Paid extensions must follow free evidence and occurrences.");
assert(!/BibleIQ could/.test(route + engine), "Legacy BibleIQ user error text remains.");
assert(/SEE Evidence Summary/.test(askView), "Ask view SEE branding is missing.");
assert(/SEE Evidence/.test(loader), "Evidence loader SEE branding is missing.");
assert(!/\/api\/emet\/explain/.test(sheet), "Ordinary word taps still reference live AI.");

console.log("P05 runtime-fix source verification passed.");
console.log("- Legacy Hebrew/LXX entity IDs normalize to canonical P01 IDs");
console.log("- Cached runtime lookup uses the canonical entity ID");
console.log("- Duplicate lexical/Strong identifiers are hidden");
console.log("- Original script and reader transliteration are visible");
console.log("- SEE Evidence replaces user-facing BibleIQ wording");
console.log("- Paid extensions follow the complete free evidence");
console.log("- Ordinary taps still do not invoke live AI");
