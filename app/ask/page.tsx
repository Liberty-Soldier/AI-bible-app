"use client";

import EmetseesWordmark from "@/app/components/branding/EmetseesWordmark";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import {
  PremiumFeatureButton,
  PremiumLockBadge,
} from "@/app/components/premium/PremiumAccessProvider";

export default function AskPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-5 pb-24 pt-10 text-[var(--foreground)]">
      <section className="mx-auto max-w-xl">
        <EmetseesWordmark showDescriptor />

        <div className="mt-10 rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-600 dark:text-amber-400">
              Live EMET
            </p>
            <PremiumLockBadge />
          </div>

          <h1 className="mt-4 text-4xl font-black tracking-[-0.045em]">
            Ask Scripture-grounded questions
          </h1>

          <p className="mt-4 text-base leading-7 text-[var(--muted)]">
            Ordinary word taps remain free and use verified cached EMET
            explanations. Live questions, follow-ups, and deeper reasoning
            belong to the paid experience.
          </p>

          <PremiumFeatureButton
            feature="ask-emet"
            contextLabel="Live Ask EMET"
            className="mt-6 w-full rounded-2xl bg-[var(--foreground)] px-5 py-3.5 text-sm font-black text-[var(--background)]"
          >
            View upgrade information
          </PremiumFeatureButton>
        </div>
      </section>

      <MobileBottomNav />
    </main>
  );
}
