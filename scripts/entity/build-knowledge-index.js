"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const COMPILER_ID = "P02";
const COMPILER_NAME = "EMETSEES Knowledge Index";
const COMPILER_VERSION = "0.1.0";
const SCHEMA_VERSION = "1.0.0";

const INPUTS = {
  entityGraph: path.join(
    ROOT,
    ".private",
    "entity",
    "build",
    "P01",
    "entities.json"
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
const KNOWLEDGE_PATH = path.join(OUTPUT_DIR, "knowledge-index.json");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");
const AUDIT_PATH = path.join(OUTPUT_DIR, "audit.json");

const SAMPLE_LIMIT = 100;

function fail(message) {
  throw new Error(message);
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

function relativePath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
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

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath) {
  return sha256Text(fs.readFileSync(filePath));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sortRecord(record) {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
  );
}

function sortedStrings(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function increment(record, key, amount = 1) {
  const normalizedKey = String(key || "unknown");
  record[normalizedKey] = (record[normalizedKey] || 0) + amount;
}

function addSample(set, value) {
  if (value == null || set.size >= SAMPLE_LIMIT * 4) return;
  set.add(String(value));
}

function extractEntityMap(document) {
  const data = document && document.data ? document.data : document;
  const entities = data && data.entities ? data.entities : data;

  if (!entities || typeof entities !== "object" || Array.isArray(entities)) {
    fail("P01 entities.json does not contain an entity object map.");
  }

  return entities;
}

function extractRelationshipGraph(document) {
  const data = document && document.data ? document.data : document;
  const graph =
    (data && data.relationshipGraph) ||
    (data && data.relationships) ||
    (data && data.byVerse) ||
    data;

  if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
    fail("RelationshipGraph index.json does not contain a relationship graph map.");
  }

  return graph;
}

function extractEventGraph(document) {
  const data = document && document.data ? document.data : document;
  const graph =
    (data && data.eventGraph) ||
    (data && data.events) ||
    (data && data.byVerse) ||
    data;

  if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
    fail("EventGraph index.json does not contain an event graph map.");
  }

  return graph;
}

function extractThemeGraph(document) {
  const data = document && document.data ? document.data : document;
  const graph = (data && data.themeGraph) || (data && data.themes) || data;

  if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
    fail("ThemeGraph index.json does not contain a theme graph map.");
  }

  return graph;
}

function toP01EntityId(rawEntityId, knownEntityIds) {
  if (typeof rawEntityId !== "string") return null;

  const value = rawEntityId.trim();
  if (!value) return null;

  if (knownEntityIds.has(value)) return value;

  if (!value.startsWith("word:")) {
    const candidate = `word:${value}`;
    if (knownEntityIds.has(candidate)) return candidate;
  }

  return null;
}

function corpusFromEntityId(entityId, entity) {
  if (entity && typeof entity.corpus === "string" && entity.corpus) {
    return entity.corpus;
  }

  const match = /^word:([^:]+):/.exec(entityId);
  return match ? match[1] : "unknown";
}

function createInternalEntity(id, corpus) {
  return {
    id,
    corpus,
    relationshipRefs: [],
    eventRefs: [],
    themeRefs: [],
    internal: {
      relationshipCanonicalIds: new Set(),
      relationshipCounterparts: new Set(),
      relationshipRoles: {},
      relationshipConfidence: {},
      relationshipMethods: {},
      eventCanonicalIds: new Set(),
      eventTypes: new Set(),
      eventRoles: {},
      eventConfidence: {},
      eventMethods: {},
      themeCanonicalIds: new Set(),
      themeIds: new Set(),
    },
  };
}

