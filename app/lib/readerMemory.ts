export type ReaderTranslation = "web" | "kjv" | "brenton";

export type ReaderMemoryVerse = {
  id: string;
  reference: string;
  book: string;
  chapter: number;
  verse: number;
  verseLabel?: string;
  text: string;
  translation?: ReaderTranslation;
};

export type ReaderBookmark = ReaderMemoryVerse & {
  savedAt: number;
  collectionIds: string[];
};

export type ReaderHighlight = ReaderMemoryVerse & {
  color: "yellow" | "green" | "blue" | "pink" | "purple";
  savedAt: number;
  collectionIds: string[];
};

export type ReaderHighlightCollection = {
  id: string;
  name: string;
  createdAt: number;
};

export type ReaderNote = {
  id: string;
  verses: ReaderMemoryVerse[];
  note: string;
  savedAt: number;
  updatedAt: number;
  collectionIds: string[];
};

export type ReaderCollectionItemType = "bookmark" | "highlight" | "note";

export type ReaderMemory = {
  bookmarks: ReaderBookmark[];
  highlights: ReaderHighlight[];
  notes: ReaderNote[];
  highlightCollections: ReaderHighlightCollection[];
};

const KEY = "scripture-search-reader-memory";
const ACTIVE_OWNER_KEY = "scripture-search-reader-memory-owner";
const LEGACY_CLAIMED_KEY = "scripture-search-reader-memory-claimed-by";

const defaultMemory: ReaderMemory = {
  bookmarks: [],
  highlights: [],
  notes: [],
  highlightCollections: [],
};

export function createEmptyReaderMemory(): ReaderMemory {
  return {
    bookmarks: [],
    highlights: [],
    notes: [],
    highlightCollections: [],
  };
}

export function getReaderMemoryVerseLabel(
  verse: Pick<ReaderMemoryVerse, "verse" | "verseLabel">,
) {
  return verse.verseLabel || String(verse.verse);
}

export function isReaderTranslation(
  value: unknown,
): value is ReaderTranslation {
  return value === "web" || value === "kjv" || value === "brenton";
}

function isBrowser() {
  return typeof window !== "undefined";
}

function toFiniteNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeVerse(value: unknown): ReaderMemoryVerse | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<ReaderMemoryVerse>;
  const id = String(candidate.id || "").trim();
  const reference = String(candidate.reference || "").trim();
  const book = String(candidate.book || "").trim();
  const chapter = toFiniteNumber(candidate.chapter, 0);
  const verse = toFiniteNumber(candidate.verse, 0);
  const text = String(candidate.text || "");

  if (!id || !reference || !book || chapter < 1 || verse < 0) {
    return null;
  }

  return {
    id,
    reference,
    book,
    chapter,
    verse,
    verseLabel: candidate.verseLabel
      ? String(candidate.verseLabel)
      : undefined,
    text,
    translation: isReaderTranslation(candidate.translation)
      ? candidate.translation
      : undefined,
  };
}

function normalizeBookmark(value: unknown): ReaderBookmark | null {
  const verse = normalizeVerse(value);
  if (!verse || !value || typeof value !== "object") return null;

  const candidate = value as Partial<ReaderBookmark>;

  return {
    ...verse,
    savedAt: toFiniteNumber(candidate.savedAt, Date.now()),
    collectionIds: normalizeCollectionIds(candidate.collectionIds),
  };
}

function normalizeCollectionIds(value: unknown) {
  return Array.isArray(value)
    ? Array.from(
        new Set(value.map((id) => String(id).trim()).filter(Boolean)),
      )
    : [];
}

function normalizeHighlight(value: unknown): ReaderHighlight | null {
  const verse = normalizeVerse(value);
  if (!verse || !value || typeof value !== "object") return null;

  const candidate = value as Partial<ReaderHighlight>;
  const color =
    candidate.color === "green" ||
    candidate.color === "blue" ||
    candidate.color === "pink" ||
    candidate.color === "purple"
      ? candidate.color
      : "yellow";

  return {
    ...verse,
    color,
    savedAt: toFiniteNumber(candidate.savedAt, Date.now()),
    collectionIds: normalizeCollectionIds(candidate.collectionIds),
  };
}

function normalizeHighlightCollection(
  value: unknown,
): ReaderHighlightCollection | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<ReaderHighlightCollection>;
  const id = String(candidate.id || "").trim();
  const name = String(candidate.name || "").trim();

  if (!id || !name) return null;

  return {
    id,
    name,
    createdAt: toFiniteNumber(candidate.createdAt, Date.now()),
  };
}

function normalizeNote(value: unknown): ReaderNote | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<ReaderNote>;
  const id = String(candidate.id || "").trim();
  const note = String(candidate.note || "");
  const verses = Array.isArray(candidate.verses)
    ? candidate.verses
        .map(normalizeVerse)
        .filter((verse): verse is ReaderMemoryVerse => Boolean(verse))
    : [];

  if (!id || !verses.length) return null;

  const savedAt = toFiniteNumber(candidate.savedAt, Date.now());

  return {
    id,
    verses,
    note,
    savedAt,
    updatedAt: toFiniteNumber(candidate.updatedAt, savedAt),
    collectionIds: normalizeCollectionIds(candidate.collectionIds),
  };
}

