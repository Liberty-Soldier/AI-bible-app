import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { sourceConcepts } from "@/app/data/lexicon/sourceConcepts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache: Record<string, any> = {};

function loadJson(name: string) {
  if (cache[name]) return cache[name];

  const filePath = path.join(process.cwd(), "app", "data", "lexicon", name);

  cache[name] = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return cache[name];
}

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
  const results: any[] = [];

  if (normalized.startsWith("H")) {
    results.push(
      ...loadJson("generatedHebrewLexiconV12.json").filter(
        (entry: any) => entry.strong === normalized
      )
    );
  }

  if (normalized.startsWith("G")) {
    results.push(
      ...loadJson("generatedNTGreekLexiconV12.json").filter(
        (entry: any) => entry.strong === normalized
      )
    );

    results.push(
      ...loadJson("generatedLXXGreekLexiconV12.json").filter(
        (entry: any) =>
          entry.strong === normalized || entry.strongs?.includes(normalized)
      )
    );
  }

  return results;
}

function findByEnglishGloss(query: string) {
  const key = normalizeText(query);

  if (!key) return [];

  try {
    const index = loadJson("generatedEnglishGlossIndex.json");
    return (index[key] || []).slice(0, 20);
  } catch {
    return [];
  }
}

function enrichMatches(matches: any[]) {
  return matches.map((match) => {
    const fullMatches = findByStrong(match.strong || "");

    const fullMatch =
      fullMatches.find((item: any) => item.corpus === match.corpus) ||
      fullMatches[0];

    return fullMatch
      ? {
          ...match,
          ...fullMatch,
          weight: match.weight,
        }
      : match;
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
  const hasOccurrences = Array.isArray(match.occurrences)
    ? match.occurrences.length > 0
    : false;

  const occurrenceLength = Array.isArray(match.occurrences)
    ? match.occurrences.length
    : 0;

  const occurrenceCount = Number(match.occurrenceCount || occurrenceLength || 0);
  const weight = Number(match.weight || 0);

  let score = 0;

  if (hasOccurrences) score += 1_000_000;
  if (occurrenceCount > 0) score += Math.min(occurrenceCount, 100_000);
  if (weight > 0) score += weight;

  if (match.language === "Hebrew") score += 75;
  if (match.language === "Greek") score += 50;

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
    matches = rankMatches(enrichMatches(findByEnglishGloss(cleanQuery)));
    source = "english-gloss";
  }

  return NextResponse.json({
    query,
    concept: concept?.label || null,
    source,
    strongs,
    matches,
  });
}