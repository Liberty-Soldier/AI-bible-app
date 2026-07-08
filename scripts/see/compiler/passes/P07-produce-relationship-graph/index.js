
const fs = require("fs");
const path = require("path");
const { getBookOrder } = require("../../../shared/canonicalBookOrder");
const {
    resolveRelationships
} = require("../../resolver/RelationshipResolver");

function produceRelationshipGraph(sourceUniverse) {

    const relationshipGraph = {};

    const primarySources = sourceUniverse.sources.filter(
        s => s.role === "primary"
    );

    for (const source of primarySources) {

        const orderedFiles = [...source.files].sort((a, b) => {
            const bookA = path.basename(a.name, ".json");
            const bookB = path.basename(b.name, ".json");

            return getBookOrder(bookA) - getBookOrder(bookB);
        });

        for (const file of orderedFiles) {

            const data = JSON.parse(
                fs.readFileSync(file.path, "utf8")
            );

            for (const verse of Object.values(data)) {

const found = resolveRelationships(verse);

                if (!found.length) continue;

                relationshipGraph[verse.reference] = found;

            }

        }

    }

    return {

        representation: "RelationshipGraph",

        data: {
            relationshipGraph
        },

stats: {
    relationships: Object.keys(relationshipGraph).length
},

        warnings: [],

        errors: []

    };

}

module.exports = {
    produceRelationshipGraph
};