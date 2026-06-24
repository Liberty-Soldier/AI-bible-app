"use client";

import { useState } from "react";

export default function CollapsibleReaderHeader({
  title,
  modeToggle,
  children,
}: {
  title: string;
  modeToggle?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 z-50 mb-4 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">
      <div className="px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between"
        >
          <span className="text-lg font-semibold">{title}</span>

          <span className={`transition-transform ${open ? "rotate-180" : ""}`}>
            ▼
          </span>
        </button>

        {modeToggle ? <div className="mt-3">{modeToggle}</div> : null}
      </div>

      {open && <div className="border-t border-neutral-800 p-3">{children}</div>}
    </div>
  );
}