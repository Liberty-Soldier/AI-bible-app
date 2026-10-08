import { NextResponse } from "next/server";

import { getEmetAiRequestCacheKey } from "@/app/lib/emet/EmetAiCache";
import {
  parseEmetConversationContext,
  relevantEmetConversation,
  withAuthoritativeEmetClaims,
} from "@/app/lib/emet/EmetAiConversation";
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
import {
  createSupabaseEmetAiAnswerStore,
  appendSupabaseEmetConversationLedger,
  emetConversationClaimsFromAnswer,
  getSupabaseEmetConversationLedger,
  getSupabaseEmetAiRequestCache,
  setSupabaseEmetAiRequestCache,
} from "@/app/lib/emet/EmetAiSupabaseStore";
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

function cleanUuid(value: unknown) {
  const uuid = clean(value, 64);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)
    ? uuid
    : "";
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
  const userId = await getVerifiedSupabaseUserId();
  if (!userId) {
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
  const conversationId = cleanUuid(body.conversationId);
  const conversation = parseEmetConversationContext(body.conversation);
  const context = body.context === undefined ? null : parseContext(body.context);
  if (
    !question ||
    !requestId ||
    !conversationId ||
    conversation === null ||
    (body.context !== undefined && !context)
  ) {
    return json({ status: "invalid-request" }, 400);
  }

  const ledger = await getSupabaseEmetConversationLedger({
    userId,
    conversationId,
  });
  if (!ledger) {
    return json({ status: "reasoning-ledger-unavailable" }, 503);
  }
  const authoritativeConversation = withAuthoritativeEmetClaims(
    conversation,
    ledger,
  );

  const activeConversation = relevantEmetConversation({
    question,
    conversation: authoritativeConversation,
  });

  const provider = createEmetAiOpenAiProvider();
  const requestCacheKey = getEmetAiRequestCacheKey({
    question,
    conversation: activeConversation,
    context,
  });
  const requestCache = await getSupabaseEmetAiRequestCache(requestCacheKey);
  if (!provider && !requestCache) return disabledResponse();

  const quota = await reserveEmetAiQuestion(requestId, requestCacheKey);
  if (!quota) return json({ status: "usage-unavailable" }, 503);
  if (!quota.allowed) {
    return json({ status: "quota-exhausted", usage: quota }, 429);
  }

  if (requestCache) {
    const ledgerSaved = await appendSupabaseEmetConversationLedger({
      userId,
      conversationId,
      claims: emetConversationClaimsFromAnswer(requestCache.answer),
    });
    if (!ledgerSaved) {
      await refundFailedEmetAiQuestion(requestId);
      return json({ status: "reasoning-ledger-unavailable" }, 503);
    }
    await completeEmetAiQuestion(requestId, "cache");
    return json({
      status: requestCache.answer.status,
      answer: requestCache.answer,
      source: "cache",
      usage: quota,
    });
  }

  let retrievalPlan = null;
  try {
    retrievalPlan = provider?.plan
      ? await provider.plan({
          question,
          // Keep recent dialogue available for references such as "the first
          // question". Evidence and established claims remain independently
          // topic-filtered below so an unrelated prior study cannot control a
          // new question.
          conversation: authoritativeConversation,
          context,
        })
      : null;
  } catch (error) {
    console.error("EMET retrieval planning failed.", {
      error: error instanceof Error ? error.message : String(error),
    });
    retrievalPlan = null;
  }

  const evidence = buildEmetAiTopicEvidence({
    question,
    conversation: activeConversation,
    context,
    retrievalPlan,
    requireSemanticPlan: true,
  });
  if (evidence.status !== "ready") {
    await refundFailedEmetAiQuestion(requestId);
    return json(
      {
        status: "insufficient-evidence",
        answer: "I couldn't assemble enough directly relevant Scripture to answer that reliably.",
        limitations: evidence.limitations,
        usage: (await getEmetAiUsageSummary()) || quota,
      },
      422,
    );
  }

  const store = createSupabaseEmetAiAnswerStore(evidence.packet);
  if (!store || !provider) {
    await refundFailedEmetAiQuestion(requestId);
    return disabledResponse();
  }

  const result = await answerFromEmetAiEvidence({
    packet: evidence.packet,
    store,
    provider,
    allowLive: true,
  });

  let responseUsage: unknown = quota;
  if (result.source === "fail-closed") {
    await refundFailedEmetAiQuestion(requestId);
    responseUsage = (await getEmetAiUsageSummary()) || quota;
  } else {
    const ledgerSaved = await appendSupabaseEmetConversationLedger({
      userId,
      conversationId,
      claims: emetConversationClaimsFromAnswer(result.answer),
    });
    if (!ledgerSaved) {
      await refundFailedEmetAiQuestion(requestId);
      return json({ status: "reasoning-ledger-unavailable" }, 503);
    }
    await completeEmetAiQuestion(requestId, result.source);
    if (result.answer.status === "complete") {
      await setSupabaseEmetAiRequestCache({
        key: requestCacheKey,
        packet: evidence.packet,
        answer: result.answer,
        model: provider.model,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return json({
    status: result.answer.status,
    answer: result.answer,
    source: result.source,
    usage: responseUsage,
  });
}
