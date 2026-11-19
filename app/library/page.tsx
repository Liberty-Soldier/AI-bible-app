"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import {
  formatHighlightDay,
  getHighlightDayKey,
  groupHighlightsByBook,
  groupRecentHighlights,
  type HighlightGroup,
} from "@/app/lib/highlightLibrary";
import {
  addHighlightsToCollection,
  createHighlightCollection,
  deleteHighlightCollection,
  deleteNote,
  getReaderMemory,
  getReaderMemoryVerseLabel,
  updateNote,
  type ReaderHighlightCollection,
  type ReaderMemory,
  type ReaderNote,
} from "@/app/lib/readerMemory";
import { getCanonicalBookIndex } from "@/app/data/scripture/canonicalBookOrder";
import { buildReaderHref } from "@/app/lib/translationPreference";

type LibraryTab = "bookmarks" | "highlights" | "notes";
type HighlightView = "recent" | "book" | "collections";

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
  const highlightView = getValidHighlightView(searchParams.get("view"));
  const selectedNoteId = searchParams.get("note");

  const [memory, setMemory] = useState<ReaderMemory>({
    bookmarks: [],
    highlights: [],
    notes: [],
    highlightCollections: [],
  });
  const [selectingHighlights, setSelectingHighlights] = useState(false);
  const [selectedHighlightIds, setSelectedHighlightIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [collectionMessage, setCollectionMessage] = useState("");
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");

  const recentHighlightGroups = useMemo(
    () => groupRecentHighlights(memory.highlights),
    [memory.highlights],
  );
  const bookHighlightGroups = useMemo(
    () => groupHighlightsByBook(memory.highlights),
    [memory.highlights],
  );

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

  function stopSelectingHighlights() {
    setSelectingHighlights(false);
    setSelectedHighlightIds(new Set());
    setCollectionMessage("");
    setCollectionPickerOpen(false);
    setNewCollectionName("");
  }

  function toggleHighlightGroup(group: HighlightGroup) {
    setSelectedHighlightIds((current) => {
      const next = new Set(current);
      const groupIds = group.items.map((item) => item.id);
      const allSelected = groupIds.every((id) => next.has(id));

      groupIds.forEach((id) => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });

      return next;
    });
    setCollectionMessage("");
  }

  function addSelectedHighlights(collectionId: string) {
    if (!selectedHighlightIds.size || !collectionId) return;

    const result = addHighlightsToCollection(
      Array.from(selectedHighlightIds),
      collectionId,
    );
    if (result) {
      const collection = memory.highlightCollections.find(
        (item) => item.id === collectionId,
      );
      refreshMemory();
      setCollectionPickerOpen(false);
      setCollectionMessage(result.addedCount
        ? `Added ${result.addedCount} ${result.addedCount === 1 ? "highlight" : "highlights"} to ${collection?.name || "collection"}.`
        : `Those highlights are already in ${collection?.name || "that collection"}.`);
    }
  }

  function createCollectionAndAdd() {
    const collection = createHighlightCollection(newCollectionName);
    if (!collection) {
      setCollectionMessage("Enter a collection name.");
      return;
    }
    setNewCollectionName("");
    setMemory(getReaderMemory());
    const result = addHighlightsToCollection(
      Array.from(selectedHighlightIds),
      collection.id,
    );
    refreshMemory();
    setCollectionPickerOpen(false);
    setCollectionMessage(result?.addedCount
      ? `Created ${collection.name} and added ${result.addedCount} ${result.addedCount === 1 ? "highlight" : "highlights"}.`
      : `${collection.name} is ready. Those highlights were already included.`);
  }

  return (
    <main className={`min-h-screen bg-[var(--background)] px-5 pt-10 text-[var(--foreground)] ${selectingHighlights ? "pb-52" : "pb-24"}`}>
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
            Bookmarks, highlights, notes, and collections are stored only in
            this browser on this device. They are not synchronized.
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
            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="grid flex-1 grid-cols-3 gap-1 rounded-2xl bg-[var(--surface)] p-1">
                  <HighlightViewLink view="recent" active={highlightView === "recent"}>
                    Recent
                  </HighlightViewLink>
                  <HighlightViewLink view="book" active={highlightView === "book"}>
                    By Book
                  </HighlightViewLink>
                  <HighlightViewLink
                    view="collections"
                    active={highlightView === "collections"}
                  >
                    Collections
                  </HighlightViewLink>
                </div>

                {memory.highlights.length && highlightView !== "collections" ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectingHighlights) stopSelectingHighlights();
                      else setSelectingHighlights(true);
                    }}
                    className="shrink-0 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold"
                  >
                    {selectingHighlights ? "Done" : "Select"}
                  </button>
                ) : null}
              </div>

              {highlightView === "recent" ? (
                <RecentHighlights
                  groups={recentHighlightGroups}
                  selecting={selectingHighlights}
                  selectedIds={selectedHighlightIds}
                  onToggle={toggleHighlightGroup}
                />
              ) : null}

              {highlightView === "book" ? (
                <BookHighlights
                  groups={bookHighlightGroups}
                  selecting={selectingHighlights}
                  selectedIds={selectedHighlightIds}
                  onToggle={toggleHighlightGroup}
                />
              ) : null}

              {highlightView === "collections" ? (
                <HighlightCollections
                  memory={memory}
                  onMemoryChange={refreshMemory}
                />
              ) : null}

              {selectingHighlights ? (
                <HighlightCollectionToolbar
                  collections={memory.highlightCollections}
                  selectedCount={selectedHighlightIds.size}
                  message={collectionMessage}
                  pickerOpen={collectionPickerOpen}
                  newCollectionName={newCollectionName}
                  onPickerOpenChange={setCollectionPickerOpen}
                  onNewCollectionNameChange={setNewCollectionName}
                  onAddToCollection={addSelectedHighlights}
                  onCreateAndAdd={createCollectionAndAdd}
                  onClear={stopSelectingHighlights}
                />
              ) : null}
            </div>
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

