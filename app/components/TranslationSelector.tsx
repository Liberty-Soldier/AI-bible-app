"use client";

import { useEffect, useState } from "react";
import {
  AVAILABLE_TRANSLATION_OPTIONS,
  getPreferredTranslation,
  setPreferredTranslation,
  type TranslationPreference,
} from "@/app/lib/translationPreference";

type Props = {
  onTranslationChange?: (translation: TranslationPreference) => void;
};

export default function TranslationSelector({
  onTranslationChange,
}: Props) {
  const [translation, setTranslation] =
    useState<TranslationPreference>("web");

  useEffect(() => {
    const saved = getPreferredTranslation();
    setTranslation(saved);
    onTranslationChange?.(saved);
  }, [onTranslationChange]);

  function handleChange(value: TranslationPreference) {
    const saved = setPreferredTranslation(value);
    setTranslation(saved);
    onTranslationChange?.(saved);
  }

  return (
    <section className="border-t border-[var(--border)] pt-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
        Preferred translation
      </p>

      <div className="mt-3 flex items-center gap-6 overflow-x-auto border-b border-[var(--border)]">
        {AVAILABLE_TRANSLATION_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => handleChange(option.id)}
            className={`border-b-2 px-0.5 pb-2.5 pt-1 text-sm font-semibold transition ${
              translation === option.id
                ? "border-[var(--foreground)] text-[var(--foreground)]"
                : "border-transparent text-[var(--muted)]"
            }`}
          >
            {option.shortLabel}
          </button>
        ))}
      </div>
    </section>
  );
}
