import Link from "next/link";
import { notFound } from "next/navigation";
import BookPassageSelector from "@/app/components/BookPassageSelector";
import MobileBottomNav from "@/app/components/MobileBottomNav";
import { bookCatalog, getBookTranslation, getBookChapters } from "@/app/data/scripture/bookCatalog";

type Translation = "web" | "kjv" | "brenton";

function getActiveTranslation(value?: string): Translation | undefined {
  if (value === "kjv" || value === "brenton" || value === "web") return value;
  return undefined;
}

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ book: string }>;
  searchParams: Promise<{ translation?: string }>;
}) {
  const { book } = await params;
  const { translation } = await searchParams;

  const decodedBook = decodeURIComponent(book);
  const requestedTranslation = getActiveTranslation(translation);

  const bookInfo = bookCatalog.find((item) => item.book === decodedBook);

  if (!bookInfo) {
    notFound();
  }
  const activeTranslation = requestedTranslation
    ? getBookTranslation(decodedBook, requestedTranslation)
    : bookInfo.translations?.length === 1 ? bookInfo.translations[0] : undefined;

  return (
    <main className="min-h-screen bg-[var(--background)] px-5 pb-24 pt-6 text-[var(--foreground)]">
      <section className="mx-auto max-w-2xl">
        <Link
          href={activeTranslation ? `/read?translation=${activeTranslation}` : "/read"}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--muted)] transition active:opacity-60"
        >
          ← All books
        </Link>

        <div className="mb-7 mt-5 border-b border-[var(--border)] pb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
            Choose chapter
          </p>

          <h1 className="text-[2.35rem] font-bold leading-tight tracking-[-0.035em]">
            {decodedBook}
          </h1>

          <p className="mt-2 text-sm text-[var(--muted)]">
            {activeTranslation ? `${activeTranslation.toUpperCase()} · ` : ""}{activeTranslation ? getBookChapters(decodedBook, activeTranslation).length : bookInfo.chapters} chapters
          </p>
        </div>

        {decodedBook === "Proverbs" && activeTranslation === "brenton" ? <p className="mb-5 text-sm text-[var(--muted)]">Chapter 30 is unavailable in the verified Brenton corpus; original numbering is preserved.</p> : null}
        {bookInfo.note ? <p className="mb-5 text-sm leading-6 text-[var(--muted)]">{bookInfo.note}</p> : null}
        <BookPassageSelector
          book={decodedBook}
          chapterCount={bookInfo.chapters}
          translation={activeTranslation}
        />
      </section>

      <MobileBottomNav />
    </main>
  );
}
