import { NextResponse } from "next/server";

import type { BibleIQTranslation } from "@/app/data/lexicon/BibleIQTypes";
import { getEmetAiCacheKey } from "@/app/lib/emet/EmetAiCache";
import {
  buildEmetConversationQuestion,
  parseEmetConversationContext,
  relevantEmetConversation,
  withAuthoritativeEmetClaims,
} from "@/app/lib/emet/EmetAiConversation";
import { buildEmetAiWordEvidence } from "@/app/lib/emet/EmetAiEvidenceBuilder";
import {
  completeEmetAiQuestion,
  getEmetAiUsageSummary,
  refundFailedEmetAiQuestion,
  reserveEmetAiQuestion,
} from "@/app/lib/emet/EmetAiQuota";
import { createEmetAiVerseLoader } from "@/app/lib/emet/EmetAiScriptureRuntime";
import { answerFromEmetAiEvidence } from "@/app/lib/emet/EmetAiService";
import { createEmetAiPerformanceTrace } from "@/app/lib/emet/EmetAiPerformance";
import {
  appendSupabaseEmetConversationLedger,
  createSupabaseEmetAiAnswerStore,
  emetConversationClaimsFromAnswer,
  getSupabaseEmetConversationLedger,
} from "@/app/lib/emet/EmetAiSupabaseStore";
import {
  resolveEmetAiReaderWord,
  type EmetAiReaderWordContext,
} from "@/app/lib/emet/EmetAiWordContext";
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

function disabledResponse() {
  return json(
    {
      status: "disabled",
      answer: "EMET AI is not enabled yet.",
      citations: [],
      limitations: [
        "Live AI requires configured authentication, durable storage, and usage controls.",
      ],
    },
    503,
  );
}

function clean(value: unknown, maxLength = 1000) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function finiteInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) ? number : -1;
}

function cleanUuid(value: unknown) {
  const uuid = clean(value, 64);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)
    ? uuid
    : "";
}

function parseContext(value: unknown): EmetAiReaderWordContext | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const translation = clean(input.translation, 16) as BibleIQTranslation;
  const context: EmetAiReaderWordContext = {
    book: clean(input.book, 80),
    chapter: finiteInteger(input.chapter),
    verse: finiteInteger(input.verse),
    translation,
    displayWord: clean(input.displayWord, 200),
    displayTokenIndex:
      input.displayTokenIndex === undefined
        ? undefined
        : finiteInteger(input.displayTokenIndex),
    readerRecordId: clean(input.readerRecordId, 200) || undefined,
    verseText: clean(input.verseText, 5000) || undefined,
    entityId: clean(input.entityId, 200) || undefined,
    sourceOccurrenceId: clean(input.sourceOccurrenceId, 300) || undefined,
    sourceLexicalId: clean(input.sourceLexicalId, 80) || undefined,
    sourceCorpus: clean(input.sourceCorpus, 20) as EmetAiReaderWordContext["sourceCorpus"],
    sourceResolutionAuthority:
      clean(input.sourceResolutionAuthority, 200) || undefined,
    sourceResolutionMethod: clean(input.sourceResolutionMethod, 200) || undefined,
  };

  const hasDisplayRoute =
    context.displayTokenIndex !== undefined && context.displayTokenIndex >= 0;
  const hasSourceRoute = Boolean(
    context.entityId &&
      context.sourceOccurrenceId &&
      context.sourceLexicalId &&
      context.sourceCorpus &&
      context.sourceResolutionAuthority &&
      context.sourceResolutionMethod,
  );

  if (
    !context.book ||
    context.chapter < 1 ||
    context.verse < 1 ||
    !context.displayWord ||
    !["web", "kjv", "brenton"].includes(context.translation) ||
    !["hebrew", "greek-nt", "lxx", undefined].includes(context.sourceCorpus) ||
    (!hasDisplayRoute && !hasSourceRoute)
  ) {
    return null;
  }

  return context;
}

