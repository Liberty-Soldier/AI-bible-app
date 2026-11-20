import {
  createEmptyReaderMemory,
  normalizeReaderMemory,
  type ReaderBookmark,
  type ReaderHighlight,
  type ReaderHighlightCollection,
  type ReaderMemory,
  type ReaderNote,
} from "./readerMemory";

type LibraryItem =
  | ReaderBookmark
  | ReaderHighlight
  | ReaderHighlightCollection
  | ReaderNote;

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function changedAt(item: LibraryItem | undefined) {
  if (!item) return -1;
  if ("updatedAt" in item) return item.updatedAt;
  if ("savedAt" in item) return item.savedAt;
  return item.createdAt;
}

function mergeMembershipConflict<T extends ReaderBookmark | ReaderHighlight | ReaderNote>(
  local: T,
  remote: T,
) {
  const preferred = changedAt(remote) > changedAt(local) ? remote : local;
  return {
    ...preferred,
    collectionIds: Array.from(
      new Set([...local.collectionIds, ...remote.collectionIds]),
    ),
  };
}

function mergeItems<T extends LibraryItem>(
  baseItems: readonly T[],
  localItems: readonly T[],
  remoteItems: readonly T[],
  resolveConflict?: (local: T, remote: T) => T,
) {
  const base = new Map(baseItems.map((item) => [item.id, item]));
  const local = new Map(localItems.map((item) => [item.id, item]));
  const remote = new Map(remoteItems.map((item) => [item.id, item]));
  const ids = Array.from(
    new Set([
      ...localItems.map((item) => item.id),
      ...remoteItems.map((item) => item.id),
      ...baseItems.map((item) => item.id),
    ]),
  );

  return ids.flatMap((id) => {
    const before = base.get(id);
    const here = local.get(id);
    const there = remote.get(id);

    if (same(here, there)) return here ? [here] : [];
    if (same(here, before)) return there ? [there] : [];
    if (same(there, before)) return here ? [here] : [];

    // A concurrent edit wins over a deletion so user-authored content is not
    // silently lost. A later sync can still delete it intentionally.
    if (!here) return there ? [there] : [];
    if (!there) return [here];
    if (resolveConflict) return [resolveConflict(here, there)];

    return [changedAt(there) > changedAt(here) ? there : here];
  });
}

export function mergeReaderLibraries(
  baseValue: unknown,
  localValue: unknown,
  remoteValue: unknown,
): ReaderMemory {
  const base = normalizeReaderMemory(baseValue || createEmptyReaderMemory());
  const local = normalizeReaderMemory(localValue);
  const remote = normalizeReaderMemory(remoteValue);

  return {
    bookmarks: mergeItems(
      base.bookmarks,
      local.bookmarks,
      remote.bookmarks,
      mergeMembershipConflict,
    ),
    highlights: mergeItems(
      base.highlights,
      local.highlights,
      remote.highlights,
      mergeMembershipConflict,
    ),
    notes: mergeItems(
      base.notes,
      local.notes,
      remote.notes,
      mergeMembershipConflict,
    ),
    highlightCollections: mergeItems(
      base.highlightCollections,
      local.highlightCollections,
      remote.highlightCollections,
    ),
  };
}

export function readerLibrariesEqual(left: unknown, right: unknown) {
  return same(normalizeReaderMemory(left), normalizeReaderMemory(right));
}

export function isReaderLibraryWithinLimits(memory: ReaderMemory) {
  if (
    memory.bookmarks.length > 10_000 ||
    memory.highlights.length > 10_000 ||
    memory.notes.length > 5_000 ||
    memory.highlightCollections.length > 1_000
  ) {
    return false;
  }

  const verses = [
    ...memory.bookmarks,
    ...memory.highlights,
    ...memory.notes.flatMap((note) => note.verses),
  ];

  return (
    verses.every(
      (verse) =>
        verse.id.length <= 300 &&
        verse.reference.length <= 300 &&
        verse.book.length <= 120 &&
        verse.text.length <= 20_000,
    ) &&
    memory.notes.every(
      (note) => note.id.length <= 300 && note.note.length <= 50_000,
    ) &&
    memory.highlightCollections.every(
      (collection) =>
        collection.id.length <= 300 && collection.name.length <= 120,
    )
  );
}
