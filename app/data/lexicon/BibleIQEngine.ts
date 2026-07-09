import { findCanonicalHit } from "@/app/data/scripture/CanonicalVerseStore";
import SeeStore, {
  toSeeCountId,
  toSeeEvidenceId,
} from "@/app/lib/see/SeeStore";
import { buildEmetEvidencePacket } from "@/app/lib/emet/EmetEvidencePacket";
import { EmetService } from "@/app/lib/emet/EmetService";

import type {
  BibleIQEntity,
  BibleIQRequest,
  BibleIQResponse,
  BibleIQSeeEvidence,
  BibleIQSource,
  BibleIQSourceAlignment,
} from "./BibleIQTypes";

function normalize(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function isNewTestament(book: string) {
  return new Set([
    "Matthew",
    "Mark",
    "Luke",
    "John",
    "Acts",
    "Romans",
    "1 Corinthians",
    "2 Corinthians",
    "Galatians",
    "Ephesians",
    "Philippians",
    "Colossians",
    "1 Thessalonians",
    "2 Thessalonians",
    "1 Timothy",
    "2 Timothy",
    "Titus",
    "Philemon",
    "Hebrews",
    "James",
    "1 Peter",
    "2 Peter",
    "1 John",
    "2 John",
    "3 John",
    "Jude",
    "Revelation",
  ]).has(book);
}

function determinePreferredSource(input: BibleIQRequest): BibleIQSource {
  const translation = normalize(input.translation);

  if (isNewTestament(input.book)) return "greek-nt";

  if (
    translation.includes("brenton") ||
    translation.includes("septuagint") ||
    translation.includes("lxx")
  ) {
    return "lxx";
  }

  return "hebrew";
}

function unresolved(
  input: BibleIQRequest,
  preferredSource: BibleIQSource
): BibleIQResponse {
  return {
    resolved: false,
    resolutionType: "unresolved",
    preferredSource,
    query: input.displayWord,
    message: "BibleIQ could not resolve this word from canonical verse context yet.",
  };
}

function cleanCanonRef(value?: string) {
  return String(value || "").replace(/^canon:/, "");
}

function normalizeReference(value: string) {
  return String(value || "")
    .replace(/^canon:/, "")
    .replace(/^Gen:/, "Genesis ")
    .replace(/^Exod:/, "Exodus ")
    .replace(/^Lev:/, "Leviticus ")
    .replace(/^Num:/, "Numbers ")
    .replace(/^Deut:/, "Deuteronomy ")
    .trim();
}

function uniqueReferences(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeReference(value);
    const key = normalized.replace(/\s+/g, "").toLowerCase();

    if (!normalized || seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function emetStatusFromConfidence(
  confidence: "high" | "medium" | "low"
): "complete" | "insufficient-evidence" {
  if (confidence === "low") return "insufficient-evidence";
  return "complete";
}

async function buildSeeEntity({
  input,
  preferredSource,
  entityId,
  sourceWord,
  strong,
  lemma,
  morph,
}: {
  input: BibleIQRequest;
  preferredSource: BibleIQSource;
  entityId: string;
  sourceWord?: string;
  strong?: string;
  lemma?: string;
  morph?: string;
}): Promise<BibleIQEntity | null> {
  const seeEvidenceRaw = SeeStore.get(entityId);
  if (!seeEvidenceRaw) return null;

  const seeEvidenceId = toSeeEvidenceId(entityId);
  const countId = toSeeCountId(entityId);

  const firstReference = cleanCanonRef(seeEvidenceRaw.firstOccurrence);
  const lastReference = cleanCanonRef(seeEvidenceRaw.lastOccurrence);

  const occurrenceCount = seeEvidenceRaw.occurrenceCount ?? 0;
  const relationshipCount = SeeStore.relationshipCount(entityId);
  const eventCount = SeeStore.eventCount(entityId);
  const themeCount = SeeStore.themeCount(entityId);

  const title = lemma || sourceWord || input.displayWord.trim();

  const see: BibleIQSeeEvidence = {
    evidenceId: seeEvidenceId,
    countId,
    occurrenceCount,
    firstOccurrence: firstReference
      ? normalizeReference(firstReference)
      : undefined,
    lastOccurrence: lastReference ? normalizeReference(lastReference) : undefined,
    relationshipCount,
    eventCount,
    themeCount,
  };

  const alignment: BibleIQSourceAlignment = {
    selectedEnglish: input.displayWord,
    sourceWord,
    source: preferredSource,
    strong,
    lemma,
    morph,
    entityId,
    seeEvidenceId,
  };

const emetPacket = buildEmetEvidencePacket({
  entityId,
  book: input.book,
  chapter: input.chapter,
  verse: input.verse,
  translation: input.translation,
  displayWord: input.displayWord,
  verseText: input.verseText,
  sourceWord,
  strong,
  lemma,
  morph,
});

const emetResult = emetPacket
  ? await EmetService.explain(emetPacket)
  : null;

const citations = uniqueReferences([
  `${input.book} ${input.chapter}:${input.verse}`,
  ...(see.firstOccurrence ? [see.firstOccurrence] : []),
  ...(see.lastOccurrence ? [see.lastOccurrence] : []),
]);

return {
  id: entityId,
  type: "word",
  title,
  subtitle: "SEE Evidence",

  emet: {
    status: emetResult
      ? emetStatusFromConfidence(emetResult.confidence)
      : "insufficient-evidence",
    packet: emetPacket,
    explanation: emetResult?.explanation,
    citations,
  },

  see,
  alignment,

    // Legacy fields kept only so current UI does not break.
    simple: {
      meaning: title,
      inThisVerse: sourceWord
        ? `The selected English word is aligned to ${sourceWord}.`
        : `This word appears in ${input.book} ${input.chapter}:${input.verse}.`,
      whyItMatters:
        "SEE has structured evidence for this source-language lemma. EMET explains this evidence without creating it.",
      summary:
        "This entry is backed by SEE runtime evidence and explained through the EMET service layer.",
    },

    evidence: {
      originalLanguage: {
        source: preferredSource,
        word: sourceWord || title,
        strong,
        lemma,
        morph,
        seeEvidenceId,
      },

      firstMention: see.firstOccurrence,

      keyReferences: citations,

      related: {
        people: [],
        places: [],
        concepts: [
          `Occurrences: ${occurrenceCount}`,
          `Relationships: ${relationshipCount}`,
          `Events: ${eventCount}`,
          `Themes: ${themeCount}`,
        ],
        events: [],
      },

      occurrenceCount,

      occurrences: [
        {
          reference: `${input.book} ${input.chapter}:${input.verse}`,
          book: input.book,
          chapter: input.chapter,
          verse: input.verse,
          englishText: input.verseText || "",
          sourceWord,
          source: preferredSource,
        },
      ],
    },
  };
}

function buildPlaceholderEntity(
  input: BibleIQRequest,
  preferredSource: BibleIQSource
): BibleIQEntity {
  const title = input.displayWord.trim();

  return {
    id: `${preferredSource}:${input.book}:${input.chapter}:${input.verse}:${normalize(
      title
    )}`,
    type: "word",
    title,
    subtitle: "BibleIQ Evidence",

    emet: {
      status: "insufficient-evidence",
      packet: null,
      explanation: undefined,
      citations: [`${input.book} ${input.chapter}:${input.verse}`],
    },

    simple: {
      meaning: undefined,
      inThisVerse: input.verseText
        ? `This word appears in ${input.book} ${input.chapter}:${input.verse}.`
        : "This word appears in the selected verse.",
      whyItMatters:
        "BibleIQ is preparing the source-language evidence for this word.",
      summary: "This word has not been connected to SEE evidence yet.",
    },

    evidence: {
      originalLanguage: input.originalWord
        ? {
            source: preferredSource,
            word: input.originalWord,
          }
        : undefined,

      firstMention: undefined,
      keyReferences: [`${input.book} ${input.chapter}:${input.verse}`],

      related: {
        people: [],
        places: [],
        concepts: [],
        events: [],
      },

      occurrences: [
        {
          reference: `${input.book} ${input.chapter}:${input.verse}`,
          book: input.book,
          chapter: input.chapter,
          verse: input.verse,
          englishText: input.verseText || "",
          sourceWord: input.originalWord,
          source: preferredSource,
        },
      ],
    },
  };
}

export async function resolveBibleIQ(
  input: BibleIQRequest,
  _origin: string
): Promise<BibleIQResponse> {
  const preferredSource = determinePreferredSource(input);

  if (!input.displayWord?.trim()) {
    return unresolved(input, preferredSource);
  }

  const hit = findCanonicalHit({
    translation: input.translation,
    book: input.book,
    chapter: input.chapter,
    verse: input.verse,
    displayTokenIndex: input.displayTokenIndex,
  });

  if (hit) {
    const entity = await buildSeeEntity({
      input,
      preferredSource,
      entityId: hit.entityId,
      sourceWord: hit.sourceWord,
      strong: hit.sourceToken?.strong,
      lemma: hit.sourceToken?.lemma,
      morph: hit.sourceToken?.morph,
    });

    if (entity) {
      return {
        resolved: true,
        resolutionType: "verse-context",
        preferredSource,
        query: input.displayWord,
        entity,
      };
    }
  }

  const entity = buildPlaceholderEntity(input, preferredSource);

  return {
    resolved: true,
    resolutionType: "unresolved",
    preferredSource,
    query: input.displayWord,
    entity,
  };
}

export const BibleIQEngine = {
  resolve: resolveBibleIQ,
};