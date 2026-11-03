import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "./server";

const lifetime = 10 * 60;
const cookieName = process.env.NODE_ENV === "production" ? "__Host-emet-recovery" : "emet-recovery";
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

function signature(payload: string) {
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key) return null;
  return createHmac("sha256", key).update(`emet-password-recovery-v1:${payload}`).digest("base64url");
}

async function identity() {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const verified = await client.auth.getClaims();
  const claims = verified.data?.claims;
  if (verified.error || claims?.sub !== data.user.id || typeof claims.session_id !== "string") return null;
  return { client, user: data.user, session: claims.session_id };
}

// Called only after Supabase has consumed a recovery token or recovery PKCE code.
// Bind the short-lived grant to the verified user, session and user revision.
export async function issueRecoveryGrant(expectedUser: string) {
  const current = await identity();
  if (!current || current.user.id !== expectedUser) return false;
  const payload = Buffer.from(JSON.stringify({ user: current.user.id, session: current.session,
    revision: current.user.updated_at, expires: Math.floor(Date.now() / 1000) + lifetime })).toString("base64url");
  const mac = signature(payload);
  if (!mac) return false;
  (await cookies()).set(cookieName, `${payload}.${mac}`, { ...cookieOptions, maxAge: lifetime });
  return true;
}

export async function recoverySession() {
  try {
    const value = (await cookies()).get(cookieName)?.value;
    if (!value || value.length > 2048) return null;
    const [payload, mac, extra] = value.split(".");
    const expected = signature(payload);
    if (extra || !mac || !expected || mac.length !== expected.length ||
      !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
    const grant = JSON.parse(Buffer.from(payload, "base64url").toString());
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(grant.expires) || grant.expires <= now || grant.expires > now + lifetime) return null;
    const current = await identity();
    if (!current || grant.user !== current.user.id || grant.session !== current.session ||
      grant.revision !== current.user.updated_at) return null;
    return current.client;
  } catch { return null; }
}

export async function clearRecoveryGrant() {
  (await cookies()).set(cookieName, "", { ...cookieOptions, maxAge: 0 });
}

export function recoveryOrigin(origin: string | null) {
  if (origin === "https://emetsees.com") return origin;
  if (process.env.NODE_ENV !== "production" && origin) {
    try {
      const url = new URL(origin);
      if (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) return url.origin;
    } catch { /* Use the fixed production origin. */ }
  }
  return "https://emetsees.com";
}
