"use client";

import { useState } from "react";
import { sampleVerses } from "./data/sampleVerses";
import { renderSacredNames } from "./data/renderSacredNames";

export default function Home() {
  const [search, setSearch] = useState("");

  const results = sampleVerses.filter(
    (verse) =>
      verse.text.toLowerCase().includes(search.toLowerCase()) ||
      verse.reference.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
      <section className="mx-auto max-w-4xl">
        <h1 className="text-5xl font-bold mb-6">
          AI Bible App
        </h1>

        <p className="text-neutral-300 mb-6">
          Search Sacred Name Scriptures
        </p>

        <input
          type="text"
          placeholder="Search Scripture..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg bg-neutral-900 border border-neutral-700 p-4 text-white mb-8"
        />

        <div className="space-y-6">
          {results.map((verse) => (
            <div
              key={verse.reference}
              className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"
            >
              <h2 className="font-bold mb-2">
                {verse.reference}
              </h2>

              <p>{renderSacredNames(verse.text)}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}