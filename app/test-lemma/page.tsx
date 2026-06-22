import { findHebrewLemma } from "@/app/data/lexicon/searchHebrewLemma";

export default function TestLemmaPage() {
  const torah = findHebrewLemma("8451");

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <h1 className="mb-6 text-4xl font-bold">
        Hebrew Lemma Test
      </h1>

      <pre className="overflow-auto rounded-xl bg-neutral-900 p-4">
        {JSON.stringify(torah, null, 2)}
      </pre>
    </main>
  );
}