import type { ReaderMemoryVerse } from "@/app/lib/readerMemory";

export type PointerOrigin = {
  x: number;
  y: number;
};

export function pointerMoved(
  origin: PointerOrigin | null,
  point: PointerOrigin,
  threshold = 10,
) {
  if (!origin) return false;
  return Math.hypot(point.x - origin.x, point.y - origin.y) > threshold;
}

export function resolveIntersectingVerses<T extends { id: string }>(
  verses: readonly T[],
  intersectingIds: Iterable<string>,
) {
  const ids = new Set(intersectingIds);
  return verses.filter((verse) => ids.has(verse.id));
}

export function toggleSelectedVerse<T extends { id: string }>(
  selected: readonly T[],
  verse: T,
) {
  return selected.some((item) => item.id === verse.id)
    ? selected.filter((item) => item.id !== verse.id)
    : [...selected, verse];
}

export function joinSelectedScriptureText(parts: Iterable<string>) {
  return Array.from(parts)
    .map((part) => part.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function getPassageReference(verses: readonly ReaderMemoryVerse[]) {
  const first = verses[0];
  const last = verses[verses.length - 1];
  if (!first) return "";
  if (!last || verses.length === 1) return first.reference;

  const labels = verses.map((verse) => verse.verseLabel || String(verse.verse));
  const sameChapter = verses.every(
    (verse) => verse.book === first.book && verse.chapter === first.chapter,
  );
  const contiguous = sameChapter && verses.every((verse, index) => {
    if (index === 0) return true;
    const previous = verses[index - 1];
    return verse.verse === previous.verse + 1;
  });

  if (!sameChapter) {
    return first.reference + "–" + last.reference;
  }

  const verseLabel = contiguous
    ? labels[0] + "–" + labels[labels.length - 1]
    : labels.join(", ");
  return first.book + " " + first.chapter + ":" + verseLabel;
}

