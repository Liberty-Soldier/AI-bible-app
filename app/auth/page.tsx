import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import EmetseesWordmark from "@/app/components/branding/EmetseesWordmark";
import { signInAction, signUpAction } from "@/app/auth/actions";
import { normalizeAuthNextPath } from "@/app/lib/authPaths";
import { getVerifiedSupabaseUser } from "@/app/lib/supabase/server";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

type AuthSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams: AuthSearchParams;
}) {
  const params = await searchParams;
  const mode = firstValue(params.mode) === "signup" ? "signup" : "signin";
  const next = normalizeAuthNextPath(firstValue(params.next));
  const error = firstValue(params.error);
  const notice = firstValue(params.notice);
  const user = await getVerifiedSupabaseUser();

  if (user) redirect(next);

  const isSignUp = mode === "signup";
  const switchParams = new URLSearchParams({
    mode: isSignUp ? "signin" : "signup",
    next,
  });

  return (
    <main className="min-h-screen bg-[var(--background)] px-5 py-10 text-[var(--foreground)]">
      <section className="mx-auto max-w-md">
        <Link href="/" aria-label="EMETSEES home">
          <EmetseesWordmark showDescriptor />
        </Link>

        <div className="mt-10 rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--brand-strong)]">
            EMET account
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            {isSignUp
              ? "Create an account to use EMET AI and keep your question allowance tied to you."
              : "Sign in to continue your Scripture-grounded EMET studies."}
          </p>

          {error ? (
            <p
              role="alert"
              className="mt-5 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300"
            >
              {error}
            </p>
          ) : null}

          {notice ? (
            <p
              role="status"
              className="mt-5 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300"
            >
              {notice}
            </p>
          ) : null}

          <form
            action={isSignUp ? signUpAction : signInAction}
            className="mt-6 space-y-4"
          >
            <input type="hidden" name="next" value={next} />

            <label className="block">
              <span className="text-sm font-bold">Email</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                inputMode="email"
                className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3.5 text-base outline-none transition focus:border-[var(--brand)]"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold">Password</span>
              <input
                type="password"
                name="password"
                required
                minLength={8}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3.5 text-base outline-none transition focus:border-[var(--brand)]"
              />
              {isSignUp ? (
                <span className="mt-2 block text-xs text-[var(--muted)]">
                  Use at least 8 characters.
                </span>
              ) : null}
            </label>

            <button
              type="submit"
              className="w-full rounded-2xl bg-[var(--foreground)] px-5 py-3.5 text-sm font-black text-[var(--background)] transition active:scale-[0.99]"
            >
              {isSignUp ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--muted)]">
            {isSignUp ? "Already have an account?" : "New to EMETSEES?"}{" "}
            <Link
              href={`/auth?${switchParams.toString()}`}
              className="font-black text-[var(--foreground)] underline decoration-[var(--brand)] underline-offset-4"
            >
              {isSignUp ? "Sign in" : "Create one"}
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-[var(--muted)]">
          Your account controls access and usage. Biblical text, lexical identity,
          and evidence remain governed by the same source-first contracts.
        </p>
      </section>
    </main>
  );
}
