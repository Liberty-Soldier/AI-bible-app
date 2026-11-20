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
  addReaderItemsToCollection,
  addHighlightsToCollection,
  createHighlightCollection,
  deleteReaderCollection,
  getReaderMemory,
  highlightVerses,
  saveNote,
  toggleBookmarks,
} = await import("../app/lib/readerMemory.ts");
const {
  groupHighlightsByBook,
  groupRecentHighlights,
} = await import("../app/lib/highlightLibrary.ts");
const {
  groupBookmarksByBook,
  groupNotesByBook,
  sortRecentBookmarks,
  sortRecentNotes,
} = await import("../app/lib/readerLibraryOrganization.ts");
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

toggleBookmarks([verses[2]]);
const note = saveNote(verses.slice(0, 2), "A note spanning two verses");
const bookmarkAdd = addReaderItemsToCollection("bookmark", [verses[2].id], collection.id);
const noteAdd = addReaderItemsToCollection("note", [note.id], collection.id);
assert.deepEqual(bookmarkAdd, { addedCount: 1, alreadyMemberCount: 0 });
assert.deepEqual(noteAdd, { addedCount: 1, alreadyMemberCount: 0 });
assert.deepEqual(
  addReaderItemsToCollection("note", [note.id], collection.id),
  { addedCount: 0, alreadyMemberCount: 1 },
  "duplicate note membership is prevented",
);
const mixedMemory = getReaderMemory();
assert.ok(mixedMemory.bookmarks[0].collectionIds.includes(collection.id));
assert.ok(mixedMemory.highlights.every((item) => item.collectionIds.includes(collection.id)));
assert.ok(mixedMemory.notes[0].collectionIds.includes(collection.id));
assert.equal(deleteReaderCollection(collection.id), true);
const afterCollectionDelete = getReaderMemory();
assert.equal(afterCollectionDelete.highlightCollections.length, 0);
assert.ok(afterCollectionDelete.bookmarks.length && afterCollectionDelete.highlights.length && afterCollectionDelete.notes.length, "deleting a collection preserves its saved items");
assert.ok(
  [...afterCollectionDelete.bookmarks, ...afterCollectionDelete.highlights, ...afterCollectionDelete.notes]
    .every((item) => !item.collectionIds.includes(collection.id)),
  "deleting a collection removes membership from every item type",
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

const bookmarkItems = [
  { ...verse("matt-bookmark", "Matthew", 2, 1, "Matthew"), savedAt: 10, collectionIds: [] },
  { ...verse("gen-bookmark", "Genesis", 2, 2, "Genesis"), savedAt: 30, collectionIds: [] },
];
assert.deepEqual(sortRecentBookmarks(bookmarkItems).map((item) => item.id), ["gen-bookmark", "matt-bookmark"]);
assert.deepEqual(groupBookmarksByBook(bookmarkItems).map((section) => section.book), ["Genesis", "Matthew"]);

const noteItems = [
  { id: "matt-note", verses: [verse("matt-note-verse", "Matthew", 4, 2, "Matthew")], note: "Later book", savedAt: 40, updatedAt: 80, collectionIds: [] },
  { id: "gen-note", verses: [verse("gen-note-verse", "Genesis", 1, 3, "Genesis")], note: "Earlier book", savedAt: 60, updatedAt: 60, collectionIds: [] },
];
assert.deepEqual(sortRecentNotes(noteItems).map((item) => item.id), ["gen-note", "matt-note"], "notes sort by creation date, not edited date");
assert.deepEqual(groupNotesByBook(noteItems).map((section) => section.book), ["Genesis", "Matthew"]);

console.log("Reader selection and Library verification passed.");
console.log("- Tap, range, reverse-direction, and drag-threshold selection logic passed.");
console.log("- Collection creation, immediate add, and duplicate prevention passed.");
console.log("- Canonical/additional-book ordering and Recent save-date ordering passed.");
console.log("- Mixed bookmark, highlight, and note collection membership passed.");
console.log("- Bookmark and note Recent/By Book organization passed.");
