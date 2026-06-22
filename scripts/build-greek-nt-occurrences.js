const fs = require("fs");
const path = require("path");

const inputFile = path.join(
  process.cwd(),
  "app",
  "data",
  "scripture",
  "generatedGreekNTWords.json"
);

const outputFile = path.join(
  process.cwd(),
  "app",
  "data",
  "scripture",
  "generatedGreekNTOccurrences.json"
);

const words = JSON.parse(fs.readFileSync(inputFile, "utf8"));

const index = {};

for (const entry of words) {
  if (!entry.strong) continue;

  if (!index[entry.strong]) {
    index[entry.strong] = {
      strong: entry.strong,
      gloss: entry.gloss,
      words: [],
      occurrences: [],
    };
  }

  if (!index[entry.strong].words.includes(entry.word)) {
    index[entry.strong].words.push(entry.word);
  }

  index[entry.strong].occurrences.push({
    book: entry.book,
    chapter: entry.chapter,
    verse: entry.verse,
    reference: `${entry.book} ${entry.chapter}:${entry.verse}`,
    word: entry.word,
    gloss: entry.gloss,
    morph: entry.morph,
    morphEnglish: entry.morphEnglish,
    sort: entry.sort,
  });
}

fs.writeFileSync(outputFile, JSON.stringify(index, null, 2), "utf8");

console.log(`Built ${Object.keys(index).length} Greek Strong's entries`);
console.log(`Saved to ${outputFile}`);