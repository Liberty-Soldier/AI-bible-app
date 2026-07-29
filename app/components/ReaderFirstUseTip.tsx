"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "emetsees-reader-tip-dismissed-v1";
const OPEN_HELP_EVENT = "emetsees:open-reader-help";

function rememberDismissal() {
  localStorage.setItem(STORAGE_KEY, "true");
}

export default function ReaderFirstUseTip() {
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(localStorage.getItem(STORAGE_KEY) !== "true");
    setReady(true);

    function dismissAfterWordTap(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-word-token="true"]')) {
        rememberDismissal();
        setVisible(false);
      }
    }

    function reopenHelp() {
      setVisible(true);
    }

    document.addEventListener("pointerdown", dismissAfterWordTap, true);
    window.addEventListener(OPEN_HELP_EVENT, reopenHelp);

    return () => {
      document.removeEventListener("pointerdown", dismissAfterWordTap, true);
      window.removeEventListener(OPEN_HELP_EVENT, reopenHelp);
    };
  }, []);

  function dismiss() {
    rememberDismissal();
    setVisible(false);
  }

  if (!ready || !visible) {
    return null;
  }

  return (
    <aside
      className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-sm)]"
      aria-label="Reader tip"
    >
      <span
        aria-hidden="true"
        className="inline-block w-7 shrink-0 border-b border-dotted border-[var(--muted)]"
      />

      <p className="min-w-0 flex-1 text-xs leading-5 text-[var(--muted)]">
        <strong className="font-bold text-[var(--foreground)]">
          Dotted words open source evidence
        </strong>
        <span aria-hidden="true"> · </span>
        Verse numbers open tools
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
