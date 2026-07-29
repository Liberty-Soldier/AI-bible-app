"use client";

type LogoVariant = "auto" | "gold" | "black" | "white";

export default function EmetseesLogo({
  size = 36,
  className = "",
  variant = "auto",
  priority = false,
}: {
  size?: number;
  className?: string;
  variant?: LogoVariant;
  priority?: boolean;
}) {
  const dimensions = { width: size, height: size };

  if (variant !== "auto") {
    return (
      <img
        src={`/brand/emetsees-mark-${variant}.png`}
        alt=""
        aria-hidden="true"
        decoding={priority ? "sync" : "async"}
        className={`block object-contain ${className}`}
        style={dimensions}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 ${className}`}
      style={dimensions}
    >
      <img
        src="/brand/emetsees-mark-black.png"
        alt=""
        className="emetsees-logo-light absolute inset-0 h-full w-full object-contain"
      />
      <img
        src="/brand/emetsees-mark-white.png"
        alt=""
        className="emetsees-logo-dark absolute inset-0 h-full w-full object-contain"
      />
    </span>
  );
}