export function normalizeReaderMemory(value: unknown): ReaderMemory {
  if (!value || typeof value !== "object") return defaultMemory;

  const candidate = value as Partial<ReaderMemory>;

  return {
    bookmarks: Array.isArray(candidate.bookmarks)
      ? candidate.bookmarks
          .map(normalizeBookmark)
          .filter((item): item is ReaderBookmark => Boolean(item))
      : [],
    highlights: Array.isArray(candidate.highlights)
      ? candidate.highlights
          .map(normalizeHighlight)
          .filter((item): item is ReaderHighlight => Boolean(item))
      : [],
    notes: Array.isArray(candidate.notes)
      ? candidate.notes
          .map(normalizeNote)
          .filter((item): item is ReaderNote => Boolean(item))
      : [],
    highlightCollections: Array.isArray(candidate.highlightCollections)
      ? candidate.highlightCollections
          .map(normalizeHighlightCollection)
          .filter(
            (item): item is ReaderHighlightCollection => Boolean(item),
          )
      : [],
  };
}

function getReaderMemoryKey() {
  if (!isBrowser()) return KEY;

  const owner = localStorage.getItem(ACTIVE_OWNER_KEY)?.trim();
  return owner ? `${KEY}:${owner}` : KEY;
}

export function activateReaderMemoryOwner(ownerId: string | null) {
  if (!isBrowser()) return;

  const owner = ownerId?.trim() || "";
  const previousOwner = localStorage.getItem(ACTIVE_OWNER_KEY) || "";

  if (!owner) {
    localStorage.removeItem(ACTIVE_OWNER_KEY);
    if (previousOwner) notifyReaderMemoryUpdated();
    return;
  }

  const ownerKey = `${KEY}:${owner}`;
  if (!localStorage.getItem(ownerKey)) {
    const claimedBy = localStorage.getItem(LEGACY_CLAIMED_KEY);
    const legacy = localStorage.getItem(KEY);

    if (legacy && (!claimedBy || claimedBy === owner)) {
      localStorage.setItem(ownerKey, legacy);
      localStorage.setItem(LEGACY_CLAIMED_KEY, owner);
    } else {
      localStorage.setItem(ownerKey, JSON.stringify(createEmptyReaderMemory()));
    }
  }

  localStorage.setItem(ACTIVE_OWNER_KEY, owner);
  if (previousOwner !== owner) notifyReaderMemoryUpdated();
}

function notifyReaderMemoryUpdated() {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event("reader-memory-updated"));
}

export function getReaderMemory(): ReaderMemory {
  if (!isBrowser()) return defaultMemory;

  try {
    const raw = localStorage.getItem(getReaderMemoryKey());
    if (!raw) return defaultMemory;

    return normalizeReaderMemory(JSON.parse(raw));
  } catch {
    return defaultMemory;
  }
}

export function saveReaderMemory(memory: ReaderMemory) {
  if (!isBrowser()) return;

  localStorage.setItem(
    getReaderMemoryKey(),
    JSON.stringify(normalizeReaderMemory(memory)),
  );
  notifyReaderMemoryUpdated();
}

export function areAllBookmarked(verses: ReaderMemoryVerse[]) {
  const memory = getReaderMemory();

  return verses.every((verse) =>
    memory.bookmarks.some((bookmark) => bookmark.id === verse.id)
  );
}

export function toggleBookmarks(verses: ReaderMemoryVerse[]) {
  const memory = getReaderMemory();

  const allSaved = verses.every((verse) =>
    memory.bookmarks.some((bookmark) => bookmark.id === verse.id)
  );

  const nextBookmarks = allSaved
    ? memory.bookmarks.filter(
        (bookmark) => !verses.some((verse) => verse.id === bookmark.id)
      )
    : [
        ...memory.bookmarks.filter(
          (bookmark) => !verses.some((verse) => verse.id === bookmark.id)
        ),
        ...verses.map((verse) => ({
          ...verse,
          savedAt: Date.now(),
          collectionIds:
            memory.bookmarks.find((bookmark) => bookmark.id === verse.id)
              ?.collectionIds || [],
        })),
      ];

  saveReaderMemory({
    ...memory,
    bookmarks: nextBookmarks,
  });

  return !allSaved;
}

export function highlightVerses(
  verses: ReaderMemoryVerse[],
  color: ReaderHighlight["color"] = "yellow"
) {
  const memory = getReaderMemory();

  const nextHighlights = [
    ...memory.highlights.filter(
      (highlight) => !verses.some((verse) => verse.id === highlight.id)
    ),
    ...verses.map((verse) => ({
      ...verse,
      color,
      savedAt: Date.now(),
      collectionIds:
        memory.highlights.find((highlight) => highlight.id === verse.id)
          ?.collectionIds || [],
    })),
  ];

  saveReaderMemory({
    ...memory,
    highlights: nextHighlights,
  });

  return nextHighlights;
}

