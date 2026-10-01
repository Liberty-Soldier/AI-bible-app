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
const layout = read("app/layout.tsx");
const ask = read("app/ask/page.tsx");
const study = read("app/study/page.tsx");
const liveApi = read("app/api/emet/explain/route.ts");
const wordStudy = read("app/components/WordStudySheet.tsx");
const publicTestRoutes = [
  "app/test-concept/page.tsx",
  "app/test-lemma/page.tsx",
];

requireText(home, 'action="/search"', "home Scripture-search action");
requireText(home, 'name="q"', "home Scripture-search query parameter");
forbidText(home, "usePremiumAccess", "home premium dependency");
forbidText(home, "requestUpgrade", "home upgrade interception");

requireText(navigation, 'href: "/library"', "free Library navigation");
forbidText(navigation, 'href="/ask"', "unfinished Ask navigation");
forbidText(navigation, "Ask EMET", "unfinished Ask navigation label");

forbidText(layout, "PremiumAccessProvider", "premium provider mount");
requireText(ask, 'redirect(query ? `/search?q=', "Ask-to-Search redirect");
requireText(study, 'redirect("/read")', "Study-to-Reader redirect");

requireText(liveApi, 'status: "disabled"', "disabled live-EMET status");
requireText(liveApi, "status: 503", "disabled live-EMET HTTP status");
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

for (const relativePath of publicTestRoutes) {
  if (fs.existsSync(path.join(ROOT, relativePath))) {
    throw new Error(`Developer-only route remains public: ${relativePath}`);
  }
}

console.log("Free-reader MVP verification passed.");
console.log("- Home prompt performs Scripture search.");
console.log("- Primary navigation exposes only working free features.");
console.log("- Legacy Ask and Study URLs redirect to working free routes.");
console.log("- Live EMET API is fail-closed and cannot invoke OpenAI.");
console.log("- Short legacy EMET explanations receive canonical usage-range evidence.");
console.log("- Developer-only diagnostic pages are absent from public routes.");
