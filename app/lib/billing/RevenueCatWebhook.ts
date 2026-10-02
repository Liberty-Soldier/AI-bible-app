import { createHmac, timingSafeEqual } from "node:crypto";

export const EMET_REVENUECAT_ENTITLEMENTS = {
  emet_lite: "lite",
  emet_starter: "starter",
  emet_study: "study",
  emet_deep_study: "deep-study",
} as const;

type EmetPlanCode = (typeof EMET_REVENUECAT_ENTITLEMENTS)[keyof typeof EMET_REVENUECAT_ENTITLEMENTS];

export type RevenueCatBillingUpdate = {
  eventId: string;
  eventType: string;
  eventAt: string;
  userId: string;
  planCode: EmetPlanCode | "free";
  subscriptionStatus: "trialing" | "active" | "canceled";
  entitlementId: string | null;
  productId: string | null;
  store: string | null;
  environment: string | null;
  expiresAt: string | null;
  willRenew: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVOKING_EVENTS = new Set(["EXPIRATION", "REFUND"]);
const NON_RENEWING_EVENTS = new Set(["CANCELLATION", "EXPIRATION", "REFUND"]);

function cleanString(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validDateFromMilliseconds(value: unknown) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  const date = new Date(milliseconds);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function secureEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export function verifyRevenueCatWebhookSignature({
  rawBody,
  signatureHeader,
  secret,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
}: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}) {
  if (!secret || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const separator = part.indexOf("=");
      return separator > 0
        ? [part.slice(0, separator).trim(), part.slice(separator + 1).trim()]
        : ["", ""];
    }),
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1 || "";
  if (!Number.isInteger(timestamp) || !signature) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return secureEqual(expected, signature);
}

function findUserId(event: Record<string, unknown>) {
  const candidates = [
    event.app_user_id,
    event.original_app_user_id,
    ...(Array.isArray(event.aliases) ? event.aliases : []),
  ];
  for (const candidate of candidates) {
    const value = cleanString(candidate, 100);
    if (UUID_PATTERN.test(value)) return value;
  }
  return null;
}

function resolveEntitlement(event: Record<string, unknown>) {
  const candidates = [
    ...(Array.isArray(event.entitlement_ids) ? event.entitlement_ids : []),
    event.entitlement_id,
  ];
  for (const candidate of candidates) {
    const entitlement = cleanString(candidate, 100);
    if (entitlement in EMET_REVENUECAT_ENTITLEMENTS) {
      return entitlement as keyof typeof EMET_REVENUECAT_ENTITLEMENTS;
    }
  }
  return null;
}

export function parseRevenueCatBillingUpdate(
  payload: unknown,
): RevenueCatBillingUpdate | null {
  if (!payload || typeof payload !== "object") return null;
  const eventValue = (payload as Record<string, unknown>).event;
  if (!eventValue || typeof eventValue !== "object") return null;
  const event = eventValue as Record<string, unknown>;

  const eventId = cleanString(event.id, 160);
  const eventType = cleanString(event.type, 80).toUpperCase();
  const userId = findUserId(event);
  const eventAt = validDateFromMilliseconds(event.event_timestamp_ms);
  if (!eventId || !eventType || !userId || !eventAt) return null;

  const entitlementId = resolveEntitlement(event);
  const revoking = REVOKING_EVENTS.has(eventType);
  if (!entitlementId && !revoking) return null;

  const periodType = cleanString(event.period_type, 40).toUpperCase();
  return {
    eventId,
    eventType,
    eventAt,
    userId,
    planCode: revoking
      ? "free"
      : EMET_REVENUECAT_ENTITLEMENTS[entitlementId!],
    subscriptionStatus: revoking
      ? "canceled"
      : periodType === "TRIAL"
        ? "trialing"
        : "active",
    entitlementId: revoking ? null : entitlementId,
    productId: cleanString(event.new_product_id || event.product_id, 160) || null,
    store: cleanString(event.store, 80) || null,
    environment: cleanString(event.environment, 40) || null,
    expiresAt: validDateFromMilliseconds(event.expiration_at_ms),
    willRenew: !NON_RENEWING_EVENTS.has(eventType),
  };
}
