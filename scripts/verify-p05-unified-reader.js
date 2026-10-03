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
const readerStudy = read("app/components/ReaderVerseStudy.tsx");
const sourceRuntime = read("app/data/bibleiq/SourceBreakdownRuntime.ts");
const wordSheet = read("app/components/WordStudySheet.tsx");
const wordRoute = read("app/api/word-study/route.ts");
const mobileNav = read("app/components/MobileBottomNav.tsx");
const layout = read("app/layout.tsx");
const liveEmetRoute = read("app/api/emet/explain/route.ts");
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

assertAbsent(
  scriptureText,
  /data-word-token|useRouter|openWordStudy|displayTokenIndex/,
  "ScriptureText English navigation",
);
assertAbsent(
  globalStyles,
  /\[data-word-token="true"\]/,
  "global English-word styles",
);
assertPresent(
  readerStudy,
  /data-verse-study-control="true"/,
  "per-verse Study control",
);
assertPresent(
  readerStudy,
  /data-source-word="true"/,
  "original-language word controls",
);
assertPresent(
  readerStudy,
  /setWordOverview\(occurrence\)/,
  "source-word Word Overview navigation",
);
assertPresent(
  readerStudy,
  /className="fixed inset-0 z-\[60\] overflow-hidden"/,
  "mobile source-study sheet",
);
assertPresent(
  readerStudy,
  /<WordStudySheet[\s\S]*?onClose=\{\(\) => setWordOverview\(null\)\}/,
  "full-width deeper Word Overview sheet",
);
assertAbsent(
  readerStudy,
  /presentation="inline"/,
  "narrow inline Word Overview",
);
assertPresent(
  readerStudy,
  /ownership\?\.kind !== "exact"[\s\S]*?spans\.size === 1/,
  "fail-closed exact source correspondence",
);
assertPresent(
  scriptureText,
  /data-source-correspondence/,
  "non-interactive source correspondence highlight",
);
assertPresent(
  readerStudy,
  /\["hebrew", "lxx"\]/,
  "Hebrew/LXX selector",
);
assertPresent(
  sourceRuntime,
  /args\.source === "lxx"[\s\S]*?"brenton"/,
  "settled Brenton-to-LXX lookup",
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
  /Study opens the original-language text/,
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
  /\[data-verse-study-control="true"\]/,
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
  />\s*Done\s*</,
  "verse action sheet Done control",
);
assertPresent(
  verseActionSheet,
  /aria-label="Dismiss verse actions"/,
  "verse action sheet dismiss control",
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
  mobileNav,
  /href(?::|=)\s*["']\/read["']/,
  "mobile nav Read route",
);
assertPresent(
  mobileNav,
  /href(?::|=)\s*["']\/emet["']/,
  "mobile nav Ask EMET route",
);
assertPresent(
  mobileNav,
  /emetsees:open-emet/,
  "mobile nav Ask EMET sheet trigger",
);
assertPresent(
  mobileNav,
  /href(?::|=)\s*["']\/library["']/,
  "mobile nav Library route",
);
assertPresent(
  mobileNav,
  /href(?::|=)\s*["']\/settings["']/,
  "mobile nav Settings route",
);
assertAbsent(mobileNav, /href(?::|=)\s*["']\/ask["']/, "mobile nav");
assertAbsent(
  mobileNav,
  /href(?::|=)\s*["']\/study["']/,
  "mobile nav",
);

assertAbsent(layout, /PremiumAccessProvider/, "root layout");
assertPresent(layout, /<GlobalAskButton \/>/, "global Ask EMET sheet host");
assertAbsent(
  mobileNav,
  /requestUpgrade\("ask-emet"/,
  "subscription-gated reader navigation",
);
assertPresent(liveEmetRoute, /EMET_LIVE_ENABLED/, "live EMET feature gate");
assertPresent(liveEmetRoute, /getVerifiedSupabaseUserId/, "live EMET authentication");

assertAbsent(wordSheet, /\/api\/emet\/explain/, "WordStudySheet");
assertAbsent(
  wordRoute,
  /EmetService|openai|\/api\/emet\/explain/i,
  "word-study API",
);
assertAbsent(wordSheet, /PremiumStudyPanel/, "WordStudySheet");
assertPresent(
  wordSheet,
  /Across Scripture/,
  "WordStudySheet Across Scripture slot",
);
assertPresent(
  wordSheet,
  /readerReadyConnections/,
  "WordStudySheet reader-ready connections",
);
assertPresent(
  wordSheet,
  /Common English renderings/,
  "WordStudySheet rendering exploration",
);
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
console.log("- English Scripture is reading-only");
console.log("- Only original-language lexical words are tappable");
console.log("- Verse-number actions are preserved");
console.log("- Inactive paid entry points are absent from the free-reader shell");
console.log("- Live EMET is fail-closed");
console.log("- No live AI runs on ordinary word taps");
console.log("- Source-owned occurrence routing is preserved");
console.log("- Exact source correspondence is visual-only and fails closed");
console.log("- Source study and deeper Word Overview use mobile-safe sheets");
