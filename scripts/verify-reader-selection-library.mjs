import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  },
};
globalThis.window = {
  dispatchEvent() {},
};

const {
  getPassageReference,
  joinSelectedScriptureText,
  pointerMoved,
  resolveIntersectingVerses,
  toggleSelectedVerse,
} = await import("../app/lib/readerSelection.ts");
const {
  addHighlightsToCollection,
  createHighlightCollection,
  getReaderMemory,
  highlightVerses,
} = await import("../app/lib/readerMemory.ts");
const {
  groupHighlightsByBook,
  groupRecentHighlights,
} = await import("../app/lib/highlightLibrary.ts");
const {
  canonicalBookOrder,
  getCanonicalBookIndex,
} = await import("../app/data/scripture/canonicalBookOrder.ts");

function verse(id, book, chapter, number, text, savedAt = 0) {
  return {
    id,
    reference: `${book} ${chapter}:${number}`,
    book,
    chapter,
    verse: number,
    text,
    translation: "web",
    savedAt,
  };
}

const verses = [
  verse("john-3-16", "John", 3, 16, "For God so loved the world"),
  verse("john-3-17", "John", 3, 17, "For God didn't send his Son"),
  verse("john-3-18", "John", 3, 18, "He who believes in him"),
];

assert.deepEqual(
  resolveIntersectingVerses(verses, ["john-3-18", "john-3-16"]).map((item) => item.id),
  ["john-3-16", "john-3-18"],
  "reverse-direction ranges resolve in Scripture order",
);
assert.equal(
  getPassageReference(verses),
  "John 3:16–18",
  "multi-verse selection produces an accurate range",
);
assert.equal(
  joinSelectedScriptureText([" loved the world ", "For God\n didn't send"]),
  "loved the world\nFor God didn't send",
  "partial and multi-verse text is normalized without interface labels",
);
assert.deepEqual(
  toggleSelectedVerse([verses[0]], verses[0]),
  [],
  "tapping a selected verse deselects it",
);
assert.equal(pointerMoved({ x: 10, y: 10 }, { x: 12, y: 14 }), false);
assert.equal(pointerMoved({ x: 10, y: 10 }, { x: 40, y: 40 }), true);

highlightVerses(verses.slice(0, 2), "yellow");
const collection = createHighlightCollection("Promises");
assert.ok(collection, "collection is created from the selection flow");
const firstAdd = addHighlightsToCollection(
  verses.slice(0, 2).map((item) => item.id),
  collection.id,
);
assert.deepEqual(firstAdd, { addedCount: 2, alreadyMemberCount: 0 });
const duplicateAdd = addHighlightsToCollection(
  verses.slice(0, 2).map((item) => item.id),
  collection.id,
);
assert.deepEqual(duplicateAdd, { addedCount: 0, alreadyMemberCount: 2 });
assert.ok(
  getReaderMemory().highlights.every(
    (item) => item.collectionIds.filter((id) => id === collection.id).length === 1,
  ),
  "duplicate collection membership is prevented",
);

assert.ok(
  getCanonicalBookIndex("1 Esdras") < getCanonicalBookIndex("Matthew"),
  "supported additional books have an established Scripture position",
);
for (const book of [
  "Esther Greek",
  "Daniel Greek",
  "Letter of Jeremiah",
  "Susanna",
  "Bel and the Dragon",
  "3 Maccabees",
  "4 Maccabees",
  "Prayer of Manasseh",
]) {
  assert.ok(canonicalBookOrder.includes(book), `${book} is included in Scripture order`);
}

const ordered = groupHighlightsByBook([
  { ...verse("matt-1-1", "Matthew", 1, 1, "The book"), color: "yellow", collectionIds: [], savedAt: 10 },
  { ...verse("esdras-1-1", "1 Esdras", 1, 1, "And Josias"), color: "yellow", collectionIds: [], savedAt: 20 },
  { ...verse("gen-2-2", "Genesis", 2, 2, "On the seventh day"), color: "yellow", collectionIds: [], savedAt: 30 },
]);
assert.deepEqual(ordered.map((group) => group.book), ["Genesis", "1 Esdras", "Matthew"]);

const recent = groupRecentHighlights([
  { ...verse("old", "Genesis", 1, 1, "In the beginning"), color: "yellow", collectionIds: [], savedAt: 1_000 },
  { ...verse("new", "John", 1, 1, "In the beginning"), color: "yellow", collectionIds: [], savedAt: 5_000 },
]);
assert.deepEqual(recent.map((group) => group.items[0].id), ["new", "old"]);

console.log("Reader selection and Library verification passed.");
console.log("- Tap, range, reverse-direction, and drag-threshold selection logic passed.");
console.log("- Collection creation, immediate add, and duplicate prevention passed.");
console.log("- Canonical/additional-book ordering and Recent save-date ordering passed.");

