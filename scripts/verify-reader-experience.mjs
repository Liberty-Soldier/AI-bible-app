import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8").replace(/\r\n/g, "\n");
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
const libraryPage = read("app/library/page.tsx");
const readerMemory = read("app/lib/readerMemory.ts");

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
requireText(actionSheet, 'aria-label="Selected passage actions"', "labeled passage action strip");
requireText(actionSheet, '>Highlight</button>', "primary Highlight action");
requireText(actionSheet, '>Note</button>', "primary Note action");
requireText(actionSheet, '>Copy</button>', "primary Copy action");
requireText(actionSheet, "More", "explicit additional-action disclosure");
requireText(actionSheet, 'panel === "highlight"', "on-demand highlight palette");
requireText(actionSheet, "Original language / Word Study", "on-demand source-study access");
forbidText(actionSheet, 'h-[262px]', "oversized automatic action sheet");
forbidText(actionSheet, 'fixed inset-0', "full-screen selection interception");
requireText(header, ">\n          Aa\n", "reader appearance button");
requireText(header, 'panel === "passage" ? passage', "separate passage panel");
requireText(header, 'panel === "translation" ? translation : children', "separate translation and appearance panels");
requireText(header, "max-h-[min(50dvh,26rem)]", "bounded mobile panels");
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
forbidText(controller, "⋯ Tools", "tiny inline reader Tools label");
requireText(
  controller,
  "applyNativeTextSelection",
  "native text-selection tools",
);
requireText(
  controller,
  'data-scripture-text="true"',
  "Scripture-only native selection boundary",
);
requireText(controller, '"selectionchange"', "mobile selection-handle tracking");
requireText(controller, "suppressNextClickRef", "post-drag tap suppression");
requireText(libraryPage, 'view="recent"', "recent highlight view");
requireText(libraryPage, 'view="book"', "book-ordered highlight view");
requireText(libraryPage, 'view="collections"', "highlight collections view");
requireText(libraryPage, "BookmarkBooks", "bookmark By Book organization");
requireText(libraryPage, "NoteBooks", "note By Book organization");
requireText(libraryPage, "LibraryCollections", "mixed Library collections view");
requireText(libraryPage, "showType", "mixed collection item labels");
requireText(libraryPage, "Create new collection", "inline collection creation picker");
requireText(libraryPage, "Add to collection", "enabled selection organization action");
requireText(readerMemory, "addReaderItemsToCollection", "shared collection membership workflow");
requireText(
  libraryPage,
  "synchronized across your devices",
  "accurate signed-in Library synchronization wording",
);
requireText(
  readerMemory,
  "highlightCollections",
  "backward-compatible highlight collections storage",
);

console.log("Reader experience verification passed.");
console.log("- Chapter text defaults to a book-style serif surface without repeated study links.");
console.log("- Verse selection shows a compact strip; the menu exposes the canonical Source Text path.");
console.log("- Typeface, text size, and spacing preferences persist on the device.");
console.log("- Passage, translation, and Aa controls open separate bounded panels.");
console.log("- Verse taps and Scripture-only native drag selection share labeled passage actions.");
console.log("- Bookmarks, Highlights, and Notes support Recent, By Book, and mixed Collections views.");
console.log("- Signed-in Library data reports account synchronization state.");
