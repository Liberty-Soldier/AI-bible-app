import { allScripture } from "../../data/scripture/allScripture";
import { generatedKJV } from "../../data/scripture/generatedKJV";
import { renderSacredNames } from "../../data/renderSacredNames";
import { notFound } from "next/navigation";

export default async function VersePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  if (!verse) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
      <section className="mx-auto max-w-4xl">
        <p className="text-sm uppercase tracking-[0.3em] text-neutral-400 mb-4">
          Scripture Search
        </p>

        <h1 className="text-4xl font-bold mb-8">
          {verse.reference}
        </h1>

        <div className="space-y-4">
        {sources.map((source) => (
            <div
              key={source.tradition}
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