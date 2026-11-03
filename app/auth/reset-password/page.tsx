import type { Metadata } from "next";
import Link from "next/link";
import { recoverySession } from "@/app/lib/supabase/recovery";
import RecoveryForm from "../RecoveryForm";
import RecoveryShell from "../RecoveryShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New password", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ResetPasswordPage() {
  const session = await recoverySession();
  return <RecoveryShell title="Choose a new password">{session ? <RecoveryForm reset /> : <>
    <p role="alert" className="mt-5 text-sm leading-6">This reset link is invalid or has expired. Request a new one.</p>
    <Link href="/auth/forgot-password" className="mt-4 inline-flex min-h-11 items-center font-semibold underline decoration-[var(--brand)]">Request a new reset link</Link>
  </>}</RecoveryShell>;
}
