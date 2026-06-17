import Link from "next/link";
import { allScripture } from "../../data/scripture/allScripture";
import { generatedHebrew } from "../../data/scripture/generatedHebrew";
import { generatedKJV } from "../../data/scripture/generatedKJV";
import { generatedLXX } from "../../data/scripture/generatedLXX";
import ScriptureText from "../../components/ScriptureText";
import SacredNameToggle from "../../components/SacredNameToggle";
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

  const hebrewVerse = generatedHebrew.find(
    (v) =>
      v.book === verse.book &&
      v.chapter === verse.chapter &&
      v.verse === verse.verse
  );

  const lxxVerse = generatedLXX.find(
    (v) => v.reference === verse.reference
  );

  const kjvVerse = generatedKJV.find(
    (v) => v.reference === verse.reference
  );

  const hebrewSource = hebrewVerse
    ? [
        {
          label: "Hebrew WLC",
          sourceName:
            "Open Scriptures Hebrew Bible / Westminster Leningrad Codex",
          tradition: "Hebrew",
          text: hebrewVerse.text,
          isOriginalLanguage: true,
        },
      ]
    : [];

  const sources = [
    ...hebrewSource,
    ...(lxxVerse
      ? lxxVerse.sources.map((source) => ({
          ...source,
          isOriginalLanguage: true,
        }))
      : []),
    ...verse.sources.map((source) => ({
      ...source,
      isOriginalLanguage: false,
    })),
    ...(kjvVerse
      ? kjvVerse.sources.map((source) => ({
          ...source,
          isOriginalLanguage: false,
        }))
      : []),
  ];

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

        <div className="mb-6">
          <SacredNameToggle />
        </div>

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
          {sources.map((source, index) => (
            <div
              key={`${verse.id}-${source.tradition}-${source.sourceName}-${index}`}
              className="rounded-xl border border-neutral-800 bg-neutral-900 p-6"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-wide text-neutral-500 mb-2">
                    {source.label}
                  </p>

                  <p className="text-xs text-neutral-500">
                    {source.sourceName}
                  </p>
                </div>

                {source.isOriginalLanguage && (
                  <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-400">
                    Source Text
                  </span>
                )}
              </div>

              <p
                dir={source.tradition === "Hebrew" ? "rtl" : "ltr"}
                className={`leading-relaxed text-neutral-200 ${
                  source.tradition === "Hebrew"
                    ? "text-right text-2xl"
                    : ""
                }`}
              >
                {source.isOriginalLanguage ? (
                  source.text
                ) : (
                  <ScriptureText text={source.text} />
                )}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="text-xl font-bold mb-4">
            Future Analysis
          </h2>

          <p className="text-neutral-400">
            Cross references, manuscript comparison, Hebrew and Greek
            word studies, and source-first AI analysis will appear here.
          </p>
        </div>
      </section>
    </main>
  );
}