"use client";

import { useEffect } from "react";

type BibleIQContext = {
  type?: "reader";
  book: string;
  chapter: number;
  verse?: number | null;
  translation: string;
};

export default function SaveBibleIQContext({
  book,
  chapter,
  verse,
  translation,
}: BibleIQContext) {
  useEffect(() => {
    localStorage.setItem(
      "bibleiq-current-context",
      JSON.stringify({
        type: "reader",
        experience: "unified-reader",
        book,
        chapter,
        verse,
        translation,
      }),
    );
  }, [book, chapter, verse, translation]);

  return null;
}
