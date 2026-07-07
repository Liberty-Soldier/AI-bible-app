const { unique, fullBookName } = require("./text-utils");

function buildContextConnections({ lemma, properName, occurrences }) {
  const refs = unique(occurrences.map((x) => x.reference));
  const books = unique(occurrences.map((x) => x.book));
  const firstBook = books[0];

  const context = {
    people: [],
    places: [],
    events: [],
    concepts: [],
    themes: [],
    laterReferences: refs.slice(1, 6),
  };

  if (properName) {
    context.concepts.push("Biblical name");
    context.themes.push("Narrative context");

    if (firstBook === "Gen") {
      context.events.push("Genesis narrative");
      context.themes.push("Beginnings", "Family line", "First occurrences");
    }

    if (books.length === 1) {
      context.concepts.push(`Concentrated in ${fullBookName(books[0])}`);
    } else if (books.length > 1) {
      context.concepts.push(`Traced across ${books.length} biblical books`);
    }

    return context;
  }

  context.themes.push("Word usage", "Scripture comparison");

  if (books.length > 1) {
    context.concepts.push(`Used across ${books.length} biblical books`);
  } else if (books.length === 1) {
    context.concepts.push(`Concentrated in ${fullBookName(books[0])}`);
  }

  return context;
}

module.exports = { buildContextConnections };