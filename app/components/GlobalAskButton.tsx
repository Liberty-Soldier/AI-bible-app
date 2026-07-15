"use client";

import {
  PremiumFeatureButton,
  PremiumLockBadge,
} from "@/app/components/premium/PremiumAccessProvider";

export default function GlobalAskButton() {
  return (
    <PremiumFeatureButton
      feature="ask-emet"
      contextLabel="Ask from your current reading context"
      className="fixed bottom-24 right-5 z-50 flex items-center gap-2 rounded-full border border-amber-500/25 bg-[var(--foreground)] px-4 py-3 text-sm font-black text-[var(--background)] shadow-lg"
    >
      Ask EMET
      <PremiumLockBadge compact />
    </PremiumFeatureButton>
  );
}
