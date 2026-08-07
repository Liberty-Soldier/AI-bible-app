import EmetseesLogo from "@/app/components/branding/EmetseesLogo";

export default function EmetseesWordmark({
  compact = false,
  showDescriptor = false,
  className = "",
}: {
  compact?: boolean;
  showDescriptor?: boolean;
  className?: string;
}) {
  const logoSize = compact ? 30 : 48;

  return (
    <div
      className={`inline-flex items-center ${compact ? "gap-2.5" : "gap-3.5"} ${className}`}
    >
      <span className={`rounded-2xl bg-[var(--brand-soft)] ${compact ? "p-1.5" : "p-2.5"}`}>
        <EmetseesLogo size={logoSize} variant="gold" priority />
      </span>

      <span className="min-w-0 text-left">
        <span
          className={`block font-black tracking-[0.11em] text-[var(--foreground)] ${compact ? "text-sm" : "text-2xl sm:text-[1.7rem]"}`}
        >
          EMETSEES
        </span>
        {showDescriptor ? (
          <span className="mt-1 block text-sm font-semibold text-[var(--muted)]">
            Bible Study & Scripture Evidence
          </span>
        ) : null}
      </span>
    </div>
  );
}
