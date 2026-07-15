import { NextResponse } from "next/server";
import { BibleIQEngine } from "@/app/data/lexicon/BibleIQEngine";
import type { BibleIQRequest } from "@/app/data/lexicon/BibleIQTypes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toNumber(value: string | null, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  try {
    const { searchParams, origin } = new URL(request.url);

    const input: BibleIQRequest = {
      book: searchParams.get("book") || "",
      chapter: toNumber(searchParams.get("chapter")),
      verse: toNumber(searchParams.get("verse")),
      translation: searchParams.get("translation") || "",
      displayWord:
        searchParams.get("displayWord") ||
        searchParams.get("q") ||
        "",
      displayTokenIndex: toNumber(
        searchParams.get("displayTokenIndex"),
        -1,
      ),
      originalWord:
        searchParams.get("originalWord") || undefined,
      selectedText:
        searchParams.get("selectedText") || undefined,
      verseText: searchParams.get("verseText") || undefined,
    };

    const result = await BibleIQEngine.resolve(input, origin);

    return NextResponse.json(result);
  } catch (error) {
    console.error("SEE word-study route failed:", error);

    return NextResponse.json(
      {
        resolved: false,
        resolutionType: "error",
        preferredSource: "hebrew",
        query: "",
        message:
          "SEE could not complete this word study request.",
      },
      { status: 500 },
    );
  }
}
