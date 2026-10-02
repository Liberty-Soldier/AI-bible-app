import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function requireText(source, expected, label) {
  if (!source.includes(expected)) {
    throw new Error(`Missing ${label}: ${expected}`);
  }
}

function forbidText(source, forbidden, label) {
  if (source.includes(forbidden)) {
    throw new Error(`Unexpected ${label}: ${forbidden}`);
  }
}

const home = read("app/page.tsx");
const navigation = read("app/components/MobileBottomNav.tsx");
const readerPassagePicker = read("app/read/page.tsx");
const readerSelector = read("app/components/ReaderSelector.tsx");
const layout = read("app/layout.tsx");
const ask = read("app/ask/page.tsx");
const study = read("app/study/page.tsx");
const liveApi = read("app/api/emet/explain/route.ts");
const wordStudy = read("app/components/WordStudySheet.tsx");
const bibleIqEngine = read("app/data/lexicon/BibleIQEngine.ts");
const publicTestRoutes = [
  "app/test-concept/page.tsx",
  "app/test-lemma/page.tsx",
];

requireText(home, 'action="/emet"', "home Ask EMET action");
requireText(home, 'name="q"', "home Ask EMET query parameter");
requireText(home, 'href="/search"', "home Scripture-search access");
forbidText(home, "usePremiumAccess", "home premium dependency");
forbidText(home, "requestUpgrade", "home upgrade interception");
forbidText(home, "tap any word", "obsolete English-word tapping claim");
requireText(
  home,
  "explore its Hebrew and Greek source words",
  "source-word home description",
);
requireText(readerSelector, 'label: "New Testament"', "New Testament book group");
requireText(readerSelector, '"Matthew"', "first New Testament book");
requireText(readerSelector, '"Revelation"', "last New Testament book");
requireText(readerSelector, "<optgroup", "grouped reader book selector");
requireText(
  readerPassagePicker,
  "<details",
  "native mobile passage disclosure controls",
);
requireText(
  readerPassagePicker,
  "<summary",
  "native mobile passage disclosure labels",
);
requireText(
  readerPassagePicker,
  "href={`/read/${encodeURIComponent(",
  "real chapter navigation links",
);
forbidText(
  readerPassagePicker,
  'setPickerStep("book")',
  "JavaScript-only section navigation",
);

requireText(navigation, 'href="/library"', "free Library navigation");
requireText(navigation, 'href="/emet"', "authenticated Ask EMET navigation");
requireText(navigation, "Ask EMET", "Ask EMET navigation label");

forbidText(layout, "PremiumAccessProvider", "premium provider mount");
requireText(ask, 'redirect(query ? `/emet?q=', "legacy Ask-to-EMET redirect");
requireText(study, 'redirect("/read")', "Study-to-Reader redirect");

requireText(liveApi, 'status: "disabled"', "disabled live-EMET status");
requireText(
  liveApi,
  'process.env.EMET_LIVE_ENABLED !== "true"',
  "live-EMET environment gate",
);
requireText(
  liveApi,
  "getVerifiedSupabaseUserId",
  "live-EMET verified authentication gate",
);
requireText(
  liveApi,
  "resolveEmetAiReaderWord",
  "live-EMET canonical reader occurrence resolver",
);
requireText(
  liveApi,
  "reserveEmetAiQuestion",
  "live-EMET quota reservation gate",
);
forbidText(liveApi, "OPENAI_API_KEY", "live OpenAI credential access");
forbidText(liveApi, "explainWithEmet", "live EMET invocation");
forbidText(liveApi, 'from "openai"', "live OpenAI import");

requireText(
  wordStudy,
  "buildShortEmetUsageNote",
  "systemic short-EMET evidence enrichment",
);
requireText(wordStudy, "explanationWords >= 60", "short-EMET quality threshold");
requireText(wordStudy, "Usage range", "short-EMET usage-range label");
requireText(
  wordStudy,
  "Verified English renderings include",
  "short-EMET verified-rendering evidence",
);
requireText(
  wordStudy,
  'new Set(["a", "an", "the"])',
  "unattested article-fragment filter",
);
requireText(
  wordStudy,
  "How this source occurrence is identified",
  "source-occurrence study wording",
);
requireText(
  wordStudy,
  "EMET · lexical evidence",
  "evidence-derived explanation label",
);
requireText(
  bibleIqEngine,
  "lexicalBaselineExplanation",
  "systemic lexical explanation fallback",
);
requireText(
  bibleIqEngine,
  'approval: "evidence-derived-lexicon"',
  "evidence-derived provenance contract",
);
requireText(
  bibleIqEngine,
  'runtime.entityId === `word:${runtime.corpus}:${lexicalId}`',
  "exact lexical identity gate",
);

for (const relativePath of publicTestRoutes) {
  if (fs.existsSync(path.join(ROOT, relativePath))) {
    throw new Error(`Developer-only route remains public: ${relativePath}`);
  }
}

console.log("Free-reader MVP verification passed.");
console.log("- Home prompt opens authenticated Ask EMET while preserving direct Scripture search access.");
console.log("- Home description accurately identifies Hebrew and Greek source-word study.");
console.log("- Reader book selector explicitly groups Matthew through Revelation as New Testament.");
console.log("- Mobile section and book selection uses native disclosures with real chapter links.");
console.log("- Primary navigation restores Ask EMET as the central action.");
console.log("- Legacy Ask and Study URLs redirect to their current working routes.");
console.log("- Live EMET API remains environment-gated and requires verified auth, canonical identity, and quota.");
console.log("- Short legacy EMET explanations receive canonical usage-range evidence.");
console.log("- Exact lexical entities receive a provenance-marked lexicon baseline when reviewed prose is unavailable.");
console.log("- Developer-only diagnostic pages are absent from public routes.");
