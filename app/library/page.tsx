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
  addReaderItemsToCollection,
  createReaderCollection,
  deleteReaderCollection,
  deleteNote,
  getReaderMemory,
  getReaderMemoryVerseLabel,
  updateNote,
  type ReaderBookmark,
  type ReaderCollectionItemType,
  type ReaderHighlightCollection,
  type ReaderMemory,
  type ReaderNote,
} from "@/app/lib/readerMemory";
import { getCanonicalBookIndex } from "@/app/data/scripture/canonicalBookOrder";
import { buildReaderHref } from "@/app/lib/translationPreference";
import type { ReaderLibrarySyncStatus } from "@/app/components/ReaderLibrarySync";
import {
  compareReaderVerses,
  groupBookmarksByBook,
  groupNotesByBook,
  sortRecentBookmarks,
  sortRecentNotes,
} from "@/app/lib/readerLibraryOrganization";

type LibraryTab = "bookmarks" | "highlights" | "notes";
type LibraryView = "recent" | "book" | "collections";

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
  const activeView = getValidLibraryView(searchParams.get("view"));
  const selectedNoteId = searchParams.get("note");

  const [memory, setMemory] = useState<ReaderMemory>({
    bookmarks: [],
    highlights: [],
    notes: [],
    highlightCollections: [],
  });
  const [selectingType, setSelectingType] = useState<LibraryTab | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
  const [collectionMessage, setCollectionMessage] = useState("");
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [syncStatus, setSyncStatus] = useState<ReaderLibrarySyncStatus | "">(
    "",
  );

  const recentHighlightGroups = useMemo(
    () => groupRecentHighlights(memory.highlights),
    [memory.highlights],
  );
  const bookHighlightGroups = useMemo(
    () => groupHighlightsByBook(memory.highlights),
    [memory.highlights],
  );
  const recentBookmarks = useMemo(
    () => sortRecentBookmarks(memory.bookmarks),
    [memory.bookmarks],
  );
  const bookmarkBooks = useMemo(
    () => groupBookmarksByBook(memory.bookmarks),
    [memory.bookmarks],
  );
  const recentNotes = useMemo(
    () => sortRecentNotes(memory.notes),
    [memory.notes],
  );
  const noteBooks = useMemo(
    () => groupNotesByBook(memory.notes),
    [memory.notes],
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

  useEffect(() => {
    function refreshSyncStatus(event?: Event) {
      const detail = (event as CustomEvent<ReaderLibrarySyncStatus> | undefined)
        ?.detail;
      const status =
        detail ||
        (document.documentElement.dataset
          .readerLibrarySync as ReaderLibrarySyncStatus | undefined);
      if (status) setSyncStatus(status);
    }

    refreshSyncStatus();
    window.addEventListener("reader-library-sync-status", refreshSyncStatus);
    return () =>
      window.removeEventListener(
        "reader-library-sync-status",
        refreshSyncStatus,
      );
  }, []);

  const selectedNote = selectedNoteId
    ? memory.notes.find((note) => note.id === selectedNoteId) || null
    : null;

  function openNote(noteId: string) {
    router.push(
      `/library?tab=notes&view=${activeView}&note=${encodeURIComponent(noteId)}`,
      { scroll: false },
    );
  }

  function closeNote() {
    router.replace(`/library?tab=notes&view=${activeView}`, { scroll: false });
  }

  function refreshMemory() {
    setMemory(getReaderMemory());
  }

  function stopSelecting() {
    setSelectingType(null);
    setSelectedItemIds(new Set());
    setCollectionMessage("");
    setCollectionPickerOpen(false);
    setNewCollectionName("");
  }

  function beginSelecting() {
    if (selectingType === activeTab) {
      stopSelecting();
      return;
    }
    setSelectingType(activeTab);
    setSelectedItemIds(new Set());
    setCollectionMessage("");
    setCollectionPickerOpen(false);
    setNewCollectionName("");
  }

  function toggleItem(itemId: string) {
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
    setCollectionMessage("");
  }

  function toggleHighlightGroup(group: HighlightGroup) {
    setSelectedItemIds((current) => {
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

  function addSelectedItems(collectionId: string) {
    if (!selectingType || !selectedItemIds.size || !collectionId) return;

    const itemType = getCollectionItemType(selectingType);
    const result = addReaderItemsToCollection(
      itemType,
      Array.from(selectedItemIds),
      collectionId,
    );
    if (result) {
      const collection = memory.highlightCollections.find(
        (item) => item.id === collectionId,
      );
      refreshMemory();
      setCollectionPickerOpen(false);
      const noun = getItemNoun(itemType, result.addedCount);
      setCollectionMessage(result.addedCount
        ? `Added ${result.addedCount} ${noun} to ${collection?.name || "collection"}.`
        : `Those ${getItemNoun(itemType, 2)} are already in ${collection?.name || "that collection"}.`);
    }
  }

  function createCollectionAndAdd() {
    if (!selectingType) return;
    const collection = createReaderCollection(newCollectionName);
    if (!collection) {
      setCollectionMessage("Enter a collection name.");
      return;
    }
    setNewCollectionName("");
    setMemory(getReaderMemory());
    const itemType = getCollectionItemType(selectingType);
    const result = addReaderItemsToCollection(
      itemType,
      Array.from(selectedItemIds),
      collection.id,
    );
    refreshMemory();
    setCollectionPickerOpen(false);
    setCollectionMessage(result?.addedCount
      ? `Created ${collection.name} and added ${result.addedCount} ${getItemNoun(itemType, result.addedCount)}.`
      : `${collection.name} is ready. Those ${getItemNoun(itemType, 2)} were already included.`);
  }

  const selecting = selectingType === activeTab;
  const activeItemCount =
    activeTab === "bookmarks"
      ? memory.bookmarks.length
      : activeTab === "highlights"
        ? memory.highlights.length
        : memory.notes.length;

  return (
    <main className={`min-h-screen bg-[var(--background)] px-5 pt-10 text-[var(--foreground)] ${selecting ? "pb-52" : "pb-24"}`}>
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

          <p className="mt-2 text-[var(--muted)]" aria-live="polite">
            {syncStatus === "synced"
              ? "Backed up to your account and synchronized across your devices."
              : syncStatus === "syncing"
                ? "Saved in this browser. Synchronizing with your account…"
                : syncStatus === "offline"
                  ? "Saved in this browser. Changes will synchronize when you are back online."
                  : syncStatus === "error"
                    ? "Saved safely in this browser. Account synchronization will retry automatically."
                    : syncStatus === "signed-out"
                      ? "Saved in this browser. Sign in to back up and synchronize your Library across devices."
                      : "Saved in this browser. Signed-in Libraries synchronize across devices."}
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
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="grid flex-1 grid-cols-3 gap-1 rounded-2xl bg-[var(--surface)] p-1">
                <LibraryViewLink tab={activeTab} view="recent" active={activeView === "recent"}>Recent</LibraryViewLink>
                <LibraryViewLink tab={activeTab} view="book" active={activeView === "book"}>By Book</LibraryViewLink>
                <LibraryViewLink tab={activeTab} view="collections" active={activeView === "collections"}>Collections</LibraryViewLink>
              </div>
              {activeItemCount > 0 && activeView !== "collections" ? (
                <button type="button" onClick={beginSelecting} className="min-h-11 shrink-0 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold">
                  {selecting ? "Done" : "Select"}
                </button>
              ) : null}
            </div>

            {activeTab === "bookmarks" && activeView === "recent" ? (
              <BookmarkList items={recentBookmarks} selecting={selecting} selectedIds={selectedItemIds} onToggle={toggleItem} />
            ) : null}
            {activeTab === "bookmarks" && activeView === "book" ? (
              <BookmarkBooks sections={bookmarkBooks} selecting={selecting} selectedIds={selectedItemIds} onToggle={toggleItem} />
            ) : null}
            {activeTab === "highlights" && activeView === "recent" ? (
                <RecentHighlights
                  groups={recentHighlightGroups}
                  selecting={selecting}
                  selectedIds={selectedItemIds}
                  onToggle={toggleHighlightGroup}
                />
            ) : null}
            {activeTab === "highlights" && activeView === "book" ? (
                <BookHighlights
                  groups={bookHighlightGroups}
                  selecting={selecting}
                  selectedIds={selectedItemIds}
                  onToggle={toggleHighlightGroup}
                />
            ) : null}
            {activeTab === "notes" && activeView === "recent" ? (
              <NoteList items={recentNotes} selecting={selecting} selectedIds={selectedItemIds} onToggle={toggleItem} onOpen={openNote} />
            ) : null}
            {activeTab === "notes" && activeView === "book" ? (
              <NoteBooks sections={noteBooks} selecting={selecting} selectedIds={selectedItemIds} onToggle={toggleItem} onOpen={openNote} />
            ) : null}
            {activeView === "collections" ? (
              <LibraryCollections memory={memory} onMemoryChange={refreshMemory} onOpenNote={openNote} />
            ) : null}

            {selecting ? (
              <CollectionSelectionToolbar
                collections={memory.highlightCollections}
                itemType={getCollectionItemType(activeTab)}
                selectedCount={selectedItemIds.size}
                message={collectionMessage}
                pickerOpen={collectionPickerOpen}
                newCollectionName={newCollectionName}
                onPickerOpenChange={setCollectionPickerOpen}
                onNewCollectionNameChange={setNewCollectionName}
                onAddToCollection={addSelectedItems}
                onCreateAndAdd={createCollectionAndAdd}
                onClear={stopSelecting}
              />
            ) : null}
          </div>
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

function getValidLibraryView(view: string | null): LibraryView {
  if (view === "book" || view === "collections") return view;
  return "recent";
}

function getCollectionItemType(tab: LibraryTab): ReaderCollectionItemType {
  if (tab === "bookmarks") return "bookmark";
  if (tab === "notes") return "note";
  return "highlight";
}

function getItemNoun(type: ReaderCollectionItemType, count: number) {
  const singular = type;
  return count === 1 ? singular : `${singular}s`;
}

function LibraryViewLink({
  tab,
  view,
  active,
  children,
}: {
  tab: LibraryTab;
  view: LibraryView;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/library?tab=${tab}&view=${view}`}
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

type SelectableItemsProps = {
  selecting: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
};

function bookmarkHref(item: ReaderBookmark) {
  return buildReaderHref({
    book: item.book,
    chapter: item.chapter,
    verse: getReaderMemoryVerseLabel(item),
    translation: item.translation,
  });
}

function BookmarkList({
  items,
  ...selection
}: { items: ReaderBookmark[] } & SelectableItemsProps) {
  if (!items.length) return <LibraryEmpty>No bookmarks yet. Save a verse to find it here.</LibraryEmpty>;
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <BookmarkCard key={item.id} item={item} {...selection} />
      ))}
    </div>
  );
}

function BookmarkBooks({
  sections,
  ...selection
}: {
  sections: Array<{ book: string; items: ReaderBookmark[] }>;
} & SelectableItemsProps) {
  if (!sections.length) return <LibraryEmpty>No bookmarked books yet.</LibraryEmpty>;
  return (
    <div className="space-y-4">
      {sections.map(({ book, items }) => (
        <BookDetails key={book} book={book} count={items.length} noun="bookmark">
          {items.map((item) => <BookmarkCard key={item.id} item={item} {...selection} />)}
        </BookDetails>
      ))}
    </div>
  );
}

function BookmarkCard({
  item,
  selecting = false,
  selectedIds = new Set<string>(),
  onToggle = () => {},
  showType = false,
}: {
  item: ReaderBookmark;
  selecting?: boolean;
  selectedIds?: Set<string>;
  onToggle?: (id: string) => void;
  showType?: boolean;
}) {
  const selected = selectedIds.has(item.id);
  const className = selectableCardClass(selected, "bg-[var(--surface)]");
  const content = (
    <>
      <CardHeading reference={item.reference} selecting={selecting} selected={selected} type={showType ? "Bookmark" : undefined} />
      <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-[var(--muted)]">{item.text}</p>
    </>
  );
  return selecting ? (
    <button type="button" onClick={() => onToggle(item.id)} aria-pressed={selected} className={className}>{content}</button>
  ) : (
    <Link href={bookmarkHref(item)} className={className}>{content}</Link>
  );
}

function NoteList({
  items,
  onOpen,
  ...selection
}: { items: ReaderNote[]; onOpen: (id: string) => void } & SelectableItemsProps) {
  if (!items.length) return <LibraryEmpty>No notes yet. Add a note to a selected passage to find it here.</LibraryEmpty>;
  return (
    <div className="space-y-3">
      {items.map((note) => <NoteMemoryCard key={note.id} note={note} onOpen={() => onOpen(note.id)} {...selection} />)}
    </div>
  );
}

function NoteBooks({
  sections,
  onOpen,
  ...selection
}: {
  sections: Array<{ book: string; items: ReaderNote[] }>;
  onOpen: (id: string) => void;
} & SelectableItemsProps) {
  if (!sections.length) return <LibraryEmpty>No notes grouped by book yet.</LibraryEmpty>;
  return (
    <div className="space-y-4">
      {sections.map(({ book, items }) => (
        <BookDetails key={book} book={book} count={items.length} noun="note">
          {items.map((note) => <NoteMemoryCard key={note.id} note={note} onOpen={() => onOpen(note.id)} {...selection} />)}
        </BookDetails>
      ))}
    </div>
  );
}

function BookDetails({ book, count, noun, children }: { book: string; count: number; noun: string; children: React.ReactNode }) {
  return (
    <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <summary className="min-h-12 cursor-pointer list-none px-4 py-3 font-semibold">
        <span className="flex items-center justify-between gap-3">
          <span>{book}</span>
          <span className="text-xs text-[var(--muted)]">{count} {count === 1 ? noun : `${noun}s`}</span>
        </span>
      </summary>
      <div className="space-y-3 border-t border-[var(--border)] p-3">{children}</div>
    </details>
  );
}

function CardHeading({ reference, selecting, selected, type }: { reference: string; selecting: boolean; selected: boolean; type?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {type ? <span className="mb-1 inline-flex rounded-full bg-[var(--background)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">{type}</span> : null}
        <p className="font-semibold">{reference}</p>
      </div>
      {selecting ? <SelectionMark selected={selected} /> : null}
    </div>
  );
}

function SelectionMark({ selected }: { selected: boolean }) {
  return <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${selected ? "border-amber-600 bg-amber-600 text-white" : "border-[var(--muted)]"}`}>{selected ? "✓" : ""}</span>;
}

function selectableCardClass(selected: boolean, background: string) {
  return `block w-full rounded-2xl border p-3 text-left transition ${selected ? "border-amber-500 ring-2 ring-amber-500/20" : "border-[var(--border)]"} ${background}`;
}

function LibraryEmpty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">{children}</div>;
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
  showType = false,
}: {
  group: HighlightGroup;
  selecting?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  showType?: boolean;
}) {
  const first = group.items[0];
  const className = `block w-full rounded-2xl border p-3 text-left transition ${
    selected ? "border-amber-500 ring-2 ring-amber-500/20" : "border-[var(--border)]"
  } ${getHighlightColorClass(group.color)}`;
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          {showType ? <span className="mb-1 inline-flex rounded-full bg-[var(--background)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">Highlight</span> : null}
          <p className="font-semibold">{group.reference}</p>
        </div>
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

function CollectionSelectionToolbar({
  collections,
  itemType,
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
  itemType: ReaderCollectionItemType;
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
  const selectedNoun = getItemNoun(itemType, selectedCount);
  return (
    <div className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl">
      {pickerOpen ? (
        <section
          role="dialog"
          aria-label={`Add selected ${getItemNoun(itemType, 2)} to a collection`}
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
            {selectedCount} {selectedNoun} selected
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

function LibraryCollections({
  memory,
  onMemoryChange,
  onOpenNote,
}: {
  memory: ReaderMemory;
  onMemoryChange: () => void;
  onOpenNote: (id: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");
  const [deleteCollectionId, setDeleteCollectionId] = useState<string | null>(
    null,
  );

  function createCollection() {
    const collection = createReaderCollection(newName);
    if (!collection) {
      setMessage("Enter a collection name.");
      return;
    }

    setNewName("");
    setMessage(`Collection ready: ${collection.name}`);
    onMemoryChange();
  }

  function removeCollection(collectionId: string) {
    if (deleteReaderCollection(collectionId)) {
      setDeleteCollectionId(null);
      setMessage("Collection deleted. Its bookmarks, highlights, and notes are still saved.");
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
        <label htmlFor="new-library-collection" className="text-sm font-semibold">
          New collection
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="new-library-collection"
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
          bookmarks, highlights, or notes.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {memory.highlightCollections.map((collection) => {
            const bookmarks = memory.bookmarks.filter((bookmark) =>
              bookmark.collectionIds.includes(collection.id),
            );
            const highlights = memory.highlights.filter((highlight) =>
              highlight.collectionIds.includes(collection.id),
            );
            const highlightGroups = groupHighlightsByBook(highlights);
            const notes = memory.notes.filter((note) =>
              note.collectionIds.includes(collection.id),
            );
            const entries = [
              ...bookmarks.map((item) => ({ kind: "bookmark" as const, anchor: item, item })),
              ...highlightGroups.map((item) => ({ kind: "highlight" as const, anchor: item.items[0], item })),
              ...notes.filter((item) => item.verses[0]).map((item) => ({ kind: "note" as const, anchor: item.verses[0], item })),
            ].sort((left, right) => compareReaderVerses(left.anchor, right.anchor) || left.kind.localeCompare(right.kind));
            const itemCount = bookmarks.length + highlights.length + notes.length;

            return (
              <section
                key={collection.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <h2 className="font-semibold">{collection.name}</h2>
                    <p className="text-xs text-[var(--muted)]">
                      {itemCount} {itemCount === 1 ? "saved item" : "saved items"}
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
                  {entries.length ? (
                    entries.map((entry) =>
                      entry.kind === "bookmark" ? (
                        <BookmarkCard key={`bookmark-${entry.item.id}`} item={entry.item} showType />
                      ) : entry.kind === "highlight" ? (
                        <HighlightGroupCard key={`highlight-${entry.item.id}`} group={entry.item} showType />
                      ) : (
                        <NoteMemoryCard key={`note-${entry.item.id}`} note={entry.item} onOpen={() => onOpenNote(entry.item.id)} showType />
                      ),
                    )
                  ) : (
                    <p className="px-2 py-3 text-sm text-[var(--muted)]">
                      No saved items in this collection yet.
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

function NoteMemoryCard({
  note,
  onOpen,
  selecting = false,
  selectedIds = new Set<string>(),
  onToggle = () => {},
  showType = false,
}: {
  note: ReaderNote;
  onOpen: () => void;
  selecting?: boolean;
  selectedIds?: Set<string>;
  onToggle?: (id: string) => void;
  showType?: boolean;
}) {
  const edited = note.updatedAt > note.savedAt + 1000;
  const selected = selectedIds.has(note.id);
  const content = (
    <>
      <CardHeading reference={getNoteReference(note)} selecting={selecting} selected={selected} type={showType ? "Note" : undefined} />
      <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-[var(--muted)]">{note.note}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
        <span>Created {formatNoteDate(note.savedAt)}</span>
        {edited ? <span>Edited {formatNoteDate(note.updatedAt)}</span> : null}
      </div>
    </>
  );

  if (selecting) {
    return (
      <button type="button" onClick={() => onToggle(note.id)} aria-pressed={selected} className={selectableCardClass(selected, "bg-[var(--surface)]")}>
        {content}
      </button>
    );
  }

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
      {content}
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3">
        <Link href={getNoteScriptureHref(note)} className="min-h-11 rounded-xl border border-[var(--border)] px-3 py-2.5 text-center text-xs font-semibold">
          View passage
        </Link>
        <button type="button" onClick={onOpen} className="min-h-11 rounded-xl bg-[var(--foreground)] px-3 py-2.5 text-xs font-semibold text-[var(--background)]">
          Open & edit
        </button>
      </div>
    </article>
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
