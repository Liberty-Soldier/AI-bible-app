"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
  PROMPT_ID,
  PROMPT_VERSION,
  EXPLANATION_SCHEMA_VERSION,
  SYSTEM_PROMPT,
  OUTPUT_SCHEMA,
} = require("./emet-prompts/emet-free-tier-v1");

const ROOT = process.cwd();

function loadLocalEnvironment() {
  const originalKeys = new Set(Object.keys(process.env));
  for (const filename of [".env", ".env.local"]) {
    const filePath = path.join(ROOT, filename);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);
      if (!match || originalKeys.has(match[1])) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  }
}

loadLocalEnvironment();
const COMPILER_ID = "P04";
const COMPILER_NAME = "EMETSEES Cached EMET Explanation Compiler";
const COMPILER_VERSION = "1.6.5";
const SCHEMA_VERSION = "1.2.0";
const GENERATION_VIEW_VERSION = "1.2.4";
const GENERATION_CONTRACT_VERSION = "1.4.5";

const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_API_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_ATTEMPTS = 5;
const MIN_TOTAL_WORDS = 60;
const MAX_TOTAL_WORDS = 120;
const MAX_EXPLANATION_CHARS = 2400;
const BANNED_READER_PHRASES = [
  "entity evidence",
  "base-ready",
  "compiled record",
  "supplied view",
  "availability flags",
  "insufficient evidence",
  "source-word entity",
  "the graph reports",
  "lexical metadata",
  "occurrence distribution",
  "rendering evidence",
  "aligned kjv",
  "aligned web",
  "translation counts",
  "recorded forms",
  "source forms",
  "forms such as",
  "corpus-aware",
  "graph connection",
  "graph connections",
  "not yet compiled",
  "supplied evidence",
  "supplied glosses",
  "the supplied glosses",
  "glosses support",
  "the evidence shows",
  "available evidence",
  "the packet",
  "the record",
  "the data",
  "examples include",
  "depending on its sentence",
  "grammatical form",
  "morphological form",
  "this explanation",
  "evidence mechanics",
  "should not be expanded",
  "unrelated spiritual idea",
  "beyond the basic sense",
  "spiritual significance",
  "calls for steadfastness",
  "requiring perseverance",
];
const BANNED_HEADLINE_PHRASES = [
  "source word",
  "entity",
  "designation",
  "lexical record",
];
const SAMPLE_LIMIT = 3;
const ERROR_SAMPLE_LIMIT = 100;
const REPRESENTATIVE_REFERENCE_LIMIT = 6;
const SEE_EXCERPT_LIMIT = 4;
const SOURCE_FORM_LIMIT = 4;
const RENDERING_LIMIT = 12;
const BOOK_DISTRIBUTION_LIMIT = 5;
const DEFAULT_MAX_ENTITY_INPUT_BYTES = 32768;
const DEFAULT_MAX_BATCH_INPUT_BYTES = 393216;
const TOKEN_ESTIMATE_BYTES_PER_TOKEN = 3;

const INPUTS = {
  packets: path.join(
    ROOT,
    ".private",
    "entity",
    "build",
    "P03",
    "evidence-packets.json"
  ),
  prompt: path.join(
    ROOT,
    "scripts",
    "entity",
    "emet-prompts",
    "emet-free-tier-v1.js"
  ),
};

const OUTPUT_DIR = path.join(
  ROOT,
  ".private",
  "entity",
  "build",
  COMPILER_ID
);
const EXPLANATIONS_PATH = path.join(OUTPUT_DIR, "cached-explanations.json");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");
const AUDIT_PATH = path.join(OUTPUT_DIR, "audit.json");
const STATE_PATH = path.join(OUTPUT_DIR, "generation-state.json");

