export type TranslationPreference = "web" | "kjv" | "brenton";
export type PlannedTranslationId = "hebrew" | "greek-nt";

export type AvailableTranslationOption = {
  id: TranslationPreference;
  label: string;
  shortLabel: string;
  kind: "translation";
};

export type PlannedTranslationOption = {
  id: PlannedTranslationId;
  label: string;
  shortLabel: string;
  kind: "source";
  status: "planned";
};

export const AVAILABLE_TRANSLATION_OPTIONS: readonly AvailableTranslationOption[] = [
  {
    id: "web",
    label: "World English Bible",
    shortLabel: "WEB",
    kind: "translation",
  },
  {
    id: "kjv",
    label: "King James Version",
    shortLabel: "KJV",
    kind: "translation",
  },
  {
    id: "brenton",
    label: "Brenton Septuagint",
    shortLabel: "Brenton",
    kind: "translation",
  },
];

export const PLANNED_TRANSLATION_OPTIONS: readonly PlannedTranslationOption[] = [
  {
    id: "hebrew",
    label: "Hebrew",
    shortLabel: "Hebrew",
    kind: "source",
    status: "planned",
  },
  {
    id: "greek-nt",
    label: "Greek New Testament",
    shortLabel: "Greek NT",
    kind: "source",
    status: "planned",
  },
];

export const TRANSLATION_CATALOG = [
  ...AVAILABLE_TRANSLATION_OPTIONS,
  ...PLANNED_TRANSLATION_OPTIONS,
] as const;

export const DEFAULT_TRANSLATION: TranslationPreference = "web";
export const PREFERRED_TRANSLATION_KEY = "preferredTranslation";

export function isTranslationPreference(
  value: unknown,
): value is TranslationPreference {
  return value === "web" || value === "kjv" || value === "brenton";
}

export function normalizeTranslationPreference(
  value: unknown,
): TranslationPreference {
  return isTranslationPreference(value) ? value : DEFAULT_TRANSLATION;
}

export function getTranslationOption(
  value: TranslationPreference,
): AvailableTranslationOption {
  return (
    AVAILABLE_TRANSLATION_OPTIONS.find((option) => option.id === value) ||
    AVAILABLE_TRANSLATION_OPTIONS[0]
  );
}

export function getTranslationShortLabel(value: TranslationPreference) {
  return getTranslationOption(value).shortLabel;
}

function isBrowser() {
  return typeof window !== "undefined";
}

export function getPreferredTranslation(): TranslationPreference {
  if (!isBrowser()) return DEFAULT_TRANSLATION;

  try {
    const saved = localStorage.getItem(PREFERRED_TRANSLATION_KEY);
    const resolved = normalizeTranslationPreference(saved);

    if (saved !== resolved) {
      localStorage.setItem(PREFERRED_TRANSLATION_KEY, resolved);
    }

    return resolved;
  } catch {
    return DEFAULT_TRANSLATION;
  }
}

export function setPreferredTranslation(
  value: unknown,
): TranslationPreference {
  const resolved = normalizeTranslationPreference(value);

  if (!isBrowser()) return resolved;

  try {
    localStorage.setItem(PREFERRED_TRANSLATION_KEY, resolved);
  } catch {
    // Reading can continue even when browser storage is unavailable.
  }

  return resolved;
}

export function buildReaderHref({
  book,
  chapter,
  verse,
  translation,
}: {
  book: string;
  chapter: number;
  verse?: string | number | null;
  translation?: unknown;
}) {
  const resolvedTranslation = isTranslationPreference(translation)
    ? translation
    : getPreferredTranslation();

  const params = new URLSearchParams({
    translation: resolvedTranslation,
  });

  if (verse !== undefined && verse !== null && String(verse).trim()) {
    params.set("verse", String(verse));
  }

  return `/read/${encodeURIComponent(book)}/${chapter}?${params.toString()}`;
}
