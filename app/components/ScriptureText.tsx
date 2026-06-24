"use client";

import { useRef, useState } from "react";
import { renderSacredNames } from "../data/renderSacredNames";
import { useSacredNames } from "../data/useSacredNames";
import WordStudySheet from "./WordStudySheet";

export default function ScriptureText({
  text,
  studyMode = false,
}: {
  text: string;
  studyMode?: boolean;
}) {
  const { sacredNames } = useSacredNames();
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const scrollYRef = useRef(0);

  const renderedText = sacredNames ? renderSacredNames(text) : text;

  if (!studyMode) {
    return <>{renderedText}</>;
  }

  const parts = renderedText.split(/(\s+)/);

  function closeWordStudy() {
    setSelectedWord(null);

    requestAnimationFrame(() => {
      window.scrollTo({
        top: scrollYRef.current,
        behavior: "instant",
      });
    });
  }

  return (
    <>
      {parts.map((part, index) => {
        const isSpace = /^\s+$/.test(part);

        if (isSpace) {
          return part;
        }

        const cleanWord = part.replace(/[.,;:!?()[\]{}"“”‘’]/g, "");

        return (
          <button
            key={`${part}-${index}`}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();

              scrollYRef.current = window.scrollY;
              setSelectedWord(cleanWord);
            }}
            className="rounded px-0.5 underline decoration-neutral-700 decoration-dotted underline-offset-4 hover:text-amber-200"
          >
            {part}
          </button>
        );
      })}

      <WordStudySheet word={selectedWord} onClose={closeWordStudy} />
    </>
  );
}