function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function relativePath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} not found: ${relativePath(filePath)}`);
  }
  if (!fs.statSync(filePath).isFile()) {
    fail(`${label} is not a file: ${relativePath(filePath)}`);
  }
}

function readText(filePath, label) {
  assertFile(filePath, label);
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    fail(`Unable to read ${label}: ${error.message}`);
  }
}

function readJson(filePath, label) {
  const text = readText(filePath, label);
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`Invalid JSON in ${label} (${relativePath(filePath)}): ${error.message}`);
  }
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Text(value) {
  return sha256Buffer(Buffer.from(value, "utf8"));
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    const result = {};
    for (const key of Object.keys(value).sort((left, right) =>
      left.localeCompare(right)
    )) {
      if (value[key] !== undefined) result[key] = canonicalize(value[key]);
    }
    return result;
  }
  return value;
}

function stableStringify(value, space = 0) {
  return JSON.stringify(canonicalize(value), null, space);
}

function atomicWriteText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, text, "utf8");
  fs.renameSync(tempPath, filePath);
}

function writeStableJson(filePath, value, space = 0) {
  const text = `${stableStringify(value, space)}\n`;
  atomicWriteText(filePath, text);
  return text;
}

function fingerprintFile(filePath) {
  const stat = fs.statSync(filePath);
  return {
    path: relativePath(filePath),
    bytes: stat.size,
    sha256: sha256File(filePath),
  };
}

function sortedUniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(cleanString)
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));
}

function sortRecord(record) {
  if (!isRecord(record)) return {};
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
  );
}

function truncateArray(values, limit) {
  return Array.isArray(values) ? values.slice(0, limit) : [];
}

function countWords(text) {
  const cleaned = cleanString(text);
  return cleaned ? cleaned.split(/\s+/u).length : 0;
}

function packetCoreChecksum(packet) {
  const core = { ...packet };
  const expected = cleanString(core.checksum);
  delete core.checksum;
  return {
    expected,
    actual: sha256Text(stableStringify(core)),
  };
}

function artifactCoreChecksum(artifact) {
  const core = { ...artifact };
  const expected = cleanString(core.checksum);
  delete core.checksum;
  return {
    expected,
    actual: sha256Text(stableStringify(core)),
  };
}

function promptDescriptor() {
  const promptFileFingerprint = fingerprintFile(INPUTS.prompt);
  const promptCore = {
    id: PROMPT_ID,
    version: PROMPT_VERSION,
    explanationSchemaVersion: EXPLANATION_SCHEMA_VERSION,
    systemPrompt: SYSTEM_PROMPT,
    outputSchema: OUTPUT_SCHEMA,
    promptFileFingerprint,
    generationViewPolicy: {
      version: GENERATION_VIEW_VERSION,
      sourceFormLimit: SOURCE_FORM_LIMIT,
      renderingLimit: RENDERING_LIMIT,
      representativeReferenceLimit: REPRESENTATIVE_REFERENCE_LIMIT,
      seeExcerptLimit: SEE_EXCERPT_LIMIT,
      bookDistributionLimit: BOOK_DISTRIBUTION_LIMIT,
      minTotalWords: MIN_TOTAL_WORDS,
      maxTotalWords: MAX_TOTAL_WORDS,
      defaultMaxEntityInputBytes: DEFAULT_MAX_ENTITY_INPUT_BYTES,
      defaultMaxBatchInputBytes: DEFAULT_MAX_BATCH_INPUT_BYTES,
      tokenEstimateBytesPerToken: TOKEN_ESTIMATE_BYTES_PER_TOKEN,
      allowedEvidencePolicy:
        "Only evidence IDs present in the compact generation view are transmitted to the model.",
    },
  };
  return {
    id: PROMPT_ID,
    version: PROMPT_VERSION,
    explanationSchemaVersion: EXPLANATION_SCHEMA_VERSION,
    checksum: sha256Text(stableStringify(promptCore)),
    file: promptFileFingerprint,
  };
}

function parseArgs(argv) {
  const result = {
    mode: "build",
    force: false,
    resetState: false,
    retryFailed: false,
    limit: null,
    entityIds: [],
    model: cleanString(process.env.EMET_P04_MODEL) || DEFAULT_MODEL,
    batchSize: positiveInteger(
      process.env.EMET_P04_BATCH_SIZE,
      DEFAULT_BATCH_SIZE
    ),
    concurrency: positiveInteger(
      process.env.EMET_P04_CONCURRENCY,
      DEFAULT_CONCURRENCY
    ),
    maxAttempts: positiveInteger(
      process.env.EMET_P04_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS
    ),
    maxEntityInputBytes: positiveInteger(
      process.env.EMET_P04_MAX_ENTITY_INPUT_BYTES,
      DEFAULT_MAX_ENTITY_INPUT_BYTES
    ),
    maxBatchInputBytes: positiveInteger(
      process.env.EMET_P04_MAX_BATCH_INPUT_BYTES,
      DEFAULT_MAX_BATCH_INPUT_BYTES
    ),
    apiBaseUrl:
      cleanString(process.env.OPENAI_BASE_URL) || DEFAULT_API_BASE_URL,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--verify") result.mode = "verify";
    else if (arg === "--plan") result.mode = "plan";
    else if (arg === "--inspect-input") result.mode = "inspect";
    else if (arg === "--force") result.force = true;
    else if (arg === "--reset-state") result.resetState = true;
    else if (arg === "--retry-failed") result.retryFailed = true;
    else if (arg === "--limit") {
      result.limit = positiveInteger(argv[++index], null);
      if (!result.limit) fail("--limit requires a positive integer.");
    } else if (arg === "--entity") {
      const raw = cleanString(argv[++index]);
      if (!raw) fail("--entity requires an entity ID or comma-separated IDs.");
      result.entityIds.push(...raw.split(",").map((value) => value.trim()));
    } else if (arg === "--model") {
      result.model = cleanString(argv[++index]);
      if (!result.model) fail("--model requires a model ID.");
    } else if (arg === "--batch-size") {
      result.batchSize = positiveInteger(argv[++index], null);
      if (!result.batchSize) fail("--batch-size requires a positive integer.");
    } else if (arg === "--concurrency") {
      result.concurrency = positiveInteger(argv[++index], null);
      if (!result.concurrency) fail("--concurrency requires a positive integer.");
    } else if (arg === "--max-attempts") {
      result.maxAttempts = positiveInteger(argv[++index], null);
      if (!result.maxAttempts) fail("--max-attempts requires a positive integer.");
    } else if (arg === "--max-entity-input-bytes") {
      result.maxEntityInputBytes = positiveInteger(argv[++index], null);
      if (!result.maxEntityInputBytes) {
        fail("--max-entity-input-bytes requires a positive integer.");
      }
    } else if (arg === "--max-batch-input-bytes") {
      result.maxBatchInputBytes = positiveInteger(argv[++index], null);
      if (!result.maxBatchInputBytes) {
        fail("--max-batch-input-bytes requires a positive integer.");
      }
    } else if (arg === "--api-base-url") {
      result.apiBaseUrl = cleanString(argv[++index]);
      if (!result.apiBaseUrl) fail("--api-base-url requires a URL.");
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }

  result.entityIds = sortedUniqueStrings(result.entityIds);
  result.apiBaseUrl = result.apiBaseUrl.replace(/\/+$/, "");
  return result;
}

function extractPacketMap(document) {
  const packets = document?.packets;
  if (!isRecord(packets)) {
    fail("P03 evidence-packets.json does not contain a packets object map.");
  }
  return packets;
}

function validateP03Artifact(document) {
  const artifactChecksum = artifactCoreChecksum(document);
  if (!artifactChecksum.expected || artifactChecksum.expected !== artifactChecksum.actual) {
    fail("P03 artifact checksum mismatch. Rebuild and verify P03 before P04.");
  }

  const packets = extractPacketMap(document);
  const invalidPacketChecksums = [];
  for (const entityId of Object.keys(packets).sort()) {
    const packet = packets[entityId];
    if (!isRecord(packet)) {
      invalidPacketChecksums.push(entityId);
      continue;
    }
    const checksum = packetCoreChecksum(packet);
    if (!checksum.expected || checksum.expected !== checksum.actual) {
      invalidPacketChecksums.push(entityId);
      if (invalidPacketChecksums.length >= ERROR_SAMPLE_LIMIT) break;
    }
  }

  if (invalidPacketChecksums.length > 0) {
    fail(
      `P03 contains invalid packet checksums. First failures: ${invalidPacketChecksums.join(", ")}`
    );
  }

  return {
    artifactChecksum: artifactChecksum.actual,
    packets,
  };
}

function generationSignature({ entityId, packetChecksum, prompt, model }) {
  return sha256Text(
    stableStringify({
      entityId,
      packetChecksum,
      promptId: prompt.id,
      promptVersion: prompt.version,
      promptChecksum: prompt.checksum,
      explanationSchemaVersion: prompt.explanationSchemaVersion,
      model,
      compilerVersion: GENERATION_CONTRACT_VERSION,
    })
  );
}

function citationBase(entityId, corpus, evidenceId, kind, label, p03Path) {
  return {
    evidenceId,
    entityId,
    corpus,
    kind,
    label,
    p03Path,
  };
}

function buildEvidenceCatalog(packet) {
  const entityId = packet.entityId;
  const corpus = packet.corpus;
  const catalog = {};

  function add(evidenceId, value) {
    if (!evidenceId || catalog[evidenceId]) return;
    catalog[evidenceId] = canonicalize(value);
  }

  add(
    `p03:${entityId}:identity`,
    citationBase(
      entityId,
      corpus,
      `p03:${entityId}:identity`,
      "entity-identity",
      "Source-word identity and lexical metadata",
      `packets.${entityId}.identity`
    )
  );
  add(
    `p03:${entityId}:renderings`,
    citationBase(
      entityId,
      corpus,
      `p03:${entityId}:renderings`,
      "rendering-evidence",
      "English rendering statistics",
      `packets.${entityId}.renderings`
    )
  );
  add(
    `p03:${entityId}:occurrences`,
    citationBase(
      entityId,
      corpus,
      `p03:${entityId}:occurrences`,
      "occurrence-evidence",
      "Entity occurrence totals and distribution",
      `packets.${entityId}.occurrences`
    )
  );
  add(
    `p03:${entityId}:chronology`,
    citationBase(
      entityId,
      corpus,
      `p03:${entityId}:chronology`,
      "chronology",
      "First and last occurrence chronology",
      `packets.${entityId}.occurrences.chronology`
    )
  );
  add(
    `p03:${entityId}:health`,
    citationBase(
      entityId,
      corpus,
      `p03:${entityId}:health`,
      "entity-health",
      "P01 entity health and provenance",
      `packets.${entityId}.health`
    )
  );
  add(
    `p03:${entityId}:see-availability`,
    citationBase(
      entityId,
      corpus,
      `p03:${entityId}:see-availability`,
      "see-availability",
      "SEE graph availability and reference counts",
      `packets.${entityId}.seeKnowledge`
    )
  );

  const orderedReferences = Array.isArray(packet?.occurrences?.orderedReferences)
    ? packet.occurrences.orderedReferences
    : [];
  for (let index = 0; index < orderedReferences.length; index += 1) {
    const reference = orderedReferences[index];
    const evidenceId = cleanString(reference?.evidenceId);
    if (!evidenceId) continue;
    add(evidenceId, {
      ...citationBase(
        entityId,
        corpus,
        evidenceId,
        "scripture-reference",
        cleanString(reference.reference) || `Reference ${index + 1}`,
        `packets.${entityId}.occurrences.orderedReferences.${index}`
      ),
      reference: cleanString(reference.reference),
      book: cleanString(reference.book),
      chapter: Number.isInteger(Number(reference.chapter))
        ? Number(reference.chapter)
        : null,
      verse: Number.isInteger(Number(reference.verse))
        ? Number(reference.verse)
        : null,
    });
  }

  const relationships = Array.isArray(packet?.seeKnowledge?.relationships?.excerpts)
    ? packet.seeKnowledge.relationships.excerpts
    : [];
  for (let index = 0; index < relationships.length; index += 1) {
    const excerpt = relationships[index];
    const canonicalId = cleanString(excerpt?.pointer?.canonicalId) || "unknown";
    const graphIndex = nonNegativeInteger(excerpt?.pointer?.index, index);
    const evidenceId = `p03:${entityId}:relationship:${canonicalId}:${graphIndex}`;
    add(evidenceId, {
      ...citationBase(
        entityId,
        corpus,
        evidenceId,
        "see-relationship",
        `SEE relationship at ${canonicalId}`,
        `packets.${entityId}.seeKnowledge.relationships.excerpts.${index}`
      ),
      graph: "RelationshipGraph",
      canonicalId,
      graphIndex,
    });
  }

  const events = Array.isArray(packet?.seeKnowledge?.events?.excerpts)
    ? packet.seeKnowledge.events.excerpts
    : [];
  for (let index = 0; index < events.length; index += 1) {
    const excerpt = events[index];
    const canonicalId = cleanString(excerpt?.pointer?.canonicalId) || "unknown";
    const graphIndex = nonNegativeInteger(excerpt?.pointer?.index, index);
    const evidenceId = `p03:${entityId}:event:${canonicalId}:${graphIndex}`;
    add(evidenceId, {
      ...citationBase(
        entityId,
        corpus,
        evidenceId,
        "see-event",
        `SEE event at ${canonicalId}`,
        `packets.${entityId}.seeKnowledge.events.excerpts.${index}`
      ),
      graph: "EventGraph",
      canonicalId,
      graphIndex,
    });
  }

  const themes = Array.isArray(packet?.seeKnowledge?.themes?.excerpts)
    ? packet.seeKnowledge.themes.excerpts
    : [];
  for (let index = 0; index < themes.length; index += 1) {
    const excerpt = themes[index];
    const themeId = cleanString(excerpt?.themeId) || "unknown";
    const canonicalId = cleanString(excerpt?.canonicalId) || "unknown";
    const graphIndex = nonNegativeInteger(excerpt?.pointer?.index, index);
    const evidenceId = `p03:${entityId}:theme:${themeId}:${canonicalId}:${graphIndex}`;
    add(evidenceId, {
      ...citationBase(
        entityId,
        corpus,
        evidenceId,
        "see-theme",
        cleanString(excerpt?.name) || `SEE theme ${themeId}`,
        `packets.${entityId}.seeKnowledge.themes.excerpts.${index}`
      ),
      graph: "ThemeGraph",
      themeId,
      canonicalId,
      graphIndex,
    });
  }

  return sortRecord(catalog);
}

function topBookDistribution(distribution) {
  if (!isRecord(distribution)) return [];
  return Object.entries(distribution)
    .map(([book, counts]) => ({
      book,
      verses: nonNegativeInteger(counts?.verses),
      occurrences: nonNegativeInteger(counts?.occurrences),
    }))
    .sort(
      (left, right) =>
        right.occurrences - left.occurrences ||
        right.verses - left.verses ||
        left.book.localeCompare(right.book)
    )
    .slice(0, BOOK_DISTRIBUTION_LIMIT);
}

function compactReferenceRenderings(renderings) {
  if (!isRecord(renderings)) return {};
  const compact = {};
  for (const translation of Object.keys(renderings).sort()) {
    const values = sortedUniqueStrings(renderings[translation]).slice(0, 4);
    if (values.length > 0) compact[translation] = values;
  }
  return compact;
}

function compactReference(reference) {
  return {
    evidence_id: cleanString(reference?.evidenceId),
    reference: cleanString(reference?.reference),
    book: cleanString(reference?.book),
    chapter: Number.isInteger(Number(reference?.chapter))
      ? Number(reference.chapter)
      : null,
    verse: Number.isInteger(Number(reference?.verse))
      ? Number(reference.verse)
      : null,
    occurrence_count: nonNegativeInteger(reference?.occurrenceCount),
    renderings: compactReferenceRenderings(reference?.renderings),
  };
}

function compactRelationship(entityId, excerpt, index) {
  const canonicalId = cleanString(excerpt?.pointer?.canonicalId) || "unknown";
  const graphIndex = nonNegativeInteger(excerpt?.pointer?.index, index);
  return {
    evidence_id: `p03:${entityId}:relationship:${canonicalId}:${graphIndex}`,
    canonical_id: canonicalId,
    roles: sortedUniqueStrings(excerpt?.roles).slice(0, 8),
    type: cleanString(excerpt?.type),
    subject: cleanString(excerpt?.subject),
    predicate: cleanString(excerpt?.predicate),
    object: cleanString(excerpt?.object),
    counterpart_entity_ids: sortedUniqueStrings(excerpt?.counterpartEntityIds).slice(0, 12),
  };
}

function compactEvent(entityId, excerpt, index) {
  const canonicalId = cleanString(excerpt?.pointer?.canonicalId) || "unknown";
  const graphIndex = nonNegativeInteger(excerpt?.pointer?.index, index);
  return {
    evidence_id: `p03:${entityId}:event:${canonicalId}:${graphIndex}`,
    canonical_id: canonicalId,
    roles: sortedUniqueStrings(excerpt?.roles).slice(0, 8),
    type: cleanString(excerpt?.type),
    participant_count: nonNegativeInteger(excerpt?.participantCount),
    counterpart_entity_ids: sortedUniqueStrings(excerpt?.counterpartEntityIds).slice(0, 12),
  };
}

function compactTheme(entityId, excerpt, index) {
  const themeId = cleanString(excerpt?.themeId) || "unknown";
  const canonicalId = cleanString(excerpt?.canonicalId) || "unknown";
  const graphIndex = nonNegativeInteger(excerpt?.pointer?.index, index);
  return {
    evidence_id: `p03:${entityId}:theme:${themeId}:${canonicalId}:${graphIndex}`,
    theme_id: themeId,
    name: cleanString(excerpt?.name),
    canonical_id: canonicalId,
    event_type: cleanString(excerpt?.eventType),
  };
}

function compactSourceForm(value) {
  if (typeof value === "string") {
    const surface = cleanString(value);
    return surface ? { surface, count: 0 } : null;
  }
  if (!isRecord(value)) return null;
  const surface =
    cleanString(value.surface) ||
    cleanString(value.text) ||
    cleanString(value.form);
  if (!surface) return null;
  return {
    surface,
    count: nonNegativeInteger(value.count),
  };
}

function compactRendering(value) {
  if (!isRecord(value)) return null;
  const text = cleanString(value.text) || cleanString(value.rendering);
  if (!text) return null;
  return {
    translation: cleanString(value.translation) || "unknown",
    text,
    normalized: cleanString(value.normalized),
    count: nonNegativeInteger(value.count),
  };
}

function normalizeMeaningPhrase(value) {
  const text = cleanString(value);
  if (!text) return null;
  return text
    .toLocaleLowerCase("en-US")
    .replace(/[“”"'`]/gu, "")
    .replace(/^[\s]*(?:a|an|the|to)[\s]+/u, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ") || null;
}

function lexicalMeaningPhrases(identity) {
  const values = [
    ...(Array.isArray(identity?.glosses) ? identity.glosses : []),
    ...(Array.isArray(identity?.shortDefinitions) ? identity.shortDefinitions : []),
  ];
  const phrases = [];
  for (const value of values) {
    const text = cleanString(value);
    if (!text) continue;
    for (const part of text.split(/[;|/]+/u)) {
      const normalized = normalizeMeaningPhrase(part);
      if (normalized) phrases.push(normalized);
    }
  }
  return sortedUniqueStrings(phrases);
}

function aggregateReaderRenderings(values) {
  const groups = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const rendering = compactRendering(value);
    if (!rendering) continue;
    const normalized = normalizeMeaningPhrase(rendering.normalized || rendering.text);
    if (!normalized) continue;
    const current = groups.get(normalized) || {
      normalized,
      count: 0,
      texts: new Map(),
      translations: new Set(),
    };
    current.count += nonNegativeInteger(rendering.count);
    current.texts.set(
      rendering.text,
      (current.texts.get(rendering.text) || 0) + nonNegativeInteger(rendering.count)
    );
    if (rendering.translation) current.translations.add(rendering.translation);
    groups.set(normalized, current);
  }

  return [...groups.values()]
    .map((group) => {
      const text = [...group.texts.entries()].sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
      )[0]?.[0] || group.normalized;
      return {
        translation:
          group.translations.size === 1
            ? [...group.translations][0]
            : group.translations.size > 1
              ? "multiple"
              : "unknown",
        text,
        normalized: group.normalized,
        count: group.count,
      };
    })
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.normalized.localeCompare(right.normalized) ||
        left.text.localeCompare(right.text)
    );
}

