"use strict";

const crypto = require("crypto");

const ENTITY_GRAPH_SCHEMA_VERSION = "1";
const ENTITY_GRAPH_COMPILER_VERSION = "1";

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
    const normalized = {};

    for (const key of Object.keys(value).sort()) {
      const child = value[key];

      if (child !== undefined) {
        normalized[key] = stableNormalize(child);
      }
    }

    return normalized;
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
      `Unsupported Entity Graph corpus "${corpus}". ` +
        `Expected: ${SUPPORTED_CORPORA.join(", ")}.`
    );
  }
}

/**
 * Existing Hebrew canonical tokens currently use identities such as:
 *
 *   hebrew:H430
 *
 * Greek NT and LXX use the permanent corpus-aware form:
 *
 *   word:greek-nt:G3056
 *   word:lxx:L704639
 *
 * CR13 normalizes all three without rewriting upstream artifacts.
 */
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
      `Invalid corpus-aware word entity ID "${entityId}".`
    );
  }

  return {
    corpus: match[1],
    lexicalId: match[2],
  };
}

function entityFileStem(entityId) {
  const { lexicalId } = parseWordEntityId(entityId);

  return lexicalId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function createEmptyEntity({
  entityId,
  corpus,
  language,
  lexicalId,
}) {
  assertSupportedCorpus(corpus);

  return {
    schemaVersion: ENTITY_GRAPH_SCHEMA_VERSION,
    compilerVersion: ENTITY_GRAPH_COMPILER_VERSION,

    id: entityId,
    type: "word",
    corpus,
    language,
    lexicalId,

    lexical: {
      lemma: null,
      normalizedLemma: null,
      transliteration: null,
      glosses: [],
      surfaces: [],
      morphology: [],
      witnesses: [],
    },

    statistics: {
      sourceTokenCount: 0,
      verseCount: 0,
      translationAlignmentCount: 0,
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

    provenance: {
      canonicalCorpora: [],
      seeGraphs: [],
    },
  };
}

function validateEntity(entity) {
  if (!entity || typeof entity !== "object") {
    throw new Error("Entity Graph entry must be an object.");
  }

  parseWordEntityId(entity.id);
  assertSupportedCorpus(entity.corpus);

  if (entity.type !== "word") {
    throw new Error(
      `Unsupported Entity Graph type "${entity.type}".`
    );
  }

  if (!entity.lexical || !entity.statistics) {
    throw new Error(
      `Entity "${entity.id}" is missing required sections.`
    );
  }

  return entity;
}

function createEntityFingerprint(entity) {
  validateEntity(entity);

  const stableInput = {
    schemaVersion: entity.schemaVersion,
    compilerVersion: entity.compilerVersion,
    id: entity.id,
    type: entity.type,
    corpus: entity.corpus,
    language: entity.language,
    lexicalId: entity.lexicalId,
    lexical: entity.lexical,
    statistics: entity.statistics,
    chronology: entity.chronology,
    renderings: entity.renderings,
    references: entity.references,
    relationships: entity.relationships,
    events: entity.events,
    themes: entity.themes,
    provenance: entity.provenance,
  };

  return sha256(stableInput);
}

module.exports = {
  ENTITY_GRAPH_SCHEMA_VERSION,
  ENTITY_GRAPH_COMPILER_VERSION,
  SUPPORTED_CORPORA,
  stableNormalize,
  stableStringify,
  sha256,
  assertSupportedCorpus,
  normalizeWordEntityId,
  parseWordEntityId,
  entityFileStem,
  createEmptyEntity,
  validateEntity,
  createEntityFingerprint,
};