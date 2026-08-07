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
  "app/lib/readerMemory.ts": "6476f9c9244d2f16423505dec5a4a2fdf9a2435d9a458fe6a2499db7364c1ab6",
  "app/components/VerseActionController.tsx": "70f023999b2d63e669e9332779d61a8855590366e7d94a703e422ebe49f9d1bf",
  "app/library/page.tsx": "18622fc682a1db6d5a1211d2a38c0427264ca030150219060211e58678b78f65",
  "app/page.tsx": "70b73c300aef12bbfffa12cc0f570ae0cd6d0a163033ec99be59e06957a311c4",
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

function runMemoryBehaviorTest(ts, sourceText) {
  const compiled = ts.transpileModule(sourceText, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
    },
    fileName: "readerMemory.ts",
  }).outputText;

  const storage = new Map();
  const events = [];
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
    window: {
      dispatchEvent(event) {
        events.push(event.type);
      },
    },
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
    console,
    Date,
    JSON,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
  };
  context.exports = context.module.exports;

  vm.runInNewContext(compiled, context, {
    filename: "readerMemory.compiled.cjs",
  });

  const api = context.module.exports;
  const createdAt = 1700000000000;
  storage.set(
    "scripture-search-reader-memory",
    JSON.stringify({
      bookmarks: [],
      highlights: [],
      notes: [
        {
          id: "note-legacy",
          verses: [
            {
              id: "Genesis.1.1",
              reference: "Genesis 1:1",
              book: "Genesis",
              chapter: 1,
              verse: 1,
              text: "In the beginning",
            },
          ],
          note: "Original note",
          savedAt: createdAt,
        },
      ],
    }),
  );

  const migrated = api.getReaderMemory();
  if (migrated.notes.length !== 1) fail("Legacy note migration lost the note.");
  if (migrated.notes[0].savedAt !== createdAt) {
    fail("Legacy note migration changed the created date.");
  }
  if (migrated.notes[0].updatedAt !== createdAt) {
    fail("Legacy note migration did not derive updatedAt from savedAt.");
  }

  const updated = api.updateNote("note-legacy", "Edited note");
  if (!updated) fail("updateNote did not return the edited note.");
  if (updated.savedAt !== createdAt) fail("updateNote changed the created date.");
  if (updated.note !== "Edited note") fail("updateNote did not save new text.");
  if (updated.updatedAt < createdAt) fail("updateNote wrote an invalid edited date.");

  if (!api.deleteNote("note-legacy")) fail("deleteNote did not report success.");
  if (api.getReaderMemory().notes.length !== 0) {
    fail("deleteNote did not remove the note.");
  }
  if (!events.includes("reader-memory-updated")) {
    fail("Reader-memory changes did not emit the synchronization event.");
  }

  return {
    legacyCreatedDatePreserved: true,
    legacyUpdatedDateMigrated: true,
    editSaved: true,
    deleteConfirmedByStore: true,
    synchronizationEventEmitted: true,
  };
}

const result = {
  phase: "P08.2A",
  verifiedAt: new Date().toISOString(),
  root,
  files: [],
  staticAssertions: [],
  memoryBehavior: null,
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

  const memoryText = requireText("app/lib/readerMemory.ts");
  assertIncludes(memoryText, "export function updateNote", "note update API");
  assertIncludes(memoryText, "export function deleteNote", "note delete API");
  assertIncludes(memoryText, "savedAt: existing.savedAt", "created-date preservation");
  assertIncludes(memoryText, "updatedAt: Date.now()", "last-edited timestamp");
  assertIncludes(memoryText, 'const KEY = "scripture-search-reader-memory"', "existing storage key reuse");

  const libraryText = requireText("app/library/page.tsx");
  assertIncludes(libraryText, 'role="dialog"', "full-screen note editor dialog");
  assertIncludes(libraryText, "Save changes", "note save action");
  assertIncludes(libraryText, "Delete note", "visible delete action");
  assertIncludes(libraryText, "Delete permanently", "delete confirmation action");
  assertIncludes(libraryText, "Created ", "created-date display");
  assertIncludes(libraryText, "Last edited", "last-edited display");

  const homeText = requireText("app/page.tsx");
  assertIncludes(
    homeText,
    "/library?tab=notes&note=",
    "home recent-note editor routing",
  );

  const controllerText = requireText(
    "app/components/VerseActionController.tsx",
  );
  assertIncludes(
    controllerText,
    "translation: activeTranslation",
    "translation capture for newly saved reader memory",
  );

  result.staticAssertions = [
    "existing reader-memory storage reused",
    "note cards open a full-screen editor",
    "edit saves without replacing savedAt",
    "delete requires explicit confirmation",
    "created and edited dates are displayed",
    "home recent notes open the editor",
    "new reader-memory verses capture translation",
  ];

  result.memoryBehavior = runMemoryBehaviorTest(ts, memoryText);
  result.verdict = "PASS";
} catch (error) {
  result.error = error instanceof Error ? error.stack || error.message : String(error);
}

if (reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

if (result.verdict !== "PASS") {
  console.error(result.error || "P08.2A verification failed.");
  process.exit(1);
}

console.log("P08.2A notes lifecycle verification passed.");
console.log(`Verified files: ${result.files.length}`);
console.log("Legacy created date preserved: yes");
console.log("Edit and delete behavior: yes");
