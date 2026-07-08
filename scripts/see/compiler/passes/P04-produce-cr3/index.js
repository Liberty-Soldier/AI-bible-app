const fs = require("fs");
const path = require("path");
const { getBookOrder } = require("../../../shared/canonicalBookOrder");

function produceCR3(sourceUniverse) {

  const strongIndex = {};
  const tokenIndex = {};

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

        for (const token of (verse.sourceTokens || [])) {

          if (token.strong) {

            strongIndex[token.strong] ??= [];

            strongIndex[token.strong].push(token.id);

          }

          tokenIndex[token.id] = {
            canonicalId,
            strong: token.strong,
            lemma: token.lemma,
            morph: token.morph,
            source: source.id
          };

        }

      }

    }

  }

  return {

    representation: "CR3",

    data: {
      strongIndex,
      tokenIndex
    },

    stats: {
      strongs: Object.keys(strongIndex).length,
      tokens: Object.keys(tokenIndex).length
    },

    warnings: [],

    errors: []

  };

}

module.exports = {
  produceCR3
};