export function removeHighlights(verses: ReaderMemoryVerse[]) {
  const memory = getReaderMemory();

  const nextHighlights = memory.highlights.filter(
    (highlight) => !verses.some((verse) => verse.id === highlight.id)
  );

  saveReaderMemory({
    ...memory,
    highlights: nextHighlights,
  });

  return nextHighlights;
}

export function createHighlightCollection(name: string) {
  const cleanName = name.trim().replace(/\s+/g, " ");
  if (!cleanName) return null;

  const memory = getReaderMemory();
  const existing = memory.highlightCollections.find(
    (collection) => collection.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase(),
  );

  if (existing) return existing;

  const now = Date.now();
  const collection: ReaderHighlightCollection = {
    id: `highlight-collection-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: cleanName,
    createdAt: now,
  };

  saveReaderMemory({
    ...memory,
    highlightCollections: [...memory.highlightCollections, collection],
  });

  return collection;
}

export const createReaderCollection = createHighlightCollection;

export function addReaderItemsToCollection(
  itemType: ReaderCollectionItemType,
  itemIds: string[],
  collectionId: string,
) {
  const memory = getReaderMemory();
  const ids = new Set(itemIds);

  if (
    !ids.size ||
    !memory.highlightCollections.some(
      (collection) => collection.id === collectionId,
    )
  ) {
    return null;
  }

  let addedCount = 0;
  let alreadyMemberCount = 0;
  const addMembership = <T extends { id: string; collectionIds: string[] }>(
    item: T,
  ) => {
    if (!ids.has(item.id)) return item;
    if (item.collectionIds.includes(collectionId)) {
      alreadyMemberCount += 1;
      return item;
    }
    addedCount += 1;
    return { ...item, collectionIds: [...item.collectionIds, collectionId] };
  };

  const nextMemory: ReaderMemory = {
    ...memory,
    bookmarks:
      itemType === "bookmark"
        ? memory.bookmarks.map(addMembership)
        : memory.bookmarks,
    highlights:
      itemType === "highlight"
        ? memory.highlights.map(addMembership)
        : memory.highlights,
    notes:
      itemType === "note" ? memory.notes.map(addMembership) : memory.notes,
  };

  if (addedCount) saveReaderMemory(nextMemory);
  return { addedCount, alreadyMemberCount };
}

export function addHighlightsToCollection(
  highlightIds: string[],
  collectionId: string,
) {
  return addReaderItemsToCollection("highlight", highlightIds, collectionId);
}

export function deleteHighlightCollection(collectionId: string) {
  const memory = getReaderMemory();
  const exists = memory.highlightCollections.some(
    (collection) => collection.id === collectionId,
  );

  if (!exists) return false;

  saveReaderMemory({
    ...memory,
    highlightCollections: memory.highlightCollections.filter(
      (collection) => collection.id !== collectionId,
    ),
    highlights: memory.highlights.map((highlight) => ({
      ...highlight,
      collectionIds: highlight.collectionIds.filter(
        (id) => id !== collectionId,
      ),
    })),
    bookmarks: memory.bookmarks.map((bookmark) => ({
      ...bookmark,
      collectionIds: bookmark.collectionIds.filter(
        (id) => id !== collectionId,
      ),
    })),
    notes: memory.notes.map((note) => ({
      ...note,
      collectionIds: note.collectionIds.filter((id) => id !== collectionId),
    })),
  });

  return true;
}

export const deleteReaderCollection = deleteHighlightCollection;

export function saveNote(verses: ReaderMemoryVerse[], note: string) {
  const memory = getReaderMemory();
  const now = Date.now();

  const newNote: ReaderNote = {
    id: `note-${now}`,
    verses,
    note,
    savedAt: now,
    updatedAt: now,
    collectionIds: [],
  };

  saveReaderMemory({
    ...memory,
    notes: [newNote, ...memory.notes],
  });

  return newNote;
}

export function updateNote(noteId: string, noteText: string) {
  const memory = getReaderMemory();
  const existing = memory.notes.find((note) => note.id === noteId);

  if (!existing) return null;

  const updated: ReaderNote = {
    ...existing,
    note: noteText,
    savedAt: existing.savedAt,
    updatedAt: Date.now(),
  };

  saveReaderMemory({
    ...memory,
    notes: memory.notes.map((note) =>
      note.id === noteId ? updated : note
    ),
  });

  return updated;
}

export function deleteNote(noteId: string) {
  const memory = getReaderMemory();
  const exists = memory.notes.some((note) => note.id === noteId);

  if (!exists) return false;

  saveReaderMemory({
    ...memory,
    notes: memory.notes.filter((note) => note.id !== noteId),
  });

  return true;
}

export function getVerseMemoryState(verseId: string) {
  const memory = getReaderMemory();

  return {
    bookmarked: memory.bookmarks.some((bookmark) => bookmark.id === verseId),
    highlight: memory.highlights.find((highlight) => highlight.id === verseId),
    notes: memory.notes.filter((note) =>
      note.verses.some((verse) => verse.id === verseId)
    ),
  };
}
