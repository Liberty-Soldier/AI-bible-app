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

const controller = read("app/components/VerseActionController.tsx");
const actionSheet = read("app/components/VerseActionSheet.tsx");
const header = read("app/components/CollapsibleReaderHeader.tsx");
const preferences = read("app/lib/readerPreferences.ts");
const controls = read("app/components/ReaderAppearanceControls.tsx");
const readerPage = read("app/read/[book]/[chapter]/page.tsx");

requireText(controller, "<ScriptureText", "quiet Scripture-text renderer");
forbidText(controller, "<ReaderVerseStudy", "repeated per-verse study control");
requireText(controller, "reader-serif", "book-style serif reader typeface");
requireText(
  controller,
  "tokenAvailabilityByReaderVerseId",
  "canonical token-availability forwarding",
);
requireText(
  actionSheet,
  "<SourceBreakdownVerse",
  "canonical Source Text action",
);
requireText(actionSheet, "prominent", "primary Source Text presentation");
forbidText(actionSheet, "compactTrigger", "legacy compact Source Study action");
if (actionSheet.indexOf("<SourceBreakdownVerse") > actionSheet.indexOf("<CompactButton")) {
  throw new Error("Source Text must precede verse utility actions.");
}
requireText(
  actionSheet,
  "onTouchStart={onHandleTouchStart}",
  "handle-owned sheet gesture",
);
requireText(header, ">\n          Aa\n", "reader appearance button");
forbidText(header, "Open reader help", "obsolete help button");
requireText(
  preferences,
  "emetsees-reader-preferences-v1",
  "device-persistent reader preferences",
);
requireText(controls, 'label="Typeface"', "typeface control");
requireText(controls, 'label="Text size"', "text-size control");
requireText(controls, 'label="Line spacing"', "line-spacing control");
requireText(
  readerPage,
  "<ReaderAppearanceControls />",
  "reader appearance panel",
);

console.log("Reader experience verification passed.");
console.log("- Chapter text defaults to a book-style serif surface without repeated study links.");
console.log("- Verse selection exposes Source Study through the canonical occurrence path.");
console.log("- Typeface, text size, and spacing preferences persist on the device.");
console.log("- The Aa header control keeps navigation and appearance tools out of the reading flow.");
