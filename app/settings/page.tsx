import MobileBottomNav from "@/app/components/MobileBottomNav";
import ThemeToggle from "@/app/components/ThemeToggle";
import SacredNameToggle from "@/app/components/SacredNameToggle";

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-5 pb-24 pt-10 text-[var(--foreground)]">
      <section className="mx-auto max-w-xl">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>

        <div className="mt-8 space-y-8">
          <section className="border-t border-[var(--border)] pt-5">
            <p className="text-sm font-semibold">Appearance</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Switch between light and dark mode.
            </p>

            <div className="mt-4">
              <ThemeToggle />
            </div>
          </section>

          <section className="border-t border-[var(--border)] pt-5">
            <p className="text-sm font-semibold">Sacred Names</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Render LORD / God as sacred names where supported.
            </p>

            <div className="mt-4">
              <SacredNameToggle />
            </div>
          </section>
        </div>
      </section>

      <MobileBottomNav />
    </main>
  );
}