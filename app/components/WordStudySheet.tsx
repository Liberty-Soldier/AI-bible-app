"use client";

import { findGreekWordStudy } from "@/app/data/lexicon/findGreekWordStudy";

type WordStudySheetProps = {
  word: string | null;
  onClose: () => void;
};

export default function WordStudySheet({
  word,
  onClose,
}: WordStudySheetProps) {
  if (!word) return null;
  const greekStudy = findGreekWordStudy(word);
const firstOccurrences = greekStudy?.occurrences.slice(0, 8) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60">
      <button
        aria-label="Close word study"
        className="absolute inset-0"
        onClick={onClose}
      />

      <section className="relative w-full rounded-t-3xl border border-neutral-800 bg-neutral-950 p-6 text-white shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutral-700" />

        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
              Word Study
            </p>

            <h2 className="mt-2 text-3xl font-bold">
              {word}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="rounded-full border border-neutral-700 px-3 py-1 text-sm text-neutral-300"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 text-neutral-300">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">Selected Word</p>
            <p className="mt-1 text-xl text-white">{word}</p>
          </div>

{greekStudy ? (
  <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
    <p className="text-sm text-neutral-500">Greek Word Study</p>

    <p className="mt-2 text-xl text-white">
      {greekStudy.words?.[0]}
    </p>

    <p className="mt-1 text-sm text-neutral-400">
      Strong&apos;s: {greekStudy.strong}
    </p>

    <p className="mt-1 text-sm text-neutral-400">
      Meaning: {greekStudy.gloss}
    </p>

    <p className="mt-3 text-sm text-neutral-400">
      Occurrences: {greekStudy.occurrences.length}
    </p>

    <div className="mt-4 space-y-2">
      {firstOccurrences.map((occurrence) => (
        <a
          key={`${occurrence.reference}-${occurrence.word}`}
          href={`/verse/${encodeURIComponent(occurrence.reference)}`}
          className="block rounded-xl border border-neutral-800 px-3 py-2 text-sm text-neutral-300 hover:border-neutral-600 hover:text-white"
        >
          {occurrence.reference} — {occurrence.word}
        </a>
      ))}
    </div>
  </div>
) : (
  <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
    <p className="text-sm text-neutral-500">No Greek match yet</p>
    <p className="mt-1">
      Hebrew and stronger English-to-original matching will be added next.
    </p>
  </div>
)}
        </div>
      </section>
    </div>
  );
}