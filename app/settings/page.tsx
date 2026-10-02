import Link from "next/link";

import { signOutAction } from "@/app/auth/actions";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import ThemeToggle from "@/app/components/ThemeToggle";
import SacredNameToggle from "@/app/components/SacredNameToggle";
import {
  getEmetAiPlanSummaries,
  getEmetAiUsageSummary,
} from "@/app/lib/emet/EmetAiQuota";
import { getVerifiedSupabaseUser } from "@/app/lib/supabase/server";

export default async function SettingsPage() {
  const user = await getVerifiedSupabaseUser();
  const [usage, plans] = user
    ? await Promise.all([getEmetAiUsageSummary(), getEmetAiPlanSummaries()])
    : [null, []];

  return (
    <main className="min-h-screen bg-[var(--background)] px-5 pb-24 pt-10 text-[var(--foreground)]">
      <section className="mx-auto max-w-xl">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>

        <div className="mt-8 space-y-8">
          <section className="border-t border-[var(--border)] pt-5">
            <p className="text-sm font-semibold">Account</p>
            {user ? (
              <>
                <p className="mt-1 break-all text-sm text-[var(--muted)]">
                  Signed in{user.email ? ` as ${user.email}` : ""}.
                </p>
                <form action={signOutAction} className="mt-4">
                  <button
                    type="submit"
                    className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-bold"
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                  Sign in or create an account to use EMET AI and track your
                  monthly question allowance.
                </p>
                <Link
                  href="/auth?next=%2Fsettings"
                  className="mt-4 inline-flex rounded-full bg-[var(--foreground)] px-4 py-2.5 text-sm font-bold text-[var(--background)]"
                >
                  Sign in or create account
                </Link>
              </>
            )}
          </section>

          {user ? (
            <section id="emet-plans" className="scroll-mt-5 border-t border-[var(--border)] pt-5">
              <p className="text-sm font-semibold">EMET AI plan</p>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                {usage?.unlimited
                  ? "Owner testing access is active."
                  : `${usage?.planName || "Free"}: ${usage?.questionsRemaining ?? 0} of ${usage?.questionLimit ?? 0} questions remain this month.`}
              </p>

              {plans.length ? (
                <div className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
                  {plans.map((plan) => (
                    <div key={plan.code} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <p className="text-sm font-bold">{plan.name}</p>
                        <p className="mt-0.5 text-xs text-[var(--muted)]">
                          {plan.monthlyQuestionLimit} questions each month
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold">
                        {plan.monthlyPriceCents
                          ? `$${(plan.monthlyPriceCents / 100).toFixed(2)}/mo`
                          : "Free"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                Paid subscriptions are not connected yet. No upgrade or charge will occur until checkout is added and tested.
              </p>
            </section>
          ) : null}

          <section className="border-t border-[var(--border)] pt-5">
            <p className="text-sm font-semibold">Appearance</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Switch between light and dark mode.
            </p>

            <div className="mt-4">
              <ThemeToggle />
            </div>
          </section>

          <section className="border-t border-[var(--border)] pt-5">
            <p className="text-sm font-semibold">Sacred Names</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Render LORD / God as sacred names where supported.
            </p>

            <div className="mt-4">
              <SacredNameToggle />
            </div>
          </section>
        </div>
      </section>

      <MobileBottomNav />
    </main>
  );
}
