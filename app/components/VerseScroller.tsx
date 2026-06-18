"use client";

import { useEffect } from "react";

export default function VerseScroller({
  verse,
}: {
  verse?: number | null;
}) {
  useEffect(() => {
    if (!verse) return;

    const element = document.getElementById(`verse-${verse}`);

    if (element) {
      setTimeout(() => {
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 150);
    }
  }, [verse]);

  return null;
}