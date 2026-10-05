"use client";

import { useState } from "react";
import { useReaderChromeVisibility } from "@/app/components/useReaderChromeVisibility";

export default function CollapsibleReaderHeader({
  title,
  children,
  autoHide = false,
}: {
  title: string;
  children: React.ReactNode;
  autoHide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const visible = useReaderChromeVisibility();
  const shouldShow = !autoHide || visible || open;

  return (
    <div
      className={`transition-all duration-200 ${
        shouldShow ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"
      }`}
    >
      <div className="flex items-center justify-between gap-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <img
            src="/icons/icon-192.png"
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-[9px] object-contain"
          />

          <span className="truncate text-xl font-semibold tracking-tight">
            {title}
          </span>

          <span
            className={`shrink-0 text-sm text-[var(--muted)] transition-transform ${
              open ? "rotate-180" : ""
            }`}
          >
            ▼
          </span>
        </button>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label="Open reading appearance and navigation"
          aria-expanded={open}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-sm font-bold text-[var(--muted)] transition active:scale-95"
        >
          Aa
        </button>
      </div>

      {open ? (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}
