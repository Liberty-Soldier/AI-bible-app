const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const root = path.resolve(process.argv[2] || process.cwd());
const reportArgIndex = process.argv.indexOf("--report");
const reportPath =
  reportArgIndex >= 0 && process.argv[reportArgIndex + 1]
    ? path.resolve(process.argv[reportArgIndex + 1])
    : null;

const expectedHashes = {
  "app/lib/translationPreference.ts": "7dd094282d42be1356fba5b3ed9677675675e0dc905e4ab64ca3c91c7291da1b",
  "app/read/page.tsx": "e05b9e1c40079079ae92f6f612d41fed38b15622ff9adb38912f32a2427224fe",
  "app/components/ReaderSelector.tsx": "166160b9f9f05820140ba3b282d76e0aa93e1c393b21448e625c768e23143c6e",
  "app/library/page.tsx": "abf11a4b321db36511cc095efef4e3bc3afbc27c0c354bd2e4a253b132ab2219",
  "app/page.tsx": "122c95e7c718b77affe3cea628333afb212be072ac399999ba68fc51d8b0fa3a",
};

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function fail(message) {
  throw new Error(message);
}

function requireText(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) fail(`Missing required file: ${relative}`);
  return fs.readFileSync(file, "utf8");
}

function assertIncludes(text, value, label) {
  if (!text.includes(value)) fail(`Missing ${label}: ${value}`);
}

function assertExcludes(text, value, label) {
  if (text.includes(value)) fail(`Unexpected ${label}: ${value}`);
}

function count(text, value) {
  return text.split(value).length - 1;
}

function loadTypeScript() {
  try {
    return require(path.join(root, "node_modules", "typescript"));
  } catch {
    try {
      return require("typescript");
    } catch {
      fail("TypeScript is not available for isolated syntax verification.");
    }
  }
}

function verifySyntax(ts, relative, text) {
  const result = ts.transpileModule(text, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
    },
    fileName: relative,
    reportDiagnostics: true,
  });

  const errors = (result.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );

  if (errors.length) {
    const details = errors
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      )
      .join("\n");
    fail(`${relative} failed isolated TypeScript syntax verification:\n${details}`);
  }
}

function runPreferenceBehaviorTest(ts, sourceText) {
  const compiled = ts.transpileModule(sourceText, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
    },
    fileName: "translationPreference.ts",
  }).outputText;

  const storage = new Map();
  const localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
  };

  const context = {
    module: { exports: {} },
    exports: {},
    localStorage,
    window: {},
    URLSearchParams,
    encodeURIComponent,
    String,
    Object,
    console,
  };
  context.exports = context.module.exports;

  vm.runInNewContext(compiled, context, {
    filename: "translationPreference.compiled.cjs",
  });

  const api = context.module.exports;

  if (api.getPreferredTranslation() !== "web") {
    fail("First-use translation did not default to WEB.");
  }
  if (storage.get("preferredTranslation") !== "web") {
    fail("First-use WEB default was not migrated into preferredTranslation.");
  }

  if (api.setPreferredTranslation("kjv") !== "kjv") {
    fail("KJV preference was not accepted.");
  }
  if (storage.get("preferredTranslation") !== "kjv") {
    fail("KJV preference was not persisted.");
  }

  const savedBrentonHref = api.buildReaderHref({
    book: "Psalms",
    chapter: 1,
    verse: "2",
    translation: "brenton",
  });
  if (
    savedBrentonHref !==
    "/read/Psalms/1?translation=brenton&verse=2"
  ) {
    fail(`Saved Brenton reader link was incorrect: ${savedBrentonHref}`);
  }

  const activeFallbackHref = api.buildReaderHref({
    book: "Genesis",
    chapter: 1,
    verse: "1",
  });
  if (
    activeFallbackHref !==
    "/read/Genesis/1?translation=kjv&verse=1"
  ) {
    fail(`Legacy saved-item fallback did not use active KJV: ${activeFallbackHref}`);
  }

  storage.set("preferredTranslation", "invalid");
  if (api.getPreferredTranslation() !== "web") {
    fail("Invalid stored translation did not migrate to WEB.");
  }
  if (storage.get("preferredTranslation") !== "web") {
    fail("Invalid stored translation was not rewritten as WEB.");
  }

  return {
    firstUseDefaultWeb: true,
    existingKeyPreserved: true,
    inReaderPreferencePersistence: true,
    savedTranslationLinkPreserved: true,
    legacyItemUsesActivePreference: true,
    invalidValueMigratesToWeb: true,
  };
}

