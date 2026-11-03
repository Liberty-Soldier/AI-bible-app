"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";
import { clearRecoveryGrant, recoveryOrigin, recoverySession } from "@/app/lib/supabase/recovery";

export type RecoveryState = { status: "idle" | "sent" | "error" | "expired" | "complete"; message?: string };

export async function requestRecoveryAction(_previous: RecoveryState, form: FormData): Promise<RecoveryState> {
  const origin = (await headers()).get("origin");
  // Keep the PKCE verifier and callback on the same allowed production host.
  if (process.env.NODE_ENV === "production" && origin !== "https://emetsees.com") redirect("https://emetsees.com/auth/forgot-password");
  const email = form.get("email");
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return { status: "error", message: "Enter a valid email address." };
  }
  try {
    const client = await createSupabaseServerClient();
    if (client) await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${recoveryOrigin(origin)}/auth/recovery`,
    });
  } catch { /* Account existence and provider errors must not be disclosed. */ }
  return { status: "sent", message: "If an account uses that email, you’ll receive a password-reset link. Please wait a few minutes before trying again." };
}

export async function updateRecoveryPasswordAction(_previous: RecoveryState, form: FormData): Promise<RecoveryState> {
  const client = await recoverySession();
  if (!client) return { status: "expired", message: "This reset link is invalid or has expired. Request a new one." };
  const password = form.get("password");
  const confirmation = form.get("confirmPassword");
  if (typeof password !== "string" || password !== confirmation) return { status: "error", message: "The passwords don’t match." };
  if (password.length < 8) return { status: "error", message: "Use a password with at least 8 characters." };
  try {
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      if (error.code === "weak_password") return { status: "error", message: "Choose a stronger password that meets the account password requirements." };
      if (error.code === "same_password") return { status: "error", message: "Choose a password different from your current one." };
      if (error.status === 429) return { status: "error", message: "Too many attempts. Wait a moment and try again." };
      return { status: "error", message: "Your password could not be updated. Request a new link and try again." };
    }
  } catch { return { status: "error", message: "Your password could not be updated. Please try again." }; }
  await clearRecoveryGrant();
  try { await client.auth.signOut({ scope: "local" }); } catch { /* The password update has already succeeded. */ }
  return { status: "complete", message: "Your password has been updated. You can now sign in." };
}
