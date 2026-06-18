"use client";

import { useState } from "react";

export default function CollapsibleReaderHeader({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 z-50 mb-6 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <span className="font-medium">{title}</span>

        <span
          className={`transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▼
        </span>
      </button>

      {open && (
        <div className="border-t border-neutral-800 p-3">
          {children}
        </div>
      )}
    </div>
  );
}