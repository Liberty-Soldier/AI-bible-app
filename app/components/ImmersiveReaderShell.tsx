"use client";

import { useState } from "react";
import MobileBottomNav from "@/app/components/MobileBottomNav";

export default function ImmersiveReaderShell({
  title,
  translation,
  controls,
  children,
}: {
  title: string;
  translation: string;
  controls: React.ReactNode;
  children: React.ReactNode;
}) {
  const [controlsOpen, setControlsOpen] = useState(false);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {controlsOpen ? (
        <div className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/95 px-4 py-3 backdrop-blur">
          {controls}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setControlsOpen((value) => !value)}
        className="block w-full text-left"
      >
        {children}
      </button>

      <button
        type="button"
        onClick={() => setControlsOpen((value) => !value)}
        className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--foreground)] shadow-lg"
      >
        {title} • {translation}
      </button>

      {controlsOpen ? <MobileBottomNav /> : null}
    </main>
  );
}