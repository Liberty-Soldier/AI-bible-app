"use client";

import { useSacredNames } from "../data/useSacredNames";

export default function SacredNameToggle() {
  const { sacredNames, setSacredNames } = useSacredNames();

  return (
    <label className="flex min-h-11 items-center justify-between gap-4 border-t border-[var(--border)] py-3 text-sm text-[var(--foreground)]">
      <span>
        <span className="block text-xs font-semibold">Sacred Name rendering</span>
        <span className="mt-0.5 block text-[0.68rem] text-[var(--muted)]">
          Show restored sacred names where supported
        </span>
      </span>
      <input
        type="checkbox"
        checked={sacredNames}
        onChange={(e) => setSacredNames(e.target.checked)}
        className="h-4 w-4 accent-[var(--brand)]"
      />
    </label>
  );
}
