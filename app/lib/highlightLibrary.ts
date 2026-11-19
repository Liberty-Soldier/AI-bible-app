import { getCanonicalBookIndex } from "@/app/data/scripture/canonicalBookOrder";
import {
  getReaderMemoryVerseLabel,
  type ReaderHighlight,
} from "@/app/lib/readerMemory";

export type HighlightGroup = {
  id: string;
  items: ReaderHighlight[];
  reference: string;
  text: string;
  book: string;
  chapter: number;
  color: ReaderHighlight["color"];
  savedAt: number;
};

function compareScriptureOrder(a: ReaderHighlight, b: ReaderHighlight) {
  return (
    getCanonicalBookIndex(a.book) - getCanonicalBookIndex(b.book) ||
    a.book.localeCompare(b.book) ||
    a.chapter - b.chapter ||
    a.verse - b.verse ||
    getReaderMemoryVerseLabel(a).localeCompare(
      getReaderMemoryVerseLabel(b),
      undefined,
      { numeric: true },
    )
  );
}

function canJoinHighlights(
  previous: ReaderHighlight,
  next: ReaderHighlight,
  requireSameSave: boolean,
) {
  return (
    previous.book === next.book &&
    previous.chapter === next.chapter &&
    previous.translation === next.translation &&
    previous.color === next.color &&
    next.verse === previous.verse + 1 &&
    (!requireSameSave || Math.abs(previous.savedAt - next.savedAt) <= 2_000)
  );
}

function createGroup(items: ReaderHighlight[]): HighlightGroup {
  const first = items[0];
  const last = items[items.length - 1];
  const firstLabel = getReaderMemoryVerseLabel(first);
  const lastLabel = getReaderMemoryVerseLabel(last);

  return {
    id: items.map((item) => item.id).join("|"),
    items,
    reference:
      items.length === 1
        ? first.reference
        : `${first.book} ${first.chapter}:${firstLabel}–${lastLabel}`,
    text: items.map((item) => item.text.trim()).filter(Boolean).join(" "),
    book: first.book,
    chapter: first.chapter,
    color: first.color,
    savedAt: Math.max(...items.map((item) => item.savedAt)),
  };
}

function groupSortedHighlights(
  highlights: ReaderHighlight[],
  requireSameSave: boolean,
) {
  const groups: ReaderHighlight[][] = [];

  highlights.forEach((highlight) => {
    const current = groups[groups.length - 1];
    const previous = current?.[current.length - 1];

    if (previous && canJoinHighlights(previous, highlight, requireSameSave)) {
      current.push(highlight);
    } else {
      groups.push([highlight]);
    }
  });

  return groups.map(createGroup);
}

export function groupRecentHighlights(highlights: ReaderHighlight[]) {
  const saveBatches = new Map<number, ReaderHighlight[]>();

  highlights.forEach((highlight) => {
    const batchKey = Math.floor(highlight.savedAt / 2_000);
    const batch = saveBatches.get(batchKey) || [];
    batch.push(highlight);
    saveBatches.set(batchKey, batch);
  });

  return Array.from(saveBatches.entries())
    .sort(([a], [b]) => b - a)
    .flatMap(([, batch]) =>
      groupSortedHighlights(batch.slice().sort(compareScriptureOrder), true),
    )
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function groupHighlightsByBook(highlights: ReaderHighlight[]) {
  return groupSortedHighlights(
    highlights.slice().sort(compareScriptureOrder),
    false,
  );
}

export function getHighlightDayKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function formatHighlightDay(timestamp: number, now = new Date()) {
  const date = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round(
    (today.getTime() - target.getTime()) / 86_400_000,
  );

  if (dayDifference === 0) return "Today";
  if (dayDifference === 1) return "Yesterday";

  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(date);
}
