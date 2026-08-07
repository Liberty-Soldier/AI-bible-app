"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import {
  deleteNote,
  getReaderMemory,
  getReaderMemoryVerseLabel,
  updateNote,
  type ReaderMemory,
  type ReaderNote,
} from "@/app/lib/readerMemory";
import { buildReaderHref } from "@/app/lib/translationPreference";

type LibraryTab = "bookmarks" | "highlights" | "notes";

function formatNoteDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

function getNoteReference(note: ReaderNote) {
  const first = note.verses[0];
  const last = note.verses[note.verses.length - 1];

  if (!first) return "Saved note";

  return note.verses.length === 1
    ? first.reference
    : `${first.book} ${first.chapter}:${getReaderMemoryVerseLabel(
        first,
      )}-${getReaderMemoryVerseLabel(last || first)}`;
}

function getNoteScriptureHref(note: ReaderNote) {
  const first = note.verses[0];
  if (!first) return "/read";

  return buildReaderHref({
    book: first.book,
    chapter: first.chapter,
    verse: getReaderMemoryVerseLabel(first),
    translation: first.translation,
  });
}

function LibraryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = getValidTab(searchParams.get("tab"));
  const selectedNoteId = searchParams.get("note");

  const [memory, setMemory] = useState<ReaderMemory>({
    bookmarks: [],
    highlights: [],
    notes: [],
  });

  useEffect(() => {
    function refreshMemory() {
      setMemory(getReaderMemory());
    }

    refreshMemory();
    window.addEventListener("reader-memory-updated", refreshMemory);
    window.addEventListener("storage", refreshMemory);

    return () => {
      window.removeEventListener("reader-memory-updated", refreshMemory);
      window.removeEventListener("storage", refreshMemory);
    };
  }, []);

  const selectedNote = selectedNoteId
    ? memory.notes.find((note) => note.id === selectedNoteId) || null
    : null;

  function openNote(noteId: string) {
    router.push(
      `/library?tab=notes&note=${encodeURIComponent(noteId)}`,
      { scroll: false },
    );
  }

  function closeNote() {
    router.replace("/library?tab=notes", { scroll: false });
  }

  function refreshMemory() {
    setMemory(getReaderMemory());
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-5 pb-24 pt-10 text-[var(--foreground)]">
      <section className="mx-auto max-w-xl">
        <div className="mb-6">
          <Link
            href="/"
            className="text-sm font-semibold text-[var(--muted)]"
          >
            ← Home
          </Link>

          <h1 className="mt-5 text-3xl font-semibold tracking-tight">
            Library
          </h1>

          <p className="mt-2 text-[var(--muted)]">
            Bookmarks, highlights, and notes saved on this device.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[var(--surface)] p-1">
          <TabLink
            href="/library?tab=bookmarks"
            active={activeTab === "bookmarks"}
          >
            Bookmarks
          </TabLink>

          <TabLink
            href="/library?tab=highlights"
            active={activeTab === "highlights"}
          >
            Highlights
          </TabLink>

          <TabLink href="/library?tab=notes" active={activeTab === "notes"}>
            Notes
          </TabLink>
        </div>

        <div className="mt-6">
          {activeTab === "bookmarks" ? (
            <LibrarySection emptyText="No bookmarks yet.">
              {memory.bookmarks
                .slice()
                .reverse()
                .map((item) => (
                  <VerseMemoryCard
                    key={`${item.id}-${item.savedAt}`}
                    reference={item.reference}
                    text={item.text}
                    href={buildReaderHref({
                      book: item.book,
                      chapter: item.chapter,
                      verse: getReaderMemoryVerseLabel(item),
                      translation: item.translation,
                    })}
                  />
                ))}
            </LibrarySection>
          ) : null}

          {activeTab === "highlights" ? (
            <LibrarySection emptyText="No highlights yet.">
              {memory.highlights
                .slice()
                .reverse()
                .map((item) => (
                  <VerseMemoryCard
                    key={`${item.id}-${item.savedAt}`}
                    reference={item.reference}
                    text={item.text}
                    color={item.color}
                    href={buildReaderHref({
                      book: item.book,
                      chapter: item.chapter,
                      verse: getReaderMemoryVerseLabel(item),
                      translation: item.translation,
                    })}
                  />
                ))}
            </LibrarySection>
          ) : null}

          {activeTab === "notes" ? (
            <LibrarySection emptyText="No notes yet.">
              {memory.notes.map((note) => (
                <NoteMemoryCard
                  key={note.id}
                  note={note}
                  onOpen={() => openNote(note.id)}
                />
              ))}
            </LibrarySection>
          ) : null}
        </div>
      </section>

      <MobileBottomNav />

      {selectedNote ? (
        <NoteEditor
          note={selectedNote}
          onClose={closeNote}
          onMemoryChange={refreshMemory}
        />
      ) : null}
    </main>
  );
}

