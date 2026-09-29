"use client";

import type { MouseEvent, ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type {
  BibleIQTokenAvailability,
  BibleIQVerseTokenAvailability,
} from "@/app/data/lexicon/BibleIQTypes";
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
    .replace(
      /\bYahweh\*\s+["\u201C][^"\u201D]+["\u201D]\s+is\s+[^.]+\.\s*/gi,
      "Yahweh ",
    )
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanWord(word: string) {
  return word
    .replace(
      /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,
      "",
    )
    .trim();
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
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "token";
      text: string;
      tokenIndex: number;
      availability: BibleIQTokenAvailability;
    };

type DisplayPiece =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "token";
      text: string;
      tokenIndex: number;
    };

type OwnedSpan = {
  start: number;
  end: number;
  anchorTokenIndex: number;
  selectedText: string;
  availability: BibleIQTokenAvailability;
  ownershipKey: string;
  explicitSegment: boolean;
};

function reconcileCanonicalDisplayPart(
  part: string,
  startIndex: number,
  tokenAvailability?: BibleIQVerseTokenAvailability,
): {
  pieces: ReconciledDisplayPiece[];
  consumed: number;
} | null {
  const target = normalizeBoundaryText(part);

  if (
    !target ||
    !tokenAvailability?.[String(startIndex)]
      ?.displayText
  ) {
    return null;
  }

  const labels: string[] = [];

  for (
    let count = 1;
    count <= 6;
    count += 1
  ) {
    const availability =
      tokenAvailability[
        String(startIndex + count - 1)
      ];

    const label =
      availability?.displayText;

    if (!availability || !label) {
      break;
    }

    labels.push(label);

    if (
      count < 2 ||
      normalizeBoundaryText(
        labels.join(" "),
      ) !== target
    ) {
      continue;
    }

    const pieces: ReconciledDisplayPiece[] =
      [];

    const lowerPart =
      part.toLocaleLowerCase();

    let cursor = 0;

    for (
      let offset = 0;
      offset < labels.length;
      offset += 1
    ) {
      const labelText =
        labels[offset];

      const found =
        lowerPart.indexOf(
          labelText.toLocaleLowerCase(),
          cursor,
        );

      if (found < cursor) {
        return null;
      }

      if (found > cursor) {
        pieces.push({
          kind: "text",
          text: part.slice(
            cursor,
            found,
          ),
        });
      }

      pieces.push({
        kind: "token",
        text: part.slice(
          found,
          found + labelText.length,
        ),
        tokenIndex:
          startIndex + offset,
        availability:
          tokenAvailability[
            String(
              startIndex + offset,
            )
          ],
      });

      cursor =
        found + labelText.length;
    }

    if (cursor < part.length) {
      pieces.push({
        kind: "text",
        text: part.slice(cursor),
      });
    }

    return {
      pieces,
      consumed: count,
    };
  }

  return null;
}

function buildDisplayPieces(
  renderedText: string,
  tokenAvailability?: BibleIQVerseTokenAvailability,
) {
  const pieces: DisplayPiece[] = [];
  const parts =
    renderedText.split(/(\s+)/);

  let displayTokenIndex = 0;

  for (const part of parts) {
    if (!part) {
      continue;
    }

    if (/^\s+$/.test(part)) {
      pieces.push({
        kind: "text",
        text: part,
      });

      continue;
    }

    const selectedWord =
      cleanWord(part);

    if (
      !selectedWord ||
      !/[\p{L}\p{N}]/u.test(
        selectedWord,
      )
    ) {
      pieces.push({
        kind: "text",
        text: part,
      });

      continue;
    }

    const reconciliation =
      reconcileCanonicalDisplayPart(
        part,
        displayTokenIndex,
        tokenAvailability,
      );

    if (reconciliation) {
      for (
        const piece of
        reconciliation.pieces
      ) {
        if (piece.kind === "text") {
          pieces.push(piece);
        } else {
          pieces.push({
            kind: "token",
            text: piece.text,
            tokenIndex:
              piece.tokenIndex,
          });
        }
      }

      displayTokenIndex +=
        reconciliation.consumed;

      continue;
    }

    pieces.push({
      kind: "token",
      text: part,
      tokenIndex:
        displayTokenIndex,
    });

    displayTokenIndex += 1;
  }

  return pieces;
}

function canonicalOwnershipKey(
  availability: BibleIQTokenAvailability,
) {
  const segment =
    availability.sourceSegment;

  if (segment) {
    return JSON.stringify({
      source:
        availability.source,
      routeMode:
        availability.routeMode ||
        null,
      sourceOccurrenceIds: [
        ...(segment
          .sourceOccurrenceIds || []),
      ].sort(),
      sourceComponentIds: [
        ...(segment
          .sourceComponentIds || []),
      ].sort(),
      layer:
        segment.layer || null,
      lane:
        segment.lane || null,
      sourceRoutes: (
        availability.sourceRoutes ||
        []
      ).map((route) => ({
        kind: route.kind,
        sourceTokenId:
          route.sourceTokenId ||
          null,
        occurrenceId:
          route.occurrenceId || null,
        componentId:
          route.componentId || null,
        grammarId:
          route.grammarId || null,
        entityId:
          route.entityId || null,
        lexicalId:
          route.lexicalId || null,
      })),
    });
  }

  return JSON.stringify({
    source:
      availability.source,
    entityId:
      availability.entityId,
    lexicalId:
      availability.lexicalId ||
      null,
    sourceWord:
      availability.sourceWord ||
      null,
  });
}

function buildOwnedSpans(
  pieces: DisplayPiece[],
  tokenAvailability?: BibleIQVerseTokenAvailability,
) {
  if (!tokenAvailability) {
    return [] as OwnedSpan[];
  }

  const tokenText =
    new Map<number, string>();

  for (const piece of pieces) {
    if (piece.kind !== "token") {
      continue;
    }

    tokenText.set(
      piece.tokenIndex,
      cleanWord(piece.text),
    );
  }

  const candidates: OwnedSpan[] =
    [];

  for (
    const [
      rawAnchor,
      availability,
    ] of Object.entries(
      tokenAvailability,
    )
  ) {
    const anchorTokenIndex =
      Number(rawAnchor);

    if (
      !Number.isInteger(
        anchorTokenIndex,
      ) ||
      anchorTokenIndex < 0 ||
      !tokenText.has(
        anchorTokenIndex,
      )
    ) {
      continue;
    }

    let start =
      anchorTokenIndex;

    let end =
      anchorTokenIndex;

    let explicitSegment =
      false;

    const segment =
      availability.sourceSegment;

    const rawStart =
      segment
        ?.renderingStartTokenIndex;

    const rawEnd =
      segment
        ?.renderingEndTokenIndex;

    const hasAnyBound =
      rawStart !== undefined ||
      rawEnd !== undefined;

    if (hasAnyBound) {
      if (
        !Number.isInteger(
          rawStart,
        ) ||
        !Number.isInteger(
          rawEnd,
        )
      ) {
        /*
         * A partial canonical span is not
         * safe enough to expose.
         */
        continue;
      }

      start =
        Number(rawStart);

      end =
        Number(rawEnd);

      explicitSegment = true;

      if (
        start < 0 ||
        end < start ||
        anchorTokenIndex <
          start ||
        anchorTokenIndex > end
      ) {
        continue;
      }
    }

    const words: string[] = [];
    let complete = true;

    for (
      let tokenIndex = start;
      tokenIndex <= end;
      tokenIndex += 1
    ) {
      const word =
        tokenText.get(
          tokenIndex,
        );

      if (!word) {
        complete = false;
        break;
      }

      words.push(word);
    }

    if (!complete) {
      continue;
    }

    const selectedText =
      words.join(" ").trim();

    if (!selectedText) {
      continue;
    }

    candidates.push({
      start,
      end,
      anchorTokenIndex,
      selectedText,
      availability,
      ownershipKey:
        canonicalOwnershipKey(
          availability,
        ),
      explicitSegment,
    });
  }

  /*
   * First collapse duplicate records that
   * describe the exact same English span.
   * If the same bounds claim different
   * canonical ownership, fail closed.
   */
  const byRange =
    new Map<
      string,
      OwnedSpan[]
    >();

  for (const candidate of candidates) {
    const rangeKey =
      `${candidate.start}:${candidate.end}`;

    const current =
      byRange.get(rangeKey) || [];

    current.push(candidate);

    byRange.set(
      rangeKey,
      current,
    );
  }

  const deduped: OwnedSpan[] =
    [];

  for (
    const group of byRange.values()
  ) {
    const ownership =
      new Set(
        group.map(
          (item) =>
            item.ownershipKey,
        ),
      );

    if (ownership.size !== 1) {
      continue;
    }

    group.sort(
      (left, right) =>
        left.anchorTokenIndex -
        right.anchorTokenIndex,
    );

    deduped.push(group[0]);
  }

  /*
   * Then reject overlapping competing
   * spans. One exception is deliberate:
   * a canonical explicit segment may
   * supersede an older single-token
   * fallback wholly contained inside it.
   */
  deduped.sort(
    (left, right) =>
      left.start - right.start ||
      left.end - right.end,
  );

  const rejected =
    new Set<number>();

  for (
    let leftIndex = 0;
    leftIndex < deduped.length;
    leftIndex += 1
  ) {
    const left =
      deduped[leftIndex];

    for (
      let rightIndex =
        leftIndex + 1;
      rightIndex <
      deduped.length;
      rightIndex += 1
    ) {
      const right =
        deduped[rightIndex];

      if (
        right.start > left.end
      ) {
        break;
      }

      const overlaps =
        left.start <= right.end &&
        right.start <= left.end;

      if (!overlaps) {
        continue;
      }

      const leftContainsRight =
        left.start <= right.start &&
        left.end >= right.end;

      const rightContainsLeft =
        right.start <= left.start &&
        right.end >= left.end;

      if (
        left.explicitSegment &&
        !right.explicitSegment &&
        leftContainsRight
      ) {
        rejected.add(
          rightIndex,
        );

        continue;
      }

      if (
        right.explicitSegment &&
        !left.explicitSegment &&
        rightContainsLeft
      ) {
        rejected.add(
          leftIndex,
        );

        continue;
      }

      /*
       * Two competing audited spans
       * overlap. Neither is exposed.
       */
      rejected.add(leftIndex);
      rejected.add(rightIndex);
    }
  }

  return deduped.filter(
    (_, index) =>
      !rejected.has(index),
  );
}

function parseReference(
  reference?: string,
) {
  if (!reference) {
    return null;
  }

  const match =
    reference.match(
      /^(.+?)\s+(\d+):(\d+)$/,
    );

  if (!match) {
    return null;
  }

  return {
    book: match[1],
    chapter:
      Number(match[2]),
    verse:
      Number(match[3]),
  };
}

function isFunctionWord(
  value: string,
) {
  return FUNCTION_WORDS.has(
    value.toLowerCase(),
  );
}

function sourceLabel(
  availability: BibleIQTokenAvailability,
) {
  if (
    availability.source ===
    "greek-nt"
  ) {
    return "Greek New Testament";
  }

  if (
    availability.source === "lxx"
  ) {
    return "Greek Septuagint";
  }

  return "Hebrew";
}

export default function ScriptureText({
  text,
  reference,
  tokenAvailability,
  readerRecordId,
  readerVerseLabel,
  verseNumber,
  focusedTokenIndex,
  interactionMode = "word",
}: {
  text: string;
  reference?: string;
  tokenAvailability?: BibleIQVerseTokenAvailability;
  readerRecordId?: string;
  readerVerseLabel?: string;
  verseNumber?: number;
  focusedTokenIndex?: number | null;
  interactionMode?: "word" | "plain";
}) {
  const router = useRouter();
  const pathname =
    usePathname();
  const searchParams =
    useSearchParams();

  const { sacredNames } =
    useSacredNames();

  const cleanedText =
    cleanVerseDisplayText(
      text,
    );

  const renderedText =
    sacredNames
      ? renderSacredNames(
          cleanedText,
          reference,
        )
      : cleanedText;

  if (
    interactionMode === "plain"
  ) {
    return <>{renderedText}</>;
  }

  const parsedReference =
    parseReference(reference);

  const displayPieces =
    buildDisplayPieces(
      renderedText,
      tokenAvailability,
    );

  const ownedSpans =
    buildOwnedSpans(
      displayPieces,
      tokenAvailability,
    );

  const spanByStart =
    new Map<number, OwnedSpan>(
      ownedSpans.map(
        (span) => [
          span.start,
          span,
        ],
      ),
    );

  function openWordStudy(
    span: OwnedSpan,
  ) {
    const params =
      new URLSearchParams(
        searchParams.toString(),
      );

    params.delete("study");
    params.delete("focusToken");

    params.set(
      "word",
      span.selectedText,
    );

    params.set(
      "displayTokenIndex",
      String(
        span.anchorTokenIndex,
      ),
    );

    params.set(
      "selectedText",
      span.selectedText,
    );

    params.set(
      "verseText",
      renderedText,
    );

    if (readerRecordId) {
      params.set(
        "readerRecordId",
        readerRecordId,
      );
    } else {
      params.delete(
        "readerRecordId",
      );
    }

    if (readerVerseLabel) {
      params.set(
        "readerVerseLabel",
        readerVerseLabel,
      );
    } else {
      params.delete(
        "readerVerseLabel",
      );
    }

    /*
     * Canonical routing comes from
     * readerRecordId + anchor token.
     * Never present a lexical/source ID
     * as the English text the reader
     * tapped.
     */
    params.delete("originalWord");

    params.delete("verse");

    if (
      verseNumber != null &&
      verseNumber > 0
    ) {
      params.set(
        "verse",
        String(verseNumber),
      );
    } else if (
      parsedReference?.verse
    ) {
      params.set(
        "verse",
        String(
          parsedReference.verse,
        ),
      );
    }

    router.replace(
      `${pathname}?${params.toString()}`,
      {
        scroll: false,
      },
    );
  }

  const output: ReactNode[] =
    [];

  let pieceIndex = 0;

  while (
    pieceIndex <
    displayPieces.length
  ) {
    const piece =
      displayPieces[pieceIndex];

    if (piece.kind === "text") {
      output.push(
        <span
          key={`text-${pieceIndex}`}
        >
          {piece.text}
        </span>,
      );

      pieceIndex += 1;
      continue;
    }

    const span =
      spanByStart.get(
        piece.tokenIndex,
      );

    if (!span) {
      output.push(
        <span
          key={`plain-${piece.tokenIndex}-${pieceIndex}`}
        >
          {piece.text}
        </span>,
      );

      pieceIndex += 1;
      continue;
    }

    let endPieceIndex =
      pieceIndex;

    let foundEnd = false;

    while (
      endPieceIndex <
      displayPieces.length
    ) {
      const endPiece =
        displayPieces[
          endPieceIndex
        ];

      if (
        endPiece.kind === "token" &&
        endPiece.tokenIndex ===
          span.end
      ) {
        foundEnd = true;
        break;
      }

      endPieceIndex += 1;
    }

    if (!foundEnd) {
      /*
       * Defensive fail-closed fallback.
       */
      output.push(
        <span
          key={`plain-${piece.tokenIndex}-${pieceIndex}`}
        >
          {piece.text}
        </span>,
      );

      pieceIndex += 1;
      continue;
    }

    const visibleText =
      displayPieces
        .slice(
          pieceIndex,
          endPieceIndex + 1,
        )
        .map(
          (item) => item.text,
        )
        .join("");

    const singleWord =
      span.start === span.end;

    const functionWord =
      singleWord &&
      isFunctionWord(
        span.selectedText,
      );

    const focused =
      focusedTokenIndex != null &&
      focusedTokenIndex >=
        span.start &&
      focusedTokenIndex <=
        span.end;

    output.push(
      <button
        key={`span-${span.start}-${span.end}-${span.anchorTokenIndex}`}
        type="button"
        data-word-token="true"
        data-word-span={
          singleWord
            ? undefined
            : "true"
        }
        data-span-start={
          span.start
        }
        data-span-end={
          span.end
        }
        data-word-kind={
          functionWord
            ? "function"
            : "lexical"
        }
        data-word-focused={
          focused
            ? "true"
            : undefined
        }
        aria-label={
          "Open source study for " +
          span.selectedText
        }
        title={
          "Study " +
          span.selectedText +
          " from its " +
          sourceLabel(
            span.availability,
          ) +
          " source"
        }
        onClick={(
          event: MouseEvent<HTMLButtonElement>,
        ) => {
          event.preventDefault();
          event.stopPropagation();
          openWordStudy(span);
        }}
        style={{
          textDecorationLine:
            "underline",
          textDecorationStyle:
            "dotted",
          textDecorationThickness:
            "1px",
          textUnderlineOffset:
            "3px",
          textDecorationColor:
            "var(--muted)",
        }}
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
        {visibleText}
      </button>,
    );

    pieceIndex =
      endPieceIndex + 1;
  }

  return <>{output}</>;
}
