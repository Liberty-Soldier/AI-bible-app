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
  };
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
  };
}

function normalizeMemory(value: unknown): ReaderMemory {
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
  };
}

function notifyReaderMemoryUpdated() {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event("reader-memory-updated"));
}

export function getReaderMemory(): ReaderMemory {
  if (!isBrowser()) return defaultMemory;

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultMemory;

    return normalizeMemory(JSON.parse(raw));
  } catch {
    return defaultMemory;
  }
}

export function saveReaderMemory(memory: ReaderMemory) {
  if (!isBrowser()) return;

  localStorage.setItem(KEY, JSON.stringify(normalizeMemory(memory)));
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
