import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import RecoveryForm from "../RecoveryForm";
import RecoveryShell from "../RecoveryShell";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ForgotPasswordPage() {
  const host = (await headers()).get("host");
  if (process.env.NODE_ENV === "production" && host === "www.emetsees.com") redirect("https://emetsees.com/auth/forgot-password");
  return <RecoveryShell title="Reset your password"><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Enter your email address to request a password-reset link.</p><RecoveryForm /></RecoveryShell>;
}
