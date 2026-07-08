const EVENT_PREDICATES = {
  "hebrew:H1254": "creation",
  "hebrew:H1696": "speech",
  "hebrew:H559": "speech",
  "hebrew:H3205": "birth_or_begetting",
  "hebrew:H4191": "death",
  "hebrew:H7812": "worship_or_bowing",
  "hebrew:H5414": "giving",
  "hebrew:H6680": "command"
};

function produceEventGraph(relationshipGraph) {
  const eventGraph = {};
  let events = 0;

  for (const [canonicalId, edges] of Object.entries(relationshipGraph.relationshipGraph)) {
    const verseEvents = [];

    for (const edge of edges) {
      const eventType = EVENT_PREDICATES[edge.predicate];
      if (!eventType) continue;

      verseEvents.push({
        type: eventType,
        canonicalId,
        reference: edge.reference,
        participants: [
          { role: "subject", entityId: edge.subject },
          { role: "predicate", entityId: edge.predicate },
          { role: "object", entityId: edge.object }
        ],
        confidence: edge.confidence,
        method: "relationship-derived-v1",
        support: edge.support
      });
    }

    if (verseEvents.length) {
      eventGraph[canonicalId] = verseEvents;
      events += verseEvents.length;
    }
  }

  return {
    representation: "EventGraph",
    data: { eventGraph },
    stats: {
      verses: Object.keys(eventGraph).length,
      events
    },
    warnings: [],
    errors: []
  };
}

module.exports = { produceEventGraph };