const result = {
  phase: "P08.2B",
  verifiedAt: new Date().toISOString(),
  root,
  files: [],
  staticAssertions: [],
  preferenceBehavior: null,
  verdict: "FAIL",
};

try {
  const ts = loadTypeScript();

  for (const [relative, expected] of Object.entries(expectedHashes)) {
    const file = path.join(root, relative);
    const actual = sha256(file);
    if (actual !== expected) {
      fail(`${relative} post-install hash mismatch. Expected ${expected}, found ${actual}`);
    }

    const text = requireText(relative);
    verifySyntax(ts, relative, text);
    result.files.push({ relative, sha256: actual, syntax: "pass" });
  }

  const preferenceText = requireText("app/lib/translationPreference.ts");
  assertIncludes(
    preferenceText,
    'export const DEFAULT_TRANSLATION: TranslationPreference = "web"',
    "WEB default",
  );
  assertIncludes(
    preferenceText,
    'export const PREFERRED_TRANSLATION_KEY = "preferredTranslation"',
    "existing storage key",
  );
  assertIncludes(
    preferenceText,
    "export function buildReaderHref",
    "shared reader-link builder",
  );

  const readText = requireText("app/read/page.tsx");
  assertIncludes(readText, "getPreferredTranslation()", "Read preference load");
  assertIncludes(
    readText,
    "setPreferredTranslation(value)",
    "Read preference save",
  );
  assertExcludes(
    readText,
    'localStorage.getItem("preferredTranslation")',
    "duplicate direct preference read",
  );
  assertExcludes(
    readText,
    'localStorage.setItem("preferredTranslation"',
    "duplicate direct preference write",
  );

  const selectorText = requireText("app/components/ReaderSelector.tsx");
  assertIncludes(
    selectorText,
    "setPreferredTranslation(translation)",
    "in-reader preference update",
  );
  assertIncludes(
    selectorText,
    "translation=${preferredTranslation}",
    "in-reader resolved translation route",
  );

  const libraryText = requireText("app/library/page.tsx");
  if (count(libraryText, "buildReaderHref({") < 3) {
    fail("Library does not use the shared reader-link builder for notes, bookmarks, and highlights.");
  }
  assertIncludes(
    libraryText,
    "translation: item.translation",
    "Library saved-item translation",
  );

  const homeText = requireText("app/page.tsx");
  assertIncludes(
    homeText,
    "translation: bookmark.translation",
    "Home recent-bookmark translation",
  );

  result.staticAssertions = [
    "WEB remains the only first-use fallback",
    "preferredTranslation remains the authoritative key",
    "Read entry uses the shared preference utility",
    "in-reader translation changes persist globally",
    "Library bookmarks and highlights carry saved translation",
    "note Scripture links use the same safe link builder",
    "Home recent bookmarks carry saved translation",
    "legacy saved items use the active preference",
  ];

  result.preferenceBehavior = runPreferenceBehaviorTest(ts, preferenceText);
  result.verdict = "PASS";
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
}

if (reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

if (result.verdict !== "PASS") {
  console.error(result.error || "P08.2B verification failed.");
  process.exit(1);
}

console.log("P08.2B translation persistence verification passed.");
console.log(`Verified files: ${result.files.length}`);
console.log("Default translation: WEB");
console.log("Saved-item translation links: preserved");
