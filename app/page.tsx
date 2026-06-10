import { sampleVerses } from "./data/sampleVerses";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
      <section className="mx-auto max-w-4xl">
        <p className="mb-4 text-sm uppercase tracking-[0.3em] text-neutral-400">
          Scripture Intelligence
        </p>

        <h1 className="text-5xl font-bold mb-6">
          AI Bible App
        </h1>

        <p className="text-xl text-neutral-300 mb-10">
          Search Scripture. Study original languages. Ask questions grounded in the text.
        </p>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="text-2xl font-semibold mb-4">
            Sacred Name Scripture Preview
          </h2>

          <div className="space-y-4">
            {sampleVerses.map((verse) => (
              <div key={verse.reference} className="border-b border-neutral-800 pb-4">
                <p className="font-semibold text-neutral-100">
                  {verse.reference}
                </p>
                <p className="text-neutral-300">
                  {verse.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}