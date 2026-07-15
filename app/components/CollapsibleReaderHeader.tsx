"use client";

import { useState } from "react";
import EmetseesLogo from "@/app/components/branding/EmetseesLogo";
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
        shouldShow
          ? "translate-y-0 opacity-100"
          : "-translate-y-4 opacity-0"
      }`}
    >
      <div className="flex items-center py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <EmetseesLogo
            size={30}
            className="shrink-0 text-amber-500"
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
      </div>

      {open ? (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}
