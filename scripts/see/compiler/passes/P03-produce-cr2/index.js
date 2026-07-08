const fs = require("fs");
const path = require("path");
const { getBookOrder } = require("../../../shared/canonicalBookOrder");

function produceCR2(sourceUniverse) {

  const tokenGraph = {};

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

        if (parts.length !== 3) continue;

        const canonicalId =
          `canon:${parts[0]}:${parts[1]}:${parts[2]}`;

        tokenGraph[canonicalId] ??= {};

        tokenGraph[canonicalId][source.id] = {
          tokenIds: (verse.sourceTokens || []).map(t => t.id)
        };

      }

    }

  }

  return {

    representation: "CR2",

    data: {
      tokenGraph
    },

    stats: {
      verses: Object.keys(tokenGraph).length,
      sources: primarySources.length
    },

    warnings: [],

    errors: []

  };

}

module.exports = {
  produceCR2
};