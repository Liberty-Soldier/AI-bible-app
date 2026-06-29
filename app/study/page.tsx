import Link from "next/link";
import MobileBottomNav from "@/app/components/MobileBottomNav";

export default function StudyPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 pb-24 pt-8 text-[var(--foreground)] sm:px-6 sm:pt-12">
      <section className="mx-auto max-w-2xl">
        <p className="mb-3 text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
          BibleIQ Study
        </p>

        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Study tools are coming soon.
        </h1>

        <p className="mt-4 text-[var(--muted)]">
          This section will bring together Word Study, concordance, lexicons,
          source texts, and concept maps powered by BibleIQ.
        </p>

        <div className="mt-6 space-y-3 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div>
            <p className="font-semibold">BibleIQ Word Study</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Hebrew, Septuagint Greek, New Testament Greek, Strong&apos;s,
              forms, definitions, and occurrences.
            </p>
          </div>

          <div>
            <p className="font-semibold">Concept Study</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Follow ideas like Torah, sin, covenant, kingdom, spirit, and
              Messiah through Scripture.
            </p>
          </div>

          <div>
            <p className="font-semibold">Source Evidence</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Compare source texts and translation witnesses without losing the
              reading flow.
            </p>
          </div>
        </div>

        <Link
          href="/read"
          className="mt-6 block rounded-2xl bg-[var(--foreground)] px-5 py-3 text-center font-semibold text-[var(--background)]"
        >
          Read Scripture
        </Link>
      </section>

      <MobileBottomNav />
    </main>
  );
}