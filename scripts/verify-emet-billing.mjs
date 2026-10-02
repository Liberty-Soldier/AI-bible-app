import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  parseRevenueCatBillingUpdate,
  verifyRevenueCatWebhookSignature,
} from "../app/lib/billing/RevenueCatWebhook.ts";

const root = process.cwd();
const rawBody = JSON.stringify({ event: { id: "evt_test" } });
const secret = "test-webhook-secret";
const timestamp = 1_800_000_000;
const signature = createHmac("sha256", secret)
  .update(`${timestamp}.${rawBody}`)
  .digest("hex");

assert.equal(
  verifyRevenueCatWebhookSignature({
    rawBody,
    signatureHeader: `t=${timestamp},v1=${signature}`,
    secret,
    nowSeconds: timestamp + 10,
  }),
  true,
);
assert.equal(
  verifyRevenueCatWebhookSignature({
    rawBody,
    signatureHeader: `t=${timestamp},v1=wrong`,
    secret,
    nowSeconds: timestamp,
  }),
  false,
);
assert.equal(
  verifyRevenueCatWebhookSignature({
    rawBody,
    signatureHeader: `t=${timestamp},v1=${signature}`,
    secret,
    nowSeconds: timestamp + 301,
  }),
  false,
);

const userId = "123e4567-e89b-42d3-a456-426614174000";
function payload(overrides = {}) {
  return {
    api_version: "1.0",
    event: {
      id: "evt_1",
      type: "INITIAL_PURCHASE",
      event_timestamp_ms: 1_800_000_000_000,
      app_user_id: userId,
      entitlement_ids: ["emet_starter"],
      product_id: "emetsees.starter.monthly",
      period_type: "NORMAL",
      expiration_at_ms: 1_802_678_400_000,
      store: "APP_STORE",
      environment: "SANDBOX",
      ...overrides,
    },
  };
}

const purchase = parseRevenueCatBillingUpdate(payload());
assert.equal(purchase?.userId, userId);
assert.equal(purchase?.planCode, "starter");
assert.equal(purchase?.subscriptionStatus, "active");
assert.equal(purchase?.willRenew, true);

const trial = parseRevenueCatBillingUpdate(payload({ period_type: "TRIAL" }));
assert.equal(trial?.subscriptionStatus, "trialing");

const cancellation = parseRevenueCatBillingUpdate(
  payload({ type: "CANCELLATION" }),
);
assert.equal(cancellation?.planCode, "starter");
assert.equal(cancellation?.subscriptionStatus, "active");
assert.equal(cancellation?.willRenew, false);

const expiration = parseRevenueCatBillingUpdate(
  payload({ type: "EXPIRATION", entitlement_ids: [] }),
);
assert.equal(expiration?.planCode, "free");
assert.equal(expiration?.subscriptionStatus, "canceled");
assert.equal(expiration?.willRenew, false);

assert.equal(
  parseRevenueCatBillingUpdate(
    payload({ entitlement_ids: ["unrelated_entitlement"] }),
  ),
  null,
);
assert.equal(
  parseRevenueCatBillingUpdate(payload({ app_user_id: "$RCAnonymousID:test" })),
  null,
);

const route = fs.readFileSync(
  path.join(root, "app/api/billing/revenuecat/route.ts"),
  "utf8",
);
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20261002173000_emet_billing_entitlements.sql",
  ),
  "utf8",
);

assert.match(route, /await request\.text\(\)/);
assert.match(route, /x-revenuecat-webhook-signature/);
assert.match(route, /REVENUECAT_WEBHOOK_SECRET/);
assert.match(route, /apply_emet_billing_event/);
assert.match(migration, /primary key \(provider, event_id\)/i);
assert.match(migration, /billing_event_at <= p_event_at/i);
assert.match(migration, /greatest\(v_limit, questions_used\)/i);
assert.match(
  migration,
  /revoke all on table public\.emet_billing_events from public, anon, authenticated/i,
);
assert.match(
  migration,
  /grant execute on function public\.apply_emet_billing_event[\s\S]*to service_role/i,
);

console.log("EMET billing entitlement verification passed.");
console.log("- RevenueCat webhooks require a fresh, valid HMAC signature.");
console.log("- Supabase UUIDs are the only accepted customer identities.");
console.log("- Stable entitlement IDs map to EMET plans without trusting product IDs.");
console.log("- Cancellation preserves access until expiration; expiration fails back to Free.");
console.log("- Billing events are idempotent and stale events cannot overwrite newer state.");
