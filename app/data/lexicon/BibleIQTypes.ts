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

export type BibleIQOccurrence = {
  reference: string;
  book: string;
  chapter: number;
  verse: number;
  englishText: string;
  sourceWord?: string;
  source: BibleIQSource;
};

export type BibleIQContextConnections = {
  people: string[];
  places: string[];
  events: string[];
  concepts: string[];
  themes: string[];
  laterReferences: string[];
};

export type BibleIQEntity = {
  id: string;
  type: BibleIQEntityType;
  title: string;
  subtitle?: string;

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
      lemmaId?: string;
      partOfSpeech?: string;
      forms?: string[];
      morphs?: [string, number][];
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
    | "unresolved";
  preferredSource?: BibleIQSource;
  query: string;
  entity?: BibleIQEntity;
  message?: string;
};