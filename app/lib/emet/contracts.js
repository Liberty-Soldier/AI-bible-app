"use strict";

const crypto = require("crypto");

const EMET_PACKET_SCHEMA_VERSION = "1";
const EMET_OUTPUT_SCHEMA_VERSION = "1";
const EMET_DEFAULT_LOCALE = "en";
const EMET_DEFAULT_PROFILE = "standard";
const EMET_PROMPT_REVISION = "1";
const EMET_PACKET_BUILDER_REVISION = "1";

const SUPPORTED_CORPORA = Object.freeze([
  "hebrew",
  "greek-nt",
  "lxx",
]);

const SUPPORTED_PACKET_TYPES = Object.freeze([
  "word",
]);

/**
 * Recursively sorts object keys so hashing and serialized output remain stable.
 *
 * Array order is preserved because arrays such as key references may have
 * intentional semantic ordering. Packet builders must sort unordered arrays
 * before passing them here.
 */
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

      if (child === undefined) {
        continue;
      }

      result[key] = stableNormalize(child);
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

function shortHash(value, length = 12) {
  return sha256(value).slice(0, length);
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `Expected ${fieldName} to be a non-empty string.`
    );
  }
}

function assertSupportedCorpus(corpus) {
  assertNonEmptyString(corpus, "corpus");

  if (!SUPPORTED_CORPORA.includes(corpus)) {
    throw new Error(
      `Unsupported EMET corpus "${corpus}". ` +
        `Expected one of: ${SUPPORTED_CORPORA.join(", ")}.`
    );
  }
}

function assertSupportedPacketType(packetType) {
  assertNonEmptyString(packetType, "packetType");

  if (!SUPPORTED_PACKET_TYPES.includes(packetType)) {
    throw new Error(
      `Unsupported EMET packet type "${packetType}". ` +
        `Expected one of: ${SUPPORTED_PACKET_TYPES.join(", ")}.`
    );
  }
}

function parseWordEntityId(entityId) {
  assertNonEmptyString(entityId, "entityId");

  const match = /^word:(hebrew|greek-nt|lxx):([^:]+)$/.exec(
    entityId
  );

  if (!match) {
    throw new Error(
      `Invalid corpus-aware word entity ID "${entityId}". ` +
        `Expected word:hebrew:<id>, word:greek-nt:<id>, ` +
        `or word:lxx:<id>.`
    );
  }

  return {
    packetType: "word",
    corpus: match[1],
    lexicalId: match[2],
  };
}

