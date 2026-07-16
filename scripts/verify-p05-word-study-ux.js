#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function read(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing word-study UX file: ${relativePath}`);
  }
  return fs.readFileSync(fullPath, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(`[P05 word-study UX] ${message}`);
}

const sheet = read("app/components/WordStudySheet.tsx");
const scripture = read("app/components/ScriptureText.tsx");
const verseActions = read("app/components/VerseActionController.tsx");
const wordController = read("app/components/ReaderWordStudyController.tsx");
const readerPage = read("app/read/[book]/[chapter]/page.tsx");
const canonicalStore = read("app/data/scripture/CanonicalVerseStore.ts");
const types = read("app/data/lexicon/BibleIQTypes.ts");

assert(/type StudyView =/.test(sheet), "Progressive-disclosure views are missing.");
for (const view of [
  "overview",
  "lexicon",
  "renderings",
  "references",
  "occurrences",
  "connections",
  "technical",
]) {
  assert(sheet.includes(`| "${view}"`) || sheet.includes(`"${view}"`), `Missing ${view} view.`);
}
assert(/What it means here/.test(sheet), "The 30-second contextual meaning section is missing.");
assert(/Across Scripture/.test(sheet), "Approved EMET teaching section is missing.");
assert(/SEE Evidence is one tap away/.test(sheet), "Progressive SEE disclosure is missing.");
assert(/Back to reading at/.test(sheet), "Back-to-reading action is missing.");
assert(/returnLabel/.test(sheet) && /returnTo/.test(sheet), "Reference return navigation is incomplete.");
assert(/Strong's definition and lexicon/.test(sheet), "Clickable Strong's entry is missing.");
assert(/LXX lexical ID/.test(sheet), "LXX lexical identity rule is missing.");
assert(!/relationshipCount\}/.test(sheet), "Giant connection counts are exposed in the default UI.");
assert(!/low confidence/i.test(sheet), "Low-confidence graph labels are exposed.");
assert(/readerReadyConnections/.test(sheet), "SEE confidence filtering is missing.");
assert(/humanizeMorphology/.test(sheet), "Readable morphology is missing.");
assert(/TECHNICAL_SOURCE_FORM_LIMIT/.test(sheet), "Raw source forms are not isolated to technical details.");

assert(/BibleIQChapterTokenAvailability/.test(types), "Shared token-availability type is missing.");
assert(/getCanonicalChapterTokenAvailability/.test(canonicalStore), "Chapter alignment availability loader is missing.");
assert(/tokenAvailabilityByVerse/.test(readerPage), "Reader does not receive token availability.");
assert(/tokenAvailability\?\.\[String\(tokenIndex\)\]/.test(scripture), "Scripture tokens do not consult source availability.");
assert(/if \(!availability\)/.test(scripture), "Unaligned English words are not excluded.");
assert(/FUNCTION_WORDS/.test(scripture), "Aligned function-word visual classification is missing.");
assert(/data-word-kind=/.test(scripture), "Token visual kind is missing.");
assert(/textDecorationStyle:\s*"dotted"/.test(scripture), "Subtle word hint is missing.");
assert(/data-verse-selector="true"/.test(verseActions), "Verse-number selection is missing.");
assert(!/cursor-pointer rounded-xl/.test(verseActions), "The entire verse still looks like the selection target.");
assert(/focusToken/.test(wordController + readerPage + scripture), "Exact tapped-word return focus is missing.");
assert(/Tap a verse number/.test(readerPage), "Reader instructions do not match the interaction.");
assert(!/\/api\/emet\/explain/.test(sheet), "Ordinary word taps still invoke live AI.");

console.log("P05 word-study UX verification passed.");
console.log("- The default sheet teaches before exposing data");
console.log("- Evidence is progressively disclosed through clickable rows");
console.log("- Strong’s and LXX lexical entries are reachable without duplication");
console.log("- Only source-aligned words are interactive");
console.log("- Translator-added words remain plain reading text");
console.log("- Verse actions use the verse number");
console.log("- Deeper exploration always offers a return to the tapped reading location");
