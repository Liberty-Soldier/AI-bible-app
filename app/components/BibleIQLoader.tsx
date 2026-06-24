export default function BibleIQLoader({
  message = "Tracing source texts...",
}: {
  message?: string;
}) {
  return (
    <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
      <p className="text-xs uppercase tracking-[0.35em] text-amber-300/80">
        BibleIQ
      </p>

      <div className="mx-auto mt-5 flex max-w-xs items-center justify-center gap-3 text-sm text-neutral-300">
        <span className="animate-pulse rounded-full border border-neutral-700 px-3 py-1">
          Hebrew
        </span>
        <span className="animate-pulse text-amber-300 delay-150">→</span>
        <span className="animate-pulse rounded-full border border-neutral-700 px-3 py-1 delay-300">
          Septuagint
        </span>
        <span className="animate-pulse text-amber-300 delay-500">→</span>
        <span className="animate-pulse rounded-full border border-neutral-700 px-3 py-1 delay-700">
          Greek
        </span>
      </div>

      <div className="mx-auto mt-5 h-1.5 w-40 overflow-hidden rounded-full bg-neutral-800">
        <div className="h-full w-1/2 animate-[pulse_1s_ease-in-out_infinite] rounded-full bg-amber-300" />
      </div>

      <p className="mt-4 text-sm text-neutral-300">{message}</p>
    </div>
  );
}