function rolesForRelationship(relationship, knownEntityIds, audit) {
  const byEntity = new Map();
  const roleFields = ["subject", "predicate", "object"];

  for (const role of roleFields) {
    const rawEntityId = relationship ? relationship[role] : null;
    if (rawEntityId == null) continue;

    const entityId = toP01EntityId(rawEntityId, knownEntityIds);
    if (!entityId) {
      audit.dangling.relationshipMentions += 1;
      addSample(audit.samples.relationshipEntityIds, rawEntityId);
      continue;
    }

    if (!byEntity.has(entityId)) byEntity.set(entityId, new Set());
    byEntity.get(entityId).add(role);
  }

  return byEntity;
}

function rolesForEvent(event, knownEntityIds, audit) {
  const byEntity = new Map();
  const participants = Array.isArray(event && event.participants)
    ? event.participants
    : [];

  if (participants.length > 0) {
    for (const participant of participants) {
      const rawEntityId = participant && participant.entityId;
      if (rawEntityId == null) continue;

      const entityId = toP01EntityId(rawEntityId, knownEntityIds);
      if (!entityId) {
        audit.dangling.eventMentions += 1;
        addSample(audit.samples.eventEntityIds, rawEntityId);
        continue;
      }

      const role =
        participant && typeof participant.role === "string" && participant.role
          ? participant.role
          : "participant";

      if (!byEntity.has(entityId)) byEntity.set(entityId, new Set());
      byEntity.get(entityId).add(role);
    }

    return byEntity;
  }

  // Compatibility with event objects that expose direct subject/predicate/object
  // fields instead of a participants array.
  for (const role of ["subject", "predicate", "object"]) {
    const rawEntityId = event ? event[role] : null;
    if (rawEntityId == null) continue;

    const entityId = toP01EntityId(rawEntityId, knownEntityIds);
    if (!entityId) {
      audit.dangling.eventMentions += 1;
      addSample(audit.samples.eventEntityIds, rawEntityId);
      continue;
    }

    if (!byEntity.has(entityId)) byEntity.set(entityId, new Set());
    byEntity.get(entityId).add(role);
  }

  return byEntity;
}

function addRelationshipRef({
  knowledge,
  relationship,
  canonicalId,
  index,
  entityRoles,
}) {
  const participants = [...entityRoles.keys()];

  for (const [entityId, roleSet] of entityRoles.entries()) {
    const entry = knowledge.get(entityId);
    const roles = sortedStrings([...roleSet]);

    entry.relationshipRefs.push({
      canonicalId,
      index,
      roles,
    });

    entry.internal.relationshipCanonicalIds.add(canonicalId);
    for (const role of roles) increment(entry.internal.relationshipRoles, role);
    increment(entry.internal.relationshipConfidence, relationship.confidence);
    increment(entry.internal.relationshipMethods, relationship.method);

    for (const participantId of participants) {
      if (participantId !== entityId) {
        entry.internal.relationshipCounterparts.add(participantId);
      }
    }
  }
}

function addEventRef({ knowledge, event, canonicalId, index, entityRoles }) {
  for (const [entityId, roleSet] of entityRoles.entries()) {
    const entry = knowledge.get(entityId);
    const roles = sortedStrings([...roleSet]);

    entry.eventRefs.push({
      canonicalId,
      index,
      roles,
    });

    entry.internal.eventCanonicalIds.add(canonicalId);
    entry.internal.eventTypes.add(String(event.type || "unknown"));
    for (const role of roles) increment(entry.internal.eventRoles, role);
    increment(entry.internal.eventConfidence, event.confidence);
    increment(entry.internal.eventMethods, event.method);
  }
}

function eventLookupKey(canonicalId, eventType) {
  return `${canonicalId}\u0000${eventType || "*"}`;
}

function addToEventLookup(eventLookup, canonicalId, eventType, entityIds) {
  const exactKey = eventLookupKey(canonicalId, eventType || "unknown");
  const wildcardKey = eventLookupKey(canonicalId, "*");

  for (const key of [exactKey, wildcardKey]) {
    if (!eventLookup.has(key)) eventLookup.set(key, new Set());
    const target = eventLookup.get(key);
    for (const entityId of entityIds) target.add(entityId);
  }
}

