#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const LOCKED_P04_CHECKSUM =
  "574c50eab68c6932fa2e29cf0af26e30c18834e9dbf231dfb08ce97f9a88e4a5";

function read(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required P05 file: ${relativePath}`);
  }
  return fs.readFileSync(fullPath, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertAbsent(text, pattern, label) {
  assert(
    !pattern.test(text),
    `${label} still contains forbidden legacy behavior: ${pattern}`,
  );
}

function assertPresent(text, pattern, label) {
  assert(
    pattern.test(text),
    `${label} is missing required P05 behavior: ${pattern}`,
  );
}

const readerPage = read("app/read/[book]/[chapter]/page.tsx");
const scriptureText = read("app/components/ScriptureText.tsx");
const globalStyles = read("app/globals.css");
const readerFirstUseTip = read("app/components/ReaderFirstUseTip.tsx");
const readerHeader = read("app/components/CollapsibleReaderHeader.tsx");
const verseActionSheet = read("app/components/VerseActionSheet.tsx");
const verseController = read("app/components/VerseActionController.tsx");
const wordController = read("app/components/ReaderWordStudyController.tsx");
const wordSheet = read("app/components/WordStudySheet.tsx");
const wordRoute = read("app/api/word-study/route.ts");
const mobileNav = read("app/components/MobileBottomNav.tsx");
const layout = read("app/layout.tsx");
const globalAsk = read("app/components/GlobalAskButton.tsx");
const premiumProvider = read(
  "app/components/premium/PremiumAccessProvider.tsx",
);
const entityStore = read("app/data/lexicon/WordStudyEntityStore.ts");
const buildEntityRuntime = read(
  "scripts/build-word-study-entity-runtime.js",
);

for (const [label, text] of [
  ["reader page", readerPage],
  ["ScriptureText", scriptureText],
  ["VerseActionController", verseController],
  ["WordStudySheet", wordSheet],
]) {
  assertAbsent(text, /\bstudyMode\b/, label);
  assertAbsent(text, /study=true/, label);
  assertAbsent(text, /params\.set\(["']study["']/, label);
}

assertPresent(scriptureText, /data-word-token="true"/, "ScriptureText");
assertPresent(scriptureText, /if \(!availability\)/, "ScriptureText");
assertPresent(scriptureText, /FUNCTION_WORDS/, "ScriptureText");
assertPresent(
  scriptureText,
  /data-word-focused=\{focused \? "true" : undefined\}/,
  "ScriptureText",
);
assertPresent(
  scriptureText,
  /textDecoration:\s*"none"/,
  "ScriptureText",
);
assertAbsent(
  scriptureText,
  /textDecorationStyle:\s*"dotted"/,
  "ScriptureText",
);
assertPresent(
  globalStyles,
  /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)/,
  "global styles",
);
assertPresent(
  globalStyles,
  /MOBILE SOURCE-WORD AFFORDANCE[\s\S]*?text-decoration-style:\s*dotted/,
  "global styles",
);
assertPresent(
  verseController,
  /data-verse-selector="true"/,
  "VerseActionController",
);
assertAbsent(
  verseController,
  /onClick=\{\(event: React\.MouseEvent<HTMLDivElement>/,
  "VerseActionController",
);
assertPresent(
  readerPage,
  /ReaderFirstUseTip/,
  "reader page",
);
assertPresent(
  readerFirstUseTip,
  /Dotted words open source evidence/,
  "reader first-use tip",
);
assertPresent(
  readerFirstUseTip,
  /Verse numbers open tools/,
  "reader first-use tip",
);
assertPresent(
  readerFirstUseTip,
  /emetsees-reader-tip-dismissed-v1/,
  "reader first-use tip",
);
assertPresent(
  readerFirstUseTip,
  /\[data-word-token="true"\]/,
  "reader first-use tip",
);
assertPresent(
  readerHeader,
  /Open reader help/,
  "reader header",
);
assertPresent(
  readerHeader,
  /emetsees:open-reader-help/,
  "reader header",
);
assertPresent(
  readerFirstUseTip,
  /emetsees:open-reader-help/,
  "reader first-use tip",
);
assertAbsent(
  readerFirstUseTip,
  /Reader help/,
  "reader first-use tip",
);
assertPresent(
  verseActionSheet,
  />\s*Close\s*</,
  "verse action sheet",
);
assertPresent(
  verseActionSheet,
  /document\.execCommand\("copy"\)/,
  "verse action sheet",
);
assertPresent(
  verseActionSheet,
  /Verse copied for sharing/,
  "verse action sheet",
);
assertPresent(
  wordController,
  /params\.set\("focusToken"/,
  "word-study return focus",
);

assertPresent(mobileNav, /href:\s*["']\/library["']/, "mobile nav");
assertAbsent(mobileNav, /href:\s*["']\/study["']/, "mobile nav");

assertPresent(layout, /PremiumAccessProvider/, "root layout");
assertAbsent(layout, /GlobalAskButton/, "root layout");
assertPresent(mobileNav, /requestUpgrade\("ask-emet"/, "mobile Ask EMET");
assertPresent(globalAsk, /feature=["']ask-emet["']/, "global Ask EMET button");
assertPresent(premiumProvider, /initialPlan\s*=\s*["']free["']/, "premium provider");
assertPresent(premiumProvider, /initialPlan\s*===\s*["']paid["']/, "premium provider");

assertAbsent(wordSheet, /\/api\/emet\/explain/, "WordStudySheet");
assertAbsent(
  wordRoute,
  /EmetService|openai|\/api\/emet\/explain/i,
  "word-study API",
);
assertPresent(wordSheet, /PremiumStudyPanel/, "WordStudySheet");
assertPresent(wordSheet, /SEE Evidence is one tap away/, "WordStudySheet");
assertPresent(wordSheet, /Back to reading at/, "WordStudySheet");
assertPresent(wordSheet, /Strong's (?:definition|number)/, "WordStudySheet");
assertPresent(wordSheet, /LXX lexical ID/, "WordStudySheet");

assertPresent(
  entityStore,
  new RegExp(LOCKED_P04_CHECKSUM),
  "WordStudyEntityStore",
);
assertPresent(
  buildEntityRuntime,
  new RegExp(LOCKED_P04_CHECKSUM),
  "P05 entity runtime builder",
);

assertAbsent(
  wordSheet,
  /deuterocanonical|1Maccabees|Tobit|Judith/,
  "WordStudySheet occurrence routing",
);
assertPresent(
  wordSheet,
  /reference\.routeTranslation/,
  "WordStudySheet occurrence routing",
);

console.log("P05 unified-reader source verification passed.");
console.log("- One reader experience");
console.log("- Only source-aligned words are tappable");
console.log("- Translator-added words remain plain text");
console.log("- Verse-number actions are preserved");
console.log("- Paid features remain centrally gated");
console.log("- No live AI runs on ordinary word taps");
console.log("- Source-owned occurrence routing is preserved");
