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
    <div>
      <div className="flex items-center justify-between py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-left"
        >
          <span className="text-xl font-semibold tracking-tight">
            {title}
          </span>

          <span
            className={`text-sm text-neutral-500 transition-transform ${
              open ? "rotate-180" : ""
            }`}
          >
            ▼
          </span>
        </button>

        {modeToggle}
      </div>

      {open && (
        <div className="mt-4 border-t border-neutral-900 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}