function finalizeEntity(entry) {
  const relationshipRefs = entry.relationshipRefs.sort((left, right) => {
    return (
      left.canonicalId.localeCompare(right.canonicalId) ||
      left.index - right.index ||
      left.roles.join("|").localeCompare(right.roles.join("|"))
    );
  });

  const eventRefs = entry.eventRefs.sort((left, right) => {
    return (
      left.canonicalId.localeCompare(right.canonicalId) ||
      left.index - right.index ||
      left.roles.join("|").localeCompare(right.roles.join("|"))
    );
  });

  const themeRefs = entry.themeRefs.sort((left, right) => {
    return (
      left.themeId.localeCompare(right.themeId) ||
      left.index - right.index ||
      left.canonicalId.localeCompare(right.canonicalId)
    );
  });

  const statistics = {
    relationships: {
      references: relationshipRefs.length,
      verses: entry.internal.relationshipCanonicalIds.size,
      counterpartEntities: entry.internal.relationshipCounterparts.size,
      roles: sortRecord(entry.internal.relationshipRoles),
      confidence: sortRecord(entry.internal.relationshipConfidence),
      methods: sortRecord(entry.internal.relationshipMethods),
    },
    events: {
      references: eventRefs.length,
      verses: entry.internal.eventCanonicalIds.size,
      types: entry.internal.eventTypes.size,
      roles: sortRecord(entry.internal.eventRoles),
      confidence: sortRecord(entry.internal.eventConfidence),
      methods: sortRecord(entry.internal.eventMethods),
    },
    themes: {
      references: themeRefs.length,
      verses: entry.internal.themeCanonicalIds.size,
      themes: entry.internal.themeIds.size,
    },
    totalKnowledgeRefs:
      relationshipRefs.length + eventRefs.length + themeRefs.length,
  };

  return {
    id: entry.id,
    corpus: entry.corpus,
    relationshipRefs,
    eventRefs,
    themeRefs,
    statistics,
  };
}

function buildAuditSkeleton(inputChecksums) {
  return {
    compiler: {
      id: COMPILER_ID,
      name: COMPILER_NAME,
      version: COMPILER_VERSION,
    },
    schemaVersion: SCHEMA_VERSION,
    inputChecksums,
    sourceGraphs: {
      relationships: {
        verses: 0,
        objects: 0,
        entityRefs: 0,
        invalidEntries: 0,
      },
      events: {
        verses: 0,
        objects: 0,
        entityRefs: 0,
        invalidEntries: 0,
      },
      themes: {
        themes: 0,
        occurrences: 0,
        entityRefs: 0,
        unmatchedOccurrences: 0,
        invalidEntries: 0,
      },
    },
    dangling: {
      relationshipMentions: 0,
      eventMentions: 0,
    },
    samples: {
      relationshipEntityIds: new Set(),
      eventEntityIds: new Set(),
      unmatchedThemeOccurrences: new Set(),
      invalidRelationshipEntries: new Set(),
      invalidEventEntries: new Set(),
      invalidThemeEntries: new Set(),
    },
  };
}

