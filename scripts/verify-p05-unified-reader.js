#!/usr/bin/env node
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
const verseController = read(
  "app/components/VerseActionController.tsx",
);
const wordSheet = read("app/components/WordStudySheet.tsx");
const wordRoute = read("app/api/word-study/route.ts");
const mobileNav = read("app/components/MobileBottomNav.tsx");
const layout = read("app/layout.tsx");
const globalAsk = read("app/components/GlobalAskButton.tsx");
const premiumProvider = read(
  "app/components/premium/PremiumAccessProvider.tsx",
);
const entityStore = read(
  "app/data/lexicon/WordStudyEntityStore.ts",
);
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

assertPresent(
  scriptureText,
  /data-word-token=["']true["']/,
  "ScriptureText",
);
assertPresent(
  scriptureText,
  /openWordStudy/,
  "ScriptureText",
);
assertPresent(
  verseController,
  /closest\(\s*["']\[data-word-token='true'\]["']\s*\)/,
  "VerseActionController",
);
assertPresent(
  readerPage,
  /Tap a word for its source-based explanation/,
  "reader page",
);

assertPresent(mobileNav, /href:\s*["']\/library["']/, "mobile nav");
assertAbsent(mobileNav, /href:\s*["']\/study["']/, "mobile nav");

assertPresent(
  layout,
  /PremiumAccessProvider/,
  "root layout",
);
assertPresent(
  globalAsk,
  /feature=["']ask-emet["']/,
  "global Ask EMET button",
);
assertPresent(
  premiumProvider,
  /initialPlan\s*=\s*["']free["']/,
  "premium provider",
);
assertPresent(
  premiumProvider,
  /initialPlan\s*===\s*["']paid["']/,
  "premium provider",
);
assertPresent(
  premiumProvider,
  /Paid plans are coming in P06/,
  "premium provider",
);

assertAbsent(
  wordSheet,
  /\/api\/emet\/explain/,
  "WordStudySheet",
);
assertAbsent(
  wordRoute,
  /EmetService|openai|\/api\/emet\/explain/i,
  "word-study API",
);
assertPresent(
  wordSheet,
  /PremiumStudyPanel/,
  "WordStudySheet",
);
assertPresent(
  wordSheet,
  /Cached explanation|EMET/,
  "WordStudySheet",
);

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
console.log("- Free cached word taps");
console.log("- Verse actions preserved");
console.log("- Paid features centrally gated");
console.log("- No live AI on ordinary taps");
console.log("- Source-owned occurrence routing preserved");
