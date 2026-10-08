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
  verifiedLexicalIds: string[];
  verifiedLemmas: string[];
  verifiedTerms: Array<{
    lexicalId: string;
    lemma: string;
    transliteration: string;
    meaning: string;
  }>;
};

let index: SourcePhraseIndex | null = null;
const lexicalIdsByLemma = new Map<EmetAiPlannedSourcePhrase["corpus"], Map<string, string[]>>();
const lexicalDetailsByCorpus = new Map<EmetAiPlannedSourcePhrase["corpus"], Map<string, {
  lexicalId: string;
  lemma: string;
  transliteration: string;
  meaning: string;
}>>();

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

function verifiedLexicalIdsForLemmas(
  corpus: EmetAiPlannedSourcePhrase["corpus"],
  lemmas: string[],
) {
  let lookup = lexicalIdsByLemma.get(corpus);
  if (!lookup) {
    const fileName = corpus === "hebrew"
      ? "generatedHebrewLexiconV12.json"
      : corpus === "greek-nt"
        ? "generatedNTGreekLexiconV12.json"
        : "generatedLXXGreekLexiconV12.json";
    const records = JSON.parse(fs.readFileSync(
      path.join(process.cwd(), "app", "data", "lexicon", fileName),
      "utf8",
    )) as Array<{
      lemma?: string;
      strong?: string;
      id?: string;
      transliteration?: string;
      shortDefinition?: string;
      gloss?: string;
    }>;
    lookup = new Map();
    const details = new Map<string, {
      lexicalId: string;
      lemma: string;
      transliteration: string;
      meaning: string;
    }>();
    for (const record of records) {
      const lemma = normalizedLemma(record.lemma || "");
      const lexicalId = normalizedLexicalId(record.strong || record.id?.split(":").pop() || "");
      if (!lemma || !lexicalId) continue;
      const ids = lookup.get(lemma) || [];
      if (!ids.includes(lexicalId)) ids.push(lexicalId);
      lookup.set(lemma, ids);
      if (record.lemma && record.transliteration && (record.shortDefinition || record.gloss)) {
        details.set(lexicalId, {
          lexicalId,
          lemma: record.lemma,
          transliteration: record.transliteration,
          meaning: record.shortDefinition || record.gloss || "",
        });
      }
    }
    lexicalIdsByLemma.set(corpus, lookup);
    lexicalDetailsByCorpus.set(corpus, details);
  }
  return lemmas.flatMap((lemma) => lookup?.get(normalizedLemma(lemma)) || []);
}

function verifiedTerms(
  corpus: EmetAiPlannedSourcePhrase["corpus"],
  lexicalIds: string[],
) {
  // Initializes both locked lookup maps when the phrase supplied IDs directly.
  verifiedLexicalIdsForLemmas(corpus, []);
  const details = lexicalDetailsByCorpus.get(corpus);
  return Array.from(new Set(lexicalIds.map(normalizedLexicalId)))
    .flatMap((lexicalId) => {
      const detail = details?.get(lexicalId);
      return detail ? [detail] : [];
    });
}

function sequenceStart(values: string[], sequence: string[]) {
  if (sequence.length < 1 || sequence.length > values.length) return -1;
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
  allowIndividualTerms = false,
}: {
  phrases: EmetAiPlannedSourcePhrase[];
  preferredReferences: string[];
  limit?: number;
  allowIndividualTerms?: boolean;
}) {
  if (!phrases.length) return [];
  const sourceIndex = loadIndex();
  const preferred = new Map(
    preferredReferences.map((reference, position) => [reference, position]),
  );
  const matches: VerifiedSourcePhraseMatch[] = [];
  const seen = new Set<string>();

  for (const phrase of phrases) {
    const lemmas = phrase.lemmas.map(normalizedLemma).filter(Boolean);
    const lexicalIds = Array.from(new Set([
      ...phrase.lexicalIds.map(normalizedLexicalId).filter(Boolean),
      ...verifiedLexicalIdsForLemmas(phrase.corpus, phrase.lemmas),
    ]));
    const phraseMatches: VerifiedSourcePhraseMatch[] = [];

    for (const entry of sourceIndex.corpora[phrase.corpus] || []) {
      const lexicalStart =
        lexicalIds.length >= 1
          ? sequenceStart(entry[1].map(normalizedLexicalId), lexicalIds)
          : -1;
      const lemmaStart =
        lexicalStart === -1 && lemmas.length >= 1
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
        verifiedLexicalIds: (entry[1] || [])
          .slice(matchedStart, matchedStart + matchedLength),
        verifiedLemmas: (entry[2] || [])
          .slice(matchedStart, matchedStart + matchedLength),
        verifiedTerms: verifiedTerms(
          phrase.corpus,
          (entry[1] || []).slice(matchedStart, matchedStart + matchedLength),
        ),
      });
    }

    if (!phraseMatches.length && allowIndividualTerms) {
      for (const entry of sourceIndex.corpora[phrase.corpus] || []) {
        const entryIds = entry[1].map(normalizedLexicalId);
        for (const lexicalId of lexicalIds) {
          const matchedStart = entryIds.indexOf(lexicalId);
          if (matchedStart === -1) continue;
          phraseMatches.push({
            reference: entry[0],
            phrase,
            sourceFingerprint: sourceIndex.sourceFingerprint,
            matchMethod: "lexical-id-sequence",
            morphologySignature: entry[3]?.[matchedStart] || "",
            verifiedLexicalIds: [entry[1][matchedStart]],
            verifiedLemmas: [entry[2][matchedStart]],
            verifiedTerms: verifiedTerms(phrase.corpus, [entry[1][matchedStart]]),
          });
        }
      }
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

    // A source form or sequence verifies a semantically planned connection; it
    // does not independently assert that every identical occurrence has the
    // same referent. Unplanned occurrences stay out of the answer packet.
    for (const match of morphologyCompatibleMatches.slice(0, 8)) {
      const key = `${match.reference}|${phrase.corpus}|${match.verifiedLexicalIds.join("+")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(match);
    }
  }

  const selected: VerifiedSourcePhraseMatch[] = [];
  for (const corpus of Array.from(new Set(phrases.map((phrase) => phrase.corpus)))) {
    const representative = matches.find((match) => match.phrase.corpus === corpus);
    if (representative) selected.push(representative);
  }
  for (const match of matches) {
    if (selected.includes(match)) continue;
    selected.push(match);
    if (selected.length >= limit) break;
  }
  return selected.slice(0, limit);
}
