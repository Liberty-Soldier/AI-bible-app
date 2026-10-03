import { NextResponse } from "next/server";

import { getEmetAiCacheKey } from "@/app/lib/emet/EmetAiCache";
import { parseEmetPreviousQuestions } from "@/app/lib/emet/EmetAiConversation";
import {
  completeEmetAiQuestion,
  getEmetAiUsageSummary,
  refundFailedEmetAiQuestion,
  reserveEmetAiQuestion,
} from "@/app/lib/emet/EmetAiQuota";
import {
  buildEmetAiTopicEvidence,
  type EmetAiReaderContext,
} from "@/app/lib/emet/EmetAiTopicEvidence";
import { answerFromEmetAiEvidence } from "@/app/lib/emet/EmetAiService";
import { createSupabaseEmetAiAnswerStore } from "@/app/lib/emet/EmetAiSupabaseStore";
import { createEmetAiOpenAiProvider } from "@/app/lib/emet/providers/EmetAiOpenAiProvider";
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
  const verse =
    typeof input.verse === "string" || typeof input.verse === "number"
      ? input.verse
      : null;

  if (
    !book ||
    !Number.isInteger(chapter) ||
    chapter < 1 ||
    !["web", "kjv", "brenton"].includes(translation)
  ) {
    return null;
  }

  return {
    book,
    chapter,
    verse,
    translation: translation as EmetAiReaderContext["translation"],
  };
}

function disabledResponse() {
  return json(
    {
      status: "disabled",
      answer: "EMET AI is not enabled yet.",
      limitations: ["Live answers remain disabled until the model is configured."],
    },
    503,
  );
}

export async function POST(request: Request) {
  if (process.env.EMET_LIVE_ENABLED !== "true") return disabledResponse();
  if (!(await getVerifiedSupabaseUserId())) {
    return json({ status: "authentication-required" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ status: "invalid-request" }, 400);
  }

  const question = clean(body.question);
  const requestId = clean(body.requestId, 64);
  const previousQuestions = parseEmetPreviousQuestions(body.previousQuestions);
  const context = body.context === undefined ? null : parseContext(body.context);
  if (
    !question ||
    !requestId ||
    previousQuestions === null ||
    (body.context !== undefined && !context)
  ) {
    return json({ status: "invalid-request" }, 400);
  }

  const evidence = buildEmetAiTopicEvidence({
    question,
    previousQuestions,
    context,
  });
  if (evidence.status !== "ready") {
    return json(
      {
        status: "insufficient-evidence",
        answer: "The available Scripture evidence cannot support a reliable answer.",
        limitations: evidence.limitations,
      },
      422,
    );
  }

  const store = createSupabaseEmetAiAnswerStore(evidence.packet);
  if (!store) return disabledResponse();

  const cacheKey = getEmetAiCacheKey(evidence.packet);
  const provider = createEmetAiOpenAiProvider();
  if (!provider && !(await store.get(cacheKey))) return disabledResponse();

  const quota = await reserveEmetAiQuestion(requestId, cacheKey);
  if (!quota) return json({ status: "usage-unavailable" }, 503);
  if (!quota.allowed) {
    return json({ status: "quota-exhausted", usage: quota }, 429);
  }

  const result = await answerFromEmetAiEvidence({
    packet: evidence.packet,
    store,
    provider: provider || undefined,
    allowLive: Boolean(provider),
  });

  let responseUsage: unknown = quota;
  if (result.source === "fail-closed") {
    await refundFailedEmetAiQuestion(requestId);
    responseUsage = (await getEmetAiUsageSummary()) || quota;
  } else {
    await completeEmetAiQuestion(requestId, result.source);
  }

  return json({
    status: result.answer.status,
    answer: result.answer,
    source: result.source,
    usage: responseUsage,
  });
}