const HIGH_RISK_SECONDARY_ALIGNMENT_TERMS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "been",
  "being",
  "by",
  "for",
  "from",
  "he",
  "her",
  "him",
  "his",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "she",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "those",
  "to",
  "was",
  "were",
  "which",
  "who",
  "with",
]);

function selectReaderRenderingEvidence(identity, values) {
  const renderings = aggregateReaderRenderings(values);
  const lexicalPhrases = lexicalMeaningPhrases(identity);
  const lexicalSet = new Set(lexicalPhrases);
  const explicitLexicalMeaningAvailable = lexicalPhrases.length > 0;
  const supported = [];

  if (explicitLexicalMeaningAvailable) {
    for (const rendering of renderings) {
      if (lexicalSet.has(rendering.normalized)) supported.push(rendering);
    }
  } else if (renderings.length > 0) {
    // With no lexical gloss or definition, the most frequent aggregate rendering
    // is the only automatically trusted fallback. A second term is admitted only
    // when it is nearly as frequent and is not a common English helper token.
    // This prevents split-alignment artifacts such as “that” from being promoted
    // into lexical meanings while still allowing genuine tied alternatives.
    const primary = renderings[0];
    supported.push(primary);
    const secondaryMinimum = Math.max(2, Math.ceil(primary.count * 0.85));
    for (const rendering of renderings.slice(1)) {
      if (supported.length >= 2) break;
      if (rendering.count < secondaryMinimum) continue;
      if (HIGH_RISK_SECONDARY_ALIGNMENT_TERMS.has(rendering.normalized)) continue;
      supported.push(rendering);
    }
  }

  const supportedNormalized = new Set(
    supported.map((item) => item.normalized).filter(Boolean)
  );
  const excludedQuotedTerms = sortedUniqueStrings(
    renderings
      .filter((item) => !supportedNormalized.has(item.normalized))
      .flatMap((item) => [item.text, item.normalized])
  );

  return {
    explicitLexicalMeaningAvailable,
    lexicalPhrases,
    supported: supported.slice(0, explicitLexicalMeaningAvailable ? 4 : 2),
    excludedQuotedTerms,
    rawRenderingCount: renderings.length,
  };
}
function buildGenerationViewCore(packet) {
  const identity = isRecord(packet.identity) ? packet.identity : {};
  const renderings = isRecord(packet.renderings) ? packet.renderings : {};
  const occurrences = isRecord(packet.occurrences) ? packet.occurrences : {};
  const knowledge = isRecord(packet.seeKnowledge) ? packet.seeKnowledge : {};
  const health = isRecord(packet.health) ? packet.health : {};

  const representativeReferences = Array.isArray(occurrences.representativeReferences)
    ? occurrences.representativeReferences
    : [];
  const relationships = Array.isArray(knowledge?.relationships?.excerpts)
    ? knowledge.relationships.excerpts
    : [];
  const events = Array.isArray(knowledge?.events?.excerpts)
    ? knowledge.events.excerpts
    : [];
  const themes = Array.isArray(knowledge?.themes?.excerpts)
    ? knowledge.themes.excerpts
    : [];

  const sourceForms = truncateArray(
    identity?.sourceForms?.forms,
    SOURCE_FORM_LIMIT
  )
    .map(compactSourceForm)
    .filter(Boolean);

  const readerRenderingEvidence = selectReaderRenderingEvidence(
    identity,
    truncateArray(renderings.mostCommon, RENDERING_LIMIT)
  );
  const primarySourceForm = cleanString(sourceForms[0]?.surface);

  return canonicalize({
    generation_view_version: GENERATION_VIEW_VERSION,
    entity_id: packet.entityId,
    corpus: packet.corpus,
    packet_availability: cleanString(packet?.availability?.level),
    identity: {
      evidence_id: `p03:${packet.entityId}:identity`,
      lexical_id: cleanString(identity.lexicalId),
      strong: cleanString(identity.strong),
      lemma: cleanString(identity.lemma),
      normalized_lemma: cleanString(identity.normalizedLemma),
      transliteration: cleanString(identity.transliteration),
      pronunciation: cleanString(identity.pronunciation),
      glosses: sortedUniqueStrings(identity.glosses).slice(0, 16),
      short_definitions: sortedUniqueStrings(identity.shortDefinitions).slice(0, 12),
      parts_of_speech: sortedUniqueStrings(identity.partsOfSpeech).slice(0, 8),
      // Detailed morphology is intentionally withheld from the reader-generation view.
      // Part of speech is sufficient unless runtime verse context later requires more.
      morphology_english: undefined,
      primary_source_form: primarySourceForm,
    },
    rendering_evidence: {
      evidence_id: `p03:${packet.entityId}:renderings`,
      available: Boolean(renderings.available),
      role: readerRenderingEvidence.explicitLexicalMeaningAvailable
        ? "translation support only; use glosses and definitions for meaning"
        : "fallback meaning support; use only dominant_fallback_candidates",
      explicit_lexical_meaning_available:
        readerRenderingEvidence.explicitLexicalMeaningAvailable,
      total_aligned_renderings: nonNegativeInteger(
        renderings.totalAlignedRenderings
      ),
      supported_translation_terms:
        readerRenderingEvidence.explicitLexicalMeaningAvailable
          ? readerRenderingEvidence.supported
          : [],
      dominant_fallback_candidates:
        readerRenderingEvidence.explicitLexicalMeaningAvailable
          ? []
          : readerRenderingEvidence.supported,
    },
    occurrence_evidence: {
      evidence_id: `p03:${packet.entityId}:occurrences`,
      chronology_evidence_id: `p03:${packet.entityId}:chronology`,
      available: Boolean(occurrences.available),
      total_entity_occurrences: nonNegativeInteger(
        occurrences.totalEntityOccurrences
      ),
      corpus_occurrence_count: nonNegativeInteger(
        occurrences.corpusOccurrenceCount
      ),
      unique_verse_count: nonNegativeInteger(occurrences.uniqueVerseCount),
      first_occurrence: cleanString(occurrences?.chronology?.firstOccurrence),
      last_occurrence: cleanString(occurrences?.chronology?.lastOccurrence),
      top_book_distribution: topBookDistribution(
        occurrences.bookDistribution
      ),
      testament_corpus_distribution: isRecord(
        occurrences.testamentCorpusDistribution
      )
        ? canonicalize(occurrences.testamentCorpusDistribution)
        : {},
      representative_references: truncateArray(
        representativeReferences,
        REPRESENTATIVE_REFERENCE_LIMIT
      ).map(compactReference),
      verse_text_available: false,
      surrounding_context_available: false,
    },
    see_evidence: {
      availability_evidence_id: `p03:${packet.entityId}:see-availability`,
      available: Boolean(knowledge.available),
      availability_flags: isRecord(knowledge.availabilityFlags)
        ? canonicalize(knowledge.availabilityFlags)
        : {},
      reference_counts: isRecord(knowledge.referenceCounts)
        ? canonicalize(knowledge.referenceCounts)
        : {},
      roles_played: isRecord(knowledge.rolesPlayed)
        ? canonicalize(knowledge.rolesPlayed)
        : {},
      relationship_excerpts: truncateArray(
        relationships,
        SEE_EXCERPT_LIMIT
      ).map((excerpt, index) => compactRelationship(packet.entityId, excerpt, index)),
      event_excerpts: truncateArray(events, SEE_EXCERPT_LIMIT).map(
        (excerpt, index) => compactEvent(packet.entityId, excerpt, index)
      ),
      theme_excerpts: truncateArray(themes, SEE_EXCERPT_LIMIT).map(
        (excerpt, index) => compactTheme(packet.entityId, excerpt, index)
      ),
    },
    health: {
      evidence_id: `p03:${packet.entityId}:health`,
      status: cleanString(health.status),
      alignment_coverage:
        Number.isFinite(Number(health.alignmentCoverage))
          ? Number(health.alignmentCoverage)
          : null,
      has_lexical_id: Boolean(health.hasLexicalId),
      has_lemma: Boolean(health.hasLemma),
      has_gloss: Boolean(health.hasGloss),
      has_english_renderings: Boolean(health.hasEnglishRenderings),
      has_references: Boolean(health.hasReferences),
    },
  });
}

function collectGenerationEvidenceIds(value, target = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectGenerationEvidenceIds(item, target);
    return target;
  }
  if (!isRecord(value)) return target;

  for (const [key, child] of Object.entries(value)) {
    if (
      typeof child === "string" &&
      (key === "evidence_id" || key.endsWith("_evidence_id"))
    ) {
      target.add(child);
      continue;
    }
    collectGenerationEvidenceIds(child, target);
  }
  return target;
}

function compactCitationForPrompt(citation) {
  return {
    evidence_id: citation.evidenceId,
    kind: citation.kind,
    label: citation.label,
    reference: citation.reference || null,
    canonical_id: citation.canonicalId || null,
  };
}

function estimateTokensFromBytes(bytes) {
  return Math.ceil(nonNegativeInteger(bytes) / TOKEN_ESTIMATE_BYTES_PER_TOKEN);
}

function buildGenerationBundle(packet, options = {}) {
  const catalog = buildEvidenceCatalog(packet);
  const identity = isRecord(packet.identity) ? packet.identity : {};
  const renderings = isRecord(packet.renderings) ? packet.renderings : {};
  const readerRenderingEvidence = selectReaderRenderingEvidence(
    identity,
    truncateArray(renderings.mostCommon, RENDERING_LIMIT)
  );
  const core = buildGenerationViewCore(packet);
  const allowedEvidenceIds = [...collectGenerationEvidenceIds(core)].sort(
    (left, right) => left.localeCompare(right)
  );

  const missingEvidenceIds = allowedEvidenceIds.filter(
    (evidenceId) => !catalog[evidenceId]
  );
  if (missingEvidenceIds.length > 0) {
    fail(
      `Compact generation view for ${packet.entityId} contains unresolved evidence IDs: ${missingEvidenceIds.join(", ")}`
    );
  }

  const view = canonicalize({
    ...core,
    allowed_evidence: allowedEvidenceIds.map((evidenceId) =>
      compactCitationForPrompt(catalog[evidenceId])
    ),
  });
  const viewText = stableStringify(view);
  const generationViewBytes = Buffer.byteLength(viewText, "utf8");
  const maxEntityInputBytes = positiveInteger(
    options.maxEntityInputBytes,
    DEFAULT_MAX_ENTITY_INPUT_BYTES
  );

  const metrics = canonicalize({
    generationViewVersion: GENERATION_VIEW_VERSION,
    generationViewChecksum: sha256Text(viewText),
    generationViewBytes,
    estimatedInputTokens: estimateTokensFromBytes(generationViewBytes),
    allowedEvidenceCount: allowedEvidenceIds.length,
    representativeReferenceCount:
      view?.occurrence_evidence?.representative_references?.length || 0,
    relationshipExcerptCount:
      view?.see_evidence?.relationship_excerpts?.length || 0,
    eventExcerptCount: view?.see_evidence?.event_excerpts?.length || 0,
    themeExcerptCount: view?.see_evidence?.theme_excerpts?.length || 0,
  });

  if (
    options.enforceLimit !== false &&
    generationViewBytes > maxEntityInputBytes
  ) {
    fail(
      `Compact generation view for ${packet.entityId} is ${generationViewBytes} bytes, exceeding the configured ${maxEntityInputBytes}-byte entity limit. Tighten the evidence view before generating.`
    );
  }

  return {
    catalog,
    allowedEvidenceIds,
    view,
    viewText,
    metrics,
    quality: {
      excludedQuotedRenderingTerms:
        readerRenderingEvidence.excludedQuotedTerms,
      explicitLexicalMeaningAvailable:
        readerRenderingEvidence.explicitLexicalMeaningAvailable,
      verseTextAvailable: false,
      surroundingContextAvailable: false,
      corpus: packet.corpus,
    },
  };
}

function containsBannedPhrase(text, phrases) {
  const normalized = String(text || "").toLocaleLowerCase("en-US");
  return phrases.find((phrase) => normalized.includes(phrase)) || null;
}

function firstSentence(text) {
  const cleaned = cleanString(text) || "";
  const match = /^(.+?[.!?])(?:\s|$)/u.exec(cleaned);
  return cleanString(match ? match[1] : cleaned) || "";
}

