const fs = require("fs");
const path = require("path");

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function produceRuntimeArtifacts(config, graphs) {
  const runtimeDir = path.join(config.rootDir, "public", "data", "see");

  fs.rmSync(runtimeDir, { recursive: true, force: true });
  fs.mkdirSync(runtimeDir, { recursive: true });

  const indexesDir = path.join(runtimeDir, "indexes");
  const liteDir = path.join(runtimeDir, "lite");

  writeJson(path.join(indexesDir, "evidence.json"), graphs.evidenceGraph);
  writeJson(path.join(indexesDir, "relationships.json"), graphs.relationshipGraph);
  writeJson(path.join(indexesDir, "events.json"), graphs.eventGraph);
  writeJson(path.join(indexesDir, "themes.json"), graphs.themeGraph);

  const evidenceLite = buildEvidenceLite(graphs.evidenceGraph.evidenceGraph);
  const relationshipCounts = buildRelationshipCounts(graphs.relationshipGraph.relationshipGraph);
  const eventCounts = buildEventCounts(graphs.eventGraph.eventGraph);
  const themeCounts = buildThemeCounts(graphs.themeGraph.themeGraph);

  writeJson(path.join(liteDir, "evidence-lite.json"), evidenceLite);
  writeJson(path.join(liteDir, "relationship-counts.json"), relationshipCounts);
  writeJson(path.join(liteDir, "event-counts.json"), eventCounts);
  writeJson(path.join(liteDir, "theme-counts.json"), themeCounts);

  writeJson(path.join(runtimeDir, "manifest.json"), {
    version: config.compilerVersion,
    profile: config.profile,
    indexes: {
      evidence: "indexes/evidence.json",
      relationships: "indexes/relationships.json",
      events: "indexes/events.json",
      themes: "indexes/themes.json"
    },
    lite: {
      evidence: "lite/evidence-lite.json",
      relationships: "lite/relationship-counts.json",
      events: "lite/event-counts.json",
      themes: "lite/theme-counts.json"
    }
  });

  return {
    representation: "RuntimeArtifacts",
    data: {
      runtimeDir
    },
    stats: {
      fullIndexes: 4,
      liteIndexes: 4,
      evidenceLiteNodes: Object.keys(evidenceLite).length
    },
    warnings: [],
    errors: []
  };
}

function buildEvidenceLite(evidenceGraph) {
  const out = {};

  for (const [id, evidence] of Object.entries(evidenceGraph)) {
    out[id] = {
      id,
      occurrenceCount: evidence.occurrenceCount,
      firstOccurrence: evidence.firstOccurrence,
      lastOccurrence: evidence.lastOccurrence
    };
  }

  return out;
}

function buildRelationshipCounts(relationshipGraph) {
  const out = {};

  for (const edges of Object.values(relationshipGraph)) {
    for (const edge of edges) {
      for (const entityId of [edge.subject, edge.predicate, edge.object]) {
        if (!entityId) continue;
        out[entityId] ??= 0;
        out[entityId]++;
      }
    }
  }

  return out;
}

function buildEventCounts(eventGraph) {
  const out = {};

  for (const events of Object.values(eventGraph)) {
    for (const event of events) {
      for (const participant of event.participants || []) {
        if (!participant.entityId) continue;
        out[participant.entityId] ??= 0;
        out[participant.entityId]++;
      }
    }
  }

  return out;
}

function buildThemeCounts(themeGraph) {
  const out = {};

  for (const [themeId, theme] of Object.entries(themeGraph)) {
    out[themeId] = (theme.occurrences || []).length;
  }

  return out;
}

module.exports = { produceRuntimeArtifacts };