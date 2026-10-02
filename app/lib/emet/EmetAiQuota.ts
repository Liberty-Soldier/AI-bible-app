import "server-only";

import { createSupabaseAdminClient } from "../supabase/admin";
import {
  createSupabaseServerClient,
  getVerifiedSupabaseUser,
  getVerifiedSupabaseUserId,
} from "../supabase/server";

export type EmetAiQuotaReservation = {
  allowed: boolean;
  charged: boolean;
  unlimited: boolean;
  questionLimit: number;
  questionsUsed: number;
  questionsRemaining: number;
  resetsAt: string;
};

export type EmetAiUsageSummary = {
  planCode: string;
  planName: string;
  unlimited: boolean;
  questionLimit: number;
  questionsUsed: number;
  questionsRemaining: number;
  resetsAt: string;
};

export type EmetAiPlanSummary = {
  code: string;
  name: string;
  monthlyQuestionLimit: number;
  monthlyPriceCents: number;
};

const OWNER_PLAN_NAME = "Owner";

function currentPeriodEnd() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString();
}

function ownerEmails() {
  return new Set(
    (process.env.EMET_OWNER_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isOwnerEmail(email: string | null) {
  return Boolean(email && ownerEmails().has(email.trim().toLowerCase()));
}

function finiteInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

export async function getEmetAiUsageSummary(): Promise<EmetAiUsageSummary | null> {
  const user = await getVerifiedSupabaseUser();
  const userId = user?.id;
  const client = await createSupabaseServerClient();
  if (!userId || !client) return null;

  if (isOwnerEmail(user.email)) {
    return {
      planCode: "owner",
      planName: OWNER_PLAN_NAME,
      unlimited: true,
      questionLimit: 0,
      questionsUsed: 0,
      questionsRemaining: 0,
      resetsAt: currentPeriodEnd(),
    };
  }

  const [{ data: account }, { data: plans }, { data: usage }] = await Promise.all([
    client
      .from("emet_accounts")
      .select("plan_code, subscription_status")
      .eq("user_id", userId)
      .maybeSingle(),
    client
      .from("emet_plans")
      .select("code, name, monthly_question_limit")
      .eq("active", true),
    client
      .from("emet_usage_periods")
      .select("question_limit, questions_used")
      .eq("user_id", userId)
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const effectivePlanCode =
    account?.subscription_status === "active" ||
    account?.subscription_status === "trialing"
      ? account.plan_code
      : "free";
  const plan = plans?.find((item) => item.code === effectivePlanCode);
  const questionLimit = finiteInteger(
    usage?.question_limit ?? plan?.monthly_question_limit ?? 5,
  );
  const questionsUsed = finiteInteger(usage?.questions_used);

  return {
    planCode: effectivePlanCode,
    planName: plan?.name || "Free",
    unlimited: false,
    questionLimit,
    questionsUsed,
    questionsRemaining: Math.max(questionLimit - questionsUsed, 0),
    resetsAt: currentPeriodEnd(),
  };
}

export async function getEmetAiPlanSummaries(): Promise<EmetAiPlanSummary[]> {
  const client = await createSupabaseServerClient();
  if (!client) return [];

  const { data, error } = await client
    .from("emet_plans")
    .select("code, name, monthly_question_limit, monthly_price_cents")
    .eq("active", true)
    .order("monthly_price_cents", { ascending: true });

  if (error || !data) return [];
  return data.map((plan) => ({
    code: plan.code,
    name: plan.name,
    monthlyQuestionLimit: finiteInteger(plan.monthly_question_limit),
    monthlyPriceCents: finiteInteger(plan.monthly_price_cents),
  }));
}

export async function reserveEmetAiQuestion(
  requestId: string,
  cacheKey: string,
): Promise<EmetAiQuotaReservation | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return null;
  }
  if (!cacheKey.trim()) return null;

  const user = await getVerifiedSupabaseUser();
  const client = await createSupabaseServerClient();
  if (!client || !user) return null;

  if (isOwnerEmail(user.email)) {
    return {
      allowed: true,
      charged: false,
      unlimited: true,
      questionLimit: 0,
      questionsUsed: 0,
      questionsRemaining: 0,
      resetsAt: currentPeriodEnd(),
    };
  }

  const { data, error } = await client.rpc("reserve_emet_question", {
    p_request_id: requestId,
    p_cache_key: cacheKey,
  });
  const result = Array.isArray(data) ? data[0] : null;

  if (error) {
    console.error("EMET quota reservation failed.", {
      code: error.code,
      message: error.message,
    });
    return null;
  }
  if (!result) {
    console.error("EMET quota reservation returned no result.");
    return null;
  }

  return {
    allowed: result.allowed === true,
    charged: result.charged === true,
    unlimited: false,
    questionLimit: finiteInteger(result.question_limit),
    questionsUsed: finiteInteger(result.questions_used),
    questionsRemaining: finiteInteger(result.questions_remaining),
    resetsAt: currentPeriodEnd(),
  };
}

export async function completeEmetAiQuestion(
  requestId: string,
  resultSource: "cache" | "model" | "fail-closed",
) {
  const userId = await getVerifiedSupabaseUserId();
  const admin = createSupabaseAdminClient();
  if (!userId || !admin) return false;

  const { error } = await admin
    .from("emet_question_requests")
    .update({
      result_source: resultSource,
      completed_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .eq("allowed", true);

  return !error;
}

export async function refundFailedEmetAiQuestion(requestId: string) {
  const client = await createSupabaseServerClient();
  if (!client || !(await getVerifiedSupabaseUserId())) return false;

  const { data, error } = await client.rpc("refund_failed_emet_question", {
    p_request_id: requestId,
  });

  return !error && data === true;
}