function quotedMeaningPhrases(text) {
  const phrases = [];
  const pattern = /[“"]([^”"]{1,80})[”"]/gu;
  for (const match of String(text || "").matchAll(pattern)) {
    const normalized = normalizeMeaningPhrase(match[1]);
    if (normalized) phrases.push(normalized);
  }
  return sortedUniqueStrings(phrases);
}

function readerQualityFailure(text, entityId, quality = {}) {
  const opening = firstSentence(text);
  const openingLower = opening.toLocaleLowerCase("en-US");
  if (!opening) return "missing-first-sentence";
  if (/\b(?:H|G|L)\d{1,8}\b/u.test(opening)) return "technical-id-in-opening";
  if (/\b(?:occurs?|times?|verses?|corpus|evidence|metadata|record|packet)\b/iu.test(opening)) {
    return "report-style-opening";
  }
  if (!/\b(?:means?|refers?|describes?|expresses?|functions?|marks?|indicates?|makes?|is\s+(?:a|an|the)\s+[^.!?]{0,60}\b(?:word|term|particle|name|verb|noun|adjective|adverb|pronoun|preposition|conjunction))\b/iu.test(openingLower)) {
    return "opening-does-not-explain-meaning";
  }

  const excluded = new Set(
    sortedUniqueStrings(quality.excludedQuotedRenderingTerms)
      .map(normalizeMeaningPhrase)
      .filter(Boolean)
  );
  for (const phrase of quotedMeaningPhrases(text)) {
    if (excluded.has(phrase)) return `quoted-alignment-artifact:${phrase}`;
  }

  if (/\b(?:english translations?|translations?)\s+(?:may\s+)?(?:also\s+)?render[^.!?]{0,120}[“"]/iu.test(text)) {
    return "rendering-list-instead-of-explanation";
  }
  if (/\b(?:its|the)\s+(?:recorded|source)\s+forms?\b/iu.test(text)) {
    return "source-form-list-in-reader-copy";
  }
  if (/\b(?:supplied|available|recorded)\s+(?:gloss(?:es)?|definition(?:s)?|evidence|data)\b/iu.test(text)) {
    return "evidence-mechanics-language";
  }
  if (/\b(?:grammatical|morphological)\s+(?:form|details?|information)\b/iu.test(text)) {
    return "unhelpful-morphology-language";
  }
  if (/\b(?:feminine|masculine|neuter)\s+(?:singular|plural)|(?:singular|plural)\s+(?:and\s+)?(?:feminine|masculine|neuter)\b/iu.test(text)) {
    return "unhelpful-gender-number-detail";
  }
  if (/\bthis explanation\b/iu.test(text)) {
    return "procedural-disclaimer";
  }

  if (!quality.verseTextAvailable) {
    if (/\b(?:in|throughout)\s+scripture\b[^.!?]{0,60}\b(?:occurs?|appears?|found|used)\b/iu.test(text)) {
      return "corpus-count-overreach";
    }
    if (/\b(?:[1-3]\s*)?[A-Z][A-Za-z]+(?:\s+of\s+[A-Z][A-Za-z]+)?\s+\d+:\d+(?:[-–]\d+)?\s*,?\s+(?:where|which|as)\b/u.test(text)) {
      return "reference-context-inference";
    }
    if (/\b(?:the|this|that)\s+(?:verse|passage)\s+(?:teaches|shows|emphasizes|requires|calls\s+for|connects|presents|depicts|describes)\b/iu.test(text)) {
      return "verse-context-inference";
    }
    if (/\b(?:where|which)\s+(?:it|the\s+word|its\s+meaning)\s+(?:refers|describes|points|connects|shows|emphasizes|requires)\b/iu.test(text)) {
      return "reference-context-inference";
    }
    if (/\b(?:requiring|calling\s+for)\s+(?:perseverance|steadfastness|faithfulness|endurance|obedience|courage)\b/iu.test(text)) {
      return "unsupported-contextual-virtue";
    }
  }
  if (/\b(?:should\s+not\s+be\s+expanded|unrelated\s+spiritual\s+idea|beyond\s+the\s+basic\s+sense)\b/iu.test(text)) {
    return "defensive-theological-disclaimer";
  }
  return null;
}

function normalizeReaderExplanation(
  raw,
  requestedEntityId,
  catalog,
  allowedEvidenceIds,
  quality = {}
) {
  if (!isRecord(raw)) fail(`Missing explanation for ${requestedEntityId}.`);
  const entityId = cleanString(raw.entity_id);
  if (entityId !== requestedEntityId) {
    fail(`Generated entity ID mismatch: expected ${requestedEntityId}, received ${entityId}.`);
  }

  const headline = cleanString(raw.headline);
  if (!headline) fail(`Generated headline is empty for ${entityId}.`);
  if (headline.length > 160) fail(`Generated headline is too long for ${entityId}.`);
  const bannedHeadline = containsBannedPhrase(headline, BANNED_HEADLINE_PHRASES);
  if (bannedHeadline) {
    fail(`Generated headline for ${entityId} uses prohibited report language: ${bannedHeadline}`);
  }

  const explanation = raw.explanation;
  if (!isRecord(explanation)) {
    fail(`Generated reader explanation is missing for ${entityId}.`);
  }
  const text = cleanString(explanation.text);
  if (!text) fail(`Generated reader explanation text is empty for ${entityId}.`);
  if (text.length > MAX_EXPLANATION_CHARS) {
    fail(
      `Generated reader explanation for ${entityId} exceeds ${MAX_EXPLANATION_CHARS} characters.`
    );
  }
  const bannedPhrase = containsBannedPhrase(text, BANNED_READER_PHRASES);
  if (bannedPhrase) {
    fail(`Generated explanation for ${entityId} uses prohibited report language: ${bannedPhrase}`);
  }
  const qualityFailure = readerQualityFailure(text, entityId, quality);
  if (qualityFailure) {
    fail(`Generated explanation for ${entityId} failed reader-quality validation: ${qualityFailure}`);
  }

  const evidenceIds = sortedUniqueStrings(explanation.evidence_ids);
  if (evidenceIds.length === 0) {
    fail(`Generated reader explanation for ${entityId} has no evidence IDs.`);
  }

  const allowed = new Set(sortedUniqueStrings(allowedEvidenceIds));
  const invalidEvidenceIds = evidenceIds.filter((id) => !catalog[id]);
  const untransmittedEvidenceIds = evidenceIds.filter(
    (id) => catalog[id] && !allowed.has(id)
  );
  if (invalidEvidenceIds.length > 0) {
    fail(
      `Generated explanation for ${entityId} cites invalid evidence IDs: ${invalidEvidenceIds.join(", ")}`
    );
  }
  if (untransmittedEvidenceIds.length > 0) {
    fail(
      `Generated explanation for ${entityId} cites evidence IDs that were not transmitted in the compact view: ${untransmittedEvidenceIds.join(", ")}`
    );
  }

  const wordCount = countWords(text);
  if (wordCount < MIN_TOTAL_WORDS || wordCount > MAX_TOTAL_WORDS) {
    fail(
      `Generated explanation for ${entityId} has ${wordCount} body words; required range is ${MIN_TOTAL_WORDS}-${MAX_TOTAL_WORDS}.`
    );
  }

  const citations = evidenceIds.map((evidenceId) => catalog[evidenceId]);
  return {
    headline,
    text,
    evidenceIds,
    citations,
    wordCount,
  };
}

function normalizeGeneratedExplanation(
  raw,
  requestedEntityId,
  catalog,
  allowedEvidenceIds,
  quality = {}
) {
  return normalizeReaderExplanation(
    raw,
    requestedEntityId,
    catalog,
    allowedEvidenceIds,
    quality
  );
}

function buildRecord({
  packet,
  prompt,
  model,
  normalizedExplanation,
  inputAudit,
  apiUsageAudit,
}) {
  const signature = generationSignature({
    entityId: packet.entityId,
    packetChecksum: packet.checksum,
    prompt,
    model,
  });

  const core = {
    explanationSchemaVersion: EXPLANATION_SCHEMA_VERSION,
    entityId: packet.entityId,
    corpus: packet.corpus,
    packetAvailability: cleanString(packet?.availability?.level),
    packetChecksum: packet.checksum,
    prompt: {
      id: prompt.id,
      version: prompt.version,
      checksum: prompt.checksum,
    },
    generation: {
      signature,
      provider: "openai",
      model,
      generatedOffline: true,
      liveRuntimeAiRequired: false,
      writeOnceUntilSignatureChanges: true,
      inputAudit: canonicalize(inputAudit),
      apiUsage: canonicalize(apiUsageAudit),
    },
    explanation: {
      headline: normalizedExplanation.headline,
      text: normalizedExplanation.text,
    },
    evidenceIds: normalizedExplanation.evidenceIds,
    citations: normalizedExplanation.citations,
    statistics: {
      wordCount: normalizedExplanation.wordCount,
      citationCount: normalizedExplanation.citations.length,
    },
  };

  return {
    ...core,
    checksum: sha256Text(stableStringify(core)),
  };
}

function validateRecord(record, packet, prompt, model) {
  if (!isRecord(record)) return { valid: false, reason: "not-an-object" };
  if (record.entityId !== packet.entityId) {
    return { valid: false, reason: "entity-id-mismatch" };
  }
  if (record.corpus !== packet.corpus) {
    return { valid: false, reason: "corpus-mismatch" };
  }
  if (record.packetChecksum !== packet.checksum) {
    return { valid: false, reason: "packet-checksum-changed" };
  }
  if (
    record?.prompt?.id !== prompt.id ||
    record?.prompt?.version !== prompt.version ||
    record?.prompt?.checksum !== prompt.checksum
  ) {
    return { valid: false, reason: "prompt-changed" };
  }
  if (record?.generation?.model !== model) {
    return { valid: false, reason: "model-changed" };
  }
  if (record.explanationSchemaVersion !== EXPLANATION_SCHEMA_VERSION) {
    return { valid: false, reason: "explanation-schema-changed" };
  }

  const expectedSignature = generationSignature({
    entityId: packet.entityId,
    packetChecksum: packet.checksum,
    prompt,
    model,
  });
  if (record?.generation?.signature !== expectedSignature) {
    return { valid: false, reason: "generation-signature-mismatch" };
  }

  const core = { ...record };
  const expectedChecksum = cleanString(core.checksum);
  delete core.checksum;
  const actualChecksum = sha256Text(stableStringify(core));
  if (!expectedChecksum || expectedChecksum !== actualChecksum) {
    return { valid: false, reason: "record-checksum-mismatch" };
  }

  let bundle;
  try {
    bundle = buildGenerationBundle(packet, { enforceLimit: false });
  } catch {
    return { valid: false, reason: "generation-view-invalid" };
  }

  if (
    stableStringify(record?.generation?.inputAudit) !==
    stableStringify(bundle.metrics)
  ) {
    return { valid: false, reason: "input-audit-mismatch" };
  }
  if (bundle.metrics.generationViewBytes > DEFAULT_MAX_ENTITY_INPUT_BYTES) {
    return { valid: false, reason: "generation-view-over-default-limit" };
  }
  if (!isRecord(record?.generation?.apiUsage)) {
    return { valid: false, reason: "api-usage-audit-missing" };
  }

  const catalog = bundle.catalog;
  const allowed = new Set(bundle.allowedEvidenceIds);
  const explanationText = cleanString(record?.explanation?.text);
  if (!explanationText) {
    return { valid: false, reason: "empty-reader-explanation" };
  }
  if (containsBannedPhrase(explanationText, BANNED_READER_PHRASES)) {
    return { valid: false, reason: "prohibited-report-language" };
  }
  const qualityFailure = readerQualityFailure(
    explanationText,
    packet.entityId,
    bundle.quality
  );
  if (qualityFailure) {
    return { valid: false, reason: `reader-quality:${qualityFailure}` };
  }
  if (containsBannedPhrase(record?.explanation?.headline, BANNED_HEADLINE_PHRASES)) {
    return { valid: false, reason: "prohibited-headline-language" };
  }
  if (explanationText.length > MAX_EXPLANATION_CHARS) {
    return { valid: false, reason: "reader-explanation-too-long" };
  }

  const recordEvidenceIds = sortedUniqueStrings(record.evidenceIds);
  if (recordEvidenceIds.length === 0) {
    return { valid: false, reason: "uncited-reader-explanation" };
  }
  if (recordEvidenceIds.some((id) => !catalog[id])) {
    return { valid: false, reason: "invalid-record-citation" };
  }
  if (recordEvidenceIds.some((id) => !allowed.has(id))) {
    return { valid: false, reason: "untransmitted-record-citation" };
  }
  if (!Array.isArray(record.citations)) {
    return { valid: false, reason: "citations-missing" };
  }
  if (
    stableStringify(record.citations) !==
    stableStringify(recordEvidenceIds.map((id) => catalog[id]))
  ) {
    return { valid: false, reason: "citation-metadata-mismatch" };
  }

  const storedWordCount = nonNegativeInteger(record?.statistics?.wordCount, -1);
  const actualWordCount = countWords(explanationText);
  if (
    storedWordCount !== actualWordCount ||
    actualWordCount < MIN_TOTAL_WORDS ||
    actualWordCount > MAX_TOTAL_WORDS
  ) {
    return { valid: false, reason: "word-count-out-of-range" };
  }

  return { valid: true, reason: null };
}

function extractPreviousRecords() {
  const finalArtifact = readJsonIfExists(EXPLANATIONS_PATH);
  const state = readJsonIfExists(STATE_PATH);
  const records = {};

  if (isRecord(finalArtifact?.explanations)) {
    Object.assign(records, finalArtifact.explanations);
  }
  if (isRecord(state?.records)) {
    Object.assign(records, state.records);
  }

  return {
    records,
    failures: isRecord(state?.failures) ? state.failures : {},
    finalArtifact,
    state,
  };
}

function buildPlan({ packets, prompt, model, previousRecords, retryFailed, previousFailures }) {
  const entityIds = Object.keys(packets).sort((left, right) =>
    left.localeCompare(right)
  );
  const reusable = {};
  const pending = [];
  const reasons = {};

  for (const entityId of entityIds) {
    const packet = packets[entityId];
    const record = previousRecords[entityId];
    const validation = validateRecord(record, packet, prompt, model);

    if (validation.valid) {
      reusable[entityId] = record;
      reasons.reused = (reasons.reused || 0) + 1;
      continue;
    }

    if (!retryFailed && previousFailures[entityId]?.terminal === true) {
      reasons["terminal-failure-held"] =
        (reasons["terminal-failure-held"] || 0) + 1;
    }

    pending.push(entityId);
    const reason = validation.reason || "missing";
    reasons[reason] = (reasons[reason] || 0) + 1;
  }

  return {
    entityIds,
    reusable,
    pending,
    reasons: sortRecord(reasons),
  };
}

function selectWork(plan, options, packets) {
  const requested = new Set(options.entityIds);
  for (const entityId of requested) {
    if (!packets[entityId]) fail(`Unknown P03 entity ID: ${entityId}`);
  }

  const pendingCandidates =
    requested.size > 0
      ? plan.pending.filter((entityId) => requested.has(entityId))
      : [...plan.pending];
  const forceCandidates = options.force
    ? requested.size > 0
      ? [...requested]
      : [...plan.entityIds]
    : [];

  let selected = sortedUniqueStrings([
    ...pendingCandidates,
    ...forceCandidates,
  ]);
  if (options.limit) selected = selected.slice(0, options.limit);

  const reusable = { ...plan.reusable };
  for (const entityId of selected) delete reusable[entityId];

  return {
    selected,
    reusable: sortRecord(reusable),
    forcedSelected: selected.filter((entityId) => forceCandidates.includes(entityId)),
  };
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseRetryAfter(response) {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function responseOutputText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  const pieces = [];
  const output = Array.isArray(response?.output) ? response.output : [];
  for (const item of output) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        pieces.push(content.text);
      }
      if (content?.type === "refusal" && typeof content.refusal === "string") {
        fail(`Model refusal: ${content.refusal}`);
      }
    }
  }
  return pieces.join("\n");
}

