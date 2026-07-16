"use client";

import type { MouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { BibleIQVerseTokenAvailability } from "@/app/data/lexicon/BibleIQTypes";
import { renderSacredNames } from "../data/renderSacredNames";
import { useSacredNames } from "../data/useSacredNames";

const FUNCTION_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "if",
  "in",
  "into",
  "nor",
  "of",
  "on",
  "or",
  "that",
  "the",
  "then",
  "to",
  "unto",
  "upon",
  "with",
  "yet",
]);

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

function isFunctionWord(value: string) {
  return FUNCTION_WORDS.has(value.toLowerCase());
}

export default function ScriptureText({
  text,
  reference,
  tokenAvailability,
  focusedTokenIndex,
}: {
  text: string;
  reference?: string;
  tokenAvailability?: BibleIQVerseTokenAvailability;
  focusedTokenIndex?: number | null;
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

  function openWordStudy(
    word: string,
    tokenIndex: number,
    sourceWord?: string,
  ) {
    const selectedWord = cleanWord(word);
    if (!selectedWord) return;

    const params = new URLSearchParams(searchParams.toString());

    params.delete("study");
    params.delete("focusToken");
    params.set("word", selectedWord);
    params.set("displayTokenIndex", String(tokenIndex));
    params.set("selectedText", selectedWord);
    params.set("verseText", renderedText);

    if (sourceWord) {
      params.set("originalWord", sourceWord);
    } else {
      params.delete("originalWord");
    }

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

        const availability = tokenAvailability?.[String(tokenIndex)];

        if (!availability) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }

        const functionWord = isFunctionWord(selectedWord);
        const focused = focusedTokenIndex === tokenIndex;

        return (
          <button
            key={`${part}-${index}`}
            type="button"
            data-word-token="true"
            data-word-kind={functionWord ? "function" : "lexical"}
            aria-label={`Open source word study for ${selectedWord}`}
            title={`Study ${selectedWord} from its ${
              availability.source === "greek-nt"
                ? "Greek New Testament"
                : availability.source === "lxx"
                  ? "Greek Septuagint"
                  : "Hebrew"
            } source`}
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              event.preventDefault();
              event.stopPropagation();
              openWordStudy(
                part,
                tokenIndex,
                availability.sourceWord,
              );
            }}
            style={{
              textDecorationLine: "underline",
              textDecorationStyle: "dotted",
              textDecorationColor: functionWord
                ? "rgba(176, 137, 63, 0.14)"
                : "rgba(176, 137, 63, 0.34)",
              textUnderlineOffset: "0.22em",
            }}
            className={`inline rounded-[0.22em] px-[0.03em] text-inherit transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/45 active:bg-amber-500/10 ${
              functionWord
                ? "hover:bg-[var(--surface)] hover:decoration-amber-500/50"
                : "hover:bg-amber-500/10 hover:decoration-amber-500/80"
            } ${focused ? "bg-amber-500/15 ring-1 ring-amber-500/30" : ""}`}
          >
            {part}
          </button>
        );
      })}
    </>
  );
}
