"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import WordStudySheet from "@/app/components/WordStudySheet";

export default function ReaderWordStudyController({
  book,
  chapter,
  translation,
}: {
  book: string;
  chapter: number;
  translation: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  const selectedWord = searchParams.get("word");
  const selectedVerse = searchParams.get("verse");
  const selectedText = searchParams.get("selectedText");
  const originalWord = searchParams.get("originalWord");
  const displayTokenIndex = searchParams.get("displayTokenIndex");
  const verseText = searchParams.get("verseText");

  useEffect(() => {
    if (!searchParams.has("study")) return;

    const params = new URLSearchParams(queryString);
    params.delete("study");
    const query = params.toString();

    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [pathname, queryString, router, searchParams]);

  function closeWordStudy() {
    const params = new URLSearchParams(queryString);
    const verseToFocus = selectedVerse;
    const tokenToFocus = displayTokenIndex;

    params.delete("study");
    params.delete("word");
    params.delete("selectedText");
    params.delete("originalWord");
    params.delete("displayTokenIndex");
    params.delete("verseText");
    params.delete("wordOccurrence");

    if (verseToFocus) {
      params.set("verse", verseToFocus);
    } else {
      params.delete("verse");
    }

    if (tokenToFocus !== null && Number(tokenToFocus) >= 0) {
      params.set("focusToken", tokenToFocus);
    } else {
      params.delete("focusToken");
    }

    const query = params.toString();

    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  return (
    <WordStudySheet
      word={selectedWord}
      book={book}
      chapter={chapter}
      verse={selectedVerse ? Number(selectedVerse) : undefined}
      translation={translation}
      displayTokenIndex={
        displayTokenIndex !== null
          ? Number(displayTokenIndex)
          : undefined
      }
      selectedText={selectedText || undefined}
      originalWord={originalWord || undefined}
      verseText={verseText || undefined}
      onClose={closeWordStudy}
    />
  );
}
