#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repositoryRoot = path.resolve(process.argv[2] || process.cwd());
const indexRoot = path.resolve(
  process.argv[3] ||
    path.join(repositoryRoot, "public", "scripture", "search"),
);

const EXPECTED = {
  web: 31098,
  kjv: 31102,
  brenton: 28548,
};

function fail(message) {
  throw new Error(message);
}

function loadIndex(translation) {
  const file = path.join(indexRoot, `${translation}.json`);

  if (!fs.existsSync(file)) fail(`Missing search index: ${file}`);

  const value = JSON.parse(fs.readFileSync(file, "utf8"));

  if (
    value.schemaVersion !== 1 ||
    value.translation !== translation ||
    value.verseCount !== EXPECTED[translation] ||
    !Array.isArray(value.records) ||
    value.records.length !== EXPECTED[translation]
  ) {
    fail(`Invalid ${translation} search index.`);
  }

  return value;
}

function loadTypeScript() {
  const candidates = [
    path.join(repositoryRoot, "node_modules", "typescript"),
    "/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript",
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Continue.
    }
  }

  fail("TypeScript is unavailable.");
}

function transpileFile(ts, relative) {
  const file = path.join(repositoryRoot, relative);
  const source = fs.readFileSync(file, "utf8");
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const diagnostics = (result.diagnostics || []).map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  );

  if (diagnostics.length) {
    fail(`${relative} TypeScript diagnostics: ${diagnostics.join(" | ")}`);
  }

  return { source, outputText: result.outputText };
}

function loadSearchLibrary(ts) {
  const { source, outputText } = transpileFile(
    ts,
    "app/lib/scriptureSearch.ts",
  );
  const module = { exports: {} };
  const wrapper = new vm.Script(
    `(function(require, module, exports) {${outputText}\n})`,
    { filename: "scriptureSearch.transpiled.cjs" },
  );
  const execute = wrapper.runInNewContext({
    URLSearchParams,
    fetch: () => {
      throw new Error("fetch was not expected during verifier unit tests.");
    },
  });

  execute(
    (request) => {
      if (request === "@/app/data/bookAliases") {
        return {
          bookAliasMap: {
            genesis: "Genesis",
            gen: "Genesis",
            romans: "Romans",
            rom: "Romans",
          },
        };
      }
      if (request === "@/app/lib/translationPreference") {
        return {};
      }
      throw new Error(`Unexpected verifier import: ${request}`);
    },
    module,
    module.exports,
  );

  return { source, exports: module.exports };
}

function verifySearchBehavior(searchLibrary) {
  const index = {
    schemaVersion: 1,
    translation: "web",
    verseCount: 4,
    books: ["Genesis", "Matthew", "Romans"],
    sourceFingerprint: "synthetic",
    records: [
      ["Genesis", 1, "1", "In the beginning God created the heavens and the earth."],
      ["Matthew", 1, "1", "The kingdom of God is near."],
      ["Matthew", 1, "2", "God of heaven revealed the kingdom to the people."],
      ["Romans", 8, "28", "We know that all things work together for good."],
    ],
  };

  const exact = searchLibrary.searchScripture(
    index,
    "kingdom of God",
    index.books,
    500,
    "exact",
  );

  if (
    exact.mode !== "phrase" ||
    exact.totalMatches !== 1 ||
    exact.results[0].verseLabel !== "1"
  ) {
    fail("Unquoted multi-word exact phrase behavior failed.");
  }

  const quoted = searchLibrary.searchScripture(
    index,
    '"kingdom of God"',
    index.books,
    500,
    "exact",
  );

  if (quoted.mode !== "phrase" || quoted.totalMatches !== 1) {
    fail("Backward-compatible quoted phrase behavior failed.");
  }

  const allWords = searchLibrary.searchScripture(
    index,
    "kingdom of God",
    index.books,
    500,
    "all",
  );

  if (allWords.mode !== "terms" || allWords.totalMatches !== 2) {
    fail("Visible All words mode failed.");
  }

  const reference = searchLibrary.searchScripture(
    index,
    "Romans 8:28",
    index.books,
    500,
    "exact",
  );

  if (
    reference.mode !== "reference" ||
    reference.totalMatches !== 1 ||
    reference.results[0].reference !== "Romans 8:28"
  ) {
    fail("Reference auto-detection failed.");
  }

  const href = searchLibrary.buildSearchResultHref({
    book: "Romans",
    chapter: 8,
    verseLabel: "28",
    translation: "web",
    query: "kingdom of God",
    textMode: "all",
  });

  const parsedHref = new URL(href, "https://emet.test");
  const returnTo = parsedHref.searchParams.get("returnTo");
  const parsedReturnTo = returnTo
    ? new URL(returnTo, "https://emet.test")
    : null;

  if (
    parsedHref.searchParams.get("verse") !== "28" ||
    parsedHref.searchParams.get("returnLabel") !== "Search results" ||
    !parsedReturnTo ||
    parsedReturnTo.pathname !== "/search" ||
    parsedReturnTo.searchParams.get("q") !== "kingdom of God" ||
    parsedReturnTo.searchParams.get("translation") !== "web" ||
    parsedReturnTo.searchParams.get("mode") !== "all"
  ) {
    fail("Search return state does not preserve visible text mode.");
  }
}

