import Link from "next/link";
import { allScripture } from "../../data/scripture/allScripture";
import { generatedKJV } from "../../data/scripture/generatedKJV";
import { renderSacredNames } from "../../data/renderSacredNames";
import { notFound } from "next/navigation";

export default async function VersePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;

  const verse = allScripture.find((v) => v.id === id);

  if (!verse) {
    notFound();
  }

  const kjvVerse = generatedKJV.find(
    (v) => v.reference === verse.reference
  );

  const sources = kjvVerse
    ? [...verse.sources, ...kjvVerse.sources]
    : verse.sources;

  const backHref = q ? `/?q=${encodeURIComponent(q)}` : "/";

  return (
    <main className="min-h-screen bg-neutral-950 text-white px-6 py-8">
      <section className="mx-auto max-w-4xl">
        <Link href="/" className="block mb-4">
          <p className="text-sm uppercase tracking-[0.3em] text-neutral-400">
            Scripture Search
          </p>
        </Link>

        <form action="/" className="mb-8">
          <input
            name="q"
            defaultValue={q || ""}
            type="text"
            placeholder="Search Scripture..."
            className="w-full rounded-lg bg-neutral-900 border border-neutral-700 p-4 text-white"
          />
        </form>

        <Link
          href={backHref}
          className="inline-block mb-6 text-neutral-400 hover:text-white"
        >
          ← Back to Results
        </Link>

        <h1 className="text-4xl font-bold mb-8">
          {verse.reference}
        </h1>

        <div className="space-y-4">
          {sources.map((source) => (
            <div
              key={`${verse.id}-${source.tradition}-${source.sourceName}`}
              className="rounded-xl border border-neutral-800 bg-neutral-900 p-6"
            >
              <p className="text-sm uppercase tracking-wide text-neutral-500 mb-2">
                {source.label}
              </p>

              <p className="text-xs text-neutral-500 mb-4">
                {source.sourceName}
              </p>

              <p className="leading-relaxed text-neutral-200">
                {renderSacredNames(source.text)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="text-xl font-bold mb-4">
            Future Analysis
          </h2>

          <p className="text-neutral-400">
            Manuscript comparison, Greek/Hebrew source text,
            cross references, and AI analysis will appear here.
          </p>
        </div>
      </section>
    </main>
  );
}