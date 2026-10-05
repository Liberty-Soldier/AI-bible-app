"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "emetsees-reader-tip-dismissed-v1";
const CHANGE_EVENT = "emetsees:reader-tip-dismissed";

function rememberDismissal() {
  localStorage.setItem(STORAGE_KEY, "true");
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  function dismissAfterVerseSelect(event: PointerEvent) {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('[data-verse-selector="true"]')
    ) {
      rememberDismissal();
    }
  }

  function onStorage(event: StorageEvent) {
    if (event.key === STORAGE_KEY) onChange();
  }

  document.addEventListener("pointerdown", dismissAfterVerseSelect, true);
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);

  return () => {
    document.removeEventListener("pointerdown", dismissAfterVerseSelect, true);
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export default function ReaderFirstUseTip() {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(STORAGE_KEY) === "true",
    () => true,
  );

  function dismiss() {
    rememberDismissal();
  }

  if (dismissed) {
    return null;
  }

  return (
    <aside
      className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-sm)]"
      aria-label="Reader tip"
    >
      <p className="min-w-0 flex-1 text-xs leading-5 text-[var(--muted)]">
        Tap a verse number for highlight, notes, sharing, and source study.
      </p>

      <button
        type="button"
        onClick={dismiss}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-base text-[var(--muted)] transition hover:bg-[var(--surface-soft)] active:scale-95"
        aria-label="Dismiss reader tip"
      >
        ×
      </button>
    </aside>
  );
}