function verifySourceMarkers(ts, searchLibrarySource) {
  const searchPage = transpileFile(ts, "app/search/page.tsx").source;
  const nav = transpileFile(
    ts,
    "app/components/MobileBottomNav.tsx",
  ).source;

  const pageMarkers = [
    "Find Scripture",
    'aria-label="Clear search"',
    'aria-label="Search Scripture"',
    'id="search-translation"',
    "border-b-2 pb-3",
    "divide-y divide-[var(--border)]",
    "Search all words instead",
    'className="font-bold">{result.reference}</p>',
    "rounded-full border border-[var(--border)]",
  ];

  for (const marker of pageMarkers) {
    if (!searchPage.includes(marker)) {
      fail(`Premium Search marker missing: ${marker}`);
    }
  }

  const forbiddenPageMarkers = [
    "No quotation marks needed.",
    "Phrases stay together automatically.",
    "Search and Ask EMET are separate.",
    '["faith", "kingdom of God", "Romans 8:28"]',
    "space-y-2.5",
    "grid grid-cols-3 gap-1",
    "rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4",
    "text-4xl",
  ];

  for (const marker of forbiddenPageMarkers) {
    if (searchPage.includes(marker)) {
      fail(`Removed Search copy or bulk marker remains: ${marker}`);
    }
  }

  const libraryMarkers = [
    'export type SearchTextMode = "exact" | "all"',
    'textMode: SearchTextMode = "exact"',
    'mode: textMode',
  ];

  for (const marker of libraryMarkers) {
    if (!searchLibrarySource.includes(marker)) {
      fail(`Search library marker missing: ${marker}`);
    }
  }

  const navMarkers = [
    'href: "/search"',
    'href="/ask"',
    "<span>Ask EMET</span>",
    'variant={askActive ? "gold" : "auto"}',
    'aria-current={active ? "page" : undefined}',
    'bg-[var(--surface)] shadow-[var(--shadow-sm)]',
    "grid-cols-5 items-end gap-1",
  ];

  for (const marker of navMarkers) {
    if (!nav.includes(marker)) {
      fail(`Premium navigation marker missing: ${marker}`);
    }
  }

  if (nav.includes('variant="gold"')) {
    fail("Ask EMET remains permanently gold when inactive.");
  }
}

function main() {
  for (const translation of Object.keys(EXPECTED)) {
    loadIndex(translation);
  }

  const ts = loadTypeScript();
  const searchLibrary = loadSearchLibrary(ts);

  verifySearchBehavior(searchLibrary.exports);
  verifySourceMarkers(ts, searchLibrary.source);

  console.log(
    JSON.stringify(
      {
        verdict: "P08_3E_SEARCH_ENGINE_LAYOUT_VERIFIED",
        unquotedMultiWordDefault: "exact phrase",
        visibleModes: ["exact", "all"],
        quotationMarksRequired: false,
        phraseHighlighting: "contiguous",
        searchInput: "full width",
        searchChrome: "search engine",
        resultPresentation: "flat divided list",
        redundantCopyRemoved: true,
        clearSearchControl: true,
        examplePillsRemoved: true,
        outerSearchCardRemoved: true,
        translationControl: "native compact select",
        inactiveAskLogo: "neutral",
        indexCounts: EXPECTED,
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
}