function getValidTab(tab: string | null): LibraryTab {
  if (tab === "highlights" || tab === "notes" || tab === "bookmarks") {
    return tab;
  }

  return "bookmarks";
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl py-2 text-center text-xs font-semibold ${
        active
          ? "bg-[var(--foreground)] text-[var(--background)]"
          : "text-[var(--muted)]"
      }`}
    >
      {children}
    </Link>
  );
}

function LibrarySection({
  children,
  emptyText,
}: {
  children: React.ReactNode;
  emptyText: string;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;

  if (Array.isArray(items) && items.length === 0) {
    return (
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
        {emptyText}
      </div>
    );
  }

  return <div className="space-y-3">{items}</div>;
}

function NoteMemoryCard({
  note,
  onOpen,
}: {
  note: ReaderNote;
  onOpen: () => void;
}) {
  const edited = note.updatedAt > note.savedAt + 1000;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full border-b border-[var(--border)] py-4 text-left transition active:opacity-70"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="font-semibold">{getNoteReference(note)}</p>
        <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">
          Open
        </span>
      </div>

      <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--muted)]">
        {note.note}
      </p>

      <p className="mt-3 text-xs text-[var(--muted)]">
        Created {formatNoteDate(note.savedAt)}
        {edited ? ` · Edited ${formatNoteDate(note.updatedAt)}` : ""}
      </p>
    </button>
  );
}

function VerseMemoryCard({
  reference,
  text,
  href,
  color,
}: {
  reference: string;
  text: string;
  href: string;
  color?: string;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-3xl border border-[var(--border)] p-4 ${
        color === "green"
          ? "bg-emerald-500/15"
          : color === "blue"
          ? "bg-sky-500/15"
          : color === "pink"
          ? "bg-pink-500/15"
          : color === "purple"
          ? "bg-purple-500/15"
          : color === "yellow"
          ? "bg-yellow-200/35"
          : "bg-[var(--surface)]"
      }`}
    >
      <p className="font-semibold">{reference}</p>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--muted)]">
        {text}
      </p>
    </Link>
  );
}

