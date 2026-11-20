import assert from "node:assert/strict";
import fs from "node:fs";

import {
  activateReaderMemoryOwner,
  createEmptyReaderMemory,
  getReaderMemory,
  saveReaderMemory,
} from "../app/lib/readerMemory.ts";
import { mergeReaderLibraries } from "../app/lib/readerLibraryMerge.ts";

function verse(id, savedAt = 1) {
  return {
    id,
    reference: `John 3:${id}`,
    book: "John",
    chapter: 3,
    verse: Number(id),
    text: `Verse ${id}`,
    translation: "web",
    savedAt,
  };
}

const empty = createEmptyReaderMemory();
const localBookmark = verse("1", 10);
const remoteBookmark = verse("2", 20);
let merged = mergeReaderLibraries(
  empty,
  { ...empty, bookmarks: [localBookmark] },
  { ...empty, bookmarks: [remoteBookmark] },
);
assert.deepEqual(
  merged.bookmarks.map((item) => item.id).sort(),
  ["1", "2"],
  "first sign-in preserves and combines local and cloud bookmarks",
);

merged = mergeReaderLibraries(
  { ...empty, bookmarks: [localBookmark] },
  empty,
  { ...empty, bookmarks: [localBookmark] },
);
assert.equal(
  merged.bookmarks.length,
  0,
  "a local deletion propagates when the cloud item was unchanged",
);

const editedRemote = { ...localBookmark, text: "Remote edit", savedAt: 30 };
merged = mergeReaderLibraries(
  { ...empty, bookmarks: [localBookmark] },
  empty,
  { ...empty, bookmarks: [editedRemote] },
);
assert.equal(
  merged.bookmarks[0]?.text,
  "Remote edit",
  "a concurrent edit is preserved instead of being silently deleted",
);

const baseHighlight = {
  ...verse("3", 30),
  color: "yellow",
  collectionIds: [],
};
merged = mergeReaderLibraries(
  { ...empty, highlights: [baseHighlight] },
  {
    ...empty,
    highlights: [{ ...baseHighlight, color: "blue", collectionIds: ["a"] }],
  },
  {
    ...empty,
    highlights: [{ ...baseHighlight, color: "pink", collectionIds: ["b"] }],
  },
);
assert.deepEqual(
  merged.highlights[0]?.collectionIds.sort(),
  ["a", "b"],
  "concurrent collection membership is deduplicated and preserved",
);

const baseBookmarkMembership = { ...localBookmark, collectionIds: [] };
merged = mergeReaderLibraries(
  { ...empty, bookmarks: [baseBookmarkMembership] },
  { ...empty, bookmarks: [{ ...baseBookmarkMembership, collectionIds: ["a"] }] },
  { ...empty, bookmarks: [{ ...baseBookmarkMembership, collectionIds: ["b"] }] },
);
assert.deepEqual(merged.bookmarks[0]?.collectionIds.sort(), ["a", "b"], "bookmark collection memberships merge across devices");

const baseNote = {
  id: "note-1",
  verses: [localBookmark],
  note: "Study note",
  savedAt: 10,
  updatedAt: 10,
  collectionIds: [],
};
merged = mergeReaderLibraries(
  { ...empty, notes: [baseNote] },
  { ...empty, notes: [{ ...baseNote, collectionIds: ["a"] }] },
  { ...empty, notes: [{ ...baseNote, collectionIds: ["b"] }] },
);
assert.deepEqual(merged.notes[0]?.collectionIds.sort(), ["a", "b"], "note collection memberships merge across devices");

const values = new Map();
globalThis.localStorage = {
  getItem(key) {
    return values.get(key) ?? null;
  },
  setItem(key, value) {
    values.set(key, String(value));
  },
  removeItem(key) {
    values.delete(key);
  },
};
globalThis.window = { dispatchEvent() {} };
values.set(
  "scripture-search-reader-memory",
  JSON.stringify({ ...empty, bookmarks: [localBookmark] }),
);

activateReaderMemoryOwner("account-a");
assert.equal(getReaderMemory().bookmarks.length, 1, "the first account claims legacy device data");
saveReaderMemory({ ...getReaderMemory(), bookmarks: [localBookmark, remoteBookmark] });
activateReaderMemoryOwner(null);
activateReaderMemoryOwner("account-b");
assert.equal(getReaderMemory().bookmarks.length, 0, "a second account cannot inherit the first account's device data");
activateReaderMemoryOwner("account-a");
assert.equal(getReaderMemory().bookmarks.length, 2, "account-scoped local data remains intact");

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20261119210000_reader_library_sync.sql", import.meta.url),
  "utf8",
);
for (const required of [
  "enable row level security",
  "revoke all on table public.reader_libraries from anon, authenticated",
  "grant select, insert, update",
  "(select auth.uid()) = user_id",
]) {
  assert.ok(migration.includes(required), `migration includes ${required}`);
}
assert.ok(!migration.includes("security definer"), "migration does not bypass RLS");

const route = fs.readFileSync(
  new URL("../app/api/library/route.ts", import.meta.url),
  "utf8",
);
assert.ok(route.includes("getVerifiedSupabaseUserId"), "API verifies the signed-in user");
assert.ok(route.includes("sameOrigin(request)"), "writes reject cross-origin requests");
assert.ok(route.includes('.eq("revision", revision)'), "writes use optimistic concurrency");

console.log("Reader Library synchronization verification passed.");
console.log("- First sign-in merges local and cloud data without duplicate membership.");
console.log("- Three-way merge preserves deletions and concurrent edits.");
console.log("- Local caches are account-scoped and the Supabase table is protected by RLS.");
