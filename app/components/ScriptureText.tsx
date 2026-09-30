"use client";

import { renderSacredNames } from "../data/renderSacredNames";
import { useSacredNames } from "../data/useSacredNames";

function cleanVerseDisplayText(text: string) {
  return text
    .replace(
      /\bYahweh\*\s+["\u201C][^"\u201D]+["\u201D]\s+is\s+[^.]+\.\s*/gi,
      "Yahweh ",
    )
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isDisplayToken(value: string) {
  return /[\p{L}\p{N}]/u.test(value);
}

function displayTokenCount(value: string) {
  return value
    .split(/(\s+)/u)
    .filter((part) => part && !/^\s+$/u.test(part) && isDisplayToken(part))
    .length;
}

function buildDisplayParts(value: string) {
  let nextTokenIndex = 0;

  return value.split(/(\s+)/u).map((text, partIndex) => {
    if (/^\s+$/u.test(text) || !text || !isDisplayToken(text)) {
      return { key: `${partIndex}-text`, text, tokenIndex: null };
    }

    const tokenIndex = nextTokenIndex;
    nextTokenIndex += 1;
    return { key: `${partIndex}-${tokenIndex}`, text, tokenIndex };
  });
}

export default function ScriptureText({
  text,
  reference,
  highlightRange,
}: {
  text: string;
  reference?: string;
  highlightRange?: {
    startTokenIndex: number;
    endTokenIndex: number;
  } | null;
}) {
  const { sacredNames } = useSacredNames();
  const cleanedText = cleanVerseDisplayText(text);
  const renderedText = sacredNames
    ? renderSacredNames(cleanedText, reference)
    : cleanedText;
  const correspondenceIndexesRemainStable =
    displayTokenCount(renderedText) === displayTokenCount(cleanedText);
  const displayParts = buildDisplayParts(renderedText);

  return (
    <>
      {displayParts.map(({ key, text: part, tokenIndex }) => {
        if (tokenIndex === null) return part;

        const isCorresponding = Boolean(
          highlightRange &&
            correspondenceIndexesRemainStable &&
            tokenIndex >= highlightRange.startTokenIndex &&
            tokenIndex <= highlightRange.endTokenIndex,
        );

        return (
          <span
            key={key}
            {...(isCorresponding
              ? { "data-source-correspondence": "true" }
              : {})}
            className={
              isCorresponding
                ? "rounded-sm bg-amber-300/35 px-0.5 ring-1 ring-amber-500/35 dark:bg-amber-400/20"
                : undefined
            }
          >
            {part}
          </span>
        );
      })}
    </>
  );
}
