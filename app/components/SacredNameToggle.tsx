"use client";

import { useSacredNames } from "../data/useSacredNames";

export default function SacredNameToggle() {
  const { sacredNames, setSacredNames } = useSacredNames();

  return (
    <label className="flex items-center gap-2 mb-6 text-sm text-neutral-300">
      <input
        type="checkbox"
        checked={sacredNames}
        onChange={(e) => setSacredNames(e.target.checked)}
      />
      Sacred Name Rendering
    </label>
  );
}