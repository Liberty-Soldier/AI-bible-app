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

function cleanStudyWord(word: string) {
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
  studyMode = false,
}: {
  text: string;
  reference?: string;
  studyMode?: boolean;
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

  if (!studyMode) {
    return <>{renderedText}</>;
  }

  const parts = renderedText.split(/(\s+)/);
  let displayTokenIndex = 0;

  function openWordStudy(word: string, tokenIndex: number) {
    const cleanWord = cleanStudyWord(word);

    if (!cleanWord) return;

    const params = new URLSearchParams(searchParams.toString());

    params.set("study", "true");
    params.set("word", cleanWord);
    params.set("displayTokenIndex", String(tokenIndex));
    params.set("selectedText", cleanWord);
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
        const isSpace = /^\s+$/.test(part);

        if (isSpace) return part;

        const cleanWord = cleanStudyWord(part);

        if (!cleanWord) return part;

        const tokenIndex = displayTokenIndex;
        displayTokenIndex += 1;

        return (
          <button
            key={`${part}-${index}`}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openWordStudy(part, tokenIndex);
            }}
            className="rounded px-0.5 underline decoration-[var(--muted)] decoration-dotted underline-offset-4 transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
          >
            {part}
          </button>
        );
      })}
    </>
  );
}