function getValidHighlightView(view: string | null): HighlightView {
  if (view === "book" || view === "collections") return view;
  return "recent";
}

function HighlightViewLink({
  view,
  active,
  children,
}: {
  view: HighlightView;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/library?tab=highlights&view=${view}`}
      scroll={false}
      className={`rounded-xl px-2 py-2 text-center text-[11px] font-semibold ${
        active
          ? "bg-[var(--foreground)] text-[var(--background)]"
          : "text-[var(--muted)]"
      }`}
    >
      {children}
    </Link>
  );
}

function RecentHighlights({
  groups,
  selecting,
  selectedIds,
  onToggle,
}: HighlightListProps) {
  if (!groups.length) return <EmptyHighlights />;

  const days = new Map<string, HighlightGroup[]>();
  groups.forEach((group) => {
    const key = getHighlightDayKey(group.savedAt);
    const day = days.get(key) || [];
    day.push(group);
    days.set(key, day);
  });

  return (
    <div className="space-y-7">
      {Array.from(days.values()).map((dayGroups) => (
        <section key={getHighlightDayKey(dayGroups[0].savedAt)}>
          <h2 className="mb-3 text-sm font-bold text-[var(--muted)]">
            {formatHighlightDay(dayGroups[0].savedAt)}
          </h2>
          <div className="space-y-3">
            {dayGroups.map((group) => (
              <HighlightGroupCard
                key={group.id}
                group={group}
                selecting={selecting}
                selected={group.items.every((item) => selectedIds.has(item.id))}
                onToggle={() => onToggle(group)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

type HighlightListProps = {
  groups: HighlightGroup[];
  selecting: boolean;
  selectedIds: Set<string>;
  onToggle: (group: HighlightGroup) => void;
};

function BookHighlights({
  groups,
  selecting,
  selectedIds,
  onToggle,
}: HighlightListProps) {
  if (!groups.length) return <EmptyHighlights />;

  const books = new Map<string, HighlightGroup[]>();
  groups.forEach((group) => {
    const book = books.get(group.book) || [];
    book.push(group);
    books.set(group.book, book);
  });

  return (
    <div className="space-y-4">
      {Array.from(books.entries())
        .sort(
          ([a], [b]) =>
            getCanonicalBookIndex(a) - getCanonicalBookIndex(b) ||
            a.localeCompare(b),
        )
        .map(([book, bookGroups]) => (
          <details
            key={book}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
          >
            <summary className="min-h-12 cursor-pointer list-none px-4 py-3 font-semibold">
              <span className="flex items-center justify-between gap-3">
                <span>{book}</span>
                <span className="text-xs text-[var(--muted)]">
                  {bookGroups.reduce(
                    (count, group) => count + group.items.length,
                    0,
                  )}{" "}
                  saved {bookGroups.reduce(
                    (count, group) => count + group.items.length,
                    0,
                  ) === 1 ? "highlight" : "highlights"}
                </span>
              </span>
            </summary>
            <div className="space-y-3 border-t border-[var(--border)] p-3">
              {bookGroups.map((group) => (
                <HighlightGroupCard
                  key={group.id}
                  group={group}
                  selecting={selecting}
                  selected={group.items.every((item) =>
                    selectedIds.has(item.id),
                  )}
                  onToggle={() => onToggle(group)}
                />
              ))}
            </div>
          </details>
        ))}
    </div>
  );
}

function HighlightGroupCard({
  group,
  selecting,
  selected,
  onToggle,
}: {
  group: HighlightGroup;
  selecting?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const first = group.items[0];
  const className = `block w-full rounded-2xl border p-3 text-left transition ${
    selected ? "border-amber-500 ring-2 ring-amber-500/20" : "border-[var(--border)]"
  } ${getHighlightColorClass(group.color)}`;
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold">{group.reference}</p>
        {selecting ? (
          <span
            aria-hidden="true"
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
              selected
                ? "border-amber-600 bg-amber-600 text-white"
                : "border-[var(--muted)]"
            }`}
          >
            {selected ? "✓" : ""}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-[var(--muted)]">
        {group.text}
      </p>
    </>
  );

  if (selecting) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className={className}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={buildReaderHref({
        book: first.book,
        chapter: first.chapter,
        verse: getReaderMemoryVerseLabel(first),
        translation: first.translation,
      })}
      className={className}
    >
      {content}
    </Link>
  );
}

