const THEME_EVENTS = {
  creation: "theme:creation",
  speech: "theme:speech",
  birth_or_begetting: "theme:genealogy",
  death: "theme:death",
  command: "theme:commandment",
  worship_or_bowing: "theme:worship",
  giving: "theme:giving"
};

function produceThemeGraph(eventGraph) {
  const themeGraph = {};

  for (const [canonicalId, events] of Object.entries(eventGraph.eventGraph)) {
    for (const event of events) {
      const themeId = THEME_EVENTS[event.type];
      if (!themeId) continue;

      themeGraph[themeId] ??= {
        id: themeId,
        occurrences: []
      };

      themeGraph[themeId].occurrences.push({
        canonicalId,
        reference: event.reference,
        eventType: event.type
      });
    }
  }

  return {
    representation: "ThemeGraph",
    data: { themeGraph },
    stats: {
      themes: Object.keys(themeGraph).length
    },
    warnings: [],
    errors: []
  };
}

module.exports = { produceThemeGraph };