"use client";

import { useEffect } from "react";
import { readerVerseAnchorId } from "@/app/data/scripture/ReaderVerseAdapter";

export default function ReaderVerseScroller({
  verseLabel,
}: {
  verseLabel?: string | null;
}) {
  useEffect(() => {
    if (!verseLabel) return;

    const target = document.getElementById(
      readerVerseAnchorId(verseLabel),
    );

    target?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [verseLabel]);

  return null;
}
