import "server-only";

import type { BibleIQSource } from "./BibleIQTypes";

const RUNTIME_ROOT = "/data/bibleiq/word-study/entities";
const EXPECTED_RUNTIME_VERSION = 1;
const EXPECTED_SCHEMA_VERSION = "1.0.0";
const EXPECTED_P04_CHECKSUM =
  "574c50eab68c6932fa2e29cf0af26e30c18834e9dbf231dfb08ce97f9a88e4a5";
const EXPECTED_P04_PROMPT_ID = "emet-free-tier-entity-explanation";
const EXPECTED_P04_PROMPT_VERSION = "1.4.5";

type CompactReference = [
  book: string,
  chapter: number,
  verse: number,
  occurrenceCount: number,
  evidenceId: string,
  renderings: [translation: string, values: string[]][],
];

type CompactChronologyReference = [
  book: string,
  chapter: number,
  verse: number,
];

type CompactCitation = [
  book: string,
  chapter: number,
  verse: number,
  label: string,
  evidenceId: string,
  kind: string,
];

type CompactKnowledgeExample = [
  reference: CompactChronologyReference | null,
  label: string,
  details: string,
  confidence: string,
];

type CompactEntity = {
  c: BibleIQSource;
  i?: {
    l?: string;
    n?: string;
    x?: string;
    s?: string;
    g?: string;
    t?: string;
    p?: string;
    ps?: string[];
    gl?: string[];
    d?: string[];
    w?: string[];
    m?: string[];
    me?: string[];
    f?: [
      countedOccurrences: number,
      distinctForms: number,
      forms: [surface: string, count: number][],
    ];
  };
  o?: {
    c?: number;
    t?: number;
    u?: number;
    a?: number;
    v?: number;
    ta?: number;
    f?: CompactChronologyReference;
    l?: CompactChronologyReference;
    r?: CompactReference[];
    p?: CompactReference[];
  };
  r?: {
    a?: boolean;
    t?: number;
    c?: [translation: string, count: number][];
    m?: [text: string, count: number, translation: string][];
    b?: [
      translation: string,
      forms: [text: string, count: number][],
    ][];
  };
  k?: {
    a?: boolean;
    c?: [
      relationshipCount: number,
      eventCount: number,
      themeCount: number,
      totalCount: number,
    ];
    r?: CompactKnowledgeExample[];
    e?: CompactKnowledgeExample[];
    t?: CompactKnowledgeExample[];
  };
  h?: {
    s?: string;
    a?: number;
    e?: boolean;
    g?: boolean;
    l?: boolean;
    x?: boolean;
    r?: boolean;
    c?: string;
  };
  e: {
    h?: string;
    t: string;
    c?: CompactCitation[];
    x?: string;
    p?: string;
  };
};

type RuntimeShard = {
  version: number;
  corpus: BibleIQSource;
  shard: string;
  entities: Record<string, CompactEntity>;
};

type RuntimeShardManifest = {
  file: string;
  entities: number;
  bytes: number;
  checksum: string;
};

type RuntimeManifest = {
  version: number;
  schemaVersion: string;
  shardAlgorithm: "fnv1a-32-mod";
  shardCount: number;
  source: {
    p03Checksum: string;
    p04Checksum: string;
    p04Prompt: {
      id: string;
      version: string;
      checksum: string;
    };
  };
  corpora: Record<
    BibleIQSource,
    {
      entities: number;
      shards: Record<string, RuntimeShardManifest>;
    }
  >;
  totals: {
    entities: number;
    shards: number;
    bytes: number;
    byCorpus: Record<BibleIQSource, number>;
  };
  checksum: string;
};

export type WordStudyRuntimeReference = {
  book: string;
  chapter: number;
  verse: number;
  occurrenceCount: number;
  evidenceId?: string;
  renderings: Record<string, string[]>;
};

export type WordStudyRuntimeCitation = {
  book: string;
  chapter: number;
  verse: number;
  label: string;
  evidenceId?: string;
  kind?: string;
};

