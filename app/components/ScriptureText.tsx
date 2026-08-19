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

function normalizeBoundaryText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^0-9A-Za-z]+/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

type ReconciledDisplayPiece =
  | { kind: "text"; text: string }
  | {
      kind: "token";
      text: string;
      tokenIndex: number;
      availability: NonNullable<BibleIQVerseTokenAvailability[string]>;
    };

function reconcileCanonicalDisplayPart(
  part: string,
  startIndex: number,
  tokenAvailability?: BibleIQVerseTokenAvailability,
): { pieces: ReconciledDisplayPiece[]; consumed: number } | null {
  const target = normalizeBoundaryText(part);
  if (!target || !tokenAvailability?.[String(startIndex)]?.displayText) {
    return null;
  }

  const labels: string[] = [];
  for (let count = 1; count <= 6; count += 1) {
    const availability =
      tokenAvailability[String(startIndex + count - 1)];
    const label = availability?.displayText;
    if (!availability || !label) break;

    labels.push(label);
    if (
      count < 2 ||
      normalizeBoundaryText(labels.join(" ")) !== target
    ) {
      continue;
    }

    const pieces: ReconciledDisplayPiece[] = [];
    const lowerPart = part.toLocaleLowerCase();
    let cursor = 0;

    for (let offset = 0; offset < labels.length; offset += 1) {
      const labelText = labels[offset];
      const found = lowerPart.indexOf(
        labelText.toLocaleLowerCase(),
        cursor,
      );
      if (found < cursor) return null;

      if (found > cursor) {
        pieces.push({
          kind: "text",
          text: part.slice(cursor, found),
        });
      }

      pieces.push({
        kind: "token",
        text: part.slice(found, found + labelText.length),
        tokenIndex: startIndex + offset,
        availability,
      });
      cursor = found + labelText.length;
    }

    if (cursor < part.length) {
      pieces.push({ kind: "text", text: part.slice(cursor) });
    }

    return { pieces, consumed: count };
  }

  return null;
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

        if (!/[\p{L}\p{N}]/u.test(selectedWord)) {
          return <span key={part + "-" + index}>{part}</span>;
        }

        const reconciliation = reconcileCanonicalDisplayPart(
          part,
          displayTokenIndex,
          tokenAvailability,
        );

        if (reconciliation) {
          displayTokenIndex += reconciliation.consumed;

          return (
            <span key={"reconciled-" + index}>
              {reconciliation.pieces.map((piece, pieceIndex) => {
                if (piece.kind === "text") {
                  return (
                    <span key={"separator-" + pieceIndex}>
                      {piece.text}
                    </span>
                  );
                }

                const word = cleanWord(piece.text);
                const functionWord = isFunctionWord(word);
                const focused = focusedTokenIndex === piece.tokenIndex;

                return (
                  <button
                    key={
                      "token-" +
                      piece.tokenIndex +
                      "-" +
                      pieceIndex
                    }
                    type="button"
                    data-word-token="true"
                    data-word-kind={
                      functionWord ? "function" : "lexical"
                    }
                    data-word-focused={focused ? "true" : undefined}
                    aria-label={
                      "Open source word study for " + word
                    }
                    title={
                      "Study " + word + " from its Hebrew source"
                    }
                    onClick={(event: MouseEvent<HTMLButtonElement>) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openWordStudy(
                        piece.text,
                        piece.tokenIndex,
                        piece.availability.sourceWord,
                      );
                    }}
                    style={{ textDecoration: "none" }}
                    className={
                      "inline rounded-[0.22em] px-[0.03em] text-inherit transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/45 active:bg-amber-500/10 " +
                      (functionWord
                        ? "hover:bg-[var(--surface)] hover:decoration-amber-500/50"
                        : "hover:bg-amber-500/10 hover:decoration-amber-500/80") +
                      " " +
                      (focused
                        ? "bg-amber-500/15 ring-1 ring-amber-500/30"
                        : "")
                    }
                  >
                    {piece.text}
                  </button>
                );
              })}
            </span>
          );
        }

        const tokenIndex = displayTokenIndex;
        displayTokenIndex += 1;

        const availability = tokenAvailability?.[String(tokenIndex)];

        if (!availability) {
          return <span key={part + "-" + index}>{part}</span>;
        }

        const functionWord = isFunctionWord(selectedWord);
        const focused = focusedTokenIndex === tokenIndex;

        return (
          <button
            key={part + "-" + index}
            type="button"
            data-word-token="true"
            data-word-kind={functionWord ? "function" : "lexical"}
            data-word-focused={focused ? "true" : undefined}
            aria-label={
              "Open source word study for " + selectedWord
            }
            title={
              "Study " +
              selectedWord +
              " from its " +
              (availability.source === "greek-nt"
                ? "Greek New Testament"
                : availability.source === "lxx"
                  ? "Greek Septuagint"
                  : "Hebrew") +
              " source"
            }
            onClick={(event: MouseEvent<HTMLButtonElement>) => {
              event.preventDefault();
              event.stopPropagation();
              openWordStudy(
                part,
                tokenIndex,
                availability.sourceWord,
              );
            }}
            style={{ textDecoration: "none" }}
            className={
              "inline rounded-[0.22em] px-[0.03em] text-inherit transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/45 active:bg-amber-500/10 " +
              (functionWord
                ? "hover:bg-[var(--surface)] hover:decoration-amber-500/50"
                : "hover:bg-amber-500/10 hover:decoration-amber-500/80") +
              " " +
              (focused
                ? "bg-amber-500/15 ring-1 ring-amber-500/30"
                : "")
            }
          >
            {part}
          </button>
        );
      })}
    </>
  );
}
