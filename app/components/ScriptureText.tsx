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

  if (!studyMode) {
    return <>{renderedText}</>;
  }

  const parts = renderedText.split(/(\s+)/);

  function cleanStudyWord(word: string) {
    return word.replace(/[.,;:!?()[\]{}"“”‘’]/g, "").trim();
  }

  function openWordStudy(word: string) {
    const cleanWord = cleanStudyWord(word);

    if (!cleanWord) return;

    const params = new URLSearchParams(searchParams.toString());

    params.set("study", "true");
    params.set("word", cleanWord);

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

        return (
          <button
            key={`${part}-${index}`}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openWordStudy(part);
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