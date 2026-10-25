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
  schemaVersion: "emet-source-phrase-index@2";
  sourceFingerprint: string;
  bodyChecksum: string;
  corpora: Record<EmetAiPlannedSourcePhrase["corpus"], SourcePhraseEntry[]>;
  lexicalDetails: Record<
    EmetAiPlannedSourcePhrase["corpus"],
    Array<[lexicalId: string, lemma: string, transliteration: string, meaning: string]>
  >;
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

export type VerifiedSourceTermAtReference = {
  reference: string;
  corpus: EmetAiPlannedSourcePhrase["corpus"];
  sourceFingerprint: string;
  morphologySignature: string;
  lexicalId: string;
  lemma: string;
  transliteration: string;
  meaning: string;
  position: number;
  surfaceForm?: string;
};

let index: SourcePhraseIndex | null = null;
const lexicalIdsByLemma = new Map<EmetAiPlannedSourcePhrase["corpus"], Map<string, string[]>>();
const lexicalDetailsByCorpus = new Map<EmetAiPlannedSourcePhrase["corpus"], Map<string, {
  lexicalId: string;
  lemma: string;
  transliteration: string;
  meaning: string;
}>>();
const readerSourceBookCache = new Map<string, {
  corpus: string;
  verses: Record<string, { s?: Array<[string, string, string, string, string, string]> }>;
} | null>();
const orderedSourceBookCache = new Map<string, {
  verses?: Record<string, {
    orderAuthority?: string;
    occurrences?: Array<{
      id?: string;
      sourceSlotOrder?: number;
      readingOrder?: number;
      surface?: string;
      lexicalId?: string;
      morphology?: string;
      grammarOnly?: boolean;
    }>;
  }>;
} | null>();

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
    parsed.schemaVersion !== "emet-source-phrase-index@2" ||
    !parsed.sourceFingerprint ||
    !parsed.bodyChecksum ||
    !parsed.corpora ||
    !parsed.lexicalDetails
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
    lookup = new Map();
    const details = new Map<string, {
      lexicalId: string;
      lemma: string;
      transliteration: string;
      meaning: string;
    }>();
    for (const [rawLexicalId, rawLemma, transliteration, meaning] of loadIndex().lexicalDetails[corpus] || []) {
      const lemma = normalizedLemma(rawLemma);
      const lexicalId = normalizedLexicalId(rawLexicalId);
      if (!lemma || !lexicalId) continue;
      const ids = lookup.get(lemma) || [];
      if (!ids.includes(lexicalId)) ids.push(lexicalId);
      lookup.set(lemma, ids);
      details.set(lexicalId, { lexicalId, lemma: rawLemma, transliteration, meaning });
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

function normalizedLookupWords(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u0591-\u05c7]/g, "")
    .toLocaleLowerCase("en-US")
    .match(/[\p{L}\p{N}]+/gu) || [];
}

/**
 * Resolves an English lookup label to a source term only inside one explicitly
 * requested verse. This is intentionally narrower than semantic lexical
 * planning: every returned identity and occurrence comes from the locked
 * source-phrase index, and ambiguous matches are rejected by the caller.
 */
export function verifiedSourceTermsAtReference({
  corpus,
  reference,
  lookup,
}: {
  corpus: EmetAiPlannedSourcePhrase["corpus"];
  reference: string;
  lookup: string;
}) {
  const sourceIndex = loadIndex();
  const entry = (sourceIndex.corpora[corpus] || []).find(
    (candidate) => candidate[0] === reference,
  );
  if (!entry) return [];
  const lookupWords = normalizedLookupWords(lookup);
  if (lookupWords.length !== 1) return [];
  const lookupWord = lookupWords[0];

  return entry[1].flatMap((rawLexicalId, position): VerifiedSourceTermAtReference[] => {
    const term = verifiedTerms(corpus, [rawLexicalId])[0];
    if (!term) return [];
    const searchable = new Set(normalizedLookupWords(
      `${term.lemma} ${term.transliteration} ${term.meaning}`,
    ));
    if (!searchable.has(lookupWord)) return [];
    return [{
      reference,
      corpus,
      sourceFingerprint: sourceIndex.sourceFingerprint,
      morphologySignature: entry[3]?.[position] || "",
      lexicalId: term.lexicalId,
      lemma: term.lemma,
      transliteration: term.transliteration,
      meaning: term.meaning,
      position,
    }];
  });
}

/**
 * Returns the complete, ordered source-token sequence for one locked verse.
 * This supports verse-scoped phrase and translation-rendering questions without
 * asking an English gloss lookup to stand in for source-language alignment.
 */
