export type BibleIQEntityType =
  | "person"
  | "place"
  | "event"
  | "concept"
  | "practice"
  | "office"
  | "object"
  | "word";

export type BibleIQSource = "hebrew" | "greek-nt" | "lxx";
export type BibleIQTranslation = "web" | "kjv" | "brenton";

export type BibleIQCompoundRouteKind =
  | "lexical-compound-alias"
  | "compositional-number"
  | "compositional-function-word";

export type BibleIQTokenAvailability = {
  entityId: string;
  source: BibleIQSource;
  sourceWord?: string;
  lexicalId?: string;
  isCompoundRoute?: boolean;
  compoundRouteKind?: BibleIQCompoundRouteKind;
  componentLexicalIds?: string[];
};

export type BibleIQVerseTokenAvailability = Record<
  string,
  BibleIQTokenAvailability
>;

export type BibleIQChapterTokenAvailability = Record<
  string,
  BibleIQVerseTokenAvailability
>;

export type BibleIQRequest = {
  book: string;
  chapter: number;
  verse: number;
  translation: string;
  displayWord: string;
  displayTokenIndex?: number;
  originalWord?: string;
  selectedText?: string;
  verseText?: string;
};

export type BibleIQReference = {
  reference: string;
  book: string;
  chapter: number;
  verse: number;
  source: BibleIQSource;
  routeTranslation: BibleIQTranslation;
  renderings?: string[];
  occurrenceCount?: number;
  evidenceId?: string;
};

export type BibleIQOccurrence = BibleIQReference & {
  englishText?: string;
  sourceWord?: string;
};

export type BibleIQContextConnections = {
  people: string[];
  places: string[];
  events: string[];
  concepts: string[];
  themes: string[];
  laterReferences: string[];
};

export type BibleIQSeeEvidence = {
  evidenceId: string;
  countId: string;
  occurrenceCount: number;
  firstOccurrence?: string;
  lastOccurrence?: string;
  relationshipCount: number;
  eventCount: number;
  themeCount: number;
};

export type BibleIQSourceAlignment = {
  selectedEnglish?: string;
  sourceWord?: string;
  source: BibleIQSource;
  strong?: string;
  lexicalId?: string;
  lemma?: string;
  morph?: string;
  entityId: string;
  seeEvidenceId?: string;
  isCompoundRoute?: boolean;
  compoundRouteKind?: BibleIQCompoundRouteKind;
  componentLexicalIds?: string[];
};

export type BibleIQEmetCitation = {
  reference: string;
  book: string;
  chapter: number;
  verse: number;
  evidenceId?: string;
  kind?: string;
};

export type BibleIQEmet = {
  status:
    | "not-ready"
    | "pending"
    | "complete"
    | "under-review"
    | "missing"
    | "insufficient-evidence";
  headline?: string;
  explanation?: string;
  citations: string[];
  citationDetails?: BibleIQEmetCitation[];
  explanationChecksum?: string;
  packetChecksum?: string;
  packet?: unknown | null;
  approval?: "approved-p04.1" | "unapproved-p04";
};

export type BibleIQMeaningInVerse = {
  reference: string;
  selectedEnglish: string;
  selectedTranslation: string;
  verseText?: string;
  sourceWord?: string;
  lemma?: string;
  lexicalId?: string;
  morph?: string;
  statement: string;
};

export type BibleIQSourceForm = {
  surface: string;
  count: number;
};

export type BibleIQRenderingForm = {
  text: string;
  count: number;
  translation: string;
};

export type BibleIQRenderingTranslation = {
  translation: string;
  count: number;
  forms: BibleIQRenderingForm[];
};

export type BibleIQLexicalEvidence = {
  lemma?: string;
  normalizedLemma?: string;
  lexicalId?: string;
  strong?: string;
  language?: string;
  transliteration?: string;
  pronunciation?: string;
  partsOfSpeech: string[];
  glosses: string[];
  shortDefinitions: string[];
  witnesses: string[];
  morphology: string[];
  morphologyEnglish: string[];
  countedSourceForms: number;
  distinctSourceForms: number;
  sourceForms: BibleIQSourceForm[];
};

export type BibleIQOccurrenceSummary = {
  corpusOccurrenceCount: number;
  totalEntityOccurrences: number;
  uniqueVerseCount: number;
  alignedSourceTokenCount: number;
  alignedVerseCount: number;
  translationAlignmentCount: number;
};

export type BibleIQRenderingEvidence = {
  available: boolean;
  totalAlignedRenderings: number;
  translations: BibleIQRenderingTranslation[];
  mostCommon: BibleIQRenderingForm[];
};

export type BibleIQChronology = {
  firstOccurrence?: BibleIQReference;
  lastOccurrence?: BibleIQReference;
};

export type BibleIQHealth = {
  status?: string;
  alignmentCoverage: number;
  hasEnglishRenderings: boolean;
  hasGloss: boolean;
  hasLemma: boolean;
  hasLexicalId: boolean;
  hasReferences: boolean;
  compilerVersion?: string;
};

export type BibleIQEntityEvidence = {
  lexical: BibleIQLexicalEvidence;
  occurrenceSummary: BibleIQOccurrenceSummary;
  renderings: BibleIQRenderingEvidence;
  chronology: BibleIQChronology;
  representativeReferences: BibleIQReference[];
  health: BibleIQHealth;
};

export type BibleIQKnowledgeExample = {
  reference?: BibleIQReference;
  label: string;
  details?: string;
  confidence?: string;
};

export type BibleIQSeeKnowledge = {
  available: boolean;
  relationshipCount: number;
  eventCount: number;
  themeCount: number;
  totalReferenceCount: number;
  relationships: BibleIQKnowledgeExample[];
  events: BibleIQKnowledgeExample[];
  themes: BibleIQKnowledgeExample[];
};

export type BibleIQEntity = {
  id: string;
  type: BibleIQEntityType;
  title: string;
  subtitle?: string;

  emet?: BibleIQEmet;
  meaningInVerse?: BibleIQMeaningInVerse;
  see?: BibleIQSeeEvidence;
  seeKnowledge?: BibleIQSeeKnowledge;
  alignment?: BibleIQSourceAlignment;
  entityEvidence?: BibleIQEntityEvidence;
  keyReferences?: BibleIQReference[];

  simple: {
    meaning?: string;
    biblicalBackground?: string;
    inThisVerse: string;
    whyItMatters: string;
    summary: string;
  };

  contextConnections?: BibleIQContextConnections;

  evidence: {
    originalLanguage?: {
      source: BibleIQSource;
      word: string;
      transliteration?: string;
      pronunciation?: string;
      strong?: string;
      lemma?: string;
      lemmaId?: string;
      partOfSpeech?: string;
      forms?: string[];
      morph?: string;
      morphs?: [string, number][];
      seeEvidenceId?: string;
    };

    definitions?: {
      short?: string;
      usage?: string;
      full?: string;
      rootNote?: string;
      sources?: string[];
    };

    firstMention?: string;
    keyReferences: string[];

    related: {
      people: string[];
      places: string[];
      concepts: string[];
      events: string[];
    };

    occurrenceCount?: number;
    occurrences: BibleIQOccurrence[];
  };
};

export type BibleIQResponse = {
  resolved: boolean;
  resolutionType:
    | "verse-context"
    | "entity"
    | "concept-fallback"
    | "unresolved"
    | "error";
  preferredSource?: BibleIQSource;
  query: string;
  entity?: BibleIQEntity;
  message?: string;
};
