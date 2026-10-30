import "server-only";

// Deployment-controlled routing only. Request bodies cannot select an engine.
// Unknown configuration fails closed instead of silently choosing a fallback.
export function getPublicEmetEngine(): "simple" | "current" | null {
  const selected = process.env.EMET_PUBLIC_ENGINE?.trim() || "simple";
  return selected === "simple" || selected === "current" ? selected : null;
}
