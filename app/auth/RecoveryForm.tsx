"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestRecoveryAction, updateRecoveryPasswordAction, type RecoveryState } from "./recovery-actions";

export default function RecoveryForm({ reset = false }: { reset?: boolean }) {
  const [state, action, pending] = useActionState(reset ? updateRecoveryPasswordAction : requestRecoveryAction, { status: "idle" } as RecoveryState);
  const inputClass = "mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3.5 text-base outline-none focus:border-[var(--brand)]";
  return <>
    {state.message ? <p role={state.status === "error" || state.status === "expired" ? "alert" : "status"} className="mt-5 text-sm leading-6">{state.message}</p> : null}
    {state.status === "complete" ? <Link href="/auth" className="mt-5 inline-flex min-h-11 items-center font-semibold underline decoration-[var(--brand)]">Sign in</Link> : state.status === "expired" ? <Link href="/auth/forgot-password" className="mt-5 inline-flex min-h-11 items-center underline">Request a new reset link</Link> :
      <form action={action} aria-busy={pending} className="mt-6 space-y-4">
        {reset ? <>
          <label className="block text-sm font-bold">New password<input type="password" name="password" autoComplete="new-password" required minLength={8} className={inputClass} /></label>
          <label className="block text-sm font-bold">Confirm new password<input type="password" name="confirmPassword" autoComplete="new-password" required minLength={8} className={inputClass} /></label>
          <p className="text-xs text-[var(--muted)]">Use at least 8 characters and meet your account’s password requirements.</p>
        </> : <label className="block text-sm font-bold">Email<input type="email" name="email" autoComplete="email" inputMode="email" required maxLength={254} className={inputClass} /></label>}
        <button type="submit" disabled={pending} className="min-h-11 w-full rounded-2xl bg-[var(--foreground)] px-5 py-3.5 text-sm font-black text-[var(--background)] disabled:opacity-60">{pending ? (reset ? "Updating…" : "Sending…") : (reset ? "Update password" : "Send reset link")}</button>
      </form>}
  </>;
}
