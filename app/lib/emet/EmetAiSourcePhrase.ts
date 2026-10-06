import "server-only";

import fs from "node:fs";
import path from "node:path";

import type { EmetAiPlannedSourcePhrase } from "./EmetAiRetrievalPlan";

type SourcePhraseEntry = [
  reference: string,
  lexicalIds: string[],
  lemmas: string[],
  morphology: string[],
];

type SourcePhraseIndex = {
  schemaVersion: "emet-source-phrase-index@1";
  sourceFingerprint: string;
  bodyChecksum: string;
  corpora: Record<EmetAiPlannedSourcePhrase["corpus"], SourcePhraseEntry[]>;
};

export type VerifiedSourcePhraseMatch = {
  reference: string;
  phrase: EmetAiPlannedSourcePhrase;
  sourceFingerprint: string;
  matchMethod: "lexical-id-sequence" | "lemma-sequence";
  morphologySignature: string;
};

let index: SourcePhraseIndex | null = null;

function loadIndex() {
  if (index) return index;
  const filePath = path.join(
    process.cwd(),
    "public",
    "scripture",
    "source-phrase-index.json",
  );
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as SourcePhraseIndex;
  if (
    parsed.schemaVersion !== "emet-source-phrase-index@1" ||
    !parsed.sourceFingerprint ||
    !parsed.bodyChecksum ||
    !parsed.corpora
  ) {
    throw new Error("The EMET source phrase index failed validation.");
  }
  index = parsed;
  return parsed;
}

function normalizedLemma(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u0591-\u05c7]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function normalizedLexicalId(value: string) {
  const compact = value.trim().toLocaleUpperCase("en-US").replace(/\s+/g, "");
  const greek = compact.match(/^G0*(\d+)$/);
  if (greek) return `G${greek[1].padStart(4, "0")}`;
  const hebrew = compact.match(/^H0*(\d+)$/);
  if (hebrew) return `H${hebrew[1]}`;
  return compact;
}

function sequenceStart(values: string[], sequence: string[]) {
  if (sequence.length < 2 || sequence.length > values.length) return -1;
  for (let start = 0; start <= values.length - sequence.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (values[start + offset] !== sequence[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return start;
  }
  return -1;
}

export function verifiedSourcePhraseMatches({
  phrases,
  preferredReferences,
  limit = 8,
}: {
  phrases: EmetAiPlannedSourcePhrase[];
  preferredReferences: string[];
  limit?: number;
}) {
  if (!phrases.length) return [];
  const sourceIndex = loadIndex();
  const preferred = new Map(
    preferredReferences.map((reference, position) => [reference, position]),
  );
  const matches: VerifiedSourcePhraseMatch[] = [];
  const seen = new Set<string>();

  for (const phrase of phrases) {
    const lexicalIds = phrase.lexicalIds.map(normalizedLexicalId).filter(Boolean);
    const lemmas = phrase.lemmas.map(normalizedLemma).filter(Boolean);
    const phraseMatches: VerifiedSourcePhraseMatch[] = [];

    for (const entry of sourceIndex.corpora[phrase.corpus] || []) {
      const lexicalStart =
        lexicalIds.length >= 2
          ? sequenceStart(entry[1].map(normalizedLexicalId), lexicalIds)
          : -1;
      const lemmaStart =
        lexicalStart === -1 && lemmas.length >= 2
          ? sequenceStart(entry[2].map(normalizedLemma), lemmas)
          : -1;
      const matchedStart = lexicalStart !== -1 ? lexicalStart : lemmaStart;
      if (matchedStart === -1) continue;
      const matchedLength = lexicalStart !== -1 ? lexicalIds.length : lemmas.length;
      phraseMatches.push({
        reference: entry[0],
        phrase,
        sourceFingerprint: sourceIndex.sourceFingerprint,
        matchMethod: lexicalStart !== -1 ? "lexical-id-sequence" : "lemma-sequence",
        morphologySignature: (entry[3] || [])
          .slice(matchedStart, matchedStart + matchedLength)
          .join("|"),
      });
    }

    const verifiedPlannedMatches = phraseMatches
      .filter((match) => preferred.has(match.reference))
      .sort(
        (left, right) =>
          (preferred.get(left.reference) ?? Number.MAX_SAFE_INTEGER) -
          (preferred.get(right.reference) ?? Number.MAX_SAFE_INTEGER),
      );

    const anchorMorphology = verifiedPlannedMatches.find(
      (match) => match.morphologySignature,
    )?.morphologySignature;
    const morphologyCompatibleMatches = anchorMorphology
      ? verifiedPlannedMatches.filter(
          (match) =>
            !match.morphologySignature ||
            match.morphologySignature === anchorMorphology,
        )
      : verifiedPlannedMatches;

    // A source sequence verifies a semantically planned connection; it does
    // not independently assert that every identical two-word sequence has the
    // same referent. Unplanned occurrences stay out of the answer packet.
    for (const match of morphologyCompatibleMatches.slice(0, 8)) {
      const key = `${match.reference}|${phrase.corpus}|${phrase.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(match);
      if (matches.length >= limit) return matches;
    }
  }

  return matches;
}
