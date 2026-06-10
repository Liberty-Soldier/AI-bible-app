import { referenceAliases } from "./referenceAliases";

export function normalizeReference(input: string) {
  const trimmed = input.trim().toLowerCase();

  const parts = trimmed.split(/\s+/);

  if (parts.length === 0) {
    return trimmed;
  }

  const book = parts[0];
  const rest = parts.slice(1).join(" ");

  const normalizedBook = referenceAliases[book] ?? book;

  return `${normalizedBook} ${rest}`.trim();
}