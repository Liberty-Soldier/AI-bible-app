"use client";

import { useReaderChromeVisibility } from "@/app/components/useReaderChromeVisibility";

export default function ReaderStickyHeader({
  children,
}: {
  children: React.ReactNode;
}) {
  const visible = useReaderChromeVisibility();

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/95 px-4 py-2 text-[var(--foreground)] backdrop-blur transition-transform duration-200 sm:px-6 ${
        visible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="mx-auto max-w-2xl">{children}</div>
    </header>
  );
}