import SeeStore, { toSeeEvidenceId, toSeeCountId } from "@/app/lib/see/SeeStore";

export type EmetEvidencePacket = {
  packetVersion: "0.1.0";
  engine: "SEE";
  interpreter: "EMET";

  entity: {
    inputId: string;
    seeEvidenceId: string;
    countId: string;
    source: string;
    strong?: string;
    lemma?: string;
    surface?: string;
    morph?: string;
  };

  verseContext: {
    reference: string;
    book: string;
    chapter: number;
    verse: number;
    translation?: string;
    selectedEnglish?: string;
    verseText?: string;
    alignedSourceWord?: string;
  };

  evidence: {
    occurrenceCount: number;
    firstOccurrence?: string;
    lastOccurrence?: string;
    relationshipCount: number;
    eventCount: number;
    themeCount: number;
  };

  rules: {
    scriptureIsSourceOfTruth: true;
    evidenceIsStructuredData: true;
    englishIsRenderingOnly: true;
    aiExplainsEvidenceOnly: true;
    aiMustNotCreateEvidence: true;
    aiMustSayWhenEvidenceIsInsufficient: true;
  };
};

function cleanCanonRef(value?: string) {
  return String(value || "").replace(/^canon:/, "");
}

function sourceFromEntityId(entityId: string) {
  const parts = String(entityId || "").split(":");
  return parts.length >= 2 ? parts[0] : "unknown";
}

export function buildEmetEvidencePacket(input: {
  entityId: string;
  book: string;
  chapter: number;
  verse: number;
  translation?: string;
  displayWord?: string;
  verseText?: string;
  sourceWord?: string;
  strong?: string;
  lemma?: string;
  morph?: string;
}): EmetEvidencePacket | null {
  const seeEvidence = SeeStore.get(input.entityId);

  if (!seeEvidence) return null;

  const seeEvidenceId = toSeeEvidenceId(input.entityId);
  const countId = toSeeCountId(input.entityId);

  return {
    packetVersion: "0.1.0",
    engine: "SEE",
    interpreter: "EMET",

    entity: {
      inputId: input.entityId,
      seeEvidenceId,
      countId,
      source: sourceFromEntityId(countId),
      strong: input.strong,
      lemma: input.lemma,
      surface: input.sourceWord,
      morph: input.morph,
    },

    verseContext: {
      reference: `${input.book} ${input.chapter}:${input.verse}`,
      book: input.book,
      chapter: input.chapter,
      verse: input.verse,
      translation: input.translation,
      selectedEnglish: input.displayWord,
      verseText: input.verseText,
      alignedSourceWord: input.sourceWord,
    },

    evidence: {
      occurrenceCount: seeEvidence.occurrenceCount ?? 0,
      firstOccurrence: cleanCanonRef(seeEvidence.firstOccurrence) || undefined,
      lastOccurrence: cleanCanonRef(seeEvidence.lastOccurrence) || undefined,
      relationshipCount: SeeStore.relationshipCount(input.entityId),
      eventCount: SeeStore.eventCount(input.entityId),
      themeCount: SeeStore.themeCount(input.entityId),
    },

    rules: {
      scriptureIsSourceOfTruth: true,
      evidenceIsStructuredData: true,
      englishIsRenderingOnly: true,
      aiExplainsEvidenceOnly: true,
      aiMustNotCreateEvidence: true,
      aiMustSayWhenEvidenceIsInsufficient: true,
    },
  };
}