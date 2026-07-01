import { NextResponse } from "next/server";
import { sourceConcepts } from "../../../data/word-study/sourceConcepts";
import wordStudyApi from "../../../data/word-study/generatedWordStudyApi.json";
import {
  normalizeBibleIQResult,
} from "@/app/data/lexicon/BibleIQEngine";

export const dynamic = "force-dynamic";

const apiData = wordStudyApi as any;

function normalizeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function normalizeStrong(value: string) {
  const raw = String(value || "").trim().toUpperCase();
  const num = raw.replace(/[^\d]/g, "");

  if (!num) return raw;

  if (raw.startsWith("H")) return `H${Number(num)}`;
  if (raw.startsWith("G")) return `G${String(Number(num)).padStart(4, "0")}`;

  return raw;
}

function findByStrong(strong: string) {
  const normalized = normalizeStrong(strong);
  return apiData.byStrong?.[normalized] || [];
}

function findByEnglishGloss(query: string) {
  const key = normalizeText(query);
  if (!key) return [];

  const refs = apiData.englishIndex?.[key] || [];

  return refs.flatMap((ref: any) => {
    const matches = findByStrong(ref.strong);

    return matches
      .filter((match: any) => !ref.corpus || match.corpus === ref.corpus)
      .map((match: any) => ({
        ...match,
        weight: ref.weight,
      }));
  });
}

function dedupeMatches(matches: any[]) {
  const seen = new Set<string>();

  return matches.filter((match) => {
    const key = `${match.strong || ""}|${match.lemma || ""}|${
      match.corpus || ""
    }`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function scoreMatch(match: any) {
  const hasOccurrences =
    Array.isArray(match.occurrences) && match.occurrences.length > 0;

  const occurrenceCount = Number(match.occurrenceCount || 0);
  const weight = Number(match.weight || 0);

  let score = 0;

  if (hasOccurrences) score += 1_000_000;
  score += Math.min(occurrenceCount, 100_000);
  score += weight;

  if (match.corpus === "Hebrew Bible") score += 40;
  if (match.corpus === "Greek New Testament") score += 35;
  if (match.corpus === "Septuagint") score += 25;

  return score;
}

function rankMatches(matches: any[]) {
  return dedupeMatches(matches)
    .sort((a, b) => scoreMatch(b) - scoreMatch(a))
    .slice(0, 20);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const cleanQuery = query.trim();

  if (!cleanQuery) {
    return NextResponse.json({ query, matches: [] });
  }

  const concept = sourceConcepts.find((item) =>
    item.aliases.some(
      (alias) => alias.toLowerCase() === cleanQuery.toLowerCase()
    )
  );

  const strongs = concept
    ? [
        ...concept.hebrewLemmas.map((lemma) => `H${lemma}`),
        ...concept.greekLemmas,
      ]
    : [cleanQuery];

  let source: "concept" | "strong" | "english-gloss" = concept
    ? "concept"
    : "strong";

  let matches = rankMatches(strongs.flatMap(findByStrong));

  if (!matches.length) {
    matches = rankMatches(findByEnglishGloss(cleanQuery));
    source = "english-gloss";
  }

const legacyResult = {
  query,
  concept: concept?.label || null,
  source,
  strongs,
  matches,
};

const bibleIQResult = normalizeBibleIQResult(legacyResult);

return NextResponse.json({
  ...legacyResult,

  // New BibleIQ engine shape.
  entries: bibleIQResult.entries,
});
}