function getHighlightColorClass(color: HighlightGroup["color"]) {
  if (color === "green") return "bg-emerald-500/15";
  if (color === "blue") return "bg-sky-500/15";
  if (color === "pink") return "bg-pink-500/15";
  if (color === "purple") return "bg-purple-500/15";
  return "bg-yellow-200/35";
}

function EmptyHighlights() {
  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
      No highlights yet.
    </div>
  );
}

function HighlightCollectionToolbar({
  collections,
  selectedCount,
  message,
  pickerOpen,
  newCollectionName,
  onPickerOpenChange,
  onNewCollectionNameChange,
  onAddToCollection,
  onCreateAndAdd,
  onClear,
}: {
  collections: ReaderHighlightCollection[];
  selectedCount: number;
  message: string;
  pickerOpen: boolean;
  newCollectionName: string;
  onPickerOpenChange: (open: boolean) => void;
  onNewCollectionNameChange: (name: string) => void;
  onAddToCollection: (id: string) => void;
  onCreateAndAdd: () => void;
  onClear: () => void;
}) {
  return (
    <div className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl">
      {pickerOpen ? (
        <section
          role="dialog"
          aria-label="Add selected highlights to a collection"
          className="mb-2 max-h-[min(52dvh,26rem)] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3 shadow-xl"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Add to collection</h2>
            <button type="button" onClick={() => onPickerOpenChange(false)} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-[var(--muted)]">
              Cancel
            </button>
          </div>

          {collections.length ? (
            <div className="mt-2 space-y-1" role="list">
              {collections.map((collection) => (
                <button
                  key={collection.id}
                  type="button"
                  onClick={() => {
                    onAddToCollection(collection.id);
                  }}
                  className="flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-[var(--surface)]"
                >
                  <span>{collection.name}</span>
                  <span aria-hidden="true">Add</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-[var(--muted)]">
              No collections yet. Create one below.
            </p>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              onCreateAndAdd();
            }}
            className="mt-3 border-t border-[var(--border)] pt-3"
          >
            <label htmlFor="selection-new-collection" className="text-sm font-semibold">
              Create new collection
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="selection-new-collection"
                value={newCollectionName}
                onChange={(event) => onNewCollectionNameChange(event.target.value)}
                maxLength={60}
                placeholder="Collection name"
                className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base"
              />
              <button type="submit" disabled={!selectedCount || !newCollectionName.trim()} className="min-h-11 rounded-xl bg-[var(--foreground)] px-3 text-sm font-semibold text-[var(--background)] disabled:opacity-40">
                Create & add
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3 shadow-xl">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-sm font-semibold" aria-live="polite">
            {selectedCount} {selectedCount === 1 ? "highlight" : "highlights"} selected
          </p>
          <button type="button" onClick={onClear} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--muted)]">
            Clear
          </button>
        </div>
        <button
          type="button"
          onClick={() => onPickerOpenChange(!pickerOpen)}
          disabled={!selectedCount}
          aria-expanded={pickerOpen}
          className="mt-1 min-h-11 w-full rounded-xl bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)] disabled:opacity-40"
        >
          Add to collection
        </button>
        {message ? <p aria-live="polite" className="mt-2 text-xs font-semibold">{message}</p> : null}
      </div>
    </div>
  );
}

function HighlightCollections({
  memory,
  onMemoryChange,
}: {
  memory: ReaderMemory;
  onMemoryChange: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");
  const [deleteCollectionId, setDeleteCollectionId] = useState<string | null>(
    null,
  );

  function createCollection() {
    const collection = createHighlightCollection(newName);
    if (!collection) {
      setMessage("Enter a collection name.");
      return;
    }

    setNewName("");
    setMessage(`Collection ready: ${collection.name}`);
    onMemoryChange();
  }

  function removeCollection(collectionId: string) {
    if (deleteHighlightCollection(collectionId)) {
      setDeleteCollectionId(null);
      setMessage("Collection deleted. Your highlights are still saved.");
      onMemoryChange();
    }
  }

  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          createCollection();
        }}
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
      >
        <label htmlFor="new-highlight-collection" className="text-sm font-semibold">
          New collection
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="new-highlight-collection"
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
              setMessage("");
            }}
            maxLength={60}
            placeholder="Sabbath study"
            className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="rounded-xl bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-[var(--background)] disabled:opacity-40"
          >
            Create
          </button>
        </div>
        {message ? (
          <p aria-live="polite" className="mt-2 text-xs text-[var(--muted)]">
            {message}
          </p>
        ) : null}
      </form>

      {!memory.highlightCollections.length ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-[var(--muted)]">
          Create a collection, then use Select in Recent or By Book to add
          highlights.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {memory.highlightCollections.map((collection) => {
            const highlights = memory.highlights.filter((highlight) =>
              highlight.collectionIds.includes(collection.id),
            );
            const groups = groupHighlightsByBook(highlights);

            return (
              <section
                key={collection.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <h2 className="font-semibold">{collection.name}</h2>
                    <p className="text-xs text-[var(--muted)]">
                      {highlights.length}{" "}
                      {highlights.length === 1 ? "highlight" : "highlights"}
                    </p>
                  </div>
                  {deleteCollectionId === collection.id ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDeleteCollectionId(null)}
                        className="text-xs font-semibold text-[var(--muted)]"
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCollection(collection.id)}
                        className="text-xs font-semibold text-red-600 dark:text-red-400"
                      >
                        Confirm delete
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteCollectionId(collection.id)}
                      className="text-xs font-semibold text-[var(--muted)]"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <div className="space-y-3 border-t border-[var(--border)] p-3">
                  {groups.length ? (
                    groups.map((group) => (
                      <HighlightGroupCard key={group.id} group={group} />
                    ))
                  ) : (
                    <p className="px-2 py-3 text-sm text-[var(--muted)]">
                      No highlights in this collection yet.
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
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

