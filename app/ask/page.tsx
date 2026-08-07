"use client";

import EmetseesWordmark from "@/app/components/branding/EmetseesWordmark";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import {
  PremiumFeatureButton,
  PremiumLockBadge,
} from "@/app/components/premium/PremiumAccessProvider";

export default function AskPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-5 pb-24 pt-6 text-[var(--foreground)]">
      <section className="mx-auto max-w-xl">
        <EmetseesWordmark showDescriptor />

        <section className="mt-7 border-y border-[var(--border)] py-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-600 dark:text-amber-400">
              Premium
            </p>
            <PremiumLockBadge />
          </div>

          <h1 className="mt-3 text-[2rem] font-black leading-[1.05] tracking-[-0.04em]">
            Ask EMET
          </h1>

          <p className="mt-3 max-w-lg text-[0.98rem] leading-6 text-[var(--muted)]">
            Ask a Scripture question and follow the supporting passages and
            source-word evidence behind the answer.
          </p>

          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Reading, Scripture Search, and cached word studies remain separate.
            Live Ask EMET is reserved for premium access.
          </p>

          <PremiumFeatureButton
            feature="ask-emet"
            contextLabel="Ask EMET premium access"
            className="mt-5 rounded-2xl bg-[var(--foreground)] px-5 py-3 text-sm font-black text-[var(--background)] transition active:scale-[0.98]"
          >
            View premium access
          </PremiumFeatureButton>
        </section>

        <section className="pt-5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
            Three distinct paths
          </p>

          <div className="mt-2 divide-y divide-[var(--border)]">
            <div className="py-3">
              <p className="font-semibold">Read</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Open a passage you already know.
              </p>
            </div>
            <div className="py-3">
              <p className="font-semibold">Search</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Find a word, phrase, chapter, or verse.
              </p>
            </div>
            <div className="py-3">
              <p className="font-semibold">Ask EMET</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Ask a question and examine Scripture-based evidence.
              </p>
            </div>
          </div>
        </section>
      </section>

      <MobileBottomNav />
    </main>
  );
}
