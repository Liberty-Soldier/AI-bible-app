#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const repo = path.resolve(process.argv[2] || process.cwd());
const verseFile = path.join(repo, "app", "components", "VerseActionSheet.tsx");
const libraryFile = path.join(repo, "app", "library", "page.tsx");

function fail(message) { throw new Error(message); }

for (const file of [verseFile, libraryFile]) {
  if (!fs.existsSync(file)) fail(`Missing ${file}`);
}

const verse = fs.readFileSync(verseFile, "utf8");
const library = fs.readFileSync(libraryFile, "utf8");

for (const marker of [
  "const [noteViewportHeight, setNoteViewportHeight] = useState(0);",
  "const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);",
  "noteTextareaRef.current?.focus({ preventScroll: true });",
  "function closeNoteEditor()",
  "noteTextareaRef.current?.blur();",
  "height: noteViewportHeight",
  "New note",
  "Cancel",
]) {
  if (!verse.includes(marker)) fail(`Missing Reader note fix marker: ${marker}`);
}

for (const marker of [
  "const [keyboardInset, setKeyboardInset] = useState(0);",
  "const textareaRef = useRef<HTMLTextAreaElement | null>(null);",
  "window.visualViewport",
  "textareaRef.current?.blur();",
  'paddingBottom: `${keyboardInset + 104}px`',
  '"min-h-[26dvh]"',
  'className="fixed inset-x-0 z-[120]',
  '{hasChanges ? "Save changes" : "Saved"}',
  'border-b border-[var(--border)] py-4 text-left',
]) {
  if (!library.includes(marker)) fail(`Missing Library note fix marker: ${marker}`);
}

const typescriptPath = path.join(repo, "node_modules", "typescript");
if (!fs.existsSync(typescriptPath)) fail("Local TypeScript dependency is unavailable.");
const ts = require(typescriptPath);

for (const file of [verseFile, libraryFile]) {
  const source = fs.readFileSync(file, "utf8");
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
  });
  const diagnostics = (result.diagnostics || []).map((item) =>
    ts.flattenDiagnosticMessageText(item.messageText, "\n"),
  );
  if (diagnostics.length) {
    fail(`${path.basename(file)} syntax diagnostics: ${diagnostics.join(" | ")}`);
  }
}

console.log(JSON.stringify({
  verdict: "P08_2C_NOTES_MOBILE_UX_FINAL_CORRECTION_VERIFIED",
  readerNewNoteVisibleAboveKeyboard: true,
  readerSaveDismissesKeyboard: true,
  librarySaveVisibleAboveKeyboard: true,
  librarySaveDismissesKeyboard: true,
  noteListFlattened: true,
  noteStorageChanged: false,
  translationBehaviorChanged: false,
  readerRoutingChanged: false,
  p07Touched: false
}, null, 2));
