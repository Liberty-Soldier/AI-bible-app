import { NextRequest, NextResponse } from "next/server";

import {
  isSourceBreakdownTranslation,
  resolveSourceBreakdown,
} from "@/app/data/bibleiq/SourceBreakdownRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: HEADERS,
  });
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const translation = params.get("translation")?.toLowerCase();
    const book = params.get("book")?.trim() || "";
    const chapter = Number(params.get("chapter"));
    const verse = params.get("verse")?.trim() || "";

    if (!isSourceBreakdownTranslation(translation)) {
      return json(
        {
          resolved: false,
          error: "translation must be web, kjv, or brenton",
        },
        400
      );
    }

    if (!book || !Number.isFinite(chapter) || chapter < 1 || !verse) {
      return json(
        {
          resolved: false,
          error: "book, chapter, and verse are required",
        },
        400
      );
    }

    const runtimeHeaders: Record<string, string> = {};

    const cookie = request.headers.get("cookie");
    const authorization = request.headers.get("authorization");

    if (cookie) {
      runtimeHeaders.cookie = cookie;
    }

    if (authorization) {
      runtimeHeaders.authorization = authorization;
    }

    const result = await resolveSourceBreakdown({
      origin: request.nextUrl.origin,
      translation,
      book,
      chapter,
      verse,
      requestHeaders: runtimeHeaders,
    });

    if (!result) {
      return json(
        {
          resolved: false,
          translation,
          book,
          chapter,
          verse,
          error: "No Phase-1 source ownership exists for this verse.",
        },
        404
      );
    }

    return json(result);
  } catch (error) {
    console.error("[source-breakdown]", error);

    return json(
      {
        resolved: false,
        error: "Source Breakdown could not be loaded.",
      },
      500
    );
  }
}
