"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SelectedVerse } from "@/app/components/VerseActionController";
import SourceBreakdownVerse from "@/app/components/SourceBreakdownVerse";
import type { BibleIQChapterTokenAvailability } from "@/app/data/lexicon/BibleIQTypes";
import {
  areAllBookmarked,
  highlightVerses,
  removeHighlights,
  saveNote,
  toggleBookmarks,
  getReaderMemoryVerseLabel,
  type ReaderHighlight,
} from "@/app/lib/readerMemory";

export default function VerseActionSheet({
  open,
  verses,
  onClose,
  onMemoryChange,
}: {
  open: boolean;
  verses: SelectedVerse[];
  onClose: () => void;
  onMemoryChange?: () => void;
  tokenAvailabilityByVerse?: BibleIQChapterTokenAvailability;
}) {
  const [message, setMessage] = useState("");
  const [panel, setPanel] = useState<"actions" | "highlight" | "note" | "source" | null>(null);
  const noteOpen = panel === "note";
  const [noteText, setNoteText] = useState("");
  const [bookmarked, setBookmarked] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [noteViewportHeight, setNoteViewportHeight] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const firstVerse = verses[0];
  const lastVerse = verses[verses.length - 1];

  const referenceLabel = useMemo(() => {
    if (!firstVerse) return "";
    if (verses.length === 1) return firstVerse.reference;
    const contiguous = verses.every((verse, index) =>
      /^\d+$/.test(getReaderMemoryVerseLabel(verse)) &&
      (index === 0 || verse.verse === verses[index - 1].verse + 1),
    );
    const labels = contiguous
      ? `${getReaderMemoryVerseLabel(firstVerse)}–${getReaderMemoryVerseLabel(lastVerse)}`
      : verses.map(getReaderMemoryVerseLabel).join(", ");
    return `${firstVerse.book} ${firstVerse.chapter}:${labels}`;
  }, [firstVerse, lastVerse, verses]);

  const selectedText = useMemo(
    () => verses.map((v) => `${getReaderMemoryVerseLabel(v)} ${v.text}`).join("\n"),
    [verses]
  );

  const shareTranslation = firstVerse?.translation || "web";
  const shareTranslationLabel =
    shareTranslation === "kjv"
      ? "KJV"
      : shareTranslation === "brenton"
        ? "Brenton"
        : "WEB";

  const verseUrl =
    typeof window !== "undefined" && firstVerse
      ? `${window.location.origin}/read/${encodeURIComponent(
          firstVerse.book
        )}/${firstVerse.chapter}?translation=${encodeURIComponent(
          shareTranslation
        )}&verse=${encodeURIComponent(getReaderMemoryVerseLabel(firstVerse))}`
      : "";

  const shareHeading = `${referenceLabel} · ${shareTranslationLabel}`;
  const shareText = `${shareHeading}\n\n${selectedText}\n\nRead in EMETSEES:\n${verseUrl}`;


  useEffect(() => {
    if (!open || !firstVerse) return;
    setBookmarked(areAllBookmarked(verses));
  }, [open, firstVerse, verses]);

  useEffect(() => {
    if (!open) {
      setPanel(null);
      setMessage("");
      setNoteText("");
      setKeyboardInset(0);
      setNoteViewportHeight(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !noteOpen || typeof window === "undefined") {
      setKeyboardInset(0);
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateKeyboardInset = () => {
      const inset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      const nextInset = inset > 80 ? Math.round(inset) : 0;
      setKeyboardInset(nextInset);
      setNoteViewportHeight(
        nextInset > 0 ? Math.round(viewport.height) : 0,
      );
    };

    updateKeyboardInset();
    viewport.addEventListener("resize", updateKeyboardInset);
    viewport.addEventListener("scroll", updateKeyboardInset);

    return () => {
      viewport.removeEventListener("resize", updateKeyboardInset);
      viewport.removeEventListener("scroll", updateKeyboardInset);
    };
  }, [noteOpen, open]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (panel && !noteOpen && event.target instanceof Node && !rootRef.current?.contains(event.target)) setPanel(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (panel) {
        setPanel(null);
        menuButtonRef.current?.focus();
      } else onClose();
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open, panel, noteOpen, onClose]);

  useEffect(() => {
    if (panel && panel !== "note") panelRef.current?.focus({ preventScroll: true });
  }, [panel]);

  if (!open || verses.length === 0 || !firstVerse) return null;

  function emitMemoryChange() {
    window.dispatchEvent(new Event("reader-memory-updated"));
    onMemoryChange?.();
  }

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 1200);
  }

  async function copyTextWithFallback(text: string) {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Continue to the legacy copy fallback.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    let copied = false;

    try {
      copied = document.execCommand("copy");
    } finally {
      textarea.remove();
    }

    return copied;
  }

  async function copySelection() {
    const copied = await copyTextWithFallback(shareText);
    showMessage(
      copied
        ? verses.length === 1
          ? "Verse copied"
          : "Verses copied"
        : "Copy unavailable",
    );
  }

  async function shareSelection() {
    if (window.isSecureContext && navigator.share) {
      try {
        await navigator.share({
          title: shareHeading,
          text: `${shareHeading}\n\n${selectedText}`,
          url: verseUrl,
        });
        showMessage("Share opened");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          showMessage("Share cancelled");
          return;
        }
      }
    }

    const copied = await copyTextWithFallback(shareText);

    showMessage(
      copied
        ? verses.length === 1
          ? "Verse copied for sharing"
          : "Verses copied for sharing"
        : "Sharing unavailable",
    );
  }

  function highlightSelection(color: ReaderHighlight["color"]) {
    highlightVerses(verses, color);
    emitMemoryChange();
    showMessage("Highlighted");
  }

  function clearHighlightSelection() {
    removeHighlights(verses);
    emitMemoryChange();
    showMessage("Highlight removed");
  }

  function bookmarkSelection() {
    const saved = toggleBookmarks(verses);
    setBookmarked(saved);
    emitMemoryChange();
    showMessage(saved ? "Bookmark saved" : "Bookmark removed");
  }

  function openNoteEditor() {
    setPanel("note");

    window.setTimeout(() => {
      noteTextareaRef.current?.focus({ preventScroll: true });
    }, 80);
  }

  function closeNoteEditor() {
    noteTextareaRef.current?.blur();
    setPanel("actions");
    setKeyboardInset(0);
    setNoteViewportHeight(0);
  }

  function submitNote() {
    const cleanNote = noteText.trim();

    if (!cleanNote) {
      showMessage("Add note text first");
      return;
    }

    saveNote(verses, cleanNote);
    noteTextareaRef.current?.blur();
    setNoteText("");
    setPanel("actions");
    setKeyboardInset(0);
    setNoteViewportHeight(0);
    emitMemoryChange();
    showMessage("Note saved");
  }

  function closePanel() {
    noteTextareaRef.current?.blur();
    setPanel(null);
    menuButtonRef.current?.focus();
  }

  const actionClass = "flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-[var(--brand)]";

  return (
    <div
      ref={rootRef}
      className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[80] mx-auto max-w-2xl"
      style={noteOpen && keyboardInset ? { bottom: `${keyboardInset}px` } : undefined}
      onTouchStart={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
    >
      {panel ? (
        <section
          ref={panelRef}
          id="reader-verse-actions"
          aria-label={panel === "highlight" ? "Highlight selected verses" : panel === "note" ? "Note for selected verses" : panel === "source" ? "Original language and Word Study" : "Verse actions"}
          tabIndex={-1}
          className="absolute inset-x-0 bottom-full mb-2 max-h-[min(55dvh,26rem)] overflow-y-auto overscroll-contain rounded-xl border border-[var(--border)] bg-[var(--background)] p-2 outline-none"
          style={noteOpen && noteViewportHeight ? { maxHeight: `${Math.max(100, noteViewportHeight - 96)}px` } : undefined}
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 pb-1">
            <h2 className="text-sm font-semibold">{panel === "actions" ? "Verse actions" : panel === "highlight" ? "Highlight" : panel === "note" ? "Note" : "Original language / Word Study"}</h2>
            <button type="button" onClick={closePanel} className="min-h-11 px-2 text-sm text-[var(--muted)]">Close</button>
          </div>
          {panel === "actions" ? (
            <div className="pt-1">
              <button type="button" onClick={copySelection} className={actionClass}>Copy</button>
              <button type="button" onClick={bookmarkSelection} className={actionClass}>{bookmarked ? "Remove bookmark" : "Bookmark"}</button>
              <button type="button" onClick={() => setPanel("highlight")} className={actionClass}>Highlight</button>
              <button type="button" onClick={openNoteEditor} className={actionClass}>Note</button>
              <button type="button" onClick={shareSelection} className={actionClass}>Share</button>
              {verses.length === 1 ? (
                <SourceBreakdownVerse
                  reference={firstVerse.reference}
                  verse={firstVerse.verse}
                  translation={shareTranslation}
                  verseText={firstVerse.text}
                  label="Original language / Word Study"
                  className={actionClass}
                />
              ) : (
                <button type="button" onClick={() => setPanel("source")} className={actionClass}>Original language / Word Study</button>
              )}
            </div>
          ) : panel === "highlight" ? (
            <div className="px-3 py-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Highlight color">
                <ColorButton label="Yellow" onClick={() => highlightSelection("yellow")} className="bg-amber-300" />
                <ColorButton label="Green" onClick={() => highlightSelection("green")} className="bg-emerald-300" />
                <ColorButton label="Blue" onClick={() => highlightSelection("blue")} className="bg-sky-300" />
                <ColorButton label="Pink" onClick={() => highlightSelection("pink")} className="bg-pink-300" />
                <ColorButton label="Purple" onClick={() => highlightSelection("purple")} className="bg-purple-300" />
              </div>
              <button type="button" onClick={clearHighlightSelection} className={`${actionClass} mt-2`}>Remove highlight</button>
              <button type="button" onClick={() => setPanel("actions")} className={actionClass}>Back to actions</button>
            </div>
          ) : panel === "note" ? (
            <form className="space-y-3 p-3" onSubmit={(event) => { event.preventDefault(); submitNote(); }}>
              <label className="block">
                <span className="sr-only">Note for {referenceLabel}</span>
                <textarea
                  ref={noteTextareaRef}
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="Write a note…"
                  rows={4}
                  className="max-h-[25dvh] min-h-20 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 text-base leading-7 focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
                />
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={closeNoteEditor} className="min-h-11 px-3 text-sm">Cancel</button>
                <button type="submit" disabled={!noteText.trim()} className="min-h-11 rounded-lg bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)] disabled:opacity-45">Save note</button>
              </div>
            </form>
          ) : (
            <div className="space-y-1 pt-1">
              {verses.map((verse) => (
                <SourceBreakdownVerse
                  key={verse.id}
                  reference={verse.reference}
                  verse={verse.verse}
                  translation={verse.translation || shareTranslation}
                  verseText={verse.text}
                  label={verse.reference}
                  className={actionClass}
                />
              ))}
              <button type="button" onClick={() => setPanel("actions")} className={actionClass}>Back to actions</button>
            </div>
          )}
        </section>
      ) : null}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-1">
        <div role="group" aria-label="Selected verse actions" className="flex items-center gap-2">
          <p className="min-w-0 flex-1 break-words text-sm font-medium" aria-live="polite">
            {referenceLabel}
            {verses.length > 1 ? <span className="ml-2 text-xs text-[var(--muted)]">{verses.length} selected</span> : null}
          </p>
          <button
            ref={menuButtonRef}
            type="button"
            aria-label="Open verse actions"
            aria-expanded={panel !== null}
            aria-controls="reader-verse-actions"
            onClick={() => panel ? closePanel() : setPanel("actions")}
            className="min-h-11 min-w-11 rounded-lg px-2 text-xl focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
          >
            <span aria-hidden="true">⋯</span>
          </button>
          <button type="button" onClick={onClose} aria-label="Clear verse selection" className="min-h-11 px-2 text-sm font-medium text-[var(--muted)]">Done</button>
        </div>
        <p role="status" className={message ? "pb-1 text-center text-xs text-[var(--muted)]" : "sr-only"}>{message}</p>
      </div>
    </div>
  );
}

function ColorButton({ label, onClick, className }: { label: string; onClick: () => void; className: string }) {
  return (
    <button type="button" aria-label={`${label} highlight`} onClick={onClick} className="grid h-11 w-11 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--brand)]">
      <span aria-hidden="true" className={`h-7 w-7 rounded-full border border-black/10 ${className}`} />
    </button>
  );
}
