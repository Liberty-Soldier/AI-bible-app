"use client";

import Link from "next/link";
import EmetseesWordmark from "@/app/components/branding/EmetseesWordmark";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import {
  PremiumFeatureButton,
  PremiumLockBadge,
} from "@/app/components/premium/PremiumAccessProvider";

export default function StudyPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-5 pb-24 pt-10 text-[var(--foreground)]">
      <section className="mx-auto max-w-xl">
        <EmetseesWordmark showDescriptor />

        <div className="mt-9 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-600 dark:text-amber-400">
              Advanced study
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-[-0.045em]">
              Deeper tools, not a second reader mode
            </h1>
          </div>
          <PremiumLockBadge />
        </div>

        <p className="mt-5 text-base leading-7 text-[var(--muted)]">
          Reading, word taps, highlights, notes, bookmarks, copy, and
          sharing now belong to one free reader. These advanced tools are
          visible here as paid extensions.
        </p>

        <div className="mt-7 space-y-3">
          <LockedStudyCard
            feature="deep-word-study"
            title="Deep Word Study"
            description="Build guided studies from source-word evidence, chronology, relationships, events, and themes."
          />
          <LockedStudyCard
            feature="ask-emet"
            title="Ask EMET"
            description="Ask contextual questions and continue with Scripture-grounded follow-up reasoning."
          />
          <LockedStudyCard
            feature="compare-passages"
            title="Compare Passages"
            description="Place passages side by side and trace shared words, themes, and scriptural connections."
          />
        </div>

        <Link
          href="/read"
          className="mt-7 block rounded-2xl border border-[var(--border)] px-5 py-3.5 text-center text-sm font-black"
        >
          Return to the free reader
        </Link>
      </section>

      <MobileBottomNav />
    </main>
  );
}

function LockedStudyCard({
  feature,
  title,
  description,
}: {
  feature: "ask-emet" | "deep-word-study" | "compare-passages";
  title: string;
  description: string;
}) {
  return (
    <PremiumFeatureButton
      feature={feature}
      contextLabel={title}
      className="w-full rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left"
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-lg font-black">{title}</p>
        <PremiumLockBadge compact />
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        {description}
      </p>
    </PremiumFeatureButton>
  );
}