export type WordStudyRuntimeKnowledgeExample = {
  reference?: {
    book: string;
    chapter: number;
    verse: number;
  };
  label: string;
  details?: string;
  confidence?: string;
};

export type WordStudyRuntimeEntity = {
  entityId: string;
  corpus: BibleIQSource;
  identity: {
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
    sourceForms: {
      surface: string;
      count: number;
    }[];
  };
  occurrences: {
    corpusOccurrenceCount: number;
    totalEntityOccurrences: number;
    uniqueVerseCount: number;
    alignedSourceTokenCount: number;
    alignedVerseCount: number;
    translationAlignmentCount: number;
    firstOccurrence?: {
      book: string;
      chapter: number;
      verse: number;
    };
    lastOccurrence?: {
      book: string;
      chapter: number;
      verse: number;
    };
    orderedReferences: WordStudyRuntimeReference[];
    representativeReferences: WordStudyRuntimeReference[];
  };
  renderings: {
    available: boolean;
    totalAlignedRenderings: number;
    translationCounts: {
      translation: string;
      count: number;
    }[];
    mostCommon: {
      text: string;
      count: number;
      translation: string;
    }[];
    byTranslation: {
      translation: string;
      forms: {
        text: string;
        count: number;
      }[];
    }[];
  };
  seeKnowledge: {
    available: boolean;
    relationshipCount: number;
    eventCount: number;
    themeCount: number;
    totalReferenceCount: number;
    relationships: WordStudyRuntimeKnowledgeExample[];
    events: WordStudyRuntimeKnowledgeExample[];
    themes: WordStudyRuntimeKnowledgeExample[];
  };
  health: {
    status?: string;
    alignmentCoverage: number;
    hasEnglishRenderings: boolean;
    hasGloss: boolean;
    hasLemma: boolean;
    hasLexicalId: boolean;
    hasReferences: boolean;
    compilerVersion?: string;
  };
  explanation: {
    headline?: string;
    text: string;
    citations: WordStudyRuntimeCitation[];
    explanationChecksum?: string;
    packetChecksum?: string;
  };
};

const manifestCache = new Map<string, Promise<RuntimeManifest | null>>();
const shardCache = new Map<string, Promise<RuntimeShard | null>>();

function runtimeUrl(origin: string, relativePath: string) {
  return new URL(
    `${RUNTIME_ROOT}/${relativePath.replace(/^\/+/, "")}`,
    origin,
  ).toString();
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      console.error(`P05 runtime returned ${response.status}: ${url}`);
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error(`P05 runtime fetch failed: ${url}`, error);
    return null;
  }
}

function originKey(origin: string) {
  return new URL(origin).origin;
}

function loadManifest(origin: string) {
  const key = originKey(origin);
  let pending = manifestCache.get(key);

  if (!pending) {
    pending = fetchJson<RuntimeManifest>(runtimeUrl(key, "manifest.json"));
    manifestCache.set(key, pending);
  }

  return pending;
}

