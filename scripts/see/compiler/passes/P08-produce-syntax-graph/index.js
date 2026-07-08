const fs = require("fs");
const path = require("path");
const { getBookOrder } = require("../../../shared/canonicalBookOrder");

function pos(morph = "") {
  if (morph.startsWith("HV") || morph.includes("/V")) return "verb";
  if (morph.startsWith("HN") || morph.includes("/N")) return "noun";
  if (morph.startsWith("HR") || morph.includes("/R")) return "preposition";
  if (morph.startsWith("HC") || morph.includes("/C")) return "conjunction";
  if (morph.startsWith("HT") || morph.includes("/T")) return "particle";
  return "unknown";
}

function canon(reference) {
  return `canon:${reference.replace(/:/g, ":")}`;
}

function produceSyntaxGraph(sourceUniverse) {
  const syntaxGraph = {};
  let clauses = 0;

  const primarySources = sourceUniverse.sources.filter(s => s.role === "primary");

  for (const source of primarySources) {
    const orderedFiles = [...source.files].sort((a, b) => {
      const bookA = path.basename(a.name, ".json");
      const bookB = path.basename(b.name, ".json");
      return getBookOrder(bookA) - getBookOrder(bookB);
    });

    for (const file of orderedFiles) {
      const data = JSON.parse(fs.readFileSync(file.path, "utf8"));

      for (const verse of Object.values(data)) {
        const tokens = verse.sourceTokens || [];
        const enriched = tokens.map(t => ({
          tokenId: t.id,
          entityId: t.entityId,
          strong: t.strong,
          morph: t.morph,
          partOfSpeech: pos(t.morph)
        }));

        const verbs = enriched.filter(t => t.partOfSpeech === "verb");

        if (!verbs.length) continue;

        const nouns = enriched.filter(t =>
          t.partOfSpeech === "noun" &&
          !String(t.morph || "").startsWith("HR")
        );

        const subject =
          nouns.find(n => n.entityId === "hebrew:H430") ||
          nouns[0] ||
          null;

        const objects = nouns.filter(n =>
          subject && n.tokenId !== subject.tokenId
        );

        syntaxGraph[canon(verse.reference)] = {
          reference: verse.reference,
          clauses: verbs.map(verb => ({
            verb,
            subject,
            objects
          }))
        };

        clauses += verbs.length;
      }
    }
  }

  return {
    representation: "SyntaxGraph",
    data: { syntaxGraph },
    stats: {
      verses: Object.keys(syntaxGraph).length,
      clauses
    },
    warnings: [],
    errors: []
  };
}

module.exports = { produceSyntaxGraph };