import Link from "next/link";
import { notFound } from "next/navigation";
import AppNav from "@/app/components/AppNav";
import { bookCatalog } from "@/app/data/scripture/bookCatalog";

type Translation = "web" | "kjv" | "brenton";

function getActiveTranslation(value?: string): Translation {
  if (value === "kjv" || value === "brenton" || value === "web") return value;
  return "web";
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
  const activeTranslation = getActiveTranslation(translation);

  const bookInfo = bookCatalog.find((item) => item.book === decodedBook);

  if (!bookInfo) {
    notFound();
  }

  const chapters = Array.from(
    { length: bookInfo.chapters },
    (_, index) => index + 1
  );

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-8 text-white">
      <section className="mx-auto max-w-5xl">
        <AppNav />

        <Link href="/read" className="text-neutral-400 hover:text-white">
          ← Choose another book
        </Link>

        <div className="mb-10 mt-8">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-neutral-500">
            Choose Chapter
          </p>

          <h1 className="text-5xl font-bold">{decodedBook}</h1>

          <p className="mt-3 text-sm text-neutral-500">
            Translation: {activeTranslation.toUpperCase()}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
          {chapters.map((chapter) => (
            <Link
              key={chapter}
              href={`/read/${encodeURIComponent(
                decodedBook
              )}/${chapter}?translation=${activeTranslation}`}
              className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-center text-lg font-semibold hover:border-neutral-600"
            >
              {chapter}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}