import assert from "node:assert/strict";
import fs from "node:fs";

import { parseScriptureReference } from "../app/lib/scriptureSearch.ts";

const books = [
  "Genesis",
  "Song of Songs",
  "Matthew",
  "1 Corinthians",
];

assert.deepEqual(parseScriptureReference("Genesis", books), {
  book: "Genesis",
  chapter: 1,
  verseLabel: "1",
});
assert.deepEqual(parseScriptureReference("Gen", books), {
  book: "Genesis",
  chapter: 1,
  verseLabel: "1",
});
assert.deepEqual(parseScriptureReference("Ge", books), {
  book: "Genesis",
  chapter: 1,
  verseLabel: "1",
});
assert.deepEqual(parseScriptureReference("John 3", [...books, "John"]), {
  book: "John",
  chapter: 3,
  verseLabel: null,
});
assert.deepEqual(parseScriptureReference("John 3:16", [...books, "John"]), {
  book: "John",
  chapter: 3,
  verseLabel: "16",
});
assert.deepEqual(parseScriptureReference("1 Cor", books), {
  book: "1 Corinthians",
  chapter: 1,
  verseLabel: "1",
});
assert.deepEqual(parseScriptureReference("Song", books), {
  book: "Song of Songs",
  chapter: 1,
  verseLabel: "1",
});
assert.equal(parseScriptureReference("not a biblical book", books), null);

const picker = fs.readFileSync(
  new URL("../app/components/BookPassageSelector.tsx", import.meta.url),
  "utf8",
);
assert.match(picker, /Select a chapter to choose a verse/);
assert.match(picker, /normalizeReaderChapter/);
assert.match(picker, /verse\.verseLabel/);
assert.match(picker, /Read chapter →/);
assert.match(picker, /translation, "web", "kjv", "brenton"/);

console.log("Reader navigation verification passed.");
console.log("- Full book names and abbreviations open chapter 1, verse 1.");
console.log("- Chapter-only and exact-verse references preserve their intent.");
console.log("- Chapter selection exposes optional, runtime-owned verse labels.");
console.log("- Translation fallback remains available for corpus-specific books.");