export async function GET() {
  return process.env.EMET_LIVE_ENABLED === "true"
    ? json({ status: "authentication-required" }, 401)
    : disabledResponse();
}

export async function POST(request: Request) {
  if (process.env.EMET_LIVE_ENABLED !== "true") {
    return disabledResponse();
  }

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
  const context = parseContext(body.context);
  if (!question || !requestId || !conversationId || conversation === null || !context) {
    return json({ status: "invalid-request" }, 400);
  }
  const performanceTrace = createEmetAiPerformanceTrace();
  const ledger = await performanceTrace.measureAsync("ledger", () =>
    getSupabaseEmetConversationLedger({ userId, conversationId }),
  );
  if (!ledger) {
    return json({ status: "reasoning-ledger-unavailable" }, 503);
  }
  const authoritativeConversation = withAuthoritativeEmetClaims(
    conversation,
    ledger,
  );

  const url = new URL(request.url);
  const forwardedHeaders: Record<string, string> = {};
  const cookie = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  if (cookie) forwardedHeaders.cookie = cookie;
  if (authorization) forwardedHeaders.authorization = authorization;

  const wordStudy = await performanceTrace.measureAsync("retrieval", () =>
    resolveEmetAiReaderWord({
      context,
      origin: url.origin,
      requestHeaders: forwardedHeaders,
    }),
  );
  if (!wordStudy) {
    return json(
      {
        status: "insufficient-evidence",
        answer: "Gloss unavailable.",
        limitations: [
          "The source occurrence has no unique canonical lexical identity.",
        ],
      },
      422,
    );
  }

  const evidence = await performanceTrace.measureAsync("retrieval", () =>
    buildEmetAiWordEvidence({
      question: buildEmetConversationQuestion({
        question,
        conversation: relevantEmetConversation({
          question,
          conversation: authoritativeConversation,
        }),
      }),
      wordStudy,
      loadVerse: createEmetAiVerseLoader(url.origin, forwardedHeaders),
    }),
  );
  if (evidence.status !== "ready") {
    return json(
      {
        status: "insufficient-evidence",
        answer: "The available evidence cannot support a reliable answer.",
        limitations: evidence.limitations,
      },
      422,
    );
  }

  const store = createSupabaseEmetAiAnswerStore(evidence.packet);
  if (!store) return disabledResponse();

  const cacheKey = getEmetAiCacheKey(evidence.packet);
  const provider = createEmetAiOpenAiProvider({
    performanceObserver: performanceTrace.observer,
  });
  if (!provider && !(await store.get(cacheKey))) return disabledResponse();

  const quota = await reserveEmetAiQuestion(requestId, cacheKey);
  if (!quota) {
    return json({ status: "usage-unavailable" }, 503);
  }
  if (!quota.allowed) {
    return json({ status: "quota-exhausted", usage: quota }, 429);
  }

  const result = await answerFromEmetAiEvidence({
    packet: evidence.packet,
    store,
    provider: provider || undefined,
    allowLive: Boolean(provider),
    performanceObserver: performanceTrace.observer,
  });
  let responseUsage: unknown = quota;
  if (result.source === "fail-closed") {
    await refundFailedEmetAiQuestion(requestId);
    responseUsage = (await getEmetAiUsageSummary()) || quota;
  } else {
    const ledgerSaved = await performanceTrace.measureAsync("storage", () =>
      appendSupabaseEmetConversationLedger({
        userId,
        conversationId,
        claims: emetConversationClaimsFromAnswer(result.answer),
      }),
    );
    if (!ledgerSaved) {
      await refundFailedEmetAiQuestion(requestId);
      return json({ status: "reasoning-ledger-unavailable" }, 503);
    }
    await completeEmetAiQuestion(requestId, result.source);
  }

  performanceTrace.report({ source: result.source, fastPath: false, wordStudy: true });
  return json({
    status: result.answer.status,
    answer: result.answer,
    source: result.source,
    usage: responseUsage,
  });
}