function validateSourcePacket(packet) {
  if (!packet || typeof packet !== "object") {
    throw new Error("EMET source packet must be an object.");
  }

  if (
    String(packet.schemaVersion) !==
    EMET_PACKET_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported EMET source packet schema version ` +
        `"${packet.schemaVersion}". Expected ` +
        `"${EMET_PACKET_SCHEMA_VERSION}".`
    );
  }

  assertSupportedPacketType(packet.packetType);
  assertSupportedCorpus(packet.corpus);
  assertNonEmptyString(packet.packetId, "packetId");

  const parsed = parseWordEntityId(packet.packetId);

  if (parsed.packetType !== packet.packetType) {
    throw new Error(
      `Packet type mismatch for "${packet.packetId}".`
    );
  }

  if (parsed.corpus !== packet.corpus) {
    throw new Error(
      `Corpus mismatch for "${packet.packetId}". ` +
        `Packet says "${packet.corpus}", while the entity ID says ` +
        `"${parsed.corpus}".`
    );
  }

  if (!packet.source || typeof packet.source !== "object") {
    throw new Error(
      `Packet "${packet.packetId}" is missing source identity.`
    );
  }

  if (packet.source.entityId !== packet.packetId) {
    throw new Error(
      `Packet source.entityId must equal packetId for ` +
        `"${packet.packetId}".`
    );
  }

  assertNonEmptyString(
    packet.source.language,
    "source.language"
  );

  if (!packet.evidence || typeof packet.evidence !== "object") {
    throw new Error(
      `Packet "${packet.packetId}" is missing SEE evidence.`
    );
  }

  if (
    !packet.provenance ||
    typeof packet.provenance !== "object"
  ) {
    throw new Error(
      `Packet "${packet.packetId}" is missing provenance.`
    );
  }

  return packet;
}

/**
 * Returns only the stable fields that are allowed to affect generation.
 *
 * Volatile fields such as builtAt or generatedAt are intentionally omitted.
 */
function getSourcePacketFingerprintInput(packet) {
  validateSourcePacket(packet);

  return {
    schemaVersion: packet.schemaVersion,
    packetType: packet.packetType,
    packetId: packet.packetId,
    corpus: packet.corpus,
    source: packet.source,
    evidence: packet.evidence,
    provenance: {
      seeSchemaVersion:
        packet.provenance.seeSchemaVersion || null,
      seeBuildId:
        packet.provenance.seeBuildId || null,
      sourceCorpus:
        packet.provenance.sourceCorpus || packet.corpus,
      sourceDataset:
        packet.provenance.sourceDataset || null,
      sourceDatasetVersion:
        packet.provenance.sourceDatasetVersion || null,
      sourcePacketBuilderRevision:
        packet.provenance.sourcePacketBuilderRevision ||
        EMET_PACKET_BUILDER_REVISION,
    },
  };
}

function createSourcePacketFingerprint(packet) {
  return sha256(
    getSourcePacketFingerprintInput(packet)
  );
}

function createLogicalCacheKey({
  packetType,
  entityId,
  locale = EMET_DEFAULT_LOCALE,
  profile = EMET_DEFAULT_PROFILE,
}) {
  assertSupportedPacketType(packetType);
  assertNonEmptyString(entityId, "entityId");
  assertNonEmptyString(locale, "locale");
  assertNonEmptyString(profile, "profile");

  parseWordEntityId(entityId);

  return [
    "emet",
    packetType,
    `v${EMET_OUTPUT_SCHEMA_VERSION}`,
    locale,
    profile,
    entityId,
  ].join(":");
}

function createArtifactCacheKey({
  packetType,
  entityId,
  packetFingerprint,
  locale = EMET_DEFAULT_LOCALE,
  profile = EMET_DEFAULT_PROFILE,
  promptRevision = EMET_PROMPT_REVISION,
}) {
  assertNonEmptyString(
    packetFingerprint,
    "packetFingerprint"
  );
  assertNonEmptyString(
    promptRevision,
    "promptRevision"
  );

  const logicalKey = createLogicalCacheKey({
    packetType,
    entityId,
    locale,
    profile,
  });

  return [
    logicalKey,
    `p${promptRevision}`,
    packetFingerprint.slice(0, 12),
  ].join(":");
}

function safeArtifactStem(entityId) {
  const parsed = parseWordEntityId(entityId);

  return parsed.lexicalId
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^_+|_+$/g, "");
}

function createRuntimeRelativePath({
  entityId,
  packetFingerprint,
  promptRevision = EMET_PROMPT_REVISION,
}) {
  const parsed = parseWordEntityId(entityId);
  const stem = safeArtifactStem(entityId);
  const revision = `p${promptRevision}`;
  const fingerprint = packetFingerprint.slice(0, 12);

  return [
    "word",
    parsed.corpus,
    `${stem}.${revision}.${fingerprint}.json`,
  ].join("/");
}

module.exports = {
  EMET_PACKET_SCHEMA_VERSION,
  EMET_OUTPUT_SCHEMA_VERSION,
  EMET_DEFAULT_LOCALE,
  EMET_DEFAULT_PROFILE,
  EMET_PROMPT_REVISION,
  EMET_PACKET_BUILDER_REVISION,
  SUPPORTED_CORPORA,
  SUPPORTED_PACKET_TYPES,
  stableNormalize,
  stableStringify,
  sha256,
  shortHash,
  parseWordEntityId,
  validateSourcePacket,
  getSourcePacketFingerprintInput,
  createSourcePacketFingerprint,
  createLogicalCacheKey,
  createArtifactCacheKey,
  createRuntimeRelativePath,
  safeArtifactStem,
};