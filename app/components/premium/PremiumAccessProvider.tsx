"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import EmetseesWordmark from "@/app/components/branding/EmetseesWordmark";

export type EmetseesPlan = "free" | "paid";

export type PremiumFeature =
  | "ask-emet"
  | "deep-word-study"
  | "compare-passages";

type UpgradeRequest = {
  feature: PremiumFeature;
  contextLabel?: string;
};

type PremiumAccessValue = {
  plan: EmetseesPlan;
  canUse: (feature: PremiumFeature) => boolean;
  requestUpgrade: (
    feature: PremiumFeature,
    contextLabel?: string,
  ) => void;
  closeUpgrade: () => void;
};

const FEATURE_COPY: Record<
  PremiumFeature,
  {
    eyebrow: string;
    title: string;
    description: string;
    benefits: string[];
  }
> = {
  "ask-emet": {
    eyebrow: "Live EMET",
    title: "Upgrade to ask EMET",
    description:
      "Live EMET reasoning is a paid feature. The free reader continues to include cached EMET explanations for ordinary word taps.",
    benefits: [
      "Ask contextual questions about a verse or word",
      "Trace answers through the whole scriptural witness",
      "Continue a study with follow-up questions",
    ],
  },
  "deep-word-study": {
    eyebrow: "Advanced study",
    title: "Upgrade for deeper word study",
    description:
      "The free reader includes the cached explanation and source evidence. Paid study adds advanced exploration and guided reasoning.",
    benefits: [
      "Explore deeper source-word connections",
      "Build focused studies across passages",
      "Use live EMET to explain supplied evidence",
    ],
  },
  "compare-passages": {
    eyebrow: "Scripture comparison",
    title: "Upgrade to compare passages",
    description:
      "Passage comparison is part of the paid study experience and will use Scripture-grounded evidence rather than outside commentary.",
    benefits: [
      "Compare selected verses side by side",
      "Trace shared source words and themes",
      "Ask EMET to explain agreements and tensions",
    ],
  },
};

const PremiumAccessContext =
  createContext<PremiumAccessValue | null>(null);

export default function PremiumAccessProvider({
  children,
  initialPlan = "free",
}: {
  children: React.ReactNode;
  initialPlan?: EmetseesPlan;
}) {
  const [activeRequest, setActiveRequest] =
    useState<UpgradeRequest | null>(null);

  useEffect(() => {
    if (!activeRequest) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [activeRequest]);

  const value = useMemo<PremiumAccessValue>(
    () => ({
      plan: initialPlan,
      canUse: () => initialPlan === "paid",
      requestUpgrade: (feature, contextLabel) => {
        setActiveRequest({ feature, contextLabel });
      },
      closeUpgrade: () => setActiveRequest(null),
    }),
    [initialPlan],
  );

  return (
    <PremiumAccessContext.Provider value={value}>
      {children}

      {activeRequest ? (
        <UpgradeSheet
          request={activeRequest}
          onClose={() => setActiveRequest(null)}
        />
      ) : null}
    </PremiumAccessContext.Provider>
  );
}

export function usePremiumAccess() {
  const value = useContext(PremiumAccessContext);

  if (!value) {
    throw new Error(
      "usePremiumAccess must be used inside PremiumAccessProvider.",
    );
  }

  return value;
}

export function PremiumLockBadge({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 font-bold text-amber-600 dark:text-amber-400 ${
        compact
          ? "gap-1 px-2 py-1 text-[0.62rem]"
          : "gap-1.5 px-2.5 py-1.5 text-xs"
      }`}
    >
      <LockIcon />
      Paid
    </span>
  );
}

export function PremiumFeatureButton({
  feature,
  contextLabel,
  children,
  className = "",
  onUnlocked,
}: {
  feature: PremiumFeature;
  contextLabel?: string;
  children: React.ReactNode;
  className?: string;
  onUnlocked?: () => void;
}) {
  const { canUse, requestUpgrade } = usePremiumAccess();

  return (
    <button
      type="button"
      onClick={() => {
        if (canUse(feature)) {
          onUnlocked?.();
          return;
        }

        requestUpgrade(feature, contextLabel);
      }}
      className={className}
    >
      {children}
    </button>
  );
}

function UpgradeSheet({
  request,
  onClose,
}: {
  request: UpgradeRequest;
  onClose: () => void;
}) {
  const copy = FEATURE_COPY[request.feature];

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        aria-label="Close upgrade information"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />

      <section className="absolute bottom-0 left-1/2 max-h-[88dvh] w-full max-w-xl -translate-x-1/2 overflow-y-auto rounded-t-[2rem] border border-[var(--border)] bg-[var(--background)] px-5 pb-8 pt-4 text-[var(--foreground)] shadow-2xl">
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-[var(--border)]" />

        <div className="flex items-start justify-between gap-4">
          <EmetseesWordmark compact showDescriptor />

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--muted)]"
          >
            Close
          </button>
        </div>

        <div className="mt-7">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-600 dark:text-amber-400">
            {copy.eyebrow}
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">
            {copy.title}
          </h2>

          {request.contextLabel ? (
            <p className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-bold">
              {request.contextLabel}
            </p>
          ) : null}

          <p className="mt-5 text-base leading-7 text-[var(--muted)]">
            {copy.description}
          </p>

          <div className="mt-5 space-y-3">
            {copy.benefits.map((benefit) => (
              <div
                key={benefit}
                className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <span className="mt-0.5 text-amber-500">◆</span>
                <p className="text-sm font-semibold leading-6">
                  {benefit}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-7 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
            <p className="text-sm font-black">Paid plans are coming in P06.</p>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              This lock is the final entitlement boundary. Billing and live
              EMET will connect here without changing the reader again.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-2xl bg-[var(--foreground)] px-5 py-3.5 text-sm font-black text-[var(--background)]"
          >
            Continue with the free reader
          </button>
        </div>
      </section>
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      aria-hidden="true"
      fill="none"
    >
      <rect
        x="4"
        y="8"
        width="12"
        height="9"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M7 8V6a3 3 0 0 1 6 0v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
