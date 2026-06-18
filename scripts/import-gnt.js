const fs = require("fs");
const path = require("path");

const inputFile = path.join(
  process.cwd(),
  "sources",
  "gnt",
  "OpenGNT-master",
  "OpenGNT-master",
  "mapping_template",
  "OpenGNT_interlinear.csv"
);

const outputFile = path.join(
  process.cwd(),
  "app",
  "data",
  "scripture",
  "generatedGNT.json"
);

const bookMap = {
  40: "Matthew",
  41: "Mark",
  42: "Luke",
  43: "John",
  44: "Acts",
  45: "Romans",
  46: "1 Corinthians",
  47: "2 Corinthians",
  48: "Galatians",
  49: "Ephesians",
  50: "Philippians",
  51: "Colossians",
  52: "1 Thessalonians",
  53: "2 Thessalonians",
  54: "1 Timothy",
  55: "2 Timothy",
  56: "Titus",
  57: "Philemon",
  58: "Hebrews",
  59: "James",
  60: "1 Peter",
  61: "2 Peter",
  62: "1 John",
  63: "2 John",
  64: "3 John",
  65: "Jude",
  66: "Revelation",
};

const rows = fs.readFileSync(inputFile, "utf8").split(/\r?\n/);
const verses = new Map();

for (const row of rows) {
  if (!row.trim()) continue;

  const parts = row.split("\t");
  const location = parts[1];
  const greekWord = parts[2];

  if (!location || !greekWord) continue;

  const match = location.match(/〔(\d+)｜(\d+)｜(\d+)〕/);
  if (!match) continue;

  const bookNumber = Number(match[1]);
  const chapter = Number(match[2]);
  const verse = Number(match[3]);
  const book = bookMap[bookNumber];

  if (!book) continue;

  const key = `${book} ${chapter}:${verse}`;

  if (!verses.has(key)) {
    verses.set(key, {
      reference: key,
      sources: [
        {
          tradition: "new-testament",
          label: "Greek New Testament",
          sourceName: "OpenGNT",
          language: "greek",
          text: "",
        },
      ],
    });
  }

  const verseEntry = verses.get(key);
  verseEntry.sources[0].text +=
    verseEntry.sources[0].text ? ` ${greekWord}` : greekWord;
}

const output = Array.from(verses.values());

fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), "utf8");

console.log(`Generated ${output.length} GNT verses at ${outputFile}`);