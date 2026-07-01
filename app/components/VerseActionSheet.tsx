"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SelectedVerse } from "@/app/components/VerseActionController";
import {
  areAllBookmarked,
  highlightVerses,
  removeHighlights,
  saveNote,
  toggleBookmarks,
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
  const touchStartY = useRef<number | null>(null);

  const firstVerse = verses[0];
  const lastVerse = verses[verses.length - 1];

  const referenceLabel = useMemo(() => {
    if (!firstVerse) return "";
    if (verses.length === 1) return firstVerse.reference;
    return `${firstVerse.book} ${firstVerse.chapter}:${firstVerse.verse}-${lastVerse.verse}`;
  }, [firstVerse, lastVerse, verses.length]);

  const selectedText = useMemo(
    () => verses.map((v) => `${v.verse} ${v.text}`).join("\n"),
    [verses]
  );

  const verseUrl =
    typeof window !== "undefined" && firstVerse
      ? `${window.location.origin}/read/${encodeURIComponent(
          firstVerse.book
        )}/${firstVerse.chapter}?verse=${firstVerse.verse}`
      : "";

  const shareText = `${referenceLabel}\n\n${selectedText}\n\nRead in Scripture Search:\n${verseUrl}`;

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
    }
  }, [open]);

  if (!open || verses.length === 0 || !firstVerse) return null;

  function emitMemoryChange() {
    window.dispatchEvent(new Event("reader-memory-updated"));
    onMemoryChange?.();
  }

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 1200);
  }

  async function copySelection() {
    try {
      await navigator.clipboard.writeText(shareText);
      showMessage(verses.length === 1 ? "Verse copied" : "Verses copied");
    } catch {
      showMessage("Copy failed");
    }
  }

  async function shareSelection() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: referenceLabel,
          text: `${referenceLabel}\n\n${selectedText}`,
          url: verseUrl,
        });
        showMessage("Share opened");
        return;
      }

      await navigator.clipboard.writeText(shareText);
      showMessage("Share text copied");
    } catch {
      showMessage("Share cancelled");
    }
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
  }

  function submitNote() {
    const cleanNote = noteText.trim();

    if (!cleanNote) {
      showMessage("Add note text first");
      return;
    }

    saveNote(verses, cleanNote);
    setNoteText("");
    setNoteOpen(false);
    emitMemoryChange();
    showMessage("Note saved");
  }

  function placeholder(action: string) {
    showMessage(`${action} coming soon`);
  }

  function onTouchStart(event: React.TouchEvent) {
    touchStartY.current = event.touches[0]?.clientY ?? null;
  }

  function onTouchEnd(event: React.TouchEvent) {
    if (touchStartY.current === null) return;

    const endY = event.changedTouches[0]?.clientY ?? touchStartY.current;
    const delta = touchStartY.current - endY;

    if (delta > 20) setExpanded(true);
    if (delta < -20) setExpanded(false);

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
        className={`pointer-events-auto absolute bottom-0 left-0 right-0 rounded-t-[1.75rem] border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] shadow-2xl transition-all duration-200 ${
          expanded ? "h-[78dvh]" : "h-[178px]"
        }`}
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
                Clear
              </button>
            </div>

            {message ? (
              <div className="mt-2 rounded-full bg-[var(--surface)] px-3 py-1.5 text-center text-xs font-semibold">
                {message}
              </div>
            ) : null}

            {!expanded ? (
              <>
                <div className="mt-2 grid grid-cols-6 gap-2">
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
                    className="min-h-9 rounded-xl border border-[var(--border)] text-[0.65rem] font-semibold text-[var(--muted)]"
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
            ) : (
              <div className="mt-3 flex-1 overflow-y-auto overscroll-contain pb-6">
                {noteOpen ? (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <textarea
                      value={noteText}
                      onChange={(event) => setNoteText(event.target.value)}
                      placeholder="Write a note..."
                      className="min-h-28 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
                    />

                    <button
                      type="button"
                      onClick={submitNote}
                      className="mt-3 w-full rounded-full bg-[var(--foreground)] py-3 text-sm font-semibold text-[var(--background)]"
                    >
                      Save Note
                    </button>
                  </div>
                ) : null}

                <div className="mt-3 rounded-2xl bg-[var(--surface)] p-3 text-xs leading-5">
                  {selectedText}
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                    Highlight
                  </p>

                  <div className="grid grid-cols-6 gap-2">
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
                      className="min-h-10 rounded-xl border border-[var(--border)] text-xs font-semibold text-[var(--muted)]"
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
                  <ActionButton onClick={() => placeholder("Ask Scripture")}>
                    Ask Scripture
                  </ActionButton>
                  <ActionButton onClick={() => placeholder("Compare")}>
                    Compare
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
      className="min-h-11 rounded-2xl bg-[var(--surface)] px-3 text-center text-xs font-semibold text-[var(--foreground)] active:scale-[0.98]"
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
      className={`min-h-9 rounded-xl border border-black/10 ${className}`}
    />
  );
}