import Link from "next/link";
import type { ReactNode } from "react";
import EmetseesWordmark from "@/app/components/branding/EmetseesWordmark";

export default function RecoveryShell({ title, children }: { title: string; children: ReactNode }) {
  return <main className="min-h-screen bg-[var(--background)] px-5 py-10 text-[var(--foreground)]"><section className="mx-auto max-w-md">
    <Link href="/" aria-label="EMETSEES home"><EmetseesWordmark showDescriptor /></Link>
    <div className="mt-10 rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)] sm:p-8">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--brand-strong)]">EMET account</p>
      <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">{title}</h1>{children}
      <Link href="/auth" className="mt-6 inline-flex min-h-11 items-center text-sm underline decoration-[var(--brand)] underline-offset-4">Back to sign in</Link>
    </div>
  </section></main>;
}