function apiHeaders() {
  const apiKey = cleanString(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    fail(
      "OPENAI_API_KEY is required to generate changed P04 explanations. Run --plan without a key to inspect pending work."
    );
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const organization = cleanString(process.env.OPENAI_ORG_ID);
  const project = cleanString(process.env.OPENAI_PROJECT_ID);
  if (organization) headers["OpenAI-Organization"] = organization;
  if (project) headers["OpenAI-Project"] = project;
  return headers;
}

function buildApiRequest(batch, packets, prompt, options) {
  const bundles = {};
  const entities = batch.map((entityId) => {
    const packet = packets[entityId];
    const bundle = buildGenerationBundle(packet, {
      maxEntityInputBytes: options.maxEntityInputBytes,
      enforceLimit: true,
    });
    bundles[entityId] = bundle;
    return bundle.view;
  });

  const input = stableStringify({
    task: "Generate one reader-first cached EMET explanation for every supplied source word.",
    expected_entity_ids: batch,
    entities,
  });

  const request = {
    model: options.model,
    store: false,
    reasoning: {
      effort: cleanString(process.env.EMET_P04_REASONING_EFFORT) || "low",
    },
    max_output_tokens: Math.max(700, 420 * batch.length),
    instructions: SYSTEM_PROMPT,
    input,
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "emet_cached_entity_explanations",
        description:
          "Plain-language reader-first EMET explanations with validated P03 evidence IDs.",
        strict: true,
        schema: OUTPUT_SCHEMA,
      },
    },
  };

  const requestBodyText = JSON.stringify(request);
  const requestBodyBytes = Buffer.byteLength(requestBodyText, "utf8");
  const inputPayloadBytes = Buffer.byteLength(input, "utf8");
  const maxBatchInputBytes = positiveInteger(
    options.maxBatchInputBytes,
    DEFAULT_MAX_BATCH_INPUT_BYTES
  );

  if (requestBodyBytes > maxBatchInputBytes) {
    fail(
      `P04 batch request for ${batch.join(", ")} is ${requestBodyBytes} bytes, exceeding the configured ${maxBatchInputBytes}-byte batch limit. Reduce --batch-size or tighten the compact generation view.`
    );
  }

  return {
    request,
    bundles,
    metrics: canonicalize({
      entityCount: batch.length,
      inputPayloadBytes,
      requestBodyBytes,
      estimatedRequestTokens: estimateTokensFromBytes(requestBodyBytes),
      maxBatchInputBytes,
    }),
  };
}

function allocateIntegerByWeight(total, weightedItems) {
  const safeTotal = nonNegativeInteger(total);
  const items = weightedItems.map((item) => ({
    entityId: item.entityId,
    weight: Math.max(0, Number(item.weight) || 0),
  }));
  const result = Object.fromEntries(items.map((item) => [item.entityId, 0]));
  if (safeTotal === 0 || items.length === 0) return result;

  let weightTotal = items.reduce((sum, item) => sum + item.weight, 0);
  if (weightTotal <= 0) {
    for (const item of items) item.weight = 1;
    weightTotal = items.length;
  }

  const allocations = items.map((item) => {
    const exact = (safeTotal * item.weight) / weightTotal;
    const floor = Math.floor(exact);
    return {
      entityId: item.entityId,
      value: floor,
      fraction: exact - floor,
    };
  });

  let remaining =
    safeTotal - allocations.reduce((sum, allocation) => sum + allocation.value, 0);
  allocations.sort(
    (left, right) =>
      right.fraction - left.fraction ||
      left.entityId.localeCompare(right.entityId)
  );
  for (let index = 0; remaining > 0; index = (index + 1) % allocations.length) {
    allocations[index].value += 1;
    remaining -= 1;
  }

  for (const allocation of allocations) {
    result[allocation.entityId] = allocation.value;
  }
  return result;
}

function processApiResponse({
  batch,
  packets,
  prompt,
  options,
  prepared,
  body,
  transportAudit = null,
}) {
  if (body?.status === "incomplete") {
    fail(
      `OpenAI response incomplete: ${cleanString(body?.incomplete_details?.reason) || "unknown reason"}`
    );
  }

  const outputText = responseOutputText(body);
  if (!cleanString(outputText)) fail("OpenAI response contained no output text.");

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    fail(`Structured output was not valid JSON: ${error.message}`);
  }

  if (!Array.isArray(parsed?.explanations)) {
    fail("Structured output does not contain an explanations array.");
  }

  const byEntityId = {};
  for (const raw of parsed.explanations) {
    const entityId = cleanString(raw?.entity_id);
    if (!entityId) fail("Generated explanation has no entity_id.");
    if (byEntityId[entityId]) {
      fail(`Generated duplicate explanation for ${entityId}.`);
    }
    byEntityId[entityId] = raw;
  }

  const requested = new Set(batch);
  const extras = Object.keys(byEntityId).filter((id) => !requested.has(id));
  const missing = batch.filter((id) => !byEntityId[id]);
  if (extras.length || missing.length) {
    fail(
      `Generated batch entity mismatch. Missing: ${missing.join(", ") || "none"}; extra: ${extras.join(", ") || "none"}.`
    );
  }

  const normalizedByEntityId = {};
  for (const entityId of batch) {
    const bundle = prepared.bundles[entityId];
    normalizedByEntityId[entityId] = normalizeGeneratedExplanation(
      byEntityId[entityId],
      entityId,
      bundle.catalog,
      bundle.allowedEvidenceIds,
      bundle.quality
    );
  }

  const reportedInputTokens = nonNegativeInteger(body?.usage?.input_tokens);
  const reportedOutputTokens = nonNegativeInteger(body?.usage?.output_tokens);
  const inputAllocations = allocateIntegerByWeight(
    reportedInputTokens,
    batch.map((entityId) => ({
      entityId,
      weight: prepared.bundles[entityId].metrics.generationViewBytes,
    }))
  );
  const outputAllocations = allocateIntegerByWeight(
    reportedOutputTokens,
    batch.map((entityId) => ({
      entityId,
      weight: Buffer.byteLength(
        stableStringify(byEntityId[entityId]),
        "utf8"
      ),
    }))
  );

  const records = {};
  for (const entityId of batch) {
    const packet = packets[entityId];
    const bundle = prepared.bundles[entityId];
    const exactSingleEntity = batch.length === 1;
    records[entityId] = buildRecord({
      packet,
      prompt,
      model: options.model,
      normalizedExplanation: normalizedByEntityId[entityId],
      inputAudit: bundle.metrics,
      apiUsageAudit: {
        allocationMethod: exactSingleEntity
          ? "exact-single-entity-batch"
          : "deterministic-byte-weighted-allocation",
        allocationIsExact: exactSingleEntity,
        batchEntityCount: batch.length,
        batchReportedInputTokens: reportedInputTokens,
        batchReportedOutputTokens: reportedOutputTokens,
        reportedInputTokensAllocated: inputAllocations[entityId],
        reportedOutputTokensAllocated: outputAllocations[entityId],
        batchRequestBodyBytes: prepared.metrics.requestBodyBytes,
        batchEstimatedRequestTokens: prepared.metrics.estimatedRequestTokens,
        ...(isRecord(transportAudit) ? canonicalize(transportAudit) : {}),
      },
    });
  }

  return {
    records,
    usage: isRecord(body?.usage) ? canonicalize(body.usage) : null,
    requestAudit: prepared.metrics,
  };
}

