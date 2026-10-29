"use client";

export default function ReaderStickyHeader({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <header
      className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)] pt-[max(0.25rem,env(safe-area-inset-top))] text-[var(--foreground)]"
    >
      <div className="mx-auto max-w-2xl">{children}</div>
    </header>
  );
}
