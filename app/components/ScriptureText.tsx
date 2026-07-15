"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { renderSacredNames } from "../data/renderSacredNames";
import { useSacredNames } from "../data/useSacredNames";

function cleanVerseDisplayText(text: string) {
  return text
    .replace(/\bYahweh\*\s+[“"][^”"]+[”"]\s+is\s+[^.]+\.\s*/gi, "Yahweh ")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanWord(word: string) {
  return word.replace(/[.,;:!?()[\]{}"“”‘’]/g, "").trim();
}

function parseReference(reference?: string) {
  if (!reference) return null;

  const match = reference.match(/^(.+?)\s+(\d+):(\d+)$/);
  if (!match) return null;

  return {
    book: match[1],
    chapter: Number(match[2]),
    verse: Number(match[3]),
  };
}

export default function ScriptureText({
  text,
  reference,
}: {
  text: string;
  reference?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { sacredNames } = useSacredNames();

  const cleanedText = cleanVerseDisplayText(text);
  const renderedText = sacredNames
    ? renderSacredNames(cleanedText, reference)
    : cleanedText;

  const parsedReference = parseReference(reference);
  const parts = renderedText.split(/(\s+)/);
  let displayTokenIndex = 0;

  function openWordStudy(word: string, tokenIndex: number) {
    const selectedWord = cleanWord(word);
    if (!selectedWord) return;

    const params = new URLSearchParams(searchParams.toString());

    params.delete("study");
    params.set("word", selectedWord);
    params.set("displayTokenIndex", String(tokenIndex));
    params.set("selectedText", selectedWord);
    params.set("verseText", renderedText);
    params.delete("verse");

    if (parsedReference?.verse) {
      params.set("verse", String(parsedReference.verse));
    }

    router.replace(`${pathname}?${params.toString()}`, {
      scroll: false,
    });
  }

  return (
    <>
      {parts.map((part, index) => {
        if (/^\s+$/.test(part)) return part;

        const selectedWord = cleanWord(part);
        if (!selectedWord) return part;

        const tokenIndex = displayTokenIndex;
        displayTokenIndex += 1;

        return (
          <button
            key={`${part}-${index}`}
            type="button"
            data-word-token="true"
            aria-label={`Open word study for ${selectedWord}`}
            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
              event.preventDefault();
              event.stopPropagation();
              openWordStudy(part, tokenIndex);
            }}
            className="inline rounded-sm px-[0.08em] text-inherit transition hover:bg-[var(--surface)] focus-visible:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border)] active:bg-[var(--surface)]"
          >
            {part}
          </button>
        );
      })}
    </>
  );
}
