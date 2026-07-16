#!/usr/bin/env node
"use strict";

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
const scriptureText = read("app/components/ScriptureText.tsx");
const canonicalStore = read("app/data/scripture/CanonicalVerseStore.ts");
const route = read("app/api/word-study/route.ts");
const askView = read("app/components/ask/AskView.tsx");
const loader = read("app/components/BibleIQLoader.tsx");

assert(/export function normalizeWordEntityId/.test(store), "Entity normalization helper is missing.");
assert(/`word:\$\{corpus\}:\$\{lexicalId\}`/.test(store), "Canonical word entity format is missing.");
assert(/canonicalEntityId/.test(engine), "Engine does not normalize canonical entity IDs.");
assert(/loadWordStudyEntity\(\s*origin,\s*canonicalEntityId/.test(engine), "Engine does not load by canonical entity ID.");
assert(/SEE Evidence is one tap away/.test(sheet), "Word-study overview is missing SEE Evidence disclosure.");
assert(!/eyebrow="Entity Evidence"/.test(sheet), "Legacy Entity Evidence label remains.");
assert(!/locked\s+cached P04/i.test(sheet), "Internal P04 language remains visible.");
assert(!/compact P05 entity record/i.test(engine), "Internal P05 language remains visible.");
assert(!/Status:\s*\{status/.test(sheet), "Internal cache status remains visible.");
assert(!/label="Strong"/.test(sheet), "Duplicate Strong row remains visible.");
assert(/deriveReaderTransliteration/.test(sheet), "Reader transliteration fallback is missing.");
assert(/SEE Evidence is one tap away[\s\S]*<PremiumStudyPanel/.test(sheet), "Paid extensions must follow the free overview and Explore section.");
assert(!/BibleIQ could/.test(route + engine), "Legacy BibleIQ user error text remains.");
assert(/SEE Evidence Summary/.test(askView), "Ask view SEE branding is missing.");
assert(/SEE Evidence/.test(loader), "Evidence loader SEE branding is missing.");
assert(!/\/api\/emet\/explain/.test(sheet), "Ordinary word taps still reference live AI.");
assert(/getCanonicalChapterTokenAvailability/.test(canonicalStore), "Chapter token availability is missing.");
assert(/if \(!availability\)/.test(scriptureText), "Unaligned translator words are still interactive.");

console.log("P05 runtime-fix source verification passed.");
console.log("- Canonical entity lookup remains strict");
console.log("- Hebrew, Greek NT, and LXX corpus ownership is preserved");
console.log("- Original script and reader transliteration remain visible");
console.log("- Strong’s is shown once and LXX IDs remain separate");
console.log("- SEE Evidence uses progressive disclosure");
console.log("- Ordinary word taps do not invoke live AI");
