"use strict";

const crypto = require("crypto");

const ENTITY_SCHEMA_VERSION = "1";
const ENTITY_COMPILER_VERSION = "0.1.0";

const SUPPORTED_CORPORA = Object.freeze([
  "hebrew",
  "greek-nt",
  "lxx",
]);

function stableNormalize(value) {
  if (Array.isArray(value)) {
    return value.map(stableNormalize);
  }

  if (
    value !== null &&
    typeof value === "object" &&
    !Buffer.isBuffer(value)
  ) {
    const result = {};

    for (const key of Object.keys(value).sort()) {
      const child = value[key];

      if (child !== undefined) {
        result[key] = stableNormalize(child);
      }
    }

    return result;
  }

  return value;
}

function stableStringify(value, spacing = 0) {
  return JSON.stringify(stableNormalize(value), null, spacing);
}

function sha256(value) {
  const input =
    typeof value === "string"
      ? value
      : stableStringify(value);

  return crypto
    .createHash("sha256")
    .update(input, "utf8")
    .digest("hex");
}

function assertSupportedCorpus(corpus) {
  if (!SUPPORTED_CORPORA.includes(corpus)) {
    throw new Error(
      `Unsupported corpus "${corpus}". Expected: ` +
        SUPPORTED_CORPORA.join(", ")
    );
  }
}

function normalizeWordEntityId(entityId, corpus, lexicalId) {
  assertSupportedCorpus(corpus);

  if (
    typeof entityId === "string" &&
    /^word:(hebrew|greek-nt|lxx):[^:]+$/.test(entityId)
  ) {
    return entityId;
  }

  if (
    typeof entityId === "string" &&
    /^(hebrew|greek-nt|lxx):[^:]+$/.test(entityId)
  ) {
    return `word:${entityId}`;
  }

  if (
    typeof lexicalId === "string" &&
    lexicalId.trim() !== ""
  ) {
    return `word:${corpus}:${lexicalId.trim()}`;
  }

  throw new Error(
    `Unable to normalize entity ID. ` +
      `corpus=${JSON.stringify(corpus)} ` +
      `entityId=${JSON.stringify(entityId)} ` +
      `lexicalId=${JSON.stringify(lexicalId)}`
  );
}

function parseWordEntityId(entityId) {
  const match =
    /^word:(hebrew|greek-nt|lxx):([^:]+)$/.exec(entityId);

  if (!match) {
    throw new Error(
      `Invalid corpus-aware entity ID "${entityId}".`
    );
  }

  return {
    corpus: match[1],
    lexicalId: match[2],
  };
}

function createEmptyEntity({
  id,
  corpus,
  language,
  lexicalId,
}) {
  return {
    schemaVersion: ENTITY_SCHEMA_VERSION,
    compilerVersion: ENTITY_COMPILER_VERSION,

    id,
    type: "word",
    corpus,
    language,
    lexicalId,

lexical: {
  lemma: null,
  normalizedLemma: null,
  transliteration: null,
  pronunciation: null,

  glosses: [],
  shortDefinitions: [],
  surfaces: [],

  morphology: [],
  morphologyEnglish: [],
  partsOfSpeech: [],

  witnesses: [],
},

    statistics: {
  sourceTokenCount: 0,
  alignedSourceTokenCount: 0,
  verseCount: 0,
  translationAlignmentCount: 0,
  alignedVerseCount: 0,
  translationCounts: {},
},

    chronology: {
      firstOccurrence: null,
      lastOccurrence: null,
    },

    renderings: [],
    references: [],

    relationships: [],
    events: [],
    themes: [],

    entityHealth: {
      hasLexicalId: Boolean(lexicalId),
      hasLemma: false,
      hasGloss: false,
      hasReferences: false,
      hasEnglishRenderings: false,
      alignmentCoverage: 0,
      status: "incomplete",
    },

    provenance: {
      canonicalCorpus: corpus,
      sourceDatasets: [],
      compiledBy: "entity-compiler:P01",
    },
  };
}

function createEntityFingerprint(entity) {
  const copy = {
    ...entity,
  };

  delete copy.fingerprint;

  return sha256(copy);
}

module.exports = {
  ENTITY_SCHEMA_VERSION,
  ENTITY_COMPILER_VERSION,
  SUPPORTED_CORPORA,
  stableNormalize,
  stableStringify,
  sha256,
  assertSupportedCorpus,
  normalizeWordEntityId,
  parseWordEntityId,
  createEmptyEntity,
  createEntityFingerprint,
};