export function verifiedSourceTermSequenceAtReference({
  corpus,
  reference,
}: {
  corpus: EmetAiPlannedSourcePhrase["corpus"];
  reference: string;
}) {
  const sourceIndex = loadIndex();
  const referenceMatch = reference.match(/^(.+)\s+(\d+):(\d+)$/);
  if (referenceMatch) {
    const [, book, chapter, verse] = referenceMatch;
    const bookSlug = book.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
    const cacheKey = `${corpus}:${bookSlug}`;
    let orderedBook = orderedSourceBookCache.get(cacheKey);
    if (orderedBook === undefined) {
      const orderedPath = path.join(
        process.cwd(), "public", "data", "bibleiq", "source-breakdown", "runtime", corpus, `${bookSlug}.json`,
      );
      try {
        orderedBook = JSON.parse(fs.readFileSync(orderedPath, "utf8"));
      } catch {
        orderedBook = null;
      }
      orderedSourceBookCache.set(cacheKey, orderedBook ?? null);
    }
    const orderedVerse = orderedBook?.verses?.[`${corpus}:${bookSlug}:${chapter}:${verse}`];
    if (orderedVerse?.orderAuthority === "sourceSlotOrder") {
      const occurrences = (orderedVerse.occurrences || [])
        .filter((occurrence) => occurrence.grammarOnly !== true && Number.isInteger(occurrence.sourceSlotOrder))
        .sort((left, right) =>
          Number(left.sourceSlotOrder) - Number(right.sourceSlotOrder) ||
          Number(left.readingOrder || 0) - Number(right.readingOrder || 0)
        );
      const seenSlots = new Set<number>();
      const sequence = occurrences.flatMap((occurrence): VerifiedSourceTermAtReference[] => {
        const position = Number(occurrence.sourceSlotOrder);
        if (seenSlots.has(position) || !occurrence.lexicalId) return [];
        const term = verifiedTerms(corpus, [occurrence.lexicalId])[0];
        if (!term) return [];
        seenSlots.add(position);
        return [{
          reference,
          corpus,
          sourceFingerprint: sourceIndex.sourceFingerprint,
          morphologySignature: occurrence.morphology || "",
          lexicalId: term.lexicalId,
          lemma: term.lemma,
          transliteration: term.transliteration,
          meaning: term.meaning,
          position,
          surfaceForm: occurrence.surface,
        }];
      });
      if (sequence.length === occurrences.length && sequence.length > 0) return sequence;
    }

    if (corpus === "hebrew" || corpus === "greek-nt") {
    let readerBook = readerSourceBookCache.get(book);
    if (readerBook === undefined) {
      const readerPath = path.join(
        process.cwd(), "public", "data", "bibleiq", "word-study-kjv-reader", `${book}.json`,
      );
      try {
        readerBook = JSON.parse(fs.readFileSync(readerPath, "utf8"));
      } catch {
        readerBook = null;
      }
      readerSourceBookCache.set(book, readerBook ?? null);
    }
    const sourceTokens = readerBook?.corpus === corpus
      ? readerBook.verses?.[`${chapter}:${verse}`]?.s || []
      : [];
    if (sourceTokens.length) {
      return sourceTokens.flatMap((token, position): VerifiedSourceTermAtReference[] => {
        const [, surfaceForm, lemma, rawLexicalId, , morphologySignature] = token;
        const term = verifiedTerms(corpus, [rawLexicalId])[0];
        if (!term || normalizedLemma(term.lemma) !== normalizedLemma(lemma)) return [];
        return [{
          reference,
          corpus,
          sourceFingerprint: sourceIndex.sourceFingerprint,
          morphologySignature: morphologySignature || "",
          lexicalId: term.lexicalId,
          lemma: term.lemma,
          transliteration: term.transliteration,
          meaning: term.meaning,
          position,
          surfaceForm,
        }];
      });
    }
    }
  }
  const entry = (sourceIndex.corpora[corpus] || []).find(
    (candidate) => candidate[0] === reference,
  );
  if (!entry) return [];

  return entry[1].flatMap((rawLexicalId, position): VerifiedSourceTermAtReference[] => {
    const term = verifiedTerms(corpus, [rawLexicalId])[0];
    if (!term) return [];
    return [{
      reference,
      corpus,
      sourceFingerprint: sourceIndex.sourceFingerprint,
      morphologySignature: entry[3]?.[position] || "",
      lexicalId: term.lexicalId,
      lemma: term.lemma,
      transliteration: term.transliteration,
      meaning: term.meaning,
      position,
    }];
  });
}

function normalizedSourceSurface(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u0591-\u05c7]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLocaleLowerCase("en-US");
}

/** Verifies a reader-visible phrase against contiguous tokens in canonical source order. */
export function verifiedSourcePhraseAtReference({
  corpus,
  reference,
  phrase,
}: {
  corpus: EmetAiPlannedSourcePhrase["corpus"];
  reference: string;
  phrase: string;
}) {
  const phraseTokens = phrase
    .normalize("NFKD")
    .replace(/[\u05be\-–—/]+/g, " ")
    .replace(/[\u0300-\u036f\u0591-\u05c7]/g, "")
    .split(/[^\p{L}\p{N}]+/gu)
    .map(normalizedSourceSurface)
    .filter(Boolean);
  if (!phraseTokens.length) return false;
  const sourceTokens = verifiedSourceTermSequenceAtReference({ corpus, reference })
    .map((term) => normalizedSourceSurface(term.surfaceForm || term.lemma))
    .filter(Boolean);
  return sequenceStart(sourceTokens, phraseTokens) !== -1;
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
