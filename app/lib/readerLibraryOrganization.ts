import { getCanonicalBookIndex } from "../data/scripture/canonicalBookOrder";
import {
  getReaderMemoryVerseLabel,
  type ReaderBookmark,
  type ReaderMemoryVerse,
  type ReaderNote,
} from "./readerMemory";

export type BookSection<T> = {
  book: string;
  items: T[];
};

export function compareReaderVerses(
  left: ReaderMemoryVerse,
  right: ReaderMemoryVerse,
) {
  return (
    getCanonicalBookIndex(left.book) - getCanonicalBookIndex(right.book) ||
    left.book.localeCompare(right.book) ||
    left.chapter - right.chapter ||
    left.verse - right.verse ||
    getReaderMemoryVerseLabel(left).localeCompare(
      getReaderMemoryVerseLabel(right),
      undefined,
      { numeric: true },
    )
  );
}

function groupByBook<T>(items: T[], getVerse: (item: T) => ReaderMemoryVerse) {
  const books = new Map<string, T[]>();
  items.forEach((item) => {
    const book = getVerse(item).book;
    books.set(book, [...(books.get(book) || []), item]);
  });
  return Array.from(books.entries())
    .sort(
      ([left], [right]) =>
        getCanonicalBookIndex(left) - getCanonicalBookIndex(right) ||
        left.localeCompare(right),
    )
    .map(([book, bookItems]) => ({ book, items: bookItems }));
}

export function sortRecentBookmarks(bookmarks: ReaderBookmark[]) {
  return bookmarks.slice().sort((left, right) => right.savedAt - left.savedAt);
}

export function groupBookmarksByBook(bookmarks: ReaderBookmark[]) {
  return groupByBook(
    bookmarks.slice().sort(compareReaderVerses),
    (bookmark) => bookmark,
  );
}

function noteAnchor(note: ReaderNote) {
  return note.verses[0];
}

export function sortRecentNotes(notes: ReaderNote[]) {
  return notes.slice().sort((left, right) => right.savedAt - left.savedAt);
}

export function groupNotesByBook(notes: ReaderNote[]) {
  const valid = notes.filter((note) => noteAnchor(note));
  return groupByBook(
    valid.slice().sort((left, right) =>
      compareReaderVerses(noteAnchor(left), noteAnchor(right)),
    ),
    noteAnchor,
  );
}