async function callOpenAI(batch, packets, prompt, options) {
  const prepared = buildApiRequest(batch, packets, prompt, options);
  const request = prepared.request;
  let lastError = null;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${options.apiBaseUrl}/responses`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify(request),
      });

      const text = await response.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { raw: text };
      }

      if (!response.ok) {
        const message =
          cleanString(body?.error?.message) ||
          cleanString(body?.message) ||
          `HTTP ${response.status}`;
        const retryable =
          response.status === 408 ||
          response.status === 409 ||
          response.status === 429 ||
          response.status >= 500;
        if (!retryable || attempt === options.maxAttempts) {
          fail(`OpenAI request failed (${response.status}): ${message}`);
        }
        const retryAfter = parseRetryAfter(response);
        const delay = retryAfter ?? Math.min(30000, 1000 * 2 ** (attempt - 1));
        await sleep(delay);
        continue;
      }

      return processApiResponse({
        batch,
        packets,
        prompt,
        options,
        prepared,
        body,
        transportAudit: {
          transport: "synchronous-responses-api",
        },
      });
    } catch (error) {
      lastError = error;
      if (attempt === options.maxAttempts) break;
      await sleep(Math.min(30000, 1000 * 2 ** (attempt - 1)));
    }
  }

  throw lastError || new Error("OpenAI request failed without an error message.");
}

function initialState({ p03Checksum, prompt, model, records, failures }) {
  return {
    compiler: {
      id: COMPILER_ID,
      name: COMPILER_NAME,
      version: COMPILER_VERSION,
    },
    schemaVersion: SCHEMA_VERSION,
    p03ArtifactChecksum: p03Checksum,
    prompt: {
      id: prompt.id,
      version: prompt.version,
      checksum: prompt.checksum,
    },
    model,
    records: sortRecord(records),
    failures: sortRecord(failures),
  };
}

function checkpointState(state) {
  writeStableJson(STATE_PATH, state, 2);
}

async function generateSelected({ selected, packets, prompt, options, state }) {
  const batches = chunk(selected, options.batchSize);
  let nextBatchIndex = 0;
  let completedEntities = 0;
  let failedEntities = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let requestBodyBytes = 0;
  let estimatedRequestTokens = 0;
  let largestBatchRequestBytes = 0;

  async function worker(workerId) {
    while (true) {
      const batchIndex = nextBatchIndex;
      nextBatchIndex += 1;
      if (batchIndex >= batches.length) return;
      const batch = batches[batchIndex];

      try {
        const result = await callOpenAI(batch, packets, prompt, options);
        for (const [entityId, record] of Object.entries(result.records)) {
          state.records[entityId] = record;
          delete state.failures[entityId];
          completedEntities += 1;
        }
        inputTokens += nonNegativeInteger(result?.usage?.input_tokens);
        outputTokens += nonNegativeInteger(result?.usage?.output_tokens);
        requestBodyBytes += nonNegativeInteger(
          result?.requestAudit?.requestBodyBytes
        );
        estimatedRequestTokens += nonNegativeInteger(
          result?.requestAudit?.estimatedRequestTokens
        );
        largestBatchRequestBytes = Math.max(
          largestBatchRequestBytes,
          nonNegativeInteger(result?.requestAudit?.requestBodyBytes)
        );
        state.records = sortRecord(state.records);
        state.failures = sortRecord(state.failures);
        checkpointState(state);
        console.log(
          `  Worker ${workerId}: ${completedEntities + failedEntities} / ${selected.length} selected entities processed`
        );
      } catch (error) {
        for (const entityId of batch) {
          const previousAttempts = nonNegativeInteger(
            state.failures?.[entityId]?.attempts
          );
          state.failures[entityId] = {
            entityId,
            packetChecksum: packets[entityId].checksum,
            promptChecksum: prompt.checksum,
            model: options.model,
            attempts: previousAttempts + 1,
            terminal: false,
            message: String(error?.message || error).slice(0, 2000),
          };
          failedEntities += 1;
        }
        state.failures = sortRecord(state.failures);
        checkpointState(state);
        console.error(
          `  Worker ${workerId}: batch failed for ${batch.join(", ")}: ${error?.message || error}`
        );
      }
    }
  }

  const workerCount = Math.min(options.concurrency, Math.max(1, batches.length));
  await Promise.all(
    Array.from({ length: workerCount }, (_, index) => worker(index + 1))
  );

  return {
    completedEntities,
    failedEntities,
    batches: batches.length,
    inputTokens,
    outputTokens,
    requestBodyBytes,
    estimatedRequestTokens,
    largestBatchRequestBytes,
  };
}

function buildFinalArtifact({ packetsDocument, packets, p03Checksum, prompt, model, records }) {
  const entityIds = Object.keys(packets).sort((left, right) =>
    left.localeCompare(right)
  );
  const orderedRecords = {};
  for (const entityId of entityIds) orderedRecords[entityId] = records[entityId];

  const core = {
    compiler: {
      id: COMPILER_ID,
      name: COMPILER_NAME,
      version: COMPILER_VERSION,
    },
    schemaVersion: SCHEMA_VERSION,
    explanationSchemaVersion: EXPLANATION_SCHEMA_VERSION,
    purpose:
      "Write-once cached EMET entity explanations generated offline from P03 evidence packets. Ordinary word taps require no live AI.",
    source: {
      artifact: "P03 evidence-packets.json",
      artifactChecksum: p03Checksum,
      packetSchemaVersion: cleanString(packetsDocument.packetSchemaVersion),
      entityCount: entityIds.length,
    },
    prompt: {
      id: prompt.id,
      version: prompt.version,
      checksum: prompt.checksum,
    },
    generationPolicy: {
      provider: "openai",
      model,
      offlineOnly: true,
      ordinaryRuntimeLiveAi: false,
      generationViewVersion: GENERATION_VIEW_VERSION,
      fullP03CatalogSentToModel: false,
      allowedEvidenceContainsOnlyTransmittedEvidence: true,
      defaultMaxEntityInputBytes: DEFAULT_MAX_ENTITY_INPUT_BYTES,
      defaultMaxBatchInputBytes: DEFAULT_MAX_BATCH_INPUT_BYTES,
      cacheInvalidation:
        "Regenerate only when packet checksum, prompt checksum/version, explanation schema, model, compiler version, or compact generation-view contract changes.",
    },
    entityOrder: entityIds,
    explanations: orderedRecords,
  };

  return {
    ...core,
    checksum: sha256Text(stableStringify(core)),
  };
}

function chooseSamples(records, corpus, preferredIds = []) {
  const selected = [];
  const seen = new Set();
  for (const entityId of preferredIds) {
    if (records[entityId]?.corpus === corpus) {
      selected.push(sampleRecord(records[entityId]));
      seen.add(entityId);
    }
  }
  for (const entityId of Object.keys(records).sort()) {
    if (selected.length >= SAMPLE_LIMIT) break;
    if (seen.has(entityId) || records[entityId]?.corpus !== corpus) continue;
    selected.push(sampleRecord(records[entityId]));
  }
  return selected;
}

function sampleRecord(record) {
  return {
    entityId: record.entityId,
    corpus: record.corpus,
    packetAvailability: record.packetAvailability,
    packetChecksum: record.packetChecksum,
    headline: record?.explanation?.headline,
    explanation: cleanString(record?.explanation?.text),
    wordCount: record?.statistics?.wordCount,
    citationCount: record?.statistics?.citationCount,
    generationViewBytes:
      record?.generation?.inputAudit?.generationViewBytes,
    estimatedInputTokens:
      record?.generation?.inputAudit?.estimatedInputTokens,
    reportedInputTokensAllocated:
      record?.generation?.apiUsage?.reportedInputTokensAllocated,
    allowedEvidenceCount:
      record?.generation?.inputAudit?.allowedEvidenceCount,
    evidenceIds: truncateArray(record.evidenceIds, 12),
  };
}

function buildAudit({ packets, records, prompt, model, p03Checksum }) {
  const packetIds = Object.keys(packets).sort();
  const recordIds = Object.keys(records).sort();
  const missing = packetIds.filter((id) => !records[id]);
  const extra = recordIds.filter((id) => !packets[id]);
  const byCorpus = {};
  const byAvailability = {};
  const modelCounts = {};
  let invalidRecords = 0;
  let invalidCitationRecords = 0;
  let untransmittedCitationRecords = 0;
  let uncitedExplanations = 0;
  let emptyExplanations = 0;
  let packetChecksumMismatches = 0;
  let promptMismatches = 0;
  let recordChecksumMismatches = 0;
  let inputAuditMismatches = 0;
  let apiUsageAuditsMissing = 0;
  let generationViewsOverDefaultLimit = 0;
  let totalWords = 0;
  let totalCitations = 0;
  let totalGenerationViewBytes = 0;
  let totalEstimatedInputTokens = 0;
  let totalAllowedEvidenceCount = 0;
  let totalReportedInputTokensAllocated = 0;
  let totalReportedOutputTokensAllocated = 0;
  let exactUsageAllocationRecords = 0;
  let largestExplanation = null;
  let largestGenerationView = null;
  const invalidRecordSamples = [];

  for (const entityId of recordIds) {
    const record = records[entityId];
    const packet = packets[entityId];
    if (!packet) continue;

    byCorpus[record.corpus] = (byCorpus[record.corpus] || 0) + 1;
    byAvailability[record.packetAvailability] =
      (byAvailability[record.packetAvailability] || 0) + 1;
    modelCounts[record?.generation?.model || "unknown"] =
      (modelCounts[record?.generation?.model || "unknown"] || 0) + 1;

    const validation = validateRecord(record, packet, prompt, model);
    if (!validation.valid) {
      invalidRecords += 1;
      if (invalidRecordSamples.length < ERROR_SAMPLE_LIMIT) {
        invalidRecordSamples.push({ entityId, reason: validation.reason });
      }
      if (validation.reason === "packet-checksum-changed") {
        packetChecksumMismatches += 1;
      }
      if (validation.reason === "prompt-changed") promptMismatches += 1;
      if (validation.reason === "record-checksum-mismatch") {
        recordChecksumMismatches += 1;
      }
      if (validation.reason === "input-audit-mismatch") {
        inputAuditMismatches += 1;
      }
      if (
        String(validation.reason).startsWith("invalid-citation") ||
        validation.reason === "invalid-record-citation"
      ) {
        invalidCitationRecords += 1;
      }
      if (
        String(validation.reason).startsWith("untransmitted-citation") ||
        validation.reason === "untransmitted-record-citation"
      ) {
        untransmittedCitationRecords += 1;
      }
      if (validation.reason === "uncited-reader-explanation") {
        uncitedExplanations += 1;
      }
      if (validation.reason === "empty-reader-explanation") {
        emptyExplanations += 1;
      }
    }

    const words = nonNegativeInteger(record?.statistics?.wordCount);
    const citations = nonNegativeInteger(record?.statistics?.citationCount);
    const inputAudit = isRecord(record?.generation?.inputAudit)
      ? record.generation.inputAudit
      : {};
    const hasApiUsageAudit = isRecord(record?.generation?.apiUsage);
    const apiUsage = hasApiUsageAudit ? record.generation.apiUsage : {};
    if (!hasApiUsageAudit) apiUsageAuditsMissing += 1;
    const generationViewBytes = nonNegativeInteger(
      inputAudit.generationViewBytes
    );
    const estimatedInputTokens = nonNegativeInteger(
      inputAudit.estimatedInputTokens
    );
    const allowedEvidenceCount = nonNegativeInteger(
      inputAudit.allowedEvidenceCount
    );

    if (generationViewBytes > DEFAULT_MAX_ENTITY_INPUT_BYTES) {
      generationViewsOverDefaultLimit += 1;
    }

    totalWords += words;
    totalCitations += citations;
    totalGenerationViewBytes += generationViewBytes;
    totalEstimatedInputTokens += estimatedInputTokens;
    totalAllowedEvidenceCount += allowedEvidenceCount;
    totalReportedInputTokensAllocated += nonNegativeInteger(
      apiUsage.reportedInputTokensAllocated
    );
    totalReportedOutputTokensAllocated += nonNegativeInteger(
      apiUsage.reportedOutputTokensAllocated
    );
    if (apiUsage.allocationIsExact === true) exactUsageAllocationRecords += 1;

    const bytes = Buffer.byteLength(stableStringify(record), "utf8");
    if (
      !largestExplanation ||
      bytes > largestExplanation.bytes ||
      (bytes === largestExplanation.bytes &&
        entityId.localeCompare(largestExplanation.entityId) < 0)
    ) {
      largestExplanation = {
        entityId,
        corpus: record.corpus,
        bytes,
        wordCount: words,
        citationCount: citations,
      };
    }

    if (
      !largestGenerationView ||
      generationViewBytes > largestGenerationView.bytes ||
      (generationViewBytes === largestGenerationView.bytes &&
        entityId.localeCompare(largestGenerationView.entityId) < 0)
    ) {
      largestGenerationView = {
        entityId,
        corpus: record.corpus,
        bytes: generationViewBytes,
        estimatedInputTokens,
        allowedEvidenceCount,
        checksum: cleanString(inputAudit.generationViewChecksum),
      };
    }
  }

  const duplicateRecordIds = [];
  const invariants = {
    everyP03PacketHasExactlyOneExplanation:
      missing.length === 0 && recordIds.length === new Set(recordIds).size,
    everyExplanationMapsToP03Packet: extra.length === 0,
    corpusMatchesPacket:
      recordIds.every((id) => !packets[id] || records[id].corpus === packets[id].corpus),
    packetChecksumsMatch: packetChecksumMismatches === 0,
    promptMetadataMatches: promptMismatches === 0,
    recordChecksumsMatch: recordChecksumMismatches === 0,
    allReaderExplanationsPresentAndNonempty: emptyExplanations === 0,
    everyReaderExplanationHasEvidenceIds: uncitedExplanations === 0,
    allEvidenceIdsResolveInsideP03Packet: invalidCitationRecords === 0,
    allCitationsWereTransmittedToModel: untransmittedCitationRecords === 0,
    allInputAuditsMatchCurrentCompactView: inputAuditMismatches === 0,
    everyRecordHasApiUsageAudit: apiUsageAuditsMissing === 0,
    allGenerationViewsWithinDefaultLimit:
      generationViewsOverDefaultLimit === 0,
    allExplanationWordCountsWithinRange: recordIds.every((id) => {
      const words = nonNegativeInteger(records[id]?.statistics?.wordCount, -1);
      return words >= MIN_TOTAL_WORDS && words <= MAX_TOTAL_WORDS;
    }),
    allRecordsValid: invalidRecords === 0,
    noLiveAiRequiredAtRuntime:
      recordIds.every((id) => records[id]?.generation?.liveRuntimeAiRequired === false),
    stableEntityOrdering:
      stableStringify(recordIds) === stableStringify([...recordIds].sort()),
  };
  invariants.allPassed = Object.values(invariants).every(Boolean);

  return {
    compiler: {
      id: COMPILER_ID,
      name: COMPILER_NAME,
      version: COMPILER_VERSION,
    },
    schemaVersion: SCHEMA_VERSION,
    explanationSchemaVersion: EXPLANATION_SCHEMA_VERSION,
    source: {
      p03ArtifactChecksum: p03Checksum,
      p03Packets: packetIds.length,
    },
    prompt: {
      id: prompt.id,
      version: prompt.version,
      checksum: prompt.checksum,
    },
    generationModel: model,
    generationInputPolicy: {
      generationViewVersion: GENERATION_VIEW_VERSION,
      defaultMaxEntityInputBytes: DEFAULT_MAX_ENTITY_INPUT_BYTES,
      defaultMaxBatchInputBytes: DEFAULT_MAX_BATCH_INPUT_BYTES,
      tokenEstimateBytesPerToken: TOKEN_ESTIMATE_BYTES_PER_TOKEN,
      fullP03CatalogRetainedLocally: true,
      fullP03CatalogSentToModel: false,
      allowedEvidenceContainsOnlyTransmittedEvidence: true,
      minimumExplanationWords: MIN_TOTAL_WORDS,
      maximumExplanationWords: MAX_TOTAL_WORDS,
    },
    totalExplanations: recordIds.length,
    explanationsByCorpus: sortRecord(byCorpus),
    explanationsByPacketAvailability: sortRecord(byAvailability),
    generationModels: sortRecord(modelCounts),
    explanationsWithCitations: recordIds.filter(
      (id) => nonNegativeInteger(records[id]?.statistics?.citationCount) > 0
    ).length,
    totalCitationCount: totalCitations,
    averageCitationsPerExplanation:
      recordIds.length > 0 ? totalCitations / recordIds.length : 0,
    totalWordCount: totalWords,
    averageExplanationWords:
      recordIds.length > 0 ? totalWords / recordIds.length : 0,
    largestExplanation,
    generationInputAudit: {
      totalGenerationViewBytes,
      averageGenerationViewBytes:
        recordIds.length > 0
          ? totalGenerationViewBytes / recordIds.length
          : 0,
      totalEstimatedInputTokens,
      averageEstimatedInputTokens:
        recordIds.length > 0
          ? totalEstimatedInputTokens / recordIds.length
          : 0,
      totalAllowedEvidenceCount,
      averageAllowedEvidenceCount:
        recordIds.length > 0
          ? totalAllowedEvidenceCount / recordIds.length
          : 0,
      totalReportedInputTokensAllocated,
      totalReportedOutputTokensAllocated,
      exactUsageAllocationRecords,
      allocatedUsageRecords: recordIds.length - apiUsageAuditsMissing,
      largestGenerationView,
      generationViewsOverDefaultLimit,
      inputAuditMismatches,
      apiUsageAuditsMissing,
    },
    packetsMissingExplanations: missing,
    explanationsMissingPackets: extra,
    duplicateExplanationIds: duplicateRecordIds,
    invalidRecords: {
      count: invalidRecords,
      samples: invalidRecordSamples,
    },
    checksumValidation: {
      packetChecksumMismatches,
      promptMismatches,
      recordChecksumMismatches,
    },
    citationValidation: {
      invalidCitationRecords,
      untransmittedCitationRecords,
      uncitedExplanations,
      emptyExplanations,
    },
    samples: {
      hebrew: chooseSamples(records, "hebrew", [
        "word:hebrew:H802",
        "word:hebrew:H430",
      ]),
      greekNt: chooseSamples(records, "greek-nt", [
        "word:greek-nt:G1135",
        "word:greek-nt:G3056",
      ]),
      lxx: chooseSamples(records, "lxx", [
        "word:lxx:L703209",
        "word:lxx:L704639",
      ]),
    },
    deterministicCompilation: {
      canonicalKeyOrdering: true,
      stableEntityOrdering: true,
      timestampsExcludedFromFinalArtifacts: true,
      unchangedGenerationSignaturesReuseWriteOnceRecords: true,
      freshAiGenerationIsNotClaimedToBeDeterministic: true,
      sameInputsPlusSameCacheProduceByteIdenticalArtifacts: true,
    },
    invariants,
  };
}

function writeFinalOutputs({ packetsDocument, packets, p03Checksum, prompt, model, records }) {
  const previousTexts = {
    explanations: fs.existsSync(EXPLANATIONS_PATH)
      ? fs.readFileSync(EXPLANATIONS_PATH, "utf8")
      : null,
    audit: fs.existsSync(AUDIT_PATH) ? fs.readFileSync(AUDIT_PATH, "utf8") : null,
    manifest: fs.existsSync(MANIFEST_PATH)
      ? fs.readFileSync(MANIFEST_PATH, "utf8")
      : null,
  };
  const previousManifest = readJsonIfExists(MANIFEST_PATH);

  const artifact = buildFinalArtifact({
    packetsDocument,
    packets,
    p03Checksum,
    prompt,
    model,
    records,
  });
  const explanationsText = `${stableStringify(artifact)}\n`;
  atomicWriteText(EXPLANATIONS_PATH, explanationsText);
  const explanationsFileChecksum = sha256File(EXPLANATIONS_PATH);

  const auditCore = buildAudit({
    packets,
    records,
    prompt,
    model,
    p03Checksum,
  });
  const audit = {
    ...auditCore,
    checksum: sha256Text(stableStringify(auditCore)),
  };
  const auditText = writeStableJson(AUDIT_PATH, audit, 2);
  const auditFileChecksum = sha256File(AUDIT_PATH);

  if (!audit.invariants.allPassed) {
    fail(`P04 audit failed. Review ${relativePath(AUDIT_PATH)}.`);
  }

  const manifestCore = {
    compiler: {
      id: COMPILER_ID,
      name: COMPILER_NAME,
      version: COMPILER_VERSION,
    },
    schemaVersion: SCHEMA_VERSION,
    explanationSchemaVersion: EXPLANATION_SCHEMA_VERSION,
    inputSignature: sha256Text(
      stableStringify({
        p03ArtifactChecksum: p03Checksum,
        promptChecksum: prompt.checksum,
        promptVersion: prompt.version,
        model,
      })
    ),
    consumes: {
      p03EvidencePackets: fingerprintFile(INPUTS.packets),
      promptFile: fingerprintFile(INPUTS.prompt),
      p03ArtifactChecksum: p03Checksum,
    },
    prompt: {
      id: prompt.id,
      version: prompt.version,
      checksum: prompt.checksum,
    },
    generationPolicy: {
      provider: "openai",
      model,
      offlineOnly: true,
      ordinaryRuntimeLiveAi: false,
      incrementalByGenerationSignature: true,
      generationViewVersion: GENERATION_VIEW_VERSION,
      fullP03CatalogSentToModel: false,
      allowedEvidenceContainsOnlyTransmittedEvidence: true,
      defaultMaxEntityInputBytes: DEFAULT_MAX_ENTITY_INPUT_BYTES,
      defaultMaxBatchInputBytes: DEFAULT_MAX_BATCH_INPUT_BYTES,
    },
    produces: {
      cachedExplanations: {
        path: relativePath(EXPLANATIONS_PATH),
        artifactChecksum: artifact.checksum,
        fileSha256: explanationsFileChecksum,
        explanations: Object.keys(records).length,
      },
      audit: {
        path: relativePath(AUDIT_PATH),
        artifactChecksum: audit.checksum,
        fileSha256: auditFileChecksum,
      },
    },
    invariantsPassed: audit.invariants.allPassed,
  };
  const manifest = {
    ...manifestCore,
    checksum: sha256Text(stableStringify(manifestCore)),
  };
  const manifestText = writeStableJson(MANIFEST_PATH, manifest, 2);

  const shouldCompare = Boolean(
    previousManifest &&
      previousManifest.compiler?.id === COMPILER_ID &&
      previousManifest.compiler?.version === COMPILER_VERSION &&
      previousManifest.inputSignature === manifest.inputSignature &&
      previousManifest?.produces?.cachedExplanations?.artifactChecksum ===
        artifact.checksum
  );
  if (shouldCompare) {
    const matches = {
      explanations: previousTexts.explanations === explanationsText,
      audit: previousTexts.audit === auditText,
      manifest: previousTexts.manifest === manifestText,
    };
    if (!Object.values(matches).every(Boolean)) {
      console.error(JSON.stringify(matches, null, 2));
      fail(
        "P04 deterministic rebuild invariant failed: same inputs and write-once cache did not produce byte-identical outputs."
      );
    }
  }

  verifyExistingOutputs();
  return { artifact, audit, manifest };
}

function verifyExistingOutputs() {
  console.log("\n========================================");
  console.log(" EMETSEES Entity Compiler");
  console.log(" P04 Cached Explanation Verification");
  console.log("========================================\n");

  for (const [label, filePath] of Object.entries({
    cachedExplanations: EXPLANATIONS_PATH,
    manifest: MANIFEST_PATH,
    audit: AUDIT_PATH,
    p03EvidencePackets: INPUTS.packets,
    promptFile: INPUTS.prompt,
  })) {
    assertFile(filePath, label);
  }

  const packetsDocument = readJson(INPUTS.packets, "P03 evidence-packets.json");
  const p03 = validateP03Artifact(packetsDocument);
  const prompt = promptDescriptor();
  const artifact = readJson(EXPLANATIONS_PATH, "P04 cached-explanations.json");
  const manifest = readJson(MANIFEST_PATH, "P04 manifest.json");
  const audit = readJson(AUDIT_PATH, "P04 audit.json");
  const model = cleanString(artifact?.generationPolicy?.model);
  if (!model) fail("P04 artifact has no generation model.");

  const artifactChecksum = artifactCoreChecksum(artifact);
  const manifestChecksum = artifactCoreChecksum(manifest);
  const auditChecksum = artifactCoreChecksum(audit);
  const records = isRecord(artifact.explanations) ? artifact.explanations : {};
  const computedAudit = buildAudit({
    packets: p03.packets,
    records,
    prompt,
    model,
    p03Checksum: p03.artifactChecksum,
  });

  const checks = {
    artifactChecksum:
      Boolean(artifactChecksum.expected) &&
      artifactChecksum.expected === artifactChecksum.actual,
    artifactFileChecksum:
      manifest?.produces?.cachedExplanations?.fileSha256 ===
      sha256File(EXPLANATIONS_PATH),
    manifestChecksum:
      Boolean(manifestChecksum.expected) &&
      manifestChecksum.expected === manifestChecksum.actual,
    auditChecksum:
      Boolean(auditChecksum.expected) && auditChecksum.expected === auditChecksum.actual,
    auditFileChecksum:
      manifest?.produces?.audit?.fileSha256 === sha256File(AUDIT_PATH),
    p03ArtifactChecksum:
      artifact?.source?.artifactChecksum === p03.artifactChecksum,
    promptChecksum: artifact?.prompt?.checksum === prompt.checksum,
    promptVersion: artifact?.prompt?.version === prompt.version,
    entityCount:
      Object.keys(records).length === Object.keys(p03.packets).length,
    auditRecomputes:
      stableStringify(computedAudit) ===
      stableStringify((({ checksum, ...rest }) => rest)(audit)),
    invariantsPassed: audit?.invariants?.allPassed === true,
  };

  if (!Object.values(checks).every(Boolean)) {
    console.error(JSON.stringify(checks, null, 2));
    fail("P04 verification failed.");
  }

  console.log(`Explanations : ${Object.keys(records).length}`);
  console.log(`Model        : ${model}`);
  console.log(`Prompt       : ${prompt.id}@${prompt.version}`);
  console.log(`Checksum     : ${artifactChecksum.actual}`);
  console.log("Status       : verified\n");
}

function printPlan(plan, selected, packets, prompt, options, previousFailures, forcedSelected) {
  const corpusPending = {};
  for (const entityId of plan.pending) {
    const corpus = packets[entityId]?.corpus || "unknown";
    corpusPending[corpus] = (corpusPending[corpus] || 0) + 1;
  }
  console.log("P04 generation plan\n");
  console.log(`P03 packets          : ${plan.entityIds.length}`);
  console.log(`Reusable             : ${Object.keys(plan.reusable).length}`);
  console.log(`Pending              : ${plan.pending.length}`);
  console.log(`Selected this run    : ${selected.length}`);
  console.log(`Forced regeneration  : ${forcedSelected}`);
  console.log(`Existing failures    : ${Object.keys(previousFailures).length}`);
  console.log(`Model                : ${options.model}`);
  console.log(`Prompt               : ${prompt.id}@${prompt.version}`);
  console.log(`Prompt checksum      : ${prompt.checksum}`);
  console.log(`Batch size           : ${options.batchSize}`);
  console.log(`Concurrency          : ${options.concurrency}`);
  console.log(`Entity input limit   : ${options.maxEntityInputBytes} bytes`);
  console.log(`Batch input limit    : ${options.maxBatchInputBytes} bytes`);
  console.log(`Generation view      : ${GENERATION_VIEW_VERSION}`);
  console.log(`Pending by corpus    : ${JSON.stringify(sortRecord(corpusPending))}`);
  console.log(`Reasons              : ${JSON.stringify(plan.reasons)}\n`);
}

function inspectGenerationInputs(entityIds, packets, options) {
  if (!Array.isArray(entityIds) || entityIds.length === 0) {
    fail(
      "--inspect-input requires --entity or --limit so it cannot accidentally inspect all P03 packets."
    );
  }

  const rows = [];
  let totalBytes = 0;
  let totalEstimatedTokens = 0;
  for (const entityId of entityIds) {
    const packet = packets[entityId];
    if (!packet) fail(`Unknown P03 entity ID: ${entityId}`);
    const bundle = buildGenerationBundle(packet, {
      maxEntityInputBytes: options.maxEntityInputBytes,
      enforceLimit: true,
    });
    totalBytes += bundle.metrics.generationViewBytes;
    totalEstimatedTokens += bundle.metrics.estimatedInputTokens;
    rows.push({
      entityId,
      corpus: packet.corpus,
      bytes: bundle.metrics.generationViewBytes,
      estimatedTokens: bundle.metrics.estimatedInputTokens,
      allowedEvidence: bundle.metrics.allowedEvidenceCount,
      references: bundle.metrics.representativeReferenceCount,
      relationships: bundle.metrics.relationshipExcerptCount,
      events: bundle.metrics.eventExcerptCount,
      themes: bundle.metrics.themeExcerptCount,
      meaningSource: bundle.quality.explicitLexicalMeaningAvailable
        ? "glosses / definitions"
        : "filtered dominant fallback",
      fallbackTerms: Array.isArray(bundle.view?.rendering_evidence?.dominant_fallback_candidates)
        ? bundle.view.rendering_evidence.dominant_fallback_candidates
            .map((item) => cleanString(item?.text))
            .filter(Boolean)
        : [],
      excludedRenderingTerms: bundle.quality.excludedQuotedRenderingTerms.length,
      checksum: bundle.metrics.generationViewChecksum,
    });
  }

  console.log("P04 compact input inspection\n");
  for (const row of rows) {
    console.log(`Entity               : ${row.entityId}`);
    console.log(`Corpus               : ${row.corpus}`);
    console.log(`Generation view bytes: ${row.bytes}`);
    console.log(`Estimated tokens     : ${row.estimatedTokens}`);
    console.log(`Allowed evidence IDs : ${row.allowedEvidence}`);
    console.log(`Meaning source        : ${row.meaningSource}`);
    console.log(`Fallback terms        : ${row.fallbackTerms.length ? row.fallbackTerms.join(", ") : "none"}`);
    console.log(`Filtered token count  : ${row.excludedRenderingTerms}`);
    console.log(`Representative refs  : ${row.references}`);
    console.log(`SEE excerpts         : R${row.relationships} / E${row.events} / T${row.themes}`);
    console.log(`View checksum        : ${row.checksum}\n`);
  }
  console.log(`Inspected entities   : ${rows.length}`);
  console.log(`Total view bytes     : ${totalBytes}`);
  console.log(`Estimated tokens     : ${totalEstimatedTokens}`);
  console.log(
    "Note                  : token estimates are conservative byte-based estimates; the API reports exact usage after generation.\n"
  );
}

async function build(options) {
  for (const [label, filePath] of Object.entries(INPUTS)) assertFile(filePath, label);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  if (options.resetState && fs.existsSync(STATE_PATH)) fs.rmSync(STATE_PATH);

  console.log("\n========================================");
  console.log(" EMETSEES Entity Compiler");
  console.log(" P04 Cached EMET Explanations");
  console.log("========================================\n");

  const packetsDocument = readJson(INPUTS.packets, "P03 evidence-packets.json");
  const p03 = validateP03Artifact(packetsDocument);
  const prompt = promptDescriptor();
  const previous = extractPreviousRecords();
  const plan = buildPlan({
    packets: p03.packets,
    prompt,
    model: options.model,
    previousRecords: previous.records,
    retryFailed: options.retryFailed,
    previousFailures: previous.failures,
  });
  const work = selectWork(plan, options, p03.packets);
  const selected = work.selected;
  printPlan(plan, selected, p03.packets, prompt, options, previous.failures, work.forcedSelected.length);

  if (options.mode === "plan") return;
  if (options.mode === "inspect") {
    const inspectionIds =
      options.entityIds.length > 0
        ? options.entityIds
        : options.limit
          ? plan.pending.slice(0, options.limit)
          : [];
    inspectGenerationInputs(inspectionIds, p03.packets, options);
    return;
  }

  const state = initialState({
    p03Checksum: p03.artifactChecksum,
    prompt,
    model: options.model,
    records: work.reusable,
    failures: options.retryFailed ? {} : previous.failures,
  });

  for (const entityId of selected) {
    const existing = previous.records[entityId];
    const validation = validateRecord(
      existing,
      p03.packets[entityId],
      prompt,
      options.model
    );
    if (!options.force && validation.valid) state.records[entityId] = existing;
  }
  checkpointState(state);

  let runSummary = {
    completedEntities: 0,
    failedEntities: 0,
    batches: 0,
    inputTokens: 0,
    outputTokens: 0,
    requestBodyBytes: 0,
    estimatedRequestTokens: 0,
    largestBatchRequestBytes: 0,
  };
  if (selected.length > 0) {
    runSummary = await generateSelected({
      selected,
      packets: p03.packets,
      prompt,
      options,
      state,
    });
  }

  const finalPlan = buildPlan({
    packets: p03.packets,
    prompt,
    model: options.model,
    previousRecords: state.records,
    retryFailed: true,
    previousFailures: state.failures,
  });

  console.log("\nP04 generation run complete\n");
  console.log(`Generated this run    : ${runSummary.completedEntities}`);
  console.log(`Failed this run       : ${runSummary.failedEntities}`);
  console.log(`Input tokens reported: ${runSummary.inputTokens}`);
  console.log(`Output tokens reported: ${runSummary.outputTokens}`);
  console.log(`Request bytes sent    : ${runSummary.requestBodyBytes}`);
  console.log(`Estimated input tokens: ${runSummary.estimatedRequestTokens}`);
  console.log(`Largest batch request : ${runSummary.largestBatchRequestBytes} bytes`);
  console.log(`Valid cached records  : ${Object.keys(finalPlan.reusable).length}`);
  console.log(`Still pending         : ${finalPlan.pending.length}`);
  console.log(`State                 : ${relativePath(STATE_PATH)}\n`);

  if (finalPlan.pending.length > 0) {
    console.log(
      "Verified final P04 artifacts were not replaced because one or more P03 packets still lack a current explanation. Re-run the same command to resume.\n"
    );
    process.exitCode = runSummary.failedEntities > 0 ? 1 : 0;
    return;
  }

  const result = writeFinalOutputs({
    packetsDocument,
    packets: p03.packets,
    p03Checksum: p03.artifactChecksum,
    prompt,
    model: options.model,
    records: finalPlan.reusable,
  });

  state.records = finalPlan.reusable;
  state.failures = {};
  checkpointState(state);

  console.log("P04 CACHED EMET EXPLANATIONS COMPLETE\n");
  console.log(`Explanations          : ${result.audit.totalExplanations}`);
  console.log(`Hebrew                : ${result.audit.explanationsByCorpus.hebrew || 0}`);
  console.log(`Greek NT              : ${result.audit.explanationsByCorpus["greek-nt"] || 0}`);
  console.log(`LXX                   : ${result.audit.explanationsByCorpus.lxx || 0}`);
  console.log(`Total citations       : ${result.audit.totalCitationCount}`);
  console.log(`Average words         : ${result.audit.averageExplanationWords}`);
  console.log(`Checksum              : ${result.artifact.checksum}`);
  console.log(`Output                : ${OUTPUT_DIR}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === "verify") {
    verifyExistingOutputs();
    return;
  }
  await build(options);
}

