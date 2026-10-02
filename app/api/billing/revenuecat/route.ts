import { NextResponse } from "next/server";

import {
  parseRevenueCatBillingUpdate,
  verifyRevenueCatWebhookSignature,
} from "@/app/lib/billing/RevenueCatWebhook";
import { createSupabaseAdminClient } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

export async function POST(request: Request) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET?.trim();
  if (!secret) return json({ status: "billing-not-configured" }, 503);

  const rawBody = await request.text();
  const signature = request.headers.get("x-revenuecat-webhook-signature");
  if (
    !verifyRevenueCatWebhookSignature({
      rawBody,
      signatureHeader: signature,
      secret,
    })
  ) {
    return json({ status: "invalid-signature" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ status: "invalid-payload" }, 400);
  }

  const update = parseRevenueCatBillingUpdate(payload);
  if (!update) return json({ status: "ignored" });

  const admin = createSupabaseAdminClient();
  if (!admin) return json({ status: "billing-not-configured" }, 503);

  const { data, error } = await admin.rpc("apply_emet_billing_event", {
    p_provider: "revenuecat",
    p_event_id: update.eventId,
    p_event_type: update.eventType,
    p_event_at: update.eventAt,
    p_user_id: update.userId,
    p_plan_code: update.planCode,
    p_subscription_status: update.subscriptionStatus,
    p_entitlement_id: update.entitlementId,
    p_product_id: update.productId,
    p_store: update.store,
    p_environment: update.environment,
    p_expires_at: update.expiresAt,
    p_will_renew: update.willRenew,
  });

  if (error) {
    console.error("EMET billing event failed.", {
      code: error.code,
      message: error.message,
      eventId: update.eventId,
    });
    return json({ status: "billing-update-failed" }, 503);
  }

  return json({
    status:
      data === "duplicate" || data === "stale" ? data : "processed",
  });
}
