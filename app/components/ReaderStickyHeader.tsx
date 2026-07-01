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
      className={`sticky top-0 z-40 -mx-4 border-b border-[var(--border)] bg-[var(--background)]/95 px-4 py-2 backdrop-blur transition-transform duration-200 sm:-mx-6 sm:px-6 ${
        visible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      {children}
    </header>
  );
}