function NoteEditor({
  note,
  onClose,
  onMemoryChange,
}: {
  note: ReaderNote;
  onClose: () => void;
  onMemoryChange: () => void;
}) {
  const [draft, setDraft] = useState(note.note);
  const [message, setMessage] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setDraft(note.note);
    setMessage("");
    setDeleteConfirmOpen(false);
    setKeyboardInset(0);
  }, [note.id, note.note]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateKeyboardInset = () => {
      const inset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      setKeyboardInset(inset > 80 ? Math.round(inset) : 0);
    };

    updateKeyboardInset();
    viewport.addEventListener("resize", updateKeyboardInset);
    viewport.addEventListener("scroll", updateKeyboardInset);

    return () => {
      viewport.removeEventListener("resize", updateKeyboardInset);
      viewport.removeEventListener("scroll", updateKeyboardInset);
    };
  }, []);

  function saveChanges() {
    const clean = draft.trim();

    if (!clean) {
      setMessage("A note cannot be empty.");
      return;
    }

    const updated = updateNote(note.id, clean);

    if (!updated) {
      setMessage("This note could not be found.");
      return;
    }

    textareaRef.current?.blur();
    setKeyboardInset(0);
    setDraft(updated.note);
    setMessage("Changes saved.");
    setDeleteConfirmOpen(false);
    onMemoryChange();
  }

  function deletePermanently() {
    if (!deleteNote(note.id)) {
      setMessage("This note could not be found.");
      return;
    }

    onMemoryChange();
    onClose();
  }

  const hasChanges = draft.trim() !== note.note.trim();

  return (
    <div className="fixed inset-0 z-[110] bg-[var(--background)] text-[var(--foreground)]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-editor-title"
        className="mx-auto flex h-full max-w-xl flex-col"
      >
        <header className="border-b border-[var(--border)] px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
                Scripture note
              </p>
              <h2
                id="note-editor-title"
                className="mt-1 truncate text-xl font-semibold"
              >
                {getNoteReference(note)}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => {
                textareaRef.current?.blur();
                setKeyboardInset(0);
                onClose();
              }}
              className="shrink-0 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold"
            >
              Close
            </button>
          </div>
        </header>

        <div
          className="flex-1 overflow-y-auto px-5 py-5"
          style={{ paddingBottom: `${keyboardInset + 104}px` }}
        >
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-sm font-semibold">{getNoteReference(note)}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              Created {formatNoteDate(note.savedAt)}
              {note.updatedAt > note.savedAt + 1000
                ? ` · Last edited ${formatNoteDate(note.updatedAt)}`
                : ""}
            </p>
          </div>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-semibold">
              Your note
            </span>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setMessage("");
              }}
              autoFocus
              className={`w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-base leading-7 outline-none focus:border-amber-500/50 ${keyboardInset ? "min-h-[26dvh]" : "min-h-[38dvh]"}`}
            />
          </label>

          {message ? (
            <p
              aria-live="polite"
              className="mt-3 rounded-xl bg-[var(--surface)] px-4 py-3 text-sm font-semibold"
            >
              {message}
            </p>
          ) : null}

          <Link
            href={getNoteScriptureHref(note)}
            onClick={onClose}
            className="mt-5 block rounded-2xl border border-[var(--border)] px-4 py-3 text-center text-sm font-semibold"
          >
            View Scripture
          </Link>

          <div className="mt-8 border-t border-[var(--border)] pt-6">
            {!deleteConfirmOpen ? (
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                className="w-full rounded-2xl border border-red-500/35 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-400"
              >
                Delete note
              </button>
            ) : (
              <div className="rounded-2xl border border-red-500/35 bg-red-500/10 p-4">
                <p className="font-semibold">Delete this note permanently?</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  This removes the note from this device. The Scripture passage
                  is not changed.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmOpen(false)}
                    className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-semibold"
                  >
                    Keep note
                  </button>
                  <button
                    type="button"
                    onClick={deletePermanently}
                    className="rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white"
                  >
                    Delete permanently
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer
          className="fixed inset-x-0 z-[120] border-t border-[var(--border)] bg-[var(--background)] px-5 pt-3"
          style={{
            bottom: keyboardInset ? `${keyboardInset}px` : "0px",
            paddingBottom: keyboardInset
              ? "12px"
              : "max(1rem, env(safe-area-inset-bottom))",
          }}
        >
          <div className="mx-auto max-w-xl">
            <button
              type="button"
              onClick={saveChanges}
              disabled={!hasChanges || !draft.trim()}
              className="w-full rounded-2xl bg-[var(--foreground)] px-5 py-3.5 text-sm font-bold text-[var(--background)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {hasChanges ? "Save changes" : "Saved"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={null}>
      <LibraryPageContent />
    </Suspense>
  );
}
