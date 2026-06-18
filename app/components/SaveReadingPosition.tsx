"use client";

import { useEffect } from "react";

type Props = {
  book: string;
  chapter: number;
  translation: string;
};

export default function SaveReadingPosition({
  book,
  chapter,
  translation,
}: Props) {
  useEffect(() => {
    localStorage.setItem(
      "lastReadingPosition",
      JSON.stringify({
        book,
        chapter,
        translation,
        timestamp: Date.now(),
      })
    );
  }, [book, chapter, translation]);

  return null;
}