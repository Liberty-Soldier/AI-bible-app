export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-6">
      <section className="max-w-3xl text-center">
        <p className="mb-4 text-sm uppercase tracking-[0.3em] text-neutral-400">
          Scripture Intelligence
        </p>

        <h1 className="text-5xl md:text-7xl font-bold mb-6">
          AI Bible App
        </h1>

        <p className="text-xl md:text-2xl text-neutral-300 mb-10">
          Search Scripture. Study original languages. Ask questions grounded in the text.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button className="rounded-xl bg-white text-black px-8 py-4 font-semibold">
            Open Bible
          </button>

          <button className="rounded-xl border border-neutral-600 px-8 py-4 font-semibold">
            Ask a Question
          </button>
        </div>
      </section>
    </main>
  );
}