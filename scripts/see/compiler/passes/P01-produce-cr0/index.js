const fs = require("fs");
const path = require("path");
const { getBookOrder } = require("../../../shared/canonicalBookOrder");

function parseRef(ref) {
  const parts = String(ref).split(":");

  if (parts.length !== 3) return null;

  return {
    book: parts[0],
    chapter: Number(parts[1]),
    verse: Number(parts[2]),
    id: `canon:${parts[0]}:${parts[1]}:${parts[2]}`
  };
}

function produceCR0(sourceUniverse) {
  const books = [];

  let totalChapters = 0;
  let totalVerses = 0;

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

      const chapterMap = new Map();

      for (const key of Object.keys(data)) {

        const ref = parseRef(key);

        if (!ref) continue;

        if (!chapterMap.has(ref.chapter)) {
          chapterMap.set(ref.chapter, []);
        }

        chapterMap.get(ref.chapter).push({
          id: ref.id,
          verse: ref.verse
        });
      }

      const chapters = [...chapterMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([chapter, verses]) => ({
          chapter,
          verses: verses.sort((a, b) => a.verse - b.verse)
        }));

      totalChapters += chapters.length;
      totalVerses += Object.keys(data).length;

      books.push({
        book: path.basename(file.name, ".json"),
        order: getBookOrder(path.basename(file.name, ".json")),
        chapters
      });
    }
  }

  books.sort((a, b) => a.order - b.order);

  return {
    representation: "CR0",

    data: {
      books
    },

    stats: {
      sources: primarySources.length,
      books: books.length,
      chapters: totalChapters,
      verses: totalVerses
    },

    warnings: [],

    errors: []
  };
}

module.exports = {
  produceCR0
};