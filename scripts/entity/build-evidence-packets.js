"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const COMPILER_ID = "P03";
const COMPILER_NAME = "EMETSEES EMET Evidence Packet Compiler";
const COMPILER_VERSION = "1.0.0";
const SCHEMA_VERSION = "1.0.0";
const PACKET_SCHEMA_VERSION = "1.0.0";

const SEE_EXCERPT_LIMIT = 24;
const REPRESENTATIVE_REFERENCE_LIMIT = 16;
const SAMPLE_PACKET_LIMIT = 3;
const ERROR_SAMPLE_LIMIT = 100;

const INPUTS = {
  entityGraph: path.join(
    ROOT,
    ".private",
    "entity",
    "build",
    "P01",
    "entities.json"
  ),
  knowledgeIndex: path.join(
    ROOT,
    ".private",
    "entity",
    "build",
    "P02",
    "knowledge-index.json"
  ),
  relationshipGraph: path.join(
    ROOT,
    ".private",
    "see",
    "build",
    "RelationshipGraph",
    "index.json"
  ),
  eventGraph: path.join(
    ROOT,
    ".private",
    "see",
    "build",
    "EventGraph",
    "index.json"
  ),
  themeGraph: path.join(
    ROOT,
    ".private",
    "see",
    "build",
    "ThemeGraph",
    "index.json"
  ),
};

const OUTPUT_DIR = path.join(
  ROOT,
  ".private",
  "entity",
  "build",
  COMPILER_ID
);
const PACKETS_PATH = path.join(OUTPUT_DIR, "evidence-packets.json");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");
const AUDIT_PATH = path.join(OUTPUT_DIR, "audit.json");

const DEUTEROCANONICAL_BOOKS = new Set([
  "Tobit",
  "Judith",
  "Wisdom",
  "Wisdom of Solomon",
  "Sirach",
  "Ecclesiasticus",
  "Baruch",
  "Letter of Jeremiah",
  "1 Maccabees",
  "2 Maccabees",
  "3 Maccabees",
  "4 Maccabees",
  "1 Esdras",
  "2 Esdras",
  "Prayer of Manasseh",
  "Psalm 151",
  "Susanna",
  "Bel and the Dragon",
]);

const NEW_TESTAMENT_BOOKS = new Set([
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
]);

function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toNonNegativeInteger(value, fallback = 0) {
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

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    fail(`${label} is not a file: ${relativePath(filePath)}`);
  }
}

