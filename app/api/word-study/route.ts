import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { sourceConcepts } from "@/app/data/lexicon/sourceConcepts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache: Record<string, any[]> = {};

function loadJson(name: string) {
  if (cache[name]) return cache[name];

  const filePath = path.join(
    process.cwd(),
    "app",
    "data",
    "lexicon",
    name
  );

  cache[name] = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return cache[name];
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

  const results = [];

  if (normalized.startsWith("H")) {
    results.push(
      ...loadJson("generatedHebrewLexiconV12.json").filter(
        (e) => e.strong === normalized
      )
    );
  }

  if (normalized.startsWith("G")) {
    results.push(
      ...loadJson("generatedNTGreekLexiconV12.json").filter(
        (e) => e.strong === normalized
      )
    );

    results.push(
      ...loadJson("generatedLXXGreekLexiconV12.json").filter(
        (e) => e.strong === normalized || e.strongs?.includes(normalized)
      )
    );
  }

  return results;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";

  if (!query.trim()) {
    return NextResponse.json({ query, matches: [] });
  }

  const concept = sourceConcepts.find((item) =>
    item.aliases.some(
      (alias) => alias.toLowerCase() === query.toLowerCase().trim()
    )
  );

  const strongs = concept
    ? [
        ...concept.hebrewLemmas.map((h) => `H${h}`),
        ...concept.greekLemmas,
      ]
    : [query];

  const matches = strongs.flatMap(findByStrong).slice(0, 20);

  return NextResponse.json({
    query,
    concept: concept?.label || null,
    strongs,
    matches,
  });
}