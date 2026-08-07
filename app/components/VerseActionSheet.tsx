"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SelectedVerse } from "@/app/components/VerseActionController";
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
}) {
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [bookmarked, setBookmarked] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [noteViewportHeight, setNoteViewportHeight] = useState(0);
  const touchStartY = useRef<number | null>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const firstVerse = verses[0];
  const lastVerse = verses[verses.length - 1];

  const referenceLabel = useMemo(() => {
    if (!firstVerse) return "";
    if (verses.length === 1) return firstVerse.reference;
    return `${firstVerse.book} ${firstVerse.chapter}:${getReaderMemoryVerseLabel(firstVerse)}-${getReaderMemoryVerseLabel(lastVerse)}`;
  }, [firstVerse, lastVerse, verses.length]);

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
      setExpanded(false);
      setMessage("");
      setNoteOpen(false);
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
        nextInset > 0 ? Math.max(320, Math.round(viewport.height)) : 0,
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
    setExpanded(true);
    setNoteOpen(true);

    window.setTimeout(() => {
      noteTextareaRef.current?.focus({ preventScroll: true });
    }, 80);
  }

  function closeNoteEditor() {
    noteTextareaRef.current?.blur();
    setNoteOpen(false);
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
    setNoteOpen(false);
    setKeyboardInset(0);
    setNoteViewportHeight(0);
    emitMemoryChange();
    showMessage("Note saved");
  }

  function onTouchStart(event: React.TouchEvent) {
    touchStartY.current = event.touches[0]?.clientY ?? null;
  }

  function onTouchEnd(event: React.TouchEvent) {
    if (touchStartY.current === null) return;

    const endY = event.changedTouches[0]?.clientY ?? touchStartY.current;
    const delta = touchStartY.current - endY;

    if (delta > 20) setExpanded(true);
    if (delta < -20 && !noteOpen) setExpanded(false);

    touchStartY.current = null;
  }

  return (
    <div
      className={`fixed inset-0 z-[80] ${
        expanded ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      {expanded ? (
        <button
          type="button"
          aria-label="Dismiss verse actions"
          onClick={onClose}
          className="absolute inset-0 bg-black/35"
        />
      ) : null}

      <section
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className={`pointer-events-auto absolute left-0 right-0 rounded-t-[1.75rem] border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] shadow-2xl transition-all duration-200 ${
          expanded ? "h-[78dvh]" : "h-[178px]"
        }`}
        style={
          noteOpen && keyboardInset
            ? {
                bottom: `${keyboardInset}px`,
                height: noteViewportHeight
                  ? `${noteViewportHeight}px`
                  : "auto",
              }
            : { bottom: 0 }
        }
      >
        <div className="flex h-full flex-col">
          <button
            type="button"
            aria-label={expanded ? "Collapse actions" : "Expand actions"}
            onClick={() => setExpanded((value) => !value)}
            className="mx-auto mt-3 h-2 w-20 rounded-full bg-[var(--border)]"
          />

          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col overflow-hidden px-4 pb-4 pt-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                  {verses.length === 1
                    ? "1 verse selected"
                    : `${verses.length} verses selected`}
                </p>

                <h2 className="truncate text-sm font-semibold">
                  {referenceLabel}
                </h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--muted)]"
              >
                Done
              </button>
            </div>

            {message ? (
              <div className="mt-2 rounded-full bg-[var(--surface)] px-3 py-1.5 text-center text-xs font-semibold">
                {message}
              </div>
            ) : null}

            {!expanded ? (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <ColorButton
                    label="Yellow"
                    onClick={() => highlightSelection("yellow")}
                    className="bg-amber-300"
                  />
                  <ColorButton
                    label="Green"
                    onClick={() => highlightSelection("green")}
                    className="bg-emerald-300"
                  />
                  <ColorButton
                    label="Blue"
                    onClick={() => highlightSelection("blue")}
                    className="bg-sky-300"
                  />
                  <ColorButton
                    label="Pink"
                    onClick={() => highlightSelection("pink")}
                    className="bg-pink-300"
                  />
                  <ColorButton
                    label="Purple"
                    onClick={() => highlightSelection("purple")}
                    className="bg-purple-300"
                  />
                  <button
                    type="button"
                    onClick={clearHighlightSelection}
                    className="ml-auto min-h-9 shrink-0 rounded-xl border border-[var(--border)] px-2.5 text-[0.68rem] font-semibold text-[var(--muted)]"
                  >
                    Clear
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-5 gap-2">
                  <CompactButton onClick={copySelection}>Copy</CompactButton>
                  <CompactButton onClick={shareSelection}>Share</CompactButton>
                  <CompactButton onClick={bookmarkSelection}>
                    {bookmarked ? "Unmark" : "Mark"}
                  </CompactButton>
                  <CompactButton onClick={openNoteEditor}>Note</CompactButton>
                  <CompactButton onClick={() => setExpanded(true)}>
                    More
                  </CompactButton>
                </div>
              </>
            ) : noteOpen ? (
              <div className="mt-3 flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                      New note
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {referenceLabel}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeNoteEditor}
                    className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)]"
                  >
                    Cancel
                  </button>
                </div>

                <textarea
                  ref={noteTextareaRef}
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="Write a note..."
                  className="mt-3 min-h-0 flex-1 resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-base leading-7 text-[var(--foreground)] outline-none focus:border-amber-500/50 placeholder:text-[var(--muted)]"
                />

                <div className="mt-3 shrink-0 border-t border-[var(--border)] pt-3">
                  <button
                    type="button"
                    onClick={submitNote}
                    disabled={!noteText.trim()}
                    className="w-full rounded-full bg-[var(--foreground)] py-3 text-sm font-semibold text-[var(--background)] disabled:opacity-45"
                  >
                    Save Note
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex-1 overflow-y-auto overscroll-contain pb-6">
                <div className="mt-3 rounded-2xl bg-[var(--surface)] p-3 text-xs leading-5">
                  {selectedText}
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                    Highlight
                  </p>

                  <div className="flex items-center gap-2">
                    <ColorButton
                      label="Yellow"
                      onClick={() => highlightSelection("yellow")}
                      className="bg-amber-300"
                    />
                    <ColorButton
                      label="Green"
                      onClick={() => highlightSelection("green")}
                      className="bg-emerald-300"
                    />
                    <ColorButton
                      label="Blue"
                      onClick={() => highlightSelection("blue")}
                      className="bg-sky-300"
                    />
                    <ColorButton
                      label="Pink"
                      onClick={() => highlightSelection("pink")}
                      className="bg-pink-300"
                    />
                    <ColorButton
                      label="Purple"
                      onClick={() => highlightSelection("purple")}
                      className="bg-purple-300"
                    />
                    <button
                      type="button"
                      onClick={clearHighlightSelection}
                      className="ml-auto min-h-10 shrink-0 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold text-[var(--muted)]"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <ActionButton onClick={copySelection}>Copy</ActionButton>
                  <ActionButton onClick={shareSelection}>Share</ActionButton>
                  <ActionButton onClick={bookmarkSelection}>
                    {bookmarked ? "Remove Bookmark" : "Bookmark"}
                  </ActionButton>
                  <ActionButton onClick={() => setNoteOpen((v) => !v)}>
                    Note
                  </ActionButton>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function CompactButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-9 rounded-xl bg-[var(--surface)] px-2 text-center text-[0.7rem] font-semibold text-[var(--foreground)] active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

function ActionButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 rounded-xl bg-[var(--surface)] px-3 text-center text-xs font-semibold text-[var(--foreground)] active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

function ColorButton({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`h-9 w-9 shrink-0 rounded-full border border-black/10 ${className}`}
    />
  );
}
