"use client";

import { useEffect, useState } from "react";

type Translation = "web" | "kjv" | "brenton";

type Props = {
  onTranslationChange?: (translation: Translation) => void;
};

export default function TranslationSelector({
  onTranslationChange,
}: Props) {
  const [translation, setTranslation] = useState<Translation>("web");

  useEffect(() => {
    const saved = localStorage.getItem("preferredTranslation");

    if (saved === "web" || saved === "kjv" || saved === "brenton") {
      setTranslation(saved);
      onTranslationChange?.(saved);
    }
  }, [onTranslationChange]);

  function handleChange(value: Translation) {
    setTranslation(value);
    localStorage.setItem("preferredTranslation", value);
    onTranslationChange?.(value);
  }

  return (
    <div className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
      <p className="mb-3 text-sm uppercase tracking-[0.25em] text-neutral-500">
        Preferred Translation
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        {(["web", "kjv", "brenton"] as Translation[]).map((value) => (
          <button
            key={value}
            onClick={() => handleChange(value)}
            className={`rounded-xl p-3 ${
              translation === value
                ? "bg-white text-black"
                : "bg-neutral-950 text-white"
            }`}
          >
            {value === "web" ? "WEB" : value === "kjv" ? "KJV" : "Brenton"}
          </button>
        ))}
      </div>
    </div>
  );
}