function hashEntityId(entityId: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < entityId.length; index += 1) {
    hash ^= entityId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

export function normalizeWordEntityId(entityId: string): string | null {
  const value = String(entityId || "").trim();
  if (!value) return null;

  const parts = value.split(":").filter(Boolean);
  const hasWordPrefix = parts[0] === "word";
  const corpus = hasWordPrefix ? parts[1] : parts[0];
  const lexicalId = (hasWordPrefix ? parts.slice(2) : parts.slice(1)).join(":");

  const valid =
    corpus === "hebrew"
      ? /^H\d+$/.test(lexicalId)
      : corpus === "greek-nt"
        ? /^G\d+$/.test(lexicalId)
        : corpus === "lxx"
          ? /^L\d+$/.test(lexicalId)
          : false;

  return valid ? `word:${corpus}:${lexicalId}` : null;
}

function corpusFromEntityId(entityId: string): BibleIQSource | null {
  const canonical = normalizeWordEntityId(entityId);
  if (!canonical) return null;

  const corpus = canonical.split(":")[1];
  if (corpus === "hebrew" || corpus === "greek-nt" || corpus === "lxx") {
    return corpus;
  }

  return null;
}

function shardIdForEntity(entityId: string, shardCount: number) {
  return (hashEntityId(entityId) % shardCount)
    .toString(16)
    .padStart(2, "0");
}

function expandReference(
  compact: CompactReference,
): WordStudyRuntimeReference {
  const renderings = Object.fromEntries(
    (compact[5] || []).map(([translation, values]) => [
      translation,
      values || [],
    ]),
  );

  return {
    book: compact[0],
    chapter: compact[1],
    verse: compact[2],
    occurrenceCount: compact[3] || 1,
    evidenceId: compact[4] || undefined,
    renderings,
  };
}

function expandChronologyReference(
  compact: CompactChronologyReference | undefined,
) {
  if (!compact) return undefined;

  return {
    book: compact[0],
    chapter: compact[1],
    verse: compact[2],
  };
}

function expandCitation(compact: CompactCitation): WordStudyRuntimeCitation {
  return {
    book: compact[0],
    chapter: compact[1],
    verse: compact[2],
    label: compact[3] || `${compact[0]} ${compact[1]}:${compact[2]}`,
    evidenceId: compact[4] || undefined,
    kind: compact[5] || undefined,
  };
}

function expandKnowledgeExample(
  compact: CompactKnowledgeExample,
): WordStudyRuntimeKnowledgeExample {
  return {
    reference: compact[0]
      ? {
          book: compact[0][0],
          chapter: compact[0][1],
          verse: compact[0][2],
        }
      : undefined,
    label: compact[1],
    details: compact[2] || undefined,
    confidence: compact[3] || undefined,
  };
}

function expandEntity(
  entityId: string,
  compact: CompactEntity,
): WordStudyRuntimeEntity {
  const identity = compact.i || {};
  const occurrences = compact.o || {};
  const renderings = compact.r || {};
  const knowledge = compact.k || {};
  const health = compact.h || {};
  const sourceForms = identity.f || [0, 0, []];
  const knowledgeCounts = knowledge.c || [0, 0, 0, 0];

  return {
    entityId,
    corpus: compact.c,
    identity: {
      lemma: identity.l,
      normalizedLemma: identity.n,
      lexicalId: identity.x,
      strong: compact.c === "lxx" ? undefined : identity.s,
      language: identity.g,
      transliteration: identity.t,
      pronunciation: identity.p,
      partsOfSpeech: identity.ps || [],
      glosses: identity.gl || [],
      shortDefinitions: identity.d || [],
      witnesses: identity.w || [],
      morphology: identity.m || [],
      morphologyEnglish: identity.me || [],
      countedSourceForms: sourceForms[0] || 0,
      distinctSourceForms: sourceForms[1] || 0,
      sourceForms: (sourceForms[2] || []).map(([surface, count]) => ({
        surface,
        count,
      })),
    },
    occurrences: {
      corpusOccurrenceCount: occurrences.c || 0,
      totalEntityOccurrences: occurrences.t || 0,
      uniqueVerseCount: occurrences.u || 0,
      alignedSourceTokenCount: occurrences.a || 0,
      alignedVerseCount: occurrences.v || 0,
      translationAlignmentCount: occurrences.ta || 0,
      firstOccurrence: expandChronologyReference(occurrences.f),
      lastOccurrence: expandChronologyReference(occurrences.l),
      orderedReferences: (occurrences.r || []).map(expandReference),
      representativeReferences: (occurrences.p || []).map(expandReference),
    },
    renderings: {
      available: renderings.a === true,
      totalAlignedRenderings: renderings.t || 0,
      translationCounts: (renderings.c || []).map(
        ([translation, count]) => ({
          translation,
          count,
        }),
      ),
      mostCommon: (renderings.m || []).map(
        ([text, count, translation]) => ({
          text,
          count,
          translation,
        }),
      ),
      byTranslation: (renderings.b || []).map(
        ([translation, forms]) => ({
          translation,
          forms: forms.map(([text, count]) => ({ text, count })),
        }),
      ),
    },
    seeKnowledge: {
      available: knowledge.a === true,
      relationshipCount: knowledgeCounts[0] || 0,
      eventCount: knowledgeCounts[1] || 0,
      themeCount: knowledgeCounts[2] || 0,
      totalReferenceCount: knowledgeCounts[3] || 0,
      relationships: (knowledge.r || []).map(expandKnowledgeExample),
      events: (knowledge.e || []).map(expandKnowledgeExample),
      themes: (knowledge.t || []).map(expandKnowledgeExample),
    },
    health: {
      status: health.s,
      alignmentCoverage: health.a || 0,
      hasEnglishRenderings: health.e === true,
      hasGloss: health.g === true,
      hasLemma: health.l === true,
      hasLexicalId: health.x === true,
      hasReferences: health.r === true,
      compilerVersion: health.c,
    },
    explanation: {
      headline: compact.e.h,
      text: compact.e.t,
      citations: (compact.e.c || []).map(expandCitation),
      explanationChecksum: compact.e.x,
      packetChecksum: compact.e.p,
    },
  };
}

async function loadRuntimeShard(
  origin: string,
  corpus: BibleIQSource,
  shardId: string,
  file: string,
) {
  const key = `${originKey(origin)}|${corpus}|${shardId}`;
  let pending = shardCache.get(key);

  if (!pending) {
    pending = fetchJson<RuntimeShard>(runtimeUrl(originKey(origin), file));
    shardCache.set(key, pending);
  }

  return pending;
}

export async function loadWordStudyEntity(
  origin: string,
  entityId: string,
): Promise<WordStudyRuntimeEntity | null> {
  const canonicalEntityId = normalizeWordEntityId(entityId);
  if (!canonicalEntityId) return null;

  const corpus = corpusFromEntityId(canonicalEntityId);
  if (!corpus) return null;

  const manifest = await loadManifest(origin);

  if (
    !manifest ||
    manifest.version !== EXPECTED_RUNTIME_VERSION ||
    manifest.schemaVersion !== EXPECTED_SCHEMA_VERSION
  ) {
    console.error("P05 runtime manifest is missing or incompatible.");
    return null;
  }

  if (manifest.source?.p04Checksum !== EXPECTED_P04_CHECKSUM) {
    console.error(
      `P05 runtime P04 checksum mismatch: ${manifest.source?.p04Checksum}`,
    );
    return null;
  }

  if (
    manifest.source?.p04Prompt?.id !== EXPECTED_P04_PROMPT_ID ||
    manifest.source?.p04Prompt?.version !== EXPECTED_P04_PROMPT_VERSION
  ) {
    console.error("P05 runtime P04 prompt identity mismatch.");
    return null;
  }

  const shardId = shardIdForEntity(canonicalEntityId, manifest.shardCount);
  const shardMeta = manifest.corpora?.[corpus]?.shards?.[shardId];
  if (!shardMeta) return null;

  const shard = await loadRuntimeShard(
    origin,
    corpus,
    shardId,
    shardMeta.file,
  );

  if (
    !shard ||
    shard.version !== EXPECTED_RUNTIME_VERSION ||
    shard.corpus !== corpus ||
    shard.shard !== shardId
  ) {
    console.error(`P05 runtime shard mismatch for ${canonicalEntityId}`);
    return null;
  }

  const compact = shard.entities?.[canonicalEntityId];
  if (!compact) {
    console.error(`P05 runtime entity not found: ${canonicalEntityId}`);
    return null;
  }

  return expandEntity(canonicalEntityId, compact);
}

export const WordStudyEntityStore = {
  get: loadWordStudyEntity,
};

export default WordStudyEntityStore;
