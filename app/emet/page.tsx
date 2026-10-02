import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import EmetseesWordmark from "@/app/components/branding/EmetseesWordmark";
import EmetChat from "@/app/components/emet/EmetChat";
import { getEmetAiUsageSummary } from "@/app/lib/emet/EmetAiQuota";
import { getVerifiedSupabaseUser } from "@/app/lib/supabase/server";

export const metadata: Metadata = {
  title: "Ask EMET",
  description: "Ask Scripture questions and inspect the evidence supporting each answer.",
  robots: { index: false, follow: false },
};

export default async function EmetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getVerifiedSupabaseUser();
  if (!user) redirect("/auth?next=%2Femet");

  const queryValue = (await searchParams).q;
  const initialQuestion = Array.isArray(queryValue)
    ? queryValue[0] || ""
    : queryValue || "";
  const usage = await getEmetAiUsageSummary();

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 pb-4 pt-5 text-[var(--foreground)] sm:px-6">
      <section className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <EmetseesWordmark compact />
          <Link
            href="/"
            className="rounded-full border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--muted)]"
          >
            Close
          </Link>
        </header>

        <div className="py-6">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--brand-strong)]">
            Ask EMET
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">
            Ask, then inspect the evidence.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
            EMET answers from the Scripture evidence supplied to it, reading earlier passages as the foundation for later ones.
          </p>
        </div>

        <EmetChat initialUsage={usage} initialQuestion={initialQuestion} />
      </section>
    </main>
  );
}
