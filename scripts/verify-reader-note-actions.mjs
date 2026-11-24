import assert from "node:assert/strict";
import fs from "node:fs";

const store = new Map();
let rejectWrites = false;
globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    if (rejectWrites) throw new Error("Storage unavailable");
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
};
globalThis.window = { dispatchEvent() {} };

const {
  addReaderItemsToCollection,
  createReaderCollection,
  getNotesForSelectedVerses,
  getReaderMemory,
  saveNote,
  saveReaderNoteDraft,
} = await import("../app/lib/readerMemory.ts");

const verse = (id, number) => ({
  id,
  reference: `John 3:${number}`,
  book: "John",
  chapter: 3,
  verse: number,
  text: `Verse ${number}`,
  translation: "web",
});

const verses = [verse("john-3-16", 16), verse("john-3-17", 17)];
const original = saveNote(verses, "Original range note");
const collection = createReaderCollection("Study notes");
assert.ok(collection);
addReaderItemsToCollection("note", [original.id], collection.id);
const edited = saveReaderNoteDraft({
  noteId: original.id,
  verses: [verses[0]],
  noteText: "Expanded existing note",
});
const afterEdit = getReaderMemory();

assert.equal(edited.created, false);
assert.equal(edited.note.id, original.id, "editing preserves the note ID");
assert.equal(afterEdit.notes.length, 1, "editing does not create a duplicate note");
assert.equal(afterEdit.notes[0].savedAt, original.savedAt);
assert.deepEqual(afterEdit.notes[0].collectionIds, [collection.id]);
assert.equal(afterEdit.notes[0].note, "Expanded existing note");
assert.deepEqual(
  afterEdit.notes[0].verses.map((item) => item.id),
  verses.map((item) => item.id),
  "editing preserves the original verse range",
);

const second = saveNote([verses[0]], "Second note on the same verse");
assert.deepEqual(
  getNotesForSelectedVerses(getReaderMemory().notes, [verses[0]]).map(
    (note) => note.id,
  ),
  [second.id, original.id],
  "multiple notes intersecting the selected verse remain available to the chooser",
);
assert.deepEqual(
  getNotesForSelectedVerses(getReaderMemory().notes, [verses[1]]).map(
    (note) => note.id,
  ),
  [original.id],
  "a saved verse-range note is editable from every associated verse",
);

const created = saveReaderNoteDraft({
  verses: [verses[0]],
  noteText: "Intentional new note",
});
assert.equal(created.created, true);
assert.equal(getReaderMemory().notes.length, 3, "New note remains an explicit create path");
assert.equal(new Set(getReaderMemory().notes.map((note) => note.id)).size, 3);
assert.deepEqual(getNotesForSelectedVerses(getReaderMemory().notes, [verse("other", 18)]), []);

const beforeFailure = getReaderMemory();
assert.throws(
  () => saveReaderNoteDraft({ noteId: "missing", verses, noteText: "Draft" }),
  /could not be found/,
);
rejectWrites = true;
assert.throws(
  () => saveReaderNoteDraft({ noteId: original.id, verses, noteText: "Unsaved draft" }),
  /Storage unavailable/,
);
rejectWrites = false;
assert.deepEqual(getReaderMemory(), beforeFailure, "failed saves leave stored notes unchanged");

const sheet = fs.readFileSync(
  new URL("../app/components/VerseActionSheet.tsx", import.meta.url),
  "utf8",
);
for (const [needle, label] of [
  ["window.visualViewport", "Visual Viewport keyboard handling"],
  ['viewport.removeEventListener("resize", updateKeyboardInset)', "viewport resize cleanup"],
  ['viewport.removeEventListener("scroll", updateKeyboardInset)', "viewport scroll cleanup"],
  ["sticky bottom-0", "sticky mobile save controls"],
  ["safe-area-inset-bottom", "safe-area padding"],
  ["savingNoteRef.current", "duplicate-submit guard"],
  ['role="alert"', "save failure feedback"],
  ["Your changes are still here", "unsaved-edit preservation message"],
  ['panel === "note-choice"', "multiple-note chooser"],
  ["Save changes", "existing-note edit action"],
  ["New note", "explicit new-note action"],
]) {
  assert.ok(sheet.includes(needle), `Missing ${label}`);
}

console.log("Reader note action verification passed.");
console.log("- Existing-note edits preserve IDs, associations, and note count.");
console.log("- Multiple notes resolve to a chooser while New note stays explicit.");
console.log("- Keyboard-aware sticky Save, failure feedback, and submit guard are present.");
