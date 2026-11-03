"use client";

import { useSacredNames } from "../data/useSacredNames";

export default function SacredNameToggle() {
  const { sacredNames, setSacredNames } = useSacredNames();

  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 border-t border-[var(--border)] py-2 text-sm text-[var(--foreground)]">
      <span>
        <span className="block text-sm font-semibold">Sacred Names</span>
        <span className="mt-0.5 block text-[0.68rem] text-[var(--muted)]">
          Show restored sacred names where supported
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-label="Sacred Names"
        aria-checked={sacredNames}
        title="Show restored sacred names where supported"
        checked={sacredNames}
        onChange={(e) => setSacredNames(e.target.checked)}
        className="peer sr-only"
      />
      <span aria-hidden="true" className={`inline-flex h-8 min-w-16 shrink-0 items-center justify-center rounded-full border px-3 text-xs font-bold tracking-wide peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--brand)] ${sacredNames ? "border-[var(--brand)] bg-[var(--brand)] text-[#111214]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"}`}>
        {sacredNames ? "ON" : "OFF"}
      </span>
    </label>
  );
}