function main() {
  console.log("\n========================================");
  console.log(" EMETSEES Entity Compiler");
  console.log(" P02 Knowledge Index");
  console.log("========================================\n");

  for (const [label, filePath] of Object.entries(INPUTS)) {
    assertFile(filePath, label);
  }

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const inputChecksums = sortRecord(
    Object.fromEntries(
      Object.entries(INPUTS).map(([name, filePath]) => [name, sha256File(filePath)])
    )
  );

  console.log("Reading P01 entities...");
  let entityDocument = readJson(INPUTS.entityGraph, "P01 Entity Graph");
  const p01Entities = extractEntityMap(entityDocument);
  const entityIds = Object.keys(p01Entities).sort((left, right) =>
    left.localeCompare(right)
  );
  const knownEntityIds = new Set(entityIds);
  const knowledge = new Map();

  for (const entityId of entityIds) {
    knowledge.set(
      entityId,
      createInternalEntity(
        entityId,
        corpusFromEntityId(entityId, p01Entities[entityId])
      )
    );
  }

  // The P01 graph is not needed after the compact entity registry is created.
  for (const key of Object.keys(p01Entities)) delete p01Entities[key];
  entityDocument = null;

  const auditState = buildAuditSkeleton(inputChecksums);

  console.log("Indexing RelationshipGraph...");
  let relationshipDocument = readJson(
    INPUTS.relationshipGraph,
    "RelationshipGraph"
  );
  let relationshipGraph = extractRelationshipGraph(relationshipDocument);
  const relationshipCanonicalIds = Object.keys(relationshipGraph).sort((left, right) =>
    left.localeCompare(right)
  );
  auditState.sourceGraphs.relationships.verses = relationshipCanonicalIds.length;

  for (const canonicalId of relationshipCanonicalIds) {
    const relationships = relationshipGraph[canonicalId];
    if (!Array.isArray(relationships)) {
      auditState.sourceGraphs.relationships.invalidEntries += 1;
      addSample(
        auditState.samples.invalidRelationshipEntries,
        `${canonicalId}:not-array`
      );
      continue;
    }

    for (let index = 0; index < relationships.length; index += 1) {
      const relationship = relationships[index];
      auditState.sourceGraphs.relationships.objects += 1;

      if (!relationship || typeof relationship !== "object") {
        auditState.sourceGraphs.relationships.invalidEntries += 1;
        addSample(
          auditState.samples.invalidRelationshipEntries,
          `${canonicalId}:${index}`
        );
        continue;
      }

      const entityRoles = rolesForRelationship(
        relationship,
        knownEntityIds,
        auditState
      );
      auditState.sourceGraphs.relationships.entityRefs += entityRoles.size;

      addRelationshipRef({
        knowledge,
        relationship,
        canonicalId,
        index,
        entityRoles,
      });
    }
  }

  relationshipGraph = null;
  relationshipDocument = null;

  console.log("Indexing EventGraph...");
  let eventDocument = readJson(INPUTS.eventGraph, "EventGraph");
  let eventGraph = extractEventGraph(eventDocument);
  const eventCanonicalIds = Object.keys(eventGraph).sort((left, right) =>
    left.localeCompare(right)
  );
  auditState.sourceGraphs.events.verses = eventCanonicalIds.length;
  const eventLookup = new Map();

  for (const canonicalId of eventCanonicalIds) {
    const events = eventGraph[canonicalId];
    if (!Array.isArray(events)) {
      auditState.sourceGraphs.events.invalidEntries += 1;
      addSample(auditState.samples.invalidEventEntries, `${canonicalId}:not-array`);
      continue;
    }

    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      auditState.sourceGraphs.events.objects += 1;

      if (!event || typeof event !== "object") {
        auditState.sourceGraphs.events.invalidEntries += 1;
        addSample(auditState.samples.invalidEventEntries, `${canonicalId}:${index}`);
        continue;
      }

      const entityRoles = rolesForEvent(event, knownEntityIds, auditState);
      auditState.sourceGraphs.events.entityRefs += entityRoles.size;

      addEventRef({
        knowledge,
        event,
        canonicalId,
        index,
        entityRoles,
      });

      addToEventLookup(
        eventLookup,
        canonicalId,
        String(event.type || "unknown"),
        entityRoles.keys()
      );
    }
  }

  eventGraph = null;
  eventDocument = null;

  console.log("Indexing ThemeGraph...");
  const themeDocument = readJson(INPUTS.themeGraph, "ThemeGraph");
  const themeGraph = extractThemeGraph(themeDocument);
  const themeIds = Object.keys(themeGraph).sort((left, right) =>
    left.localeCompare(right)
  );
  auditState.sourceGraphs.themes.themes = themeIds.length;

  for (const themeKey of themeIds) {
    const theme = themeGraph[themeKey];
    if (!theme || typeof theme !== "object") {
      auditState.sourceGraphs.themes.invalidEntries += 1;
      addSample(auditState.samples.invalidThemeEntries, `${themeKey}:not-object`);
      continue;
    }

    const themeId =
      typeof theme.id === "string" && theme.id ? theme.id : themeKey;
    const occurrences = Array.isArray(theme.occurrences) ? theme.occurrences : null;

    if (!occurrences) {
      auditState.sourceGraphs.themes.invalidEntries += 1;
      addSample(auditState.samples.invalidThemeEntries, `${themeId}:no-occurrences`);
      continue;
    }

    for (let index = 0; index < occurrences.length; index += 1) {
      const occurrence = occurrences[index];
      auditState.sourceGraphs.themes.occurrences += 1;

      if (!occurrence || typeof occurrence !== "object") {
        auditState.sourceGraphs.themes.invalidEntries += 1;
        addSample(auditState.samples.invalidThemeEntries, `${themeId}:${index}`);
        continue;
      }

      const canonicalId = String(occurrence.canonicalId || "");
      const eventType = String(occurrence.eventType || "");

      if (!canonicalId) {
        auditState.sourceGraphs.themes.invalidEntries += 1;
        addSample(
          auditState.samples.invalidThemeEntries,
          `${themeId}:${index}:no-canonical-id`
        );
        continue;
      }

      const entitySet = eventType
        ? eventLookup.get(eventLookupKey(canonicalId, eventType))
        : eventLookup.get(eventLookupKey(canonicalId, "*"));

      if (!entitySet || entitySet.size === 0) {
        auditState.sourceGraphs.themes.unmatchedOccurrences += 1;
        addSample(
          auditState.samples.unmatchedThemeOccurrences,
          `${themeId}:${index}:${canonicalId}:${eventType || "*"}`
        );
        continue;
      }

      for (const entityId of [...entitySet].sort((left, right) =>
        left.localeCompare(right)
      )) {
        const entry = knowledge.get(entityId);
        entry.themeRefs.push({
          themeId,
          index,
          canonicalId,
        });
        entry.internal.themeIds.add(themeId);
        entry.internal.themeCanonicalIds.add(canonicalId);
        auditState.sourceGraphs.themes.entityRefs += 1;
      }
    }
  }

  console.log("Finalizing per-entity knowledge records...");
  const finalizedEntities = {};
  const byCorpus = {};
  let entitiesWithRelationships = 0;
  let entitiesWithEvents = 0;
  let entitiesWithThemes = 0;
  let entitiesWithAnyKnowledge = 0;
  let totalRelationshipRefs = 0;
  let totalEventRefs = 0;
  let totalThemeRefs = 0;
  let largestEntity = null;

  for (const entityId of entityIds) {
    const finalized = finalizeEntity(knowledge.get(entityId));
    finalizedEntities[entityId] = finalized;

    const relationshipCount = finalized.relationshipRefs.length;
    const eventCount = finalized.eventRefs.length;
    const themeCount = finalized.themeRefs.length;
    const total = finalized.statistics.totalKnowledgeRefs;

    totalRelationshipRefs += relationshipCount;
    totalEventRefs += eventCount;
    totalThemeRefs += themeCount;
    if (relationshipCount > 0) entitiesWithRelationships += 1;
    if (eventCount > 0) entitiesWithEvents += 1;
    if (themeCount > 0) entitiesWithThemes += 1;
    if (total > 0) entitiesWithAnyKnowledge += 1;

    if (!byCorpus[finalized.corpus]) {
      byCorpus[finalized.corpus] = {
        entities: 0,
        entitiesWithKnowledge: 0,
        relationshipRefs: 0,
        eventRefs: 0,
        themeRefs: 0,
      };
    }

    const corpusStats = byCorpus[finalized.corpus];
    corpusStats.entities += 1;
    if (total > 0) corpusStats.entitiesWithKnowledge += 1;
    corpusStats.relationshipRefs += relationshipCount;
    corpusStats.eventRefs += eventCount;
    corpusStats.themeRefs += themeCount;

    if (
      !largestEntity ||
      total > largestEntity.totalKnowledgeRefs ||
      (total === largestEntity.totalKnowledgeRefs &&
        entityId.localeCompare(largestEntity.id) < 0)
    ) {
      largestEntity = {
        id: entityId,
        corpus: finalized.corpus,
        totalKnowledgeRefs: total,
        relationshipRefs: relationshipCount,
        eventRefs: eventCount,
        themeRefs: themeCount,
      };
    }
  }

  const coreArtifact = {
    schemaVersion: SCHEMA_VERSION,
    compiler: {
      id: COMPILER_ID,
      name: COMPILER_NAME,
      version: COMPILER_VERSION,
    },
    inputs: inputChecksums,
    entities: finalizedEntities,
  };
  const checksum = sha256Text(JSON.stringify(coreArtifact));
  const knowledgeArtifact = {
    ...coreArtifact,
    checksum,
  };

  writeJson(KNOWLEDGE_PATH, knowledgeArtifact);
  const knowledgeFileChecksum = sha256File(KNOWLEDGE_PATH);

  const audit = {
    compiler: auditState.compiler,
    schemaVersion: SCHEMA_VERSION,
    inputChecksums,
    outputChecksum: checksum,
    outputFileChecksum: knowledgeFileChecksum,
    totals: {
      entities: entityIds.length,
      entitiesWithAnyKnowledge,
      entitiesWithoutKnowledge: entityIds.length - entitiesWithAnyKnowledge,
      entitiesWithRelationships,
      entitiesWithEvents,
      entitiesWithThemes,
      relationshipRefs: totalRelationshipRefs,
      eventRefs: totalEventRefs,
      themeRefs: totalThemeRefs,
      totalKnowledgeRefs:
        totalRelationshipRefs + totalEventRefs + totalThemeRefs,
      averageKnowledgeRefsPerEntity:
        entityIds.length > 0
          ? (totalRelationshipRefs + totalEventRefs + totalThemeRefs) /
            entityIds.length
          : 0,
    },
    byCorpus: sortRecord(byCorpus),
    sourceGraphs: auditState.sourceGraphs,
    dangling: auditState.dangling,
    largestEntity,
    samples: {
      relationshipEntityIds: sortedStrings([
        ...auditState.samples.relationshipEntityIds,
      ]).slice(0, SAMPLE_LIMIT),
      eventEntityIds: sortedStrings([...auditState.samples.eventEntityIds]).slice(
        0,
        SAMPLE_LIMIT
      ),
      unmatchedThemeOccurrences: sortedStrings([
        ...auditState.samples.unmatchedThemeOccurrences,
      ]).slice(0, SAMPLE_LIMIT),
      invalidRelationshipEntries: sortedStrings([
        ...auditState.samples.invalidRelationshipEntries,
      ]).slice(0, SAMPLE_LIMIT),
      invalidEventEntries: sortedStrings([
        ...auditState.samples.invalidEventEntries,
      ]).slice(0, SAMPLE_LIMIT),
      invalidThemeEntries: sortedStrings([
        ...auditState.samples.invalidThemeEntries,
      ]).slice(0, SAMPLE_LIMIT),
    },
    invariants: {
      allP01EntitiesIndexed:
        Object.keys(finalizedEntities).length === entityIds.length,
      allKnowledgeEntitiesExistInP01: Object.keys(finalizedEntities).every((id) =>
        knownEntityIds.has(id)
      ),
      noEmbeddedRelationshipObjects: Object.values(finalizedEntities).every(
        (entry) =>
          entry.relationshipRefs.every(
            (ref) =>
              Object.keys(ref).sort().join(",") ===
              ["canonicalId", "index", "roles"].sort().join(",")
          )
      ),
      noEmbeddedEventObjects: Object.values(finalizedEntities).every((entry) =>
        entry.eventRefs.every(
          (ref) =>
            Object.keys(ref).sort().join(",") ===
            ["canonicalId", "index", "roles"].sort().join(",")
        )
      ),
      noEmbeddedThemeObjects: Object.values(finalizedEntities).every((entry) =>
        entry.themeRefs.every(
          (ref) =>
            Object.keys(ref).sort().join(",") ===
            ["canonicalId", "index", "themeId"].sort().join(",")
        )
      ),
      checksumMatches:
        sha256Text(
          JSON.stringify({
            schemaVersion: knowledgeArtifact.schemaVersion,
            compiler: knowledgeArtifact.compiler,
            inputs: knowledgeArtifact.inputs,
            entities: knowledgeArtifact.entities,
          })
        ) === knowledgeArtifact.checksum,
    },
  };

  writeJson(AUDIT_PATH, audit);
  const auditFileChecksum = sha256File(AUDIT_PATH);

  const manifestCore = {
    compiler: {
      id: COMPILER_ID,
      name: COMPILER_NAME,
      version: COMPILER_VERSION,
    },
    schemaVersion: SCHEMA_VERSION,
    purpose:
      "Per-entity references into SEE RelationshipGraph, EventGraph, and ThemeGraph. SEE graph objects are not duplicated.",
    consumes: [
      {
        id: "P01",
        name: "Entity Graph",
        path: relativePath(INPUTS.entityGraph),
        checksum: inputChecksums.entityGraph,
      },
      {
        id: "RelationshipGraph",
        name: "SEE Relationship Graph",
        path: relativePath(INPUTS.relationshipGraph),
        checksum: inputChecksums.relationshipGraph,
      },
      {
        id: "EventGraph",
        name: "SEE Event Graph",
        path: relativePath(INPUTS.eventGraph),
        checksum: inputChecksums.eventGraph,
      },
      {
        id: "ThemeGraph",
        name: "SEE Theme Graph",
        path: relativePath(INPUTS.themeGraph),
        checksum: inputChecksums.themeGraph,
      },
    ],
    produces: [
      {
        name: "Knowledge Index",
        path: relativePath(KNOWLEDGE_PATH),
        checksum,
        fileChecksum: knowledgeFileChecksum,
      },
      {
        name: "Audit",
        path: relativePath(AUDIT_PATH),
        fileChecksum: auditFileChecksum,
      },
    ],
    deterministic: true,
    entityCount: entityIds.length,
    referenceCounts: {
      relationships: totalRelationshipRefs,
      events: totalEventRefs,
      themes: totalThemeRefs,
      total: totalRelationshipRefs + totalEventRefs + totalThemeRefs,
    },
  };
  const manifest = {
    ...manifestCore,
    checksum: sha256Text(JSON.stringify(manifestCore)),
  };

  writeJson(MANIFEST_PATH, manifest);

  console.log("\nP02 KNOWLEDGE INDEX COMPLETE\n");
  console.log(`Entities          : ${entityIds.length}`);
  console.log(`With knowledge    : ${entitiesWithAnyKnowledge}`);
  console.log(`Relationship refs : ${totalRelationshipRefs}`);
  console.log(`Event refs        : ${totalEventRefs}`);
  console.log(`Theme refs        : ${totalThemeRefs}`);
  console.log(`Checksum          : ${checksum}`);
  console.log(`Output            : ${OUTPUT_DIR}\n`);
}

try {
  main();
} catch (error) {
  console.error("\nP02 KNOWLEDGE INDEX FAILED\n");
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
}
