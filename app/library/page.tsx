"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import { getReaderMemory, type ReaderMemory } from "@/app/lib/readerMemory";

type LibraryTab = "bookmarks" | "highlights" | "notes";

function LibraryPageContent() {
  const searchParams = useSearchParams();
  const activeTab = getValidTab(searchParams.get("tab"));

  const [memory, setMemory] = useState<ReaderMemory>({
    bookmarks: [],
    highlights: [],
    notes: [],
  });

  useEffect(() => {
    setMemory(getReaderMemory());
  }, []);

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

          <h1 className="mt-5 text-4xl font-semibold tracking-tight">
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
                    href={`/read/${encodeURIComponent(item.book)}/${
                      item.chapter
                    }?verse=${item.verse}`}
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
                    href={`/read/${encodeURIComponent(item.book)}/${
                      item.chapter
                    }?verse=${item.verse}`}
                  />
                ))}
            </LibrarySection>
          ) : null}

          {activeTab === "notes" ? (
            <LibrarySection emptyText="No notes yet.">
              {memory.notes.map((note) => {
                const first = note.verses[0];
                const last = note.verses[note.verses.length - 1];

                if (!first) return null;

                const label =
                  note.verses.length === 1
                    ? first.reference
                    : `${first.book} ${first.chapter}:${first.verse}-${last?.verse}`;

                return (
                  <VerseMemoryCard
                    key={note.id}
                    reference={label}
                    text={note.note}
                    href={`/read/${encodeURIComponent(first.book)}/${
                      first.chapter
                    }?verse=${first.verse}`}
                  />
                );
              })}
            </LibrarySection>
          ) : null}
        </div>
      </section>

      <MobileBottomNav />
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

export default function LibraryPage() {
  return (
    <Suspense fallback={null}>
      <LibraryPageContent />
    </Suspense>
  );
}