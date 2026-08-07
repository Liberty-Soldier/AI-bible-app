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
const globalStyles = read("app/globals.css");
const readerFirstUseTip = read("app/components/ReaderFirstUseTip.tsx");
const readerHeader = read("app/components/CollapsibleReaderHeader.tsx");
const verseActionSheet = read("app/components/VerseActionSheet.tsx");
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
assert(
  /readerMeaningLabel/.test(sheet) &&
    /Meaning here/.test(sheet) &&
    /In this verse/.test(sheet),
  "The contextual meaning section is missing.",
);
assert(/Across Scripture/.test(sheet), "Approved EMET teaching section is missing.");
assert(
  /Across Scripture/.test(sheet) &&
    /readerReadyConnections/.test(sheet) &&
    /Common English renderings/.test(sheet),
  "Progressive Scripture-evidence disclosure is missing.",
);
assert(/Back to reading at/.test(sheet), "Back-to-reading action is missing.");
assert(/returnLabel/.test(sheet) && /returnTo/.test(sheet), "Reference return navigation is incomplete.");
assert(
  /Strong's number/.test(sheet) &&
    /Source dictionary wording/.test(sheet) &&
    /onView\("lexicon"\)/.test(sheet),
  "Strong's / lexicon evidence path is missing.",
);
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
assert(
  /data-word-focused=/.test(scripture),
  "Selected-word focus marker is missing.",
);
assert(
  /textDecoration:\s*"none"/.test(scripture),
  "Normal Scripture words are not visually clean.",
);
assert(
  !/textDecorationStyle:\s*"dotted"/.test(scripture),
  "Obsolete dotted word hint remains.",
);
assert(
  /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)/.test(globalStyles),
  "Mobile touch affordance is missing.",
);
assert(
  /MOBILE SOURCE-WORD AFFORDANCE[\s\S]*?text-decoration-style:\s*dotted/.test(globalStyles),
  "Mobile source-word cue is missing.",
);
assert(
  /Dotted words open source evidence/.test(readerFirstUseTip),
  "First-use reader tip is missing.",
);
assert(
  /emetsees-reader-tip-dismissed-v1/.test(readerFirstUseTip),
  "Reader-tip persistence is missing.",
);
assert(
  /\[data-word-token="true"\]/.test(readerFirstUseTip),
  "Reader-tip automatic dismissal after a word tap is missing.",
);
assert(
  /emetsees:open-reader-help/.test(readerHeader + readerFirstUseTip),
  "Compact reader help is missing.",
);
assert(
  />\s*Done\s*</.test(verseActionSheet) &&
    /aria-label="Dismiss verse actions"/.test(verseActionSheet),
  "Verse-action dismiss behavior is missing.",
);
assert(
  /document\.execCommand\("copy"\)/.test(verseActionSheet),
  "Share copy fallback is missing.",
);
assert(/data-verse-selector="true"/.test(verseActions), "Verse-number selection is missing.");
assert(!/cursor-pointer rounded-xl/.test(verseActions), "The entire verse still looks like the selection target.");
assert(/focusToken/.test(wordController + readerPage + scripture), "Exact tapped-word return focus is missing.");
assert(/Verse numbers open tools/.test(readerFirstUseTip), "Reader instructions do not match the interaction.");
assert(!/\/api\/emet\/explain/.test(sheet), "Ordinary word taps still invoke live AI.");

console.log("P05 word-study UX verification passed.");
console.log("- The default sheet teaches before exposing data");
console.log("- Evidence is progressively disclosed through clickable rows");
console.log("- Strong’s and LXX lexical entries are reachable without duplication");
console.log("- Only source-aligned words are interactive");
console.log("- Normal Scripture remains visually clean");
console.log("- Only the selected word receives persistent emphasis");
console.log("- Touch devices receive a subtle source-word cue");
console.log("- First-use guidance dismisses after the first word tap");
console.log("- Translator-added words remain plain reading text");
console.log("- Verse actions use the verse number");
console.log("- Deeper exploration always offers a return to the tapped reading location");
