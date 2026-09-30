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

export default function ScriptureText({
  text,
  reference,
}: {
  text: string;
  reference?: string;
}) {
  const { sacredNames } = useSacredNames();
  const cleanedText = cleanVerseDisplayText(text);

  return (
    <>
      {sacredNames
        ? renderSacredNames(cleanedText, reference)
        : cleanedText}
    </>
  );
}
