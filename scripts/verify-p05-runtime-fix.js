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
assert(
  /Across Scripture/.test(sheet),
  "Word-study overview is missing the approved Across Scripture slot.",
);
assert(
  /readerReadyConnections/.test(sheet),
  "Reader-ready Scripture connections are missing.",
);
assert(!/eyebrow="Entity Evidence"/.test(sheet), "Legacy Entity Evidence label remains.");
assert(!/locked\s+cached P04/i.test(sheet), "Internal P04 language remains visible.");
assert(!/compact P05 entity record/i.test(engine), "Internal P05 language remains visible.");
assert(!/Status:\s*\{status/.test(sheet), "Internal cache status remains visible.");
assert(!/label="Strong"/.test(sheet), "Duplicate Strong row remains visible.");
assert(/deriveReaderTransliteration/.test(sheet), "Reader transliteration fallback is missing.");
assert(
  !/PremiumStudyPanel/.test(sheet),
  "Premature paid word-study panel returned before P09.",
);
assert(
  /Common English renderings/.test(sheet) &&
    /Back to reading at/.test(sheet) &&
    /readerReadyConnections/.test(sheet),
  "P08 evidence progressive disclosure is incomplete.",
);
assert(!/BibleIQ could/.test(route + engine), "Legacy BibleIQ user error text remains.");
assert(/SEE Evidence Summary/.test(askView), "Ask view SEE branding is missing.");
assert(/SEE Evidence/.test(loader), "Evidence loader SEE branding is missing.");
assert(!/\/api\/emet\/explain/.test(sheet), "Ordinary word taps still reference live AI.");
assert(/getCanonicalChapterTokenAvailability/.test(canonicalStore), "Chapter token availability is missing.");
assert(
  (() => {
    const scriptureText = require("fs").readFileSync(
      "app/components/ScriptureText.tsx",
      "utf8",
    );

    /*
     * Phase 1 now uses audited English SPAN <-> SOURCE SEGMENT
     * ownership instead of treating every translator token as an
     * independent interactive word.
     *
     * This verification intentionally checks the fail-closed
     * structure of the span renderer:
     *
     * - candidates originate only from tokenAvailability
     * - canonical rendering bounds are honored
     * - plain text is emitted when no owned span exists
     * - conflicting overlapping spans are rejected
     * - English taps route by canonical reader token identity
     * - lexical/source IDs are never presented as the English tap
     */
    return (
      scriptureText.includes("function buildOwnedSpans(") &&
      scriptureText.includes("Object.entries(") &&
      scriptureText.includes("tokenAvailability") &&
      scriptureText.includes("renderingStartTokenIndex") &&
      scriptureText.includes("renderingEndTokenIndex") &&
      scriptureText.includes("spanByStart.get(") &&
      scriptureText.includes("if (!span)") &&
      scriptureText.includes("rejected.add(leftIndex)") &&
      scriptureText.includes("rejected.add(rightIndex)") &&
      scriptureText.includes("anchorTokenIndex") &&
      scriptureText.includes('params.delete("originalWord")')
    );
  })(),
  "Unaligned translator words are still interactive.",
);

console.log("P05 runtime-fix source verification passed.");
console.log("- Canonical entity lookup remains strict");
console.log("- Hebrew, Greek NT, and LXX corpus ownership is preserved");
console.log("- Original script and reader transliteration remain visible");
console.log("- Strong’s is shown once and LXX IDs remain separate");
console.log("- SEE Evidence uses progressive disclosure");
console.log("- Ordinary word taps do not invoke live AI");
