"use client";

import { useState } from "react";
import { useReaderChromeVisibility } from "@/app/components/useReaderChromeVisibility";

export default function CollapsibleReaderHeader({
  title,
  modeToggle,
  children,
  autoHide = false,
}: {
  title: string;
  modeToggle?: React.ReactNode;
  children: React.ReactNode;
  autoHide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const visible = useReaderChromeVisibility();

  const shouldShow = !autoHide || visible || open;

  return (
    <div
      className={`transition-all duration-200 ${
        shouldShow
          ? "translate-y-0 opacity-100"
          : "-translate-y-4 opacity-0"
      }`}
    >
      <div className="flex items-center justify-between py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-left"
        >
          <span className="text-xl font-semibold tracking-tight">{title}</span>

          <span
            className={`text-sm text-[var(--muted)] transition-transform ${
              open ? "rotate-180" : ""
            }`}
          >
            ▼
          </span>
        </button>

        {modeToggle}
      </div>

      {open ? (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}