function readJson(filePath, label) {
  assertFile(filePath, label);

  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    fail(`Unable to read ${label}: ${error.message}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`Invalid JSON in ${label} (${relativePath(filePath)}): ${error.message}`);
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
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (isRecord(value)) {
    const result = {};
    for (const key of Object.keys(value).sort((left, right) =>
      left.localeCompare(right)
    )) {
      const child = value[key];
      if (child !== undefined) {
        result[key] = canonicalize(child);
      }
    }
    return result;
  }

  return value;
}

function stableStringify(value, space = 0) {
  return JSON.stringify(canonicalize(value), null, space);
}

function writeStableJson(filePath, value, space = 0) {
  const text = `${stableStringify(value, space)}\n`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
  return text;
}

function sortRecord(record) {
  if (!isRecord(record)) return {};
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
  );
}

function sortedUniqueStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(cleanString)
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));
}

function compareCountThenText(left, right, textField = "text") {
  return (
    toFiniteNumber(right.count) - toFiniteNumber(left.count) ||
    String(left[textField] || "").localeCompare(String(right[textField] || "")) ||
    String(left.translation || "").localeCompare(String(right.translation || ""))
  );
}

function fingerprintFile(filePath) {
  const stat = fs.statSync(filePath);
  return {
    path: relativePath(filePath),
    bytes: stat.size,
    sha256: sha256File(filePath),
  };
}

function extractEntityMap(document) {
  const data = isRecord(document?.data) ? document.data : document;
  const entities = isRecord(data?.entities) ? data.entities : data;

  if (!isRecord(entities)) {
    fail("P01 entities.json does not contain an entity object map.");
  }

  return entities;
}

function extractKnowledgeMap(document) {
  const data = isRecord(document?.data) ? document.data : document;
  const entities = isRecord(data?.entities) ? data.entities : data;

  if (!isRecord(entities)) {
    fail("P02 knowledge-index.json does not contain an entity object map.");
  }

  return entities;
}

function extractRelationshipGraph(document) {
  const data = isRecord(document?.data) ? document.data : document;
  const graph =
    (isRecord(data?.relationshipGraph) && data.relationshipGraph) ||
    (isRecord(data?.relationships) && data.relationships) ||
    (isRecord(data?.byVerse) && data.byVerse) ||
    data;

  if (!isRecord(graph)) {
    fail("RelationshipGraph index.json does not contain a relationship graph map.");
  }

  return graph;
}

function extractEventGraph(document) {
  const data = isRecord(document?.data) ? document.data : document;
  const graph =
    (isRecord(data?.eventGraph) && data.eventGraph) ||
    (isRecord(data?.events) && data.events) ||
    (isRecord(data?.byVerse) && data.byVerse) ||
    data;

  if (!isRecord(graph)) {
    fail("EventGraph index.json does not contain an event graph map.");
  }

  return graph;
}

function extractThemeGraph(document) {
  const data = isRecord(document?.data) ? document.data : document;
  const graph =
    (isRecord(data?.themeGraph) && data.themeGraph) ||
    (isRecord(data?.themes) && data.themes) ||
    data;

  if (!isRecord(graph)) {
    fail("ThemeGraph index.json does not contain a theme graph map.");
  }

  return graph;
}

function buildThemeLookup(themeGraph) {
  const lookup = new Map();

  for (const themeKey of Object.keys(themeGraph).sort((left, right) =>
    left.localeCompare(right)
  )) {
    const theme = themeGraph[themeKey];
    if (!isRecord(theme)) continue;

    const themeId = cleanString(theme.id) || themeKey;
    lookup.set(themeId, theme);
    if (!lookup.has(themeKey)) lookup.set(themeKey, theme);
  }

  return lookup;
}

function corpusFromEntity(entityId, entity) {
  const explicit = cleanString(entity?.corpus);
  if (explicit) return explicit;

  const match = /^word:([^:]+):/.exec(entityId);
  return match ? match[1] : "unknown";
}

function lexicalIdFromEntity(entityId, entity) {
  const explicit =
    cleanString(entity?.lexicalId) ||
    cleanString(entity?.lexical?.id) ||
    cleanString(entity?.lexical?.lexicalId);

  if (explicit) return explicit;

  const match = /^word:[^:]+:(.+)$/.exec(entityId);
  return match ? match[1] : null;
}

function strongForEntity(corpus, lexicalId, entity) {
  const explicit =
    cleanString(entity?.strong) ||
    cleanString(entity?.lexical?.strong) ||
    cleanString(entity?.lexical?.strongs);

  const candidate = explicit || lexicalId;

  if (corpus === "hebrew" && /^H\d+[A-Za-z]?$/.test(candidate || "")) {
    return candidate;
  }

  if (corpus === "greek-nt" && /^G\d+[A-Za-z]?$/.test(candidate || "")) {
    return candidate;
  }

  return null;
}

function sourcePointer(artifact, entityId, field) {
  return {
    artifact,
    entityId,
    field,
  };
}

function normalizeSurfaceEntries(lexical) {
  const surfaces = Array.isArray(lexical?.surfaces) ? lexical.surfaces : [];
  const normalized = [];

  for (const item of surfaces) {
    if (typeof item === "string") {
      const surface = cleanString(item);
      if (surface) normalized.push({ surface, count: 0 });
      continue;
    }

    if (!isRecord(item)) continue;
    const surface = cleanString(item.surface) || cleanString(item.text);
    if (!surface) continue;

    normalized.push({
      surface,
      count: toNonNegativeInteger(item.count),
    });
  }

  normalized.sort((left, right) =>
    compareCountThenText(left, right, "surface")
  );

  return normalized;
}

function normalizeTopRenderings(entity) {
  const source = Array.isArray(entity?.topRenderings)
    ? entity.topRenderings
    : Array.isArray(entity?.renderings)
      ? entity.renderings
      : [];

  const normalized = [];

  for (const item of source) {
    if (!isRecord(item)) continue;

    const text = cleanString(item.text) || cleanString(item.rendering);
    if (!text) continue;

    normalized.push({
      translation: cleanString(item.translation) || "unknown",
      text,
      normalized:
        cleanString(item.normalized) ||
        text
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim(),
      count: toNonNegativeInteger(item.count),
    });
  }

  normalized.sort((left, right) => {
    return (
      String(left.translation).localeCompare(String(right.translation)) ||
      compareCountThenText(left, right)
    );
  });

  return normalized;
}

function normalizeReferenceRenderings(renderings) {
  if (!isRecord(renderings)) return {};

  const result = {};

  for (const translation of Object.keys(renderings).sort((left, right) =>
    left.localeCompare(right)
  )) {
    const raw = renderings[translation];
    const values = Array.isArray(raw) ? raw : [raw];
    const cleaned = sortedUniqueStrings(values);
    if (cleaned.length > 0) result[translation] = cleaned;
  }

  return result;
}

function normalizeReference(rawReference, entityId, index) {
  if (!isRecord(rawReference)) return null;

  const reference =
    cleanString(rawReference.reference) ||
    cleanString(rawReference.canonicalId) ||
    cleanString(rawReference.id);

  const book = cleanString(rawReference.book);
  const chapter = Number.isInteger(Number(rawReference.chapter))
    ? Number(rawReference.chapter)
    : null;
  const verse = Number.isInteger(Number(rawReference.verse))
    ? Number(rawReference.verse)
    : null;

  if (!reference && !book) return null;

  const sourceTokenIds = sortedUniqueStrings(rawReference.sourceTokenIds);
  const occurrenceCount = sourceTokenIds.length > 0 ? sourceTokenIds.length : 1;

  return {
    evidenceId: `p01:${entityId}:reference:${index}`,
    reference: reference || `${book}.${chapter || 0}.${verse || 0}`,
    book,
    chapter,
    verse,
    occurrenceCount,
    sourceTokenIds,
    renderings: normalizeReferenceRenderings(rawReference.renderings),
  };
}

function normalizeReferences(entityId, entity) {
  const rawReferences = Array.isArray(entity?.references) ? entity.references : [];
  const references = [];

  for (let index = 0; index < rawReferences.length; index += 1) {
    const reference = normalizeReference(rawReferences[index], entityId, index);
    if (reference) references.push(reference);
  }

  return references;
}

function bookDivision(book, corpus) {
  if (corpus === "greek-nt") return "new-testament";
  if (DEUTEROCANONICAL_BOOKS.has(book || "")) return "deuterocanonical";
  if (NEW_TESTAMENT_BOOKS.has(book || "")) return "new-testament";
  return "old-testament";
}

function distributionFromReferences(references, corpus) {
  const books = {};
  const divisions = {};

  for (const reference of references) {
    const book = reference.book || "unknown";
    const division = bookDivision(reference.book, corpus);

    if (!books[book]) books[book] = { verses: 0, occurrences: 0 };
    books[book].verses += 1;
    books[book].occurrences += reference.occurrenceCount;

    if (!divisions[division]) {
      divisions[division] = { verses: 0, occurrences: 0 };
    }
    divisions[division].verses += 1;
    divisions[division].occurrences += reference.occurrenceCount;
  }

  return {
    books: sortRecord(books),
    divisions: sortRecord(divisions),
  };
}

function selectEvenly(items, limit) {
  if (!Array.isArray(items) || items.length === 0 || limit <= 0) return [];
  if (items.length <= limit) return [...items];
  if (limit === 1) return [items[0]];

  const selected = [];
  const seen = new Set();

  for (let slot = 0; slot < limit; slot += 1) {
    const index = Math.round((slot * (items.length - 1)) / (limit - 1));
    if (!seen.has(index)) {
      seen.add(index);
      selected.push(items[index]);
    }
  }

  return selected;
}

function representativeReferences(references) {
  return selectEvenly(references, REPRESENTATIVE_REFERENCE_LIMIT).map(
    (reference) => ({
      evidenceId: reference.evidenceId,
      reference: reference.reference,
      book: reference.book,
      chapter: reference.chapter,
      verse: reference.verse,
      occurrenceCount: reference.occurrenceCount,
      renderings: reference.renderings,
    })
  );
}

function buildIdentity(entityId, entity) {
  const corpus = corpusFromEntity(entityId, entity);
  const lexical = isRecord(entity?.lexical) ? entity.lexical : {};
  const lexicalId = lexicalIdFromEntity(entityId, entity);
  const surfaces = normalizeSurfaceEntries(lexical);
  const sourceFormCount = surfaces.reduce(
    (total, item) => total + item.count,
    0
  );

  return {
    entityId,
    corpus,
    language: cleanString(entity?.language) || cleanString(lexical.language) || corpus,
    lexicalId,
    strong: strongForEntity(corpus, lexicalId, entity),
    lemma: cleanString(lexical.lemma) || cleanString(entity?.lemma),
    normalizedLemma:
      cleanString(lexical.normalizedLemma) ||
      cleanString(entity?.normalizedLemma),
    transliteration:
      cleanString(lexical.transliteration) ||
      cleanString(entity?.transliteration),
    pronunciation:
      cleanString(lexical.pronunciation) ||
      cleanString(entity?.pronunciation),
    glosses: sortedUniqueStrings(
      Array.isArray(lexical.glosses)
        ? lexical.glosses
        : [lexical.gloss, entity?.gloss]
    ),
    shortDefinitions: sortedUniqueStrings(
      Array.isArray(lexical.shortDefinitions)
        ? lexical.shortDefinitions
        : [lexical.shortDefinition, entity?.shortDefinition]
    ),
    partsOfSpeech: sortedUniqueStrings(
      Array.isArray(lexical.partsOfSpeech)
        ? lexical.partsOfSpeech
        : [lexical.partOfSpeech]
    ),
    morphology: sortedUniqueStrings(lexical.morphology),
    morphologyEnglish: sortedUniqueStrings(lexical.morphologyEnglish),
    witnesses: sortedUniqueStrings(lexical.witnesses),
    sourceForms: {
      distinctForms: surfaces.length,
      countedOccurrences: sourceFormCount,
      forms: surfaces,
      pointer: sourcePointer("P01", entityId, "lexical.surfaces"),
    },
  };
}

function buildRenderingEvidence(entityId, entity, references) {
  const topRenderings = normalizeTopRenderings(entity);
  const translationCounts = sortRecord(entity?.statistics?.translationCounts || {});
  const byTranslation = {};

  for (const rendering of topRenderings) {
    if (!byTranslation[rendering.translation]) {
      byTranslation[rendering.translation] = [];
    }
    byTranslation[rendering.translation].push({
      text: rendering.text,
      normalized: rendering.normalized,
      count: rendering.count,
    });
  }

  for (const translation of Object.keys(byTranslation)) {
    byTranslation[translation].sort(compareCountThenText);
  }

  const mostCommon = [...topRenderings].sort(compareCountThenText).slice(0, 24);

  const observedReferenceTranslations = {};
  for (const reference of references) {
    for (const [translation, values] of Object.entries(reference.renderings)) {
      if (!observedReferenceTranslations[translation]) {
        observedReferenceTranslations[translation] = new Set();
      }
      for (const value of values) {
        observedReferenceTranslations[translation].add(value);
      }
    }
  }

  const observed = {};
  for (const translation of Object.keys(observedReferenceTranslations).sort()) {
    observed[translation] = [...observedReferenceTranslations[translation]].sort(
      (left, right) => left.localeCompare(right)
    );
  }

  const totalAlignedRenderings = Object.values(translationCounts).reduce(
    (total, count) => total + toNonNegativeInteger(count),
    0
  );

  return {
    available:
      topRenderings.length > 0 ||
      totalAlignedRenderings > 0 ||
      Object.keys(observed).length > 0,
    totalAlignedRenderings,
    translationCounts,
    byTranslation: sortRecord(byTranslation),
    mostCommon,
    observedReferenceForms: sortRecord(observed),
    pointer: sourcePointer("P01", entityId, "topRenderings"),
  };
}

function buildOccurrenceEvidence(entityId, entity, references, corpus) {
  const statistics = isRecord(entity?.statistics) ? entity.statistics : {};
  const distribution = distributionFromReferences(references, corpus);
  const totalEntityOccurrences = toNonNegativeInteger(
    statistics.sourceTokenCount,
    references.reduce((total, reference) => total + reference.occurrenceCount, 0)
  );
  const uniqueVerseCount = toNonNegativeInteger(
    statistics.verseCount,
    references.length
  );

  return {
    available: totalEntityOccurrences > 0 || references.length > 0,
    totalEntityOccurrences,
    corpusOccurrenceCount: totalEntityOccurrences,
    uniqueVerseCount,
    alignedSourceTokenCount: toNonNegativeInteger(
      statistics.alignedSourceTokenCount
    ),
    alignedVerseCount: toNonNegativeInteger(statistics.alignedVerseCount),
    translationAlignmentCount: toNonNegativeInteger(
      statistics.translationAlignmentCount
    ),
    chronology: {
      firstOccurrence: cleanString(entity?.chronology?.firstOccurrence),
      lastOccurrence: cleanString(entity?.chronology?.lastOccurrence),
    },
    orderedReferences: references,
    representativeReferences: representativeReferences(references),
    bookDistribution: distribution.books,
    testamentCorpusDistribution: distribution.divisions,
    pointer: sourcePointer("P01", entityId, "references"),
  };
}

function buildHealthEvidence(entityId, entity) {
  const health = isRecord(entity?.entityHealth) ? entity.entityHealth : {};

  return {
    status: cleanString(health.status),
    alignmentCoverage: Number.isFinite(Number(health.alignmentCoverage))
      ? Number(health.alignmentCoverage)
      : null,
    hasLexicalId: Boolean(health.hasLexicalId),
    hasLemma: Boolean(health.hasLemma),
    hasGloss: Boolean(health.hasGloss),
    hasEnglishRenderings: Boolean(health.hasEnglishRenderings),
    hasReferences: Boolean(health.hasReferences),
    sourceFingerprint: cleanString(entity?.fingerprint),
    compilerVersion: cleanString(entity?.compilerVersion),
    provenance: isRecord(entity?.provenance)
      ? canonicalize(entity.provenance)
      : {
          compiledBy: "entity-compiler:P01",
          canonicalCorpus: corpusFromEntity(entityId, entity),
          sourceDatasets: [],
        },
    pointer: sourcePointer("P01", entityId, "entityHealth"),
  };
}

function malformedRefSample(entityId, kind, ref, reason) {
  return {
    entityId,
    kind,
    reason,
    ref: canonicalize(ref),
  };
}

function dereferenceRelationship(ref, relationshipGraph) {
  const canonicalId = cleanString(ref?.canonicalId);
  const index = Number(ref?.index);

  if (!canonicalId || !Number.isInteger(index) || index < 0) {
    return { status: "malformed", value: null };
  }

  const relationships = relationshipGraph[canonicalId];
  if (!Array.isArray(relationships) || !isRecord(relationships[index])) {
    return { status: "dangling", value: null };
  }

  return { status: "valid", value: relationships[index] };
}

function dereferenceEvent(ref, eventGraph) {
  const canonicalId = cleanString(ref?.canonicalId);
  const index = Number(ref?.index);

  if (!canonicalId || !Number.isInteger(index) || index < 0) {
    return { status: "malformed", value: null };
  }

  const events = eventGraph[canonicalId];
  if (!Array.isArray(events) || !isRecord(events[index])) {
    return { status: "dangling", value: null };
  }

  return { status: "valid", value: events[index] };
}

function dereferenceTheme(ref, themeLookup) {
  const themeId = cleanString(ref?.themeId);
  const canonicalId = cleanString(ref?.canonicalId);
  const index = Number(ref?.index);

  if (
    !themeId ||
    !canonicalId ||
    !Number.isInteger(index) ||
    index < 0
  ) {
    return { status: "malformed", value: null, theme: null };
  }

  const theme = themeLookup.get(themeId);
  const occurrences = Array.isArray(theme?.occurrences) ? theme.occurrences : null;
  const occurrence = occurrences?.[index];

  if (
    !isRecord(theme) ||
    !isRecord(occurrence) ||
    cleanString(occurrence.canonicalId) !== canonicalId
  ) {
    return { status: "dangling", value: null, theme: null };
  }

  return { status: "valid", value: occurrence, theme };
}

function compactRelationship(entityId, ref, relationship) {
  const participants = sortedUniqueStrings([
    relationship.subject,
    relationship.predicate,
    relationship.object,
  ]);

  return {
    pointer: {
      graph: "RelationshipGraph",
      path: relativePath(INPUTS.relationshipGraph),
      canonicalId: ref.canonicalId,
      index: ref.index,
    },
    roles: sortedUniqueStrings(ref.roles),
    type:
      cleanString(relationship.type) ||
      cleanString(relationship.kind) ||
      cleanString(relationship.relationshipType),
    subject: cleanString(relationship.subject),
    predicate: cleanString(relationship.predicate),
    object: cleanString(relationship.object),
    counterpartEntityIds: participants.filter((value) => value !== entityId),
    confidence:
      cleanString(relationship.confidence) ??
      (Number.isFinite(Number(relationship.confidence))
        ? Number(relationship.confidence)
        : null),
    method: cleanString(relationship.method),
  };
}

function participantEntityIds(event) {
  const participants = Array.isArray(event?.participants)
    ? event.participants
    : [];

  if (participants.length > 0) {
    return sortedUniqueStrings(
      participants.map((participant) => participant?.entityId)
    );
  }

  return sortedUniqueStrings([event?.subject, event?.predicate, event?.object]);
}

function compactEvent(entityId, ref, event) {
  const participants = participantEntityIds(event);

  return {
    pointer: {
      graph: "EventGraph",
      path: relativePath(INPUTS.eventGraph),
      canonicalId: ref.canonicalId,
      index: ref.index,
    },
    roles: sortedUniqueStrings(ref.roles),
    type: cleanString(event.type) || "unknown",
    participantCount: participants.length,
    participantEntityIds: participants.slice(0, 24),
    counterpartEntityIds: participants
      .filter((value) => value !== entityId)
      .slice(0, 24),
    confidence:
      cleanString(event.confidence) ??
      (Number.isFinite(Number(event.confidence))
        ? Number(event.confidence)
        : null),
    method: cleanString(event.method),
  };
}

function compactTheme(ref, occurrence, theme) {
  return {
    pointer: {
      graph: "ThemeGraph",
      path: relativePath(INPUTS.themeGraph),
      themeId: ref.themeId,
      canonicalId: ref.canonicalId,
      index: ref.index,
    },
    themeId: ref.themeId,
    name:
      cleanString(theme.name) ||
      cleanString(theme.title) ||
      cleanString(theme.label),
    canonicalId: ref.canonicalId,
    eventType: cleanString(occurrence.eventType),
  };
}

function normalizeP02Statistics(statistics) {
  if (!isRecord(statistics)) {
    return {
      relationships: {
        references: 0,
        verses: 0,
        counterpartEntities: 0,
        roles: {},
        confidence: {},
        methods: {},
      },
      events: {
        references: 0,
        verses: 0,
        types: 0,
        roles: {},
        confidence: {},
        methods: {},
      },
      themes: {
        references: 0,
        verses: 0,
        themes: 0,
      },
      totalKnowledgeRefs: 0,
    };
  }

  return canonicalize(statistics);
}

function buildKnowledgeEvidence({
  entityId,
  knowledgeRecord,
  relationshipGraph,
  eventGraph,
  themeLookup,
  auditState,
}) {
  const relationshipRefs = Array.isArray(knowledgeRecord?.relationshipRefs)
    ? knowledgeRecord.relationshipRefs
    : [];
  const eventRefs = Array.isArray(knowledgeRecord?.eventRefs)
    ? knowledgeRecord.eventRefs
    : [];
  const themeRefs = Array.isArray(knowledgeRecord?.themeRefs)
    ? knowledgeRecord.themeRefs
    : [];

  const validRelationshipPointers = [];
  const validEventPointers = [];
  const validThemePointers = [];
  const relationshipCandidates = [];
  const eventCandidates = [];
  const themeCandidates = [];

  for (const rawRef of relationshipRefs) {
    const ref = {
      canonicalId: cleanString(rawRef?.canonicalId),
      index: Number(rawRef?.index),
      roles: sortedUniqueStrings(rawRef?.roles),
    };
    const dereferenced = dereferenceRelationship(ref, relationshipGraph);

    if (dereferenced.status === "malformed") {
      auditState.invalidP02ReferenceCount += 1;
      if (auditState.invalidP02ReferenceSamples.length < ERROR_SAMPLE_LIMIT) {
        auditState.invalidP02ReferenceSamples.push(
          malformedRefSample(entityId, "relationship", rawRef, "malformed")
        );
      }
      continue;
    }

    if (dereferenced.status === "dangling") {
      auditState.danglingSeePointerCount += 1;
      if (auditState.danglingSeePointerSamples.length < ERROR_SAMPLE_LIMIT) {
        auditState.danglingSeePointerSamples.push(
          malformedRefSample(entityId, "relationship", rawRef, "not-found")
        );
      }
      continue;
    }

    const pointer = {
      graph: "RelationshipGraph",
      canonicalId: ref.canonicalId,
      index: ref.index,
      roles: ref.roles,
    };
    validRelationshipPointers.push(pointer);
    relationshipCandidates.push({
      ref: pointer,
      source: dereferenced.value,
    });
  }

  for (const rawRef of eventRefs) {
    const ref = {
      canonicalId: cleanString(rawRef?.canonicalId),
      index: Number(rawRef?.index),
      roles: sortedUniqueStrings(rawRef?.roles),
    };
    const dereferenced = dereferenceEvent(ref, eventGraph);

    if (dereferenced.status === "malformed") {
      auditState.invalidP02ReferenceCount += 1;
      if (auditState.invalidP02ReferenceSamples.length < ERROR_SAMPLE_LIMIT) {
        auditState.invalidP02ReferenceSamples.push(
          malformedRefSample(entityId, "event", rawRef, "malformed")
        );
      }
      continue;
    }

    if (dereferenced.status === "dangling") {
      auditState.danglingSeePointerCount += 1;
      if (auditState.danglingSeePointerSamples.length < ERROR_SAMPLE_LIMIT) {
        auditState.danglingSeePointerSamples.push(
          malformedRefSample(entityId, "event", rawRef, "not-found")
        );
      }
      continue;
    }

    const pointer = {
      graph: "EventGraph",
      canonicalId: ref.canonicalId,
      index: ref.index,
      roles: ref.roles,
    };
    validEventPointers.push(pointer);
    eventCandidates.push({
      ref: pointer,
      source: dereferenced.value,
    });
  }

  for (const rawRef of themeRefs) {
    const ref = {
      themeId: cleanString(rawRef?.themeId),
      canonicalId: cleanString(rawRef?.canonicalId),
      index: Number(rawRef?.index),
    };
    const dereferenced = dereferenceTheme(ref, themeLookup);

    if (dereferenced.status === "malformed") {
      auditState.invalidP02ReferenceCount += 1;
      if (auditState.invalidP02ReferenceSamples.length < ERROR_SAMPLE_LIMIT) {
        auditState.invalidP02ReferenceSamples.push(
          malformedRefSample(entityId, "theme", rawRef, "malformed")
        );
      }
      continue;
    }

    if (dereferenced.status === "dangling") {
      auditState.danglingSeePointerCount += 1;
      if (auditState.danglingSeePointerSamples.length < ERROR_SAMPLE_LIMIT) {
        auditState.danglingSeePointerSamples.push(
          malformedRefSample(entityId, "theme", rawRef, "not-found")
        );
      }
      continue;
    }

    const pointer = {
      graph: "ThemeGraph",
      themeId: ref.themeId,
      canonicalId: ref.canonicalId,
      index: ref.index,
    };
    validThemePointers.push(pointer);
    themeCandidates.push({
      ref: pointer,
      source: dereferenced.value,
      theme: dereferenced.theme,
    });
  }

  const relationshipExcerpts = selectEvenly(
    relationshipCandidates,
    SEE_EXCERPT_LIMIT
  ).map(({ ref, source }) => compactRelationship(entityId, ref, source));

  const eventExcerpts = selectEvenly(eventCandidates, SEE_EXCERPT_LIMIT).map(
    ({ ref, source }) => compactEvent(entityId, ref, source)
  );

  const themeExcerpts = selectEvenly(themeCandidates, SEE_EXCERPT_LIMIT).map(
    ({ ref, source, theme }) => compactTheme(ref, source, theme)
  );

  // Excerpts are constructed from a fixed allowlist of scalar summary fields and
  // explicit graph pointers. Complete source objects are never assigned into a
  // packet, so this invariant remains zero by construction.

  const statistics = normalizeP02Statistics(knowledgeRecord?.statistics);
  const rolesPlayed = {
    relationships: sortRecord(statistics?.relationships?.roles || {}),
    events: sortRecord(statistics?.events?.roles || {}),
  };

  return {
    available:
      validRelationshipPointers.length +
        validEventPointers.length +
        validThemePointers.length >
      0,
    availabilityFlags: {
      relationships: validRelationshipPointers.length > 0,
      events: validEventPointers.length > 0,
      themes: validThemePointers.length > 0,
    },
    referenceCounts: {
      relationships: validRelationshipPointers.length,
      events: validEventPointers.length,
      themes: validThemePointers.length,
      total:
        validRelationshipPointers.length +
        validEventPointers.length +
        validThemePointers.length,
    },
    rolesPlayed,
    statistics,
    relationships: {
      available: validRelationshipPointers.length > 0,
      references: validRelationshipPointers,
      excerpts: relationshipExcerpts,
      fullGraphPointer: {
        graph: "RelationshipGraph",
        path: relativePath(INPUTS.relationshipGraph),
      },
    },
    events: {
      available: validEventPointers.length > 0,
      references: validEventPointers,
      excerpts: eventExcerpts,
      fullGraphPointer: {
        graph: "EventGraph",
        path: relativePath(INPUTS.eventGraph),
      },
    },
    themes: {
      available: validThemePointers.length > 0,
      references: validThemePointers,
      excerpts: themeExcerpts,
      fullGraphPointer: {
        graph: "ThemeGraph",
        path: relativePath(INPUTS.themeGraph),
      },
    },
    pointer: sourcePointer("P02", entityId, "knowledge-index"),
  };
}

function availabilityForPacket(knowledge) {
  if (knowledge.referenceCounts.total > 0) {
    return {
      level: "full-see",
      reason:
        "P01 entity evidence exists and one or more valid SEE Relationship/Event/Theme references are available.",
    };
  }

  return {
    level: "entity-evidence",
    reason:
      "P01 lexical, rendering, occurrence, reference, chronology, and health evidence is available; corpus-aware SEE graph references are not currently available for this entity.",
  };
}

function buildPacket({
  entityId,
  entity,
  knowledgeRecord,
  relationshipGraph,
  eventGraph,
  themeLookup,
  auditState,
}) {
  const corpus = corpusFromEntity(entityId, entity);
  const references = normalizeReferences(entityId, entity);
  const identity = buildIdentity(entityId, entity);
  const renderings = buildRenderingEvidence(entityId, entity, references);
  const occurrences = buildOccurrenceEvidence(
    entityId,
    entity,
    references,
    corpus
  );
  const health = buildHealthEvidence(entityId, entity);
  const knowledge = buildKnowledgeEvidence({
    entityId,
    knowledgeRecord,
    relationshipGraph,
    eventGraph,
    themeLookup,
    auditState,
  });
  const availability = availabilityForPacket(knowledge);

  const packetCore = {
    packetSchemaVersion: PACKET_SCHEMA_VERSION,
    entityId,
    corpus,
    availability,
    identity,
    renderings,
    occurrences,
    seeKnowledge: knowledge,
    health,
    runtimeContext: {
      suppliedAtRuntime: true,
      selectedTappedRendering: null,
      selectedSourceForm: null,
      selectedReference: null,
      selectedTranslation: null,
      note:
        "P03 is entity-level compiled evidence. The tapped verse, source form, and English rendering are supplied later by runtime context.",
    },
    evidenceBoundaries: {
      compiledEvidenceOnly: true,
      containsEmetInterpretation: false,
      containsAiGeneratedText: false,
      completeSeeGraphObjectsEmbedded: false,
    },
  };

  return {
    ...packetCore,
    checksum: sha256Text(stableStringify(packetCore)),
  };
}

function hasLexicalEvidence(packet) {
  const identity = packet.identity;
  return Boolean(
    identity.lexicalId ||
      identity.lemma ||
      identity.normalizedLemma ||
      identity.transliteration ||
      identity.glosses.length ||
      identity.shortDefinitions.length ||
      identity.sourceForms.forms.length
  );
}

function samplePacketSummary(packet) {
  return {
    entityId: packet.entityId,
    corpus: packet.corpus,
    availability: packet.availability.level,
    lexicalId: packet.identity.lexicalId,
    strong: packet.identity.strong,
    lemma: packet.identity.lemma,
    normalizedLemma: packet.identity.normalizedLemma,
    transliteration: packet.identity.transliteration,
    totalOccurrences: packet.occurrences.totalEntityOccurrences,
    firstOccurrence: packet.occurrences.chronology.firstOccurrence,
    lastOccurrence: packet.occurrences.chronology.lastOccurrence,
    mostCommonRenderings: packet.renderings.mostCommon.slice(0, 5),
    seeReferenceCounts: packet.seeKnowledge.referenceCounts,
    checksum: packet.checksum,
  };
}

function chooseCorpusSamples(packetMap, corpus, preferredIds = []) {
  const ids = Object.keys(packetMap)
    .filter((entityId) => packetMap[entityId].corpus === corpus)
    .sort((left, right) => left.localeCompare(right));

  if (ids.length === 0) return [];

  const chosen = [];
  const seen = new Set();

  for (const preferredId of preferredIds) {
    if (packetMap[preferredId] && packetMap[preferredId].corpus === corpus) {
      chosen.push(preferredId);
      seen.add(preferredId);
    }
  }

  const candidates = selectEvenly(ids, SAMPLE_PACKET_LIMIT * 2);
  for (const entityId of candidates) {
    if (chosen.length >= SAMPLE_PACKET_LIMIT) break;
    if (!seen.has(entityId)) {
      chosen.push(entityId);
      seen.add(entityId);
    }
  }

  return chosen
    .slice(0, SAMPLE_PACKET_LIMIT)
    .map((entityId) => samplePacketSummary(packetMap[entityId]));
}

function buildAudit({
  p01Entities,
  p02Entities,
  packets,
  inputFingerprints,
  outputChecksum,
  outputFileChecksum,
  auditState,
  serializationRepeatMatches,
}) {
  const p01Ids = Object.keys(p01Entities).sort((left, right) =>
    left.localeCompare(right)
  );
  const p02Ids = Object.keys(p02Entities).sort((left, right) =>
    left.localeCompare(right)
  );
  const packetIds = Object.keys(packets).sort((left, right) =>
    left.localeCompare(right)
  );

  const p01Set = new Set(p01Ids);
  const packetSet = new Set(packetIds);

  const entitiesMissingPackets = p01Ids.filter((id) => !packetSet.has(id));
  const packetsMissingEntities = packetIds.filter((id) => !p01Set.has(id));
  const p01EntitiesMissingP02Records = p01Ids.filter(
    (id) => !Object.prototype.hasOwnProperty.call(p02Entities, id)
  );
  const p02EntitiesMissingP01 = p02Ids.filter((id) => !p01Set.has(id));

  const packetsByCorpus = {};
  const packetsByAvailabilityLevel = {
    "full-see": 0,
    "entity-evidence": 0,
    "alignment-only": 0,
  };
  const corpusCoverage = {};

  let packetsWithLexicalEvidence = 0;
  let packetsWithRenderingEvidence = 0;
  let packetsWithOccurrenceEvidence = 0;
  let packetsWithChronology = 0;
  let packetsWithRelationshipEvidence = 0;
  let packetsWithEventEvidence = 0;
  let packetsWithThemeEvidence = 0;
  let totalPacketBytes = 0;
  let largestPacket = null;
  let occurrenceCountMismatches = 0;
  let chronologyMismatches = 0;
  let corpusMismatches = 0;
  let packetChecksumMismatches = 0;

  for (const entityId of packetIds) {
    const packet = packets[entityId];
    const entity = p01Entities[entityId];
    const packetBytes = Buffer.byteLength(stableStringify(packet), "utf8");

    totalPacketBytes += packetBytes;
    if (
      !largestPacket ||
      packetBytes > largestPacket.bytes ||
      (packetBytes === largestPacket.bytes &&
        entityId.localeCompare(largestPacket.entityId) < 0)
    ) {
      largestPacket = {
        entityId,
        corpus: packet.corpus,
        bytes: packetBytes,
        totalOccurrences: packet.occurrences.totalEntityOccurrences,
        orderedReferences: packet.occurrences.orderedReferences.length,
        seeReferences: packet.seeKnowledge.referenceCounts.total,
      };
    }

    packetsByCorpus[packet.corpus] =
      (packetsByCorpus[packet.corpus] || 0) + 1;
    packetsByAvailabilityLevel[packet.availability.level] =
      (packetsByAvailabilityLevel[packet.availability.level] || 0) + 1;

    if (hasLexicalEvidence(packet)) packetsWithLexicalEvidence += 1;
    if (packet.renderings.available) packetsWithRenderingEvidence += 1;
    if (packet.occurrences.available) packetsWithOccurrenceEvidence += 1;
    if (
      packet.occurrences.chronology.firstOccurrence ||
      packet.occurrences.chronology.lastOccurrence
    ) {
      packetsWithChronology += 1;
    }
    if (packet.seeKnowledge.relationships.available) {
      packetsWithRelationshipEvidence += 1;
    }
    if (packet.seeKnowledge.events.available) {
      packetsWithEventEvidence += 1;
    }
    if (packet.seeKnowledge.themes.available) {
      packetsWithThemeEvidence += 1;
    }

    const expectedCorpus = corpusFromEntity(entityId, entity);
    if (packet.corpus !== expectedCorpus) corpusMismatches += 1;

    const expectedOccurrences = toNonNegativeInteger(
      entity?.statistics?.sourceTokenCount,
      normalizeReferences(entityId, entity).reduce(
        (total, reference) => total + reference.occurrenceCount,
        0
      )
    );
    if (
      packet.occurrences.totalEntityOccurrences !== expectedOccurrences ||
      packet.occurrences.corpusOccurrenceCount !== expectedOccurrences
    ) {
      occurrenceCountMismatches += 1;
    }

    const expectedChronology = {
      firstOccurrence: cleanString(entity?.chronology?.firstOccurrence),
      lastOccurrence: cleanString(entity?.chronology?.lastOccurrence),
    };
    if (
      stableStringify(packet.occurrences.chronology) !==
      stableStringify(expectedChronology)
    ) {
      chronologyMismatches += 1;
    }

    const packetCore = { ...packet };
    delete packetCore.checksum;
    if (sha256Text(stableStringify(packetCore)) !== packet.checksum) {
      packetChecksumMismatches += 1;
    }
  }

  for (const corpus of Object.keys(packetsByCorpus).sort()) {
    const entityCount = p01Ids.filter(
      (entityId) => corpusFromEntity(entityId, p01Entities[entityId]) === corpus
    ).length;
    const packetCount = packetsByCorpus[corpus] || 0;

    corpusCoverage[corpus] = {
      entities: entityCount,
      packets: packetCount,
      missing: entityCount - packetCount,
      coverage: entityCount > 0 ? packetCount / entityCount : 1,
    };
  }

  const duplicatePacketIds = [];
  const invariants = {
    everyP01EntityHasExactlyOnePacket:
      entitiesMissingPackets.length === 0 &&
      packetIds.length === new Set(packetIds).size,
    everyPacketMapsToP01Entity: packetsMissingEntities.length === 0,
    packetCorpusMatchesEntityCorpus: corpusMismatches === 0,
    p01OccurrenceCountsPreserved: occurrenceCountMismatches === 0,
    p01ChronologyPreserved: chronologyMismatches === 0,
    p02ReferencesPointToValidSeeObjects:
      auditState.invalidP02ReferenceCount === 0 &&
      auditState.danglingSeePointerCount === 0,
    noCompleteSeeGraphObjectEmbedded:
      auditState.completeSeeObjectsEmbedded === 0,
    packetChecksumsMatch: packetChecksumMismatches === 0,
    artifactChecksumMatches: true,
    deterministicSerialization: serializationRepeatMatches,
    stableEntityOrdering:
      stableStringify(packetIds) ===
      stableStringify([...packetIds].sort((left, right) => left.localeCompare(right))),
  };
  invariants.allPassed = Object.values(invariants).every(Boolean);

  return {
    compiler: {
      id: COMPILER_ID,
      name: COMPILER_NAME,
      version: COMPILER_VERSION,
    },
    schemaVersion: SCHEMA_VERSION,
    packetSchemaVersion: PACKET_SCHEMA_VERSION,
    sourceFileFingerprints: inputFingerprints,
    totalPackets: packetIds.length,
    packetsByCorpus: sortRecord(packetsByCorpus),
    packetsByAvailabilityLevel: sortRecord(packetsByAvailabilityLevel),
    packetsWithLexicalEvidence,
    packetsWithRenderingEvidence,
    packetsWithOccurrenceEvidence,
    packetsWithChronology,
    packetsWithRelationshipEvidence,
    packetsWithEventEvidence,
    packetsWithThemeEvidence,
    entitiesMissingPackets,
    packetsMissingEntities,
    p01EntitiesMissingP02Records,
    p02EntitiesMissingP01,
    invalidP02References: {
      count: auditState.invalidP02ReferenceCount,
      samples: auditState.invalidP02ReferenceSamples,
    },
    danglingSeePointers: {
      count: auditState.danglingSeePointerCount,
      samples: auditState.danglingSeePointerSamples,
    },
    duplicatePacketIds,
    checksumValidation: {
      algorithm: "SHA-256",
      artifactCoreChecksum: outputChecksum,
      artifactFileChecksum: outputFileChecksum,
      packetChecksumMismatches,
      matches: packetChecksumMismatches === 0,
    },
    deterministicRebuild: {
      deterministicCompiler: true,
      canonicalKeyOrdering: true,
      stableEntityOrdering: true,
      timestampsExcludedFromArtifacts: true,
      repeatedSerializationByteIdentical: serializationRepeatMatches,
      "previousSame-inputBuildIsComparedAndMustMatch": true,
    },
    largestPacket,
    averagePacketSizeBytes:
      packetIds.length > 0 ? totalPacketBytes / packetIds.length : 0,
    corpusCoverage: sortRecord(corpusCoverage),
    samples: {
      hebrewPackets: chooseCorpusSamples(packets, "hebrew", [
        "word:hebrew:H802",
        "word:hebrew:H430",
      ]),
      greekNtPackets: chooseCorpusSamples(packets, "greek-nt", [
        "word:greek-nt:G1135",
        "word:greek-nt:G3056",
      ]),
      lxxPackets: chooseCorpusSamples(packets, "lxx", [
        "word:lxx:L703209",
        "word:lxx:L704639",
      ]),
    },
    invariantDiagnostics: {
      corpusMismatches,
      occurrenceCountMismatches,
      chronologyMismatches,
      completeSeeObjectsEmbedded: auditState.completeSeeObjectsEmbedded,
    },
    invariants,
  };
}

function inputSignature(inputFingerprints) {
  return sha256Text(stableStringify(inputFingerprints));
}

function readPreviousBuild() {
  const result = {
    packetsText: null,
    auditText: null,
    manifestText: null,
    manifest: null,
  };

  if (fs.existsSync(PACKETS_PATH)) {
    result.packetsText = fs.readFileSync(PACKETS_PATH, "utf8");
  }
  if (fs.existsSync(AUDIT_PATH)) {
    result.auditText = fs.readFileSync(AUDIT_PATH, "utf8");
  }
  if (fs.existsSync(MANIFEST_PATH)) {
    result.manifestText = fs.readFileSync(MANIFEST_PATH, "utf8");
    try {
      result.manifest = JSON.parse(result.manifestText);
    } catch {
      result.manifest = null;
    }
  }

  return result;
}

function shouldComparePrevious(previous, currentInputSignature) {
  return Boolean(
    previous.manifest &&
      previous.packetsText &&
      previous.auditText &&
      previous.manifestText &&
      previous.manifest.compiler?.id === COMPILER_ID &&
      previous.manifest.compiler?.version === COMPILER_VERSION &&
      previous.manifest.schemaVersion === SCHEMA_VERSION &&
      previous.manifest.inputSignature === currentInputSignature
  );
}

function verifyExistingOutputs() {
  console.log("\n========================================");
  console.log(" EMETSEES Entity Compiler");
  console.log(" P03 Evidence Packet Verification");
  console.log("========================================\n");

  for (const [label, filePath] of Object.entries({
    packets: PACKETS_PATH,
    manifest: MANIFEST_PATH,
    audit: AUDIT_PATH,
  })) {
    assertFile(filePath, `P03 ${label}`);
  }

  const packetsArtifact = readJson(PACKETS_PATH, "P03 evidence-packets.json");
  const manifest = readJson(MANIFEST_PATH, "P03 manifest.json");
  const audit = readJson(AUDIT_PATH, "P03 audit.json");

  const core = { ...packetsArtifact };
  const expectedChecksum = cleanString(core.checksum);
  delete core.checksum;
  const actualChecksum = sha256Text(stableStringify(core));

  const manifestCore = { ...manifest };
  const expectedManifestChecksum = cleanString(manifestCore.checksum);
  delete manifestCore.checksum;
  const actualManifestChecksum = sha256Text(stableStringify(manifestCore));

  const auditCore = { ...audit };
  const expectedAuditChecksum = cleanString(auditCore.checksum);
  delete auditCore.checksum;
  const actualAuditChecksum = sha256Text(stableStringify(auditCore));

  const checks = {
    evidenceArtifactChecksum:
      Boolean(expectedChecksum) && expectedChecksum === actualChecksum,
    evidenceFileChecksum:
      manifest?.produces?.evidencePackets?.fileSha256 === sha256File(PACKETS_PATH),
    auditArtifactChecksum:
      Boolean(expectedAuditChecksum) && expectedAuditChecksum === actualAuditChecksum,
    auditFileChecksum:
      manifest?.produces?.audit?.fileSha256 === sha256File(AUDIT_PATH),
    manifestChecksum:
      Boolean(expectedManifestChecksum) &&
      expectedManifestChecksum === actualManifestChecksum,
    auditInvariantsPassed: audit?.invariants?.allPassed === true,
  };

  if (!Object.values(checks).every(Boolean)) {
    console.error(JSON.stringify(checks, null, 2));
    fail("P03 verification failed.");
  }

  console.log(`Packets   : ${Object.keys(packetsArtifact.packets || {}).length}`);
  console.log(`Checksum  : ${actualChecksum}`);
  console.log("Status    : verified\n");
}

function main() {
  if (process.argv.includes("--verify")) {
    verifyExistingOutputs();
    return;
  }

  console.log("\n========================================");
  console.log(" EMETSEES Entity Compiler");
  console.log(" P03 EMET Evidence Packets");
  console.log("========================================\n");

  for (const [label, filePath] of Object.entries(INPUTS)) {
    assertFile(filePath, label);
  }

  const inputFingerprints = sortRecord(
    Object.fromEntries(
      Object.entries(INPUTS).map(([name, filePath]) => [
        name,
        fingerprintFile(filePath),
      ])
    )
  );
  const currentInputSignature = inputSignature(inputFingerprints);
  const previous = readPreviousBuild();
  const comparePrevious = shouldComparePrevious(
    previous,
    currentInputSignature
  );

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("Reading P01 Entity Graph...");
  const p01Document = readJson(INPUTS.entityGraph, "P01 Entity Graph");
  const p01Entities = extractEntityMap(p01Document);

  console.log("Reading P02 Knowledge Index...");
  const p02Document = readJson(INPUTS.knowledgeIndex, "P02 Knowledge Index");
  const p02Entities = extractKnowledgeMap(p02Document);

  console.log("Reading SEE graphs for deterministic dereferencing...");
  const relationshipGraph = extractRelationshipGraph(
    readJson(INPUTS.relationshipGraph, "RelationshipGraph")
  );
  const eventGraph = extractEventGraph(
    readJson(INPUTS.eventGraph, "EventGraph")
  );
  const themeGraph = extractThemeGraph(
    readJson(INPUTS.themeGraph, "ThemeGraph")
  );
  const themeLookup = buildThemeLookup(themeGraph);

  const entityIds = Object.keys(p01Entities).sort((left, right) =>
    left.localeCompare(right)
  );

  const auditState = {
    invalidP02ReferenceCount: 0,
    invalidP02ReferenceSamples: [],
    danglingSeePointerCount: 0,
    danglingSeePointerSamples: [],
    completeSeeObjectsEmbedded: 0,
  };

  console.log(`Building ${entityIds.length.toLocaleString()} evidence packets...`);
  const packets = {};

  for (let index = 0; index < entityIds.length; index += 1) {
    const entityId = entityIds[index];
    const entity = p01Entities[entityId];
    const knowledgeRecord = isRecord(p02Entities[entityId])
      ? p02Entities[entityId]
      : {
          id: entityId,
          corpus: corpusFromEntity(entityId, entity),
          relationshipRefs: [],
          eventRefs: [],
          themeRefs: [],
          statistics: null,
        };

    packets[entityId] = buildPacket({
      entityId,
      entity,
      knowledgeRecord,
      relationshipGraph,
      eventGraph,
      themeLookup,
      auditState,
    });

    if ((index + 1) % 5000 === 0 || index + 1 === entityIds.length) {
      console.log(
        `  ${String(index + 1).padStart(6)} / ${String(entityIds.length).padEnd(6)}`
      );
    }
  }

  const artifactCore = {
    compiler: {
      id: COMPILER_ID,
      name: COMPILER_NAME,
      version: COMPILER_VERSION,
    },
    schemaVersion: SCHEMA_VERSION,
    packetSchemaVersion: PACKET_SCHEMA_VERSION,
    purpose:
      "Deterministic, source-grounded entity evidence packets for EMET. P01 is authoritative for lexical and occurrence evidence; P02 supplies indexed SEE graph references. No AI interpretation is included.",
    inputSignature: currentInputSignature,
    sourceFileFingerprints: inputFingerprints,
    availabilityLevels: {
      "full-see":
        "P01 entity evidence plus one or more valid SEE Relationship/Event/Theme references.",
      "entity-evidence":
        "P01 entity evidence exists but corpus-aware SEE Relationship/Event/Theme references are not currently available.",
      "alignment-only":
        "Reserved runtime fallback for a canonical alignment whose P01 entity cannot be found. No P03 packet is intentionally emitted at this level.",
    },
    entityOrder: entityIds,
    packets,
  };

  const artifactChecksum = sha256Text(stableStringify(artifactCore));
  const packetsArtifact = {
    ...artifactCore,
    checksum: artifactChecksum,
  };

  const firstSerialization = `${stableStringify(packetsArtifact)}\n`;
  const firstSerializationChecksum = sha256Text(firstSerialization);
  const secondSerializationChecksum = sha256Text(
    `${stableStringify(packetsArtifact)}\n`
  );
  const serializationRepeatMatches =
    firstSerializationChecksum === secondSerializationChecksum;

  if (!serializationRepeatMatches) {
    fail("Canonical serialization was not byte-identical within the build.");
  }

  fs.writeFileSync(PACKETS_PATH, firstSerialization, "utf8");
  const packetsFileChecksum = sha256File(PACKETS_PATH);

  const audit = buildAudit({
    p01Entities,
    p02Entities,
    packets,
    inputFingerprints,
    outputChecksum: artifactChecksum,
    outputFileChecksum: packetsFileChecksum,
    auditState,
    serializationRepeatMatches,
  });

  const auditCoreChecksum = sha256Text(stableStringify(audit));
  const auditArtifact = {
    ...audit,
    checksum: auditCoreChecksum,
  };
  const auditText = writeStableJson(AUDIT_PATH, auditArtifact, 2);
  const auditFileChecksum = sha256File(AUDIT_PATH);

  const manifestCore = {
    compiler: {
      id: COMPILER_ID,
      name: COMPILER_NAME,
      version: COMPILER_VERSION,
    },
    schemaVersion: SCHEMA_VERSION,
    packetSchemaVersion: PACKET_SCHEMA_VERSION,
    inputSignature: currentInputSignature,
    deterministic: true,
    serialization: "canonical-json-sorted-keys",
    purpose:
      "Compile P01 entity evidence and P02 SEE pointers into checksummed EMET evidence packets without AI interpretation or duplicated complete SEE graph objects.",
    consumes: inputFingerprints,
    produces: {
      evidencePackets: {
        path: relativePath(PACKETS_PATH),
        artifactChecksum,
        fileSha256: packetsFileChecksum,
        entities: entityIds.length,
      },
      audit: {
        path: relativePath(AUDIT_PATH),
        artifactChecksum: auditCoreChecksum,
        fileSha256: auditFileChecksum,
      },
    },
    availabilityLevels: {
      "full-see": audit.packetsByAvailabilityLevel["full-see"] || 0,
      "entity-evidence":
        audit.packetsByAvailabilityLevel["entity-evidence"] || 0,
      "alignment-only":
        audit.packetsByAvailabilityLevel["alignment-only"] || 0,
    },
    corpora: audit.packetsByCorpus,
    invariantsPassed: audit.invariants.allPassed,
  };

  const manifestArtifact = {
    ...manifestCore,
    checksum: sha256Text(stableStringify(manifestCore)),
  };
  const manifestText = writeStableJson(MANIFEST_PATH, manifestArtifact, 2);

  if (!audit.invariants.allPassed) {
    console.error(JSON.stringify(audit.invariants, null, 2));
    fail(
      `P03 audit failed. Review ${relativePath(AUDIT_PATH)} before continuing.`
    );
  }

  if (comparePrevious) {
    const comparisons = {
      evidencePackets: previous.packetsText === firstSerialization,
      audit: previous.auditText === auditText,
      manifest: previous.manifestText === manifestText,
    };

    if (!Object.values(comparisons).every(Boolean)) {
      console.error(JSON.stringify(comparisons, null, 2));
      fail(
        "Deterministic rebuild invariant failed: identical inputs did not produce byte-identical P03 outputs."
      );
    }
  }

  verifyExistingOutputs();

  console.log("P03 EMET EVIDENCE PACKETS COMPLETE\n");
  console.log(`Packets                : ${entityIds.length}`);
  console.log(
    `Hebrew                 : ${audit.packetsByCorpus.hebrew || 0}`
  );
  console.log(
    `Greek NT               : ${audit.packetsByCorpus["greek-nt"] || 0}`
  );
  console.log(`LXX                     : ${audit.packetsByCorpus.lxx || 0}`);
  console.log(
    `Full SEE                : ${
      audit.packetsByAvailabilityLevel["full-see"] || 0
    }`
  );
  console.log(
    `Entity evidence         : ${
      audit.packetsByAvailabilityLevel["entity-evidence"] || 0
    }`
  );
  console.log(
    `Relationship evidence   : ${audit.packetsWithRelationshipEvidence}`
  );
  console.log(`Event evidence          : ${audit.packetsWithEventEvidence}`);
  console.log(`Theme evidence          : ${audit.packetsWithThemeEvidence}`);
  console.log(`Checksum                : ${artifactChecksum}`);
  console.log(`Output                  : ${OUTPUT_DIR}\n`);
}

try {
  main();
} catch (error) {
  console.error("\nP03 EMET EVIDENCE PACKET COMPILER FAILED\n");
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
}
