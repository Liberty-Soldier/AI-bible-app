import { isTranslationPreference, type TranslationPreference } from "./translationPreference";

type ScriptureCitation = {
  reference?: string;
  translation?: string;
  evidenceId?: string;
};

/** Resolve only translation identity carried by the citation, never a preference. */
export function getCitationTranslation(citation: ScriptureCitation): TranslationPreference | null {
  const evidenceTranslation = /^scripture:(web|kjv|brenton):/i
    .exec(citation.evidenceId || "")?.[1]?.toLowerCase();
  if (citation.translation !== undefined) {
    if (!isTranslationPreference(citation.translation)) return null;
    if (evidenceTranslation && evidenceTranslation !== citation.translation) return null;
    return citation.translation;
  }
  return isTranslationPreference(evidenceTranslation) ? evidenceTranslation : null;
}

export function buildScriptureCitationHref(
  citation: ScriptureCitation,
  navigation: { returnTo?: string; returnLabel?: string } = {},
): string | null {
  const translation = getCitationTranslation(citation);
  const match = citation.reference?.trim().match(/^(.+?)\s+(\d+):([^\s]+)$/);
  if (!translation || !match || Number(match[2]) < 1) return null;

  const params = new URLSearchParams({ translation, verse: match[3], citation: "1" });
  if (navigation.returnTo) params.set("returnTo", navigation.returnTo);
  if (navigation.returnLabel) params.set("returnLabel", navigation.returnLabel);
  return `/read/${encodeURIComponent(match[1])}/${match[2]}?${params.toString()}`;
}
