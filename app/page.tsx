"use client";

import { useState } from "react";
import { generatedGenesis1 as sampleVerses } from "./data/scripture/generatedGenesis1";
import { renderSacredNames } from "./data/renderSacredNames";
import { normalizeReference } from "./data/normalizeReference";

export default function Home() {
  const [search, setSearch] = useState("");
  const normalizedSearch = normalizeReference(search);

  const results = sampleVerses.filter((verse) => {
    const sourceText = verse.sources
      .map((source) => source.text)
      .join(" ")
      .toLowerCase();

    return (
      verse.reference.toLowerCase().includes(normalizedSearch) ||
      sourceText.includes(search.toLowerCase())
    );
  });

  return (
    <main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
      <section className="mx-auto max-w-5xl">
        <p className="mb-4 text-sm uppercase tracking-[0.3em] text-neutral-400">
          Scripture Intelligence
        </p>

        <h1 className="text-5xl font-bold mb-4">
          AI Bible App
        </h1>

        <p className="text-neutral-300 mb-8">
          Compare the Septuagint, Masoretic tradition, and manuscript notes with sacred-name rendering.
        </p>

        <input
          type="text"
          placeholder="Search Scripture..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg bg-neutral-900 border border-neutral-700 p-4 text-white mb-8"
        />

        <div className="space-y-8">
          {results.map((verse) => (
            <article
              key={verse.id}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
            >
              <h2 className="text-2xl font-bold mb-6">
                {verse.reference}
              </h2>

              <div className="grid gap-4 md:grid-cols-2">
                {verse.sources.map((source) => (
                  <div
                    key={`${verse.id}-${source.tradition}`}
                    className="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
                  >
                    <p className="text-sm uppercase tracking-wide text-neutral-500 mb-2">
                      {source.label}
                    </p>

                    <p className="text-xs text-neutral-500 mb-4">
                      {source.sourceName}
                    </p>

                    {source.text ? (
                      <p className="text-neutral-200 leading-relaxed">
                        {renderSacredNames(source.text)}
                      </p>
                    ) : (
                      <p className="text-neutral-500 italic">
                        No direct verse text loaded yet.
                      </p>
                    )}

                    {source.notes && source.notes.length > 0 && (
                      <ul className="mt-4 list-disc pl-5 text-sm text-neutral-400">
                        {source.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}