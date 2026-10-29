import "server-only";

import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "../../supabase/server";
import { createSupabaseAdminClient } from "../../supabase/admin";

export function isSimpleEmetOwner(user: { id: string; email?: string; email_confirmed_at?: string } | null, expectedId?: string) {
  const owners = (process.env.EMET_OWNER_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  return process.env.EMET_SIMPLE_OWNER_ENABLED === "true" && Boolean(
    user?.id && (!expectedId || user.id === expectedId) && user.email_confirmed_at &&
    user.email && owners.includes(user.email.trim().toLowerCase()),
  );
}

export async function canUseSimpleEmet(expectedId?: string) {
  if (process.env.EMET_SIMPLE_OWNER_ENABLED !== "true") return false;
  try {
    const client = await createSupabaseServerClient();
    if (!client) return false;
    const { data, error } = await client.auth.getUser();
    return !error && isSimpleEmetOwner(data.user, expectedId);
  } catch { return false; }
}

export function simpleRequestKey(userId: string, requestId: string, model: string) {
  return `simple-emet@1:${createHash("sha256").update(JSON.stringify([userId, requestId, model])).digest("hex")}`;
}

export function simpleRateLockId(userId: string, now = Date.now()) {
  const hash = createHash("sha256").update(`simple-emet-rate@1:${userId}:${Math.floor(now / 10_000)}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

// Existing private request records provide durable idempotency and an atomic
// ten-second rate bucket. No answers or experimental claims enter normal caches.
export async function claimSimpleRequest(userId: string, requestId: string, key: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return "unavailable" as const;
  const prior = await admin.from("emet_question_requests").select("id").eq("user_id", userId).eq("request_id", requestId).maybeSingle();
  if (prior.error) return "unavailable" as const;
  if (prior.data) return "duplicate" as const;
  const pending = await admin.from("emet_question_requests").select("id").eq("user_id", userId)
    .eq("allowed", true).like("cache_key", "simple-emet@1:%").is("completed_at", null)
    .gte("created_at", new Date(Date.now() - 120_000).toISOString()).limit(1);
  if (pending.error) return "unavailable" as const;
  if (pending.data?.length) return "rate-limited" as const;
  const lock = await admin.from("emet_question_requests").insert({
    user_id: userId, request_id: simpleRateLockId(userId), cache_key: "simple-emet-rate@1", allowed: false, charged: false,
    completed_at: new Date().toISOString(),
  });
  if (lock.error) return lock.error.code === "23505" ? "rate-limited" as const : "unavailable" as const;
  const record = await admin.from("emet_question_requests").insert({ user_id: userId, request_id: requestId, cache_key: key, allowed: true, charged: false });
  if (record.error) return record.error.code === "23505" ? "duplicate" as const : "unavailable" as const;
  return "claimed" as const;
}
