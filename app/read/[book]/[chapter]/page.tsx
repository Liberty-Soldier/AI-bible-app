import Link from "next/link";
import { allScripture } from "@/app/data/scripture/allScripture";
import ScriptureText from "@/app/components/ScriptureText";
import SacredNameToggle from "@/app/components/SacredNameToggle";
import { notFound } from "next/navigation";

export default async function ReadChapterPage({
  params,
  searchParams,
}: {
  params: Promise<{ book: string; chapter: string }>;
  searchParams: Promise<{ verse?: string }>;
}) {
  const { book, chapter } = await params;
  const { verse } = await searchParams;

  const decodedBook = decodeURIComponent(book);
  const chapterNumber = Number(chapter);
  const highlightedVerse = verse ? Number(verse) : null;

  const chapterVerses = allScripture
    .filter(
      (v) =>
        v.book === decodedBook &&
        v.chapter === chapterNumber
    )
    .sort((a, b) => a.verse - b.verse);

  if (!chapterVerses.length) {
    notFound();
  }

  const previousChapterHref =
    chapterNumber > 1
      ? `/read/${encodeURIComponent(decodedBook)}/${chapterNumber - 1}`
      : null;

  const nextChapterHref = `/read/${encodeURIComponent(
    decodedBook
  )}/${chapterNumber + 1}`;

  return (
    <main className="min-h-screen bg-neutral-950 text-white px-6 py-8">
      <section className="mx-auto max-w-4xl">
        <Link href="/" className="block mb-4">
          <p className="text-sm uppercase tracking-[0.3em] text-neutral-400">
            Scripture Search
          </p>
        </Link>

        <div className="mb-6">
          <SacredNameToggle />
        </div>

        <div className="mb-8 flex items-center justify-between gap-4">
          {previousChapterHref ? (
            <Link
              href={previousChapterHref}
              className="text-neutral-400 hover:text-white"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}

          <h1 className="text-4xl font-bold">
            {decodedBook} {chapterNumber}
          </h1>

          <Link
            href={nextChapterHref}
            className="text-neutral-400 hover:text-white"
          >
            Next →
          </Link>
        </div>

        <div className="space-y-3">
          {chapterVerses.map((v) => {
            const isHighlighted = highlightedVerse === v.verse;

            return (
              <Link
                key={v.id}
                href={`/verse/${v.id}`}
                className={`block rounded-xl border p-4 transition ${
                  isHighlighted
                    ? "border-amber-500 bg-amber-500/10"
                    : "border-neutral-800 bg-neutral-900 hover:border-neutral-600"
                }`}
              >
                <p className="leading-relaxed text-neutral-200">
                  <span className="mr-3 text-sm text-neutral-500">
                    {v.verse}
                  </span>
                  <ScriptureText text={v.sources[0]?.text || ""} />
                </p>
              </Link>
            );
          })}
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          <Link
            href="/"
            className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-center hover:border-neutral-600"
          >
            Search Scripture
          </Link>

          <button className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-neutral-400">
            Ask Scripture
          </button>

          <button className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-neutral-400">
            Study Tools
          </button>
        </div>
      </section>
    </main>
  );
}