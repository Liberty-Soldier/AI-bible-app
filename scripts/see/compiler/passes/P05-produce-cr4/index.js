const fs = require("fs");
const path = require("path");
const { getBookOrder } = require("../../../shared/canonicalBookOrder");

function produceCR4(sourceUniverse) {

  const occurrenceGraph = {};

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

      const data = JSON.parse(fs.readFileSync(file.path, "utf8"));

      for (const [reference, verse] of Object.entries(data)) {

        const parts = reference.split(":");

        const canonicalId =
          `canon:${parts[0]}:${parts[1]}:${parts[2]}`;

        for (const token of (verse.sourceTokens || [])) {

          const key = `lemma:${token.entityId}`;

          occurrenceGraph[key] ??= [];

          occurrenceGraph[key].push({
            tokenId: token.id,
            canonicalId
          });

        }

      }

    }

  }

  return {

    representation: "CR4",

    data: {
      occurrenceGraph
    },

    stats: {
      lemmas: Object.keys(occurrenceGraph).length
    },

    warnings: [],

    errors: []

  };

}

module.exports = {
  produceCR4
};