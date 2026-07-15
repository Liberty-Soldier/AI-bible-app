import EmetseesLogo from "@/app/components/branding/EmetseesLogo";

export default function EmetseesWordmark({
  compact = false,
  className = "",
  showDescriptor = false,
}: {
  compact?: boolean;
  className?: string;
  showDescriptor?: boolean;
}) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <EmetseesLogo
        size={compact ? 30 : 44}
        className="shrink-0 text-amber-500"
        title="EMETSEES"
      />

      <div className="min-w-0">
        <p
          className={`font-black tracking-[0.12em] ${
            compact ? "text-sm" : "text-xl"
          }`}
        >
          EMETSEES
        </p>

        {showDescriptor ? (
          <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">
            Scripture-first Bible study
          </p>
        ) : null}
      </div>
    </div>
  );
}
