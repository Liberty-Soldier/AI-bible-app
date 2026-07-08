function produceCR1(cr0, sourceUniverse) {

  const witnessGraph = {};

  for (const book of cr0.books) {
    for (const chapter of book.chapters) {
      for (const verse of chapter.verses) {

        witnessGraph[verse.id] = {
          witnesses: sourceUniverse.sources.map(source => ({
            id: source.id,
            role: source.role,
            available: true
          }))
        };

      }
    }
  }

  return {

    representation: "CR1",

    data: {
      witnessGraph
    },

    stats: {
      verses: Object.keys(witnessGraph).length,
      witnesses: sourceUniverse.sources.length
    },

    warnings: [],

    errors: []

  };
}

module.exports = {
  produceCR1
};