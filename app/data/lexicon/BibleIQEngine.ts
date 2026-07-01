export type BibleIQOccurrence = {
  book?: string;
  chapter?: number;
  verse?: number;
  reference?: string;
  word?: string;
  surface?: string;
};

export type BibleIQEntry = {
  strong?: string;
  lemma?: string;
  transliteration?: string;
  pronunciation?: string;
  language?: string;
  corpus?: string;
  gloss?: string;
  definition?: string;
  shortDefinition?: string;
  occurrenceCount?: number;
  weight?: number;
  occurrences?: BibleIQOccurrence[];

  displayWord: string;
  meaning: string;
  firstOccurrence?: BibleIQOccurrence | null;
  relatedWords: string[];
  relatedConcepts: string[];
  evidence: string[];
  sources: string[];
};

export type BibleIQResult = {
  query: string;
  concept?: string | null;
  source?: "concept" | "strong" | "english-gloss";
  strongs?: string[];
  entries: BibleIQEntry[];
};

export function normalizeBibleIQEntry(match: any, query: string): BibleIQEntry {
  const occurrences = Array.isArray(match.occurrences)
    ? match.occurrences
    : [];

  const meaning =
    match.shortDefinition ||
    match.definition ||
    match.gloss ||
    "No short meaning is available yet.";

  return {
    ...match,
    displayWord: match.lemma || query,
    meaning,
    firstOccurrence: occurrences[0] || null,
    relatedWords: [],
    relatedConcepts: [],
    evidence: buildEvidence(match),
    sources: match.sources || [],
    occurrences,
  };
}

export function normalizeBibleIQResult(apiResult: any): BibleIQResult {
  const query = String(apiResult?.query || "");

  return {
    query,
    concept: apiResult?.concept || null,
    source: apiResult?.source,
    strongs: apiResult?.strongs || [],
    entries: Array.isArray(apiResult?.matches)
      ? apiResult.matches.map((match: any) =>
          normalizeBibleIQEntry(match, query)
        )
      : [],
  };
}

function buildEvidence(match: any) {
  const evidence: string[] = [];

  if (match.strong) evidence.push(`Strong's ${match.strong}`);
  if (match.language) evidence.push(match.language);
  if (match.corpus) evidence.push(match.corpus);

  const count = Number(match.occurrenceCount || 0);
  if (count > 0) evidence.push(`${count} occurrences`);

  return evidence;
}