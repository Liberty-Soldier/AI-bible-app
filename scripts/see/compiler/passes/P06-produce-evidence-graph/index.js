function produceEvidenceGraph(cr4) {

    const evidenceGraph = {};

    for (const [lemmaId, occurrences] of Object.entries(cr4.occurrenceGraph)) {

        evidenceGraph[lemmaId] = {

            id: lemmaId,

            occurrenceCount: occurrences.length,

            occurrences,

            firstOccurrence: occurrences[0]?.canonicalId ?? null,

            lastOccurrence:
                occurrences[occurrences.length - 1]?.canonicalId ?? null

        };

    }

    return {

        representation: "EvidenceGraph",

        data: {
            evidenceGraph
        },

        stats: {
            evidenceNodes: Object.keys(evidenceGraph).length
        },

        warnings: [],

        errors: []

    };

}

module.exports = {
    produceEvidenceGraph
};