import { getPublicEmetEngine } from "@/app/lib/emet/EmetPublicRouting";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { safeChatReturnHref } from "@/app/components/emet/chatPresentation";
import EmetChat from "@/app/components/emet/EmetChat";
import { getEmetAiUsageSummary } from "@/app/lib/emet/EmetAiQuota";
import { getVerifiedSupabaseUser } from "@/app/lib/supabase/server";
import { canUseSimpleEmet } from "@/app/lib/emet/experimental/SimpleEmetAccess";

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
  const resolvedParams = await searchParams;
  const queryValue = resolvedParams.q;
  const returnValue = resolvedParams.returnTo;
  const returnTo = safeChatReturnHref(Array.isArray(returnValue) ? returnValue[0] : returnValue);
  const initialQuestion = Array.isArray(queryValue)
    ? queryValue[0] || ""
    : queryValue || "";
  const user = await getVerifiedSupabaseUser();
  if (!user) {
    let next = initialQuestion
      ? `/emet?q=${encodeURIComponent(initialQuestion)}`
      : "/emet";
    if (returnTo) next += `${initialQuestion ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`;
    redirect(`/auth?next=${encodeURIComponent(next)}`);
  }

  const usage = await getEmetAiUsageSummary();
  const ownerDiagnostics = await canUseSimpleEmet(user.id);

  return (
    <main className="h-dvh min-h-0 overflow-hidden bg-[var(--canvas)] text-[var(--foreground)]">
      <section className="mx-auto h-full max-w-3xl">
        <EmetChat initialUsage={usage} initialQuestion={initialQuestion} returnTo={returnTo} initialEngine={getPublicEmetEngine() || "simple"} initialOwnerDiagnostics={ownerDiagnostics} />
      </section>
    </main>
  );
}
