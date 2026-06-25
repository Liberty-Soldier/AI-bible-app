"use client";

import { useEffect } from "react";

type BibleIQContext = {
  type: "reader";
  book: string;
  chapter: number;
  verse?: number | null;
  translation: string;
  studyMode: boolean;
};

export default function SaveBibleIQContext({
  book,
  chapter,
  verse,
  translation,
  studyMode,
}: BibleIQContext) {
  useEffect(() => {
    localStorage.setItem(
      "bibleiq-current-context",
      JSON.stringify({
        type: "reader",
        book,
        chapter,
        verse,
        translation,
        studyMode,
      })
    );
  }, [book, chapter, verse, translation, studyMode]);

  return null;
}