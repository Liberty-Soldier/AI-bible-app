import type { Metadata } from "next";
import RecoveryForm from "../RecoveryForm";
import RecoveryShell from "../RecoveryShell";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function ForgotPasswordPage() {
  return <RecoveryShell title="Reset your password"><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Enter your email address to request a password-reset link.</p><RecoveryForm /></RecoveryShell>;
}
