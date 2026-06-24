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
    <div className="border-b border-neutral-800 bg-neutral-950/95">
      <div className="px-2 py-2 sm:px-4 sm:py-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between"
        >
          <span className="truncate text-base font-semibold sm:text-lg">{title}</span>

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