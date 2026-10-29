"use client";

import {
  updateReaderPreferences,
  useReaderPreferences,
  type ReaderFontFamily,
  type ReaderLineSpacing,
  type ReaderTextSize,
} from "@/app/lib/readerPreferences";

function OptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; ariaLabel?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--border)] py-2 last:border-b-0">
      <span className="text-xs font-semibold text-[var(--muted)]">{label}</span>
      <div
        className="inline-flex rounded-xl bg-[var(--surface)] p-1"
        role="group"
        aria-label={label}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-label={option.ariaLabel || option.label}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-lg px-3 text-sm font-medium transition ${
              value === option.value
                ? "bg-[var(--background)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ReaderAppearanceControls() {
  const preferences = useReaderPreferences();

  return (
    <section aria-label="Reading appearance" className="rounded-2xl">
      <OptionGroup<ReaderFontFamily>
        label="Typeface"
        value={preferences.fontFamily}
        options={[
          { value: "serif", label: "Book" },
          { value: "sans", label: "Modern" },
        ]}
        onChange={(fontFamily) => updateReaderPreferences({ fontFamily })}
      />
      <OptionGroup<ReaderTextSize>
        label="Text size"
        value={preferences.textSize}
        options={[
          { value: "small", label: "A−", ariaLabel: "Small text" },
          { value: "medium", label: "A", ariaLabel: "Medium text" },
          { value: "large", label: "A+", ariaLabel: "Large text" },
        ]}
        onChange={(textSize) => updateReaderPreferences({ textSize })}
      />
      <OptionGroup<ReaderLineSpacing>
        label="Line spacing"
        value={preferences.lineSpacing}
        options={[
          { value: "compact", label: "Tight" },
          { value: "comfortable", label: "Normal" },
          { value: "relaxed", label: "Wide" },
        ]}
        onChange={(lineSpacing) => updateReaderPreferences({ lineSpacing })}
      />
    </section>
  );
}
