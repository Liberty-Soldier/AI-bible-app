"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authPageHref, normalizeAuthNextPath } from "@/app/lib/authPaths";
import { createSupabaseServerClient } from "@/app/lib/supabase/server";

const DEFAULT_SITE_ORIGIN = "https://emetsees.com";

function formValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Confirm your email before signing in.";
  }
  if (normalized.includes("user already registered")) {
    return "An account already exists for this email. Try signing in.";
  }
  if (normalized.includes("password")) {
    return "Use a password with at least 8 characters.";
  }
  if (normalized.includes("rate") || normalized.includes("too many")) {
    return "Too many attempts. Wait a moment and try again.";
  }

  return "Authentication could not be completed. Please try again.";
}

async function requestOrigin() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");

  if (origin) {
    try {
      const parsed = new URL(origin);
      const isProduction = parsed.origin === DEFAULT_SITE_ORIGIN;
      const isLocal =
        parsed.protocol === "http:" &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
        parsed.port === "3000";

      if (isProduction || isLocal) return parsed.origin;
    } catch {
      // Fall back to the canonical production origin.
    }
  }

  return DEFAULT_SITE_ORIGIN;
}

export async function signInAction(formData: FormData) {
  const email = formValue(formData, "email").toLowerCase();
  const password = formValue(formData, "password");
  const next = normalizeAuthNextPath(formValue(formData, "next"));

  if (!email || !password) {
    redirect(
      authPageHref({
        mode: "signin",
        next,
        messageType: "error",
        message: "Enter both your email and password.",
      }),
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    redirect(
      authPageHref({
        mode: "signin",
        next,
        messageType: "error",
        message: "Sign-in is not configured yet.",
      }),
    );
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(
      authPageHref({
        mode: "signin",
        next,
        messageType: "error",
        message: friendlyAuthError(error.message),
      }),
    );
  }

  redirect(next);
}

export async function signUpAction(formData: FormData) {
  const email = formValue(formData, "email").toLowerCase();
  const password = formValue(formData, "password");
  const next = normalizeAuthNextPath(formValue(formData, "next"));

  if (!email || !email.includes("@")) {
    redirect(
      authPageHref({
        mode: "signup",
        next,
        messageType: "error",
        message: "Enter a valid email address.",
      }),
    );
  }
  if (password.length < 8) {
    redirect(
      authPageHref({
        mode: "signup",
        next,
        messageType: "error",
        message: "Use a password with at least 8 characters.",
      }),
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    redirect(
      authPageHref({
        mode: "signup",
        next,
        messageType: "error",
        message: "Account creation is not configured yet.",
      }),
    );
  }

  const origin = await requestOrigin();
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", next);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: callback.toString() },
  });

  if (error) {
    redirect(
      authPageHref({
        mode: "signup",
        next,
        messageType: "error",
        message: friendlyAuthError(error.message),
      }),
    );
  }

  if (data.session) redirect(next);

  redirect(
    authPageHref({
      mode: "signin",
      next,
      messageType: "notice",
      message: "Check your email and confirm your account, then sign in.",
    }),
  );
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();

  redirect(
    authPageHref({
      mode: "signin",
      messageType: "notice",
      message: "You have been signed out.",
    }),
  );
}
