import { NextResponse } from "next/server";

import {
  parseEmetConversationContext,
  relevantEmetConversation,
} from "@/app/lib/emet/EmetAiConversation";
import {
  buildEmetAiInitialScriptureEvidence,
  type EmetAiReaderContext,
} from "@/app/lib/emet/EmetAiTopicEvidence";
import { getVerifiedSupabaseUserId } from "@/app/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders });
}

function clean(value: unknown, maxLength = 800) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseContext(value: unknown): EmetAiReaderContext | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const book = clean(input.book, 80);
  const chapter = Number(input.chapter);
  const translation = clean(input.translation, 16);
  const verse = typeof input.verse === "string" || typeof input.verse === "number"
    ? input.verse
    : null;
  if (
    !book ||
    !Number.isInteger(chapter) ||
    chapter < 1 ||
    !["web", "kjv", "brenton"].includes(translation)
  ) return null;
  return {
    book,
    chapter,
    verse,
    translation: translation as EmetAiReaderContext["translation"],
  };
}

export async function POST(request: Request) {
  if (process.env.EMET_LIVE_ENABLED !== "true") {
    return json({ status: "disabled", items: [] }, 503);
  }
  if (!await getVerifiedSupabaseUserId()) {
    return json({ status: "authentication-required", items: [] }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ status: "invalid-request", items: [] }, 400);
  }
  const question = clean(body.question);
  const conversation = parseEmetConversationContext(body.conversation);
  const context = body.context === undefined ? null : parseContext(body.context);
  if (!question || conversation === null || (body.context !== undefined && !context)) {
    return json({ status: "invalid-request", items: [] }, 400);
  }

  const startedAt = performance.now();
  const activeConversation = relevantEmetConversation({ question, conversation });
  const result = buildEmetAiInitialScriptureEvidence({
    question,
    conversation: activeConversation,
    context,
    limit: 5,
  });
  return json({
    ...result,
    retrievalMs: Math.round((performance.now() - startedAt) * 10) / 10,
  });
}