module.exports = {
  COMPILER_ID,
  COMPILER_NAME,
  COMPILER_VERSION,
  SCHEMA_VERSION,
  GENERATION_VIEW_VERSION,
  GENERATION_CONTRACT_VERSION,
  DEFAULT_MODEL,
  DEFAULT_API_BASE_URL,
  DEFAULT_MAX_ATTEMPTS,
  MIN_TOTAL_WORDS,
  MAX_TOTAL_WORDS,
  DEFAULT_MAX_ENTITY_INPUT_BYTES,
  DEFAULT_MAX_BATCH_INPUT_BYTES,
  INPUTS,
  OUTPUT_DIR,
  STATE_PATH,
  cleanString,
  isRecord,
  positiveInteger,
  nonNegativeInteger,
  relativePath,
  readJson,
  readJsonIfExists,
  writeStableJson,
  stableStringify,
  canonicalize,
  sha256Text,
  sha256File,
  sortRecord,
  sortedUniqueStrings,
  validateP03Artifact,
  promptDescriptor,
  buildPlan,
  extractPreviousRecords,
  validateRecord,
  initialState,
  checkpointState,
  buildApiRequest,
  buildGenerationBundle,
  readerQualityFailure,
  processApiResponse,
  callOpenAI,
  writeFinalOutputs,
  apiHeaders,
};

if (require.main === module) {
  main().catch((error) => {
    console.error("\nP04 CACHED EMET EXPLANATION COMPILER FAILED\n");
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}
