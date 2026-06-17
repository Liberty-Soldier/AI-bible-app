"use client";

import { renderSacredNames } from "../data/renderSacredNames";
import { useSacredNames } from "../data/useSacredNames";

export default function ScriptureText({
  text,
}: {
  text: string;
}) {
  const { sacredNames } = useSacredNames();

  return (
    <>
      {sacredNames
        ? renderSacredNames(text)
        : text}
    </>
  );
}