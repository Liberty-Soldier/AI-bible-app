function produceRelationshipGraphV2(syntaxGraph) {
  const relationshipGraph = {};
  let relationships = 0;

  for (const [canonicalId, syntax] of Object.entries(syntaxGraph.syntaxGraph)) {
    const edges = [];

    for (const clause of syntax.clauses || []) {
      if (!clause.subject || !clause.verb) continue;

      for (const object of clause.objects || []) {
        edges.push({
          subject: clause.subject.entityId,
          predicate: clause.verb.entityId,
          object: object.entityId,
          canonicalId,
          reference: syntax.reference,
          confidence: "low",
          method: "syntax-graph-v1",
          support: {
            subjectTokenId: clause.subject.tokenId,
            predicateTokenId: clause.verb.tokenId,
            objectTokenId: object.tokenId
          }
        });
      }
    }

    if (edges.length) {
      relationshipGraph[canonicalId] = edges;
      relationships += edges.length;
    }
  }

  return {
    representation: "RelationshipGraph",
    data: { relationshipGraph },
    stats: {
      verses: Object.keys(relationshipGraph).length,
      relationships
    },
    warnings: [],
    errors: []
  };
}

module.exports = { produceRelationshipGraphV2 };