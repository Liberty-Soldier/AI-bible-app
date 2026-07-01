export type ReaderMemoryVerse = {
  id: string;
  reference: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
};

export type ReaderBookmark = ReaderMemoryVerse & {
  savedAt: number;
};

export type ReaderHighlight = ReaderMemoryVerse & {
  color: "yellow" | "green" | "blue" | "pink" | "purple";
  savedAt: number;
};

export type ReaderNote = {
  id: string;
  verses: ReaderMemoryVerse[];
  note: string;
  savedAt: number;
  updatedAt: number;
};

export type ReaderMemory = {
  bookmarks: ReaderBookmark[];
  highlights: ReaderHighlight[];
  notes: ReaderNote[];
};

const KEY = "scripture-search-reader-memory";

const defaultMemory: ReaderMemory = {
  bookmarks: [],
  highlights: [],
  notes: [],
};

function isBrowser() {
  return typeof window !== "undefined";
}

export function getReaderMemory(): ReaderMemory {
  if (!isBrowser()) return defaultMemory;

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultMemory;

    const parsed = JSON.parse(raw) as Partial<ReaderMemory>;

    return {
      bookmarks: parsed.bookmarks || [],
      highlights: parsed.highlights || [],
      notes: parsed.notes || [],
    };
  } catch {
    return defaultMemory;
  }
}

export function saveReaderMemory(memory: ReaderMemory) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(memory));
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

export function saveNote(verses: ReaderMemoryVerse[], note: string) {
  const memory = getReaderMemory();

  const now = Date.now();

  const newNote: ReaderNote = {
    id: `note-${now}`,
    verses,
    note,
    savedAt: now,
    updatedAt: now,
  };

  saveReaderMemory({
    ...memory,
    notes: [newNote, ...memory.notes],
  });

  return newNote;
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