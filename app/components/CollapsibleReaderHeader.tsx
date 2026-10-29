"use client";

import { useEffect, useRef, useState } from "react";

type Panel = "passage" | "translation" | "appearance";

export default function CollapsibleReaderHeader({
  title,
  translationLabel,
  passage,
  translation,
  children,
}: {
  title: string;
  translationLabel: string;
  passage: React.ReactNode;
  translation: React.ReactNode;
  children: React.ReactNode;
}) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!panel) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setPanel(null);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [panel]);

  function toggle(next: Panel, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setPanel((current) => current === next ? null : next);
  }

  return (
    <div ref={rootRef} onKeyDown={(event) => {
      if (event.key === "Escape" && panel) {
        event.preventDefault();
        setPanel(null);
        triggerRef.current?.focus();
      }
    }}>
      <div className="flex flex-wrap items-center gap-x-2 py-1">
        <button
          type="button"
          aria-label={`Choose passage, current passage ${title}`}
          aria-expanded={panel === "passage"}
          aria-controls="reader-passage-panel"
          onClick={(event) => toggle("passage", event.currentTarget)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left text-base font-semibold focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
        >
          <span className="break-words">{title}</span>
          <span aria-hidden="true" className="text-xs text-[var(--muted)]">⌄</span>
        </button>
        <button
          type="button"
          aria-label={`Choose translation, current translation ${translationLabel}`}
          aria-expanded={panel === "translation"}
          aria-controls="reader-translation-panel"
          onClick={(event) => toggle("translation", event.currentTarget)}
          className="min-h-11 rounded-lg px-3 text-sm font-semibold text-[var(--muted)] focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
        >
          {translationLabel}
        </button>
        <button
          type="button"
          aria-label="Reading appearance"
          aria-expanded={panel === "appearance"}
          aria-controls="reader-appearance-panel"
          onClick={(event) => toggle("appearance", event.currentTarget)}
          className="min-h-11 min-w-11 rounded-lg px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
        >
          Aa
        </button>
      </div>
      {panel ? (
        <section
          id={`reader-${panel}-panel`}
          aria-label={panel === "passage" ? "Choose passage" : panel === "translation" ? "Choose translation" : "Reading appearance"}
          className="max-h-[min(50dvh,26rem)] overflow-y-auto overscroll-contain border-t border-[var(--border)] py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <div className="mb-2 flex justify-end">
            <button type="button" onClick={() => {
              setPanel(null);
              triggerRef.current?.focus();
            }} className="min-h-11 px-3 text-sm font-medium text-[var(--muted)]">Close</button>
          </div>
          {panel === "passage" ? passage : panel === "translation" ? translation : children}
        </section>
      ) : null}
    </div>
  );
}
