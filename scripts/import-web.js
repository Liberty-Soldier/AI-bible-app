const fs = require("fs");
const path = require("path");

const sourceDir = path.join(
  __dirname,
  "../sources/web-json/world-english-bible-master/json"
);

const outputFile = path.join(
  __dirname,
  "../app/data/scripture/generatedWEB.ts"
);

const ntBooks = [
  "matthew",
  "mark",
  "luke",
  "john",
  "acts",
  "romans",
  "1corinthians",
  "2corinthians",
  "galatians",
  "ephesians",
  "philippians",
  "colossians",
  "1thessalonians",
  "2thessalonians",
  "1timothy",
  "2timothy",
  "titus",
  "philemon",
  "hebrews",
  "james",
  "1peter",
  "2peter",
  "1john",
  "2john",
  "3john",
  "jude",
  "revelation",
];

const bookNames = {
  matthew: "Matthew",
  mark: "Mark",
  luke: "Luke",
  john: "John",
  acts: "Acts",
  romans: "Romans",
  "1corinthians": "1 Corinthians",
  "2corinthians": "2 Corinthians",
  galatians: "Galatians",
  ephesians: "Ephesians",
  philippians: "Philippians",
  colossians: "Colossians",
  "1thessalonians": "1 Thessalonians",
  "2thessalonians": "2 Thessalonians",
  "1timothy": "1 Timothy",
  "2timothy": "2 Timothy",
  titus: "Titus",
  philemon: "Philemon",
  hebrews: "Hebrews",
  james: "James",
  "1peter": "1 Peter",
  "2peter": "2 Peter",
  "1john": "1 John",
  "2john": "2 John",
  "3john": "3 John",
  jude: "Jude",
  revelation: "Revelation",
};

const allVerses = [];

for (const bookFileName of ntBooks) {
  const filePath = path.join(sourceDir, `${bookFileName}.json`);
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);

  const book = bookNames[bookFileName];

  for (const item of data) {
    if (item.type !== "paragraph text") continue;
    if (!item.chapterNumber || !item.verseNumber || !item.value) continue;

    const chapter = item.chapterNumber;
    const verse = item.verseNumber;
    const text = item.value.trim();

    allVerses.push({
      id: `${bookFileName}-${chapter}-${verse}`,
      reference: `${book} ${chapter}:${verse}`,
      book,
      chapter,
      verse,
      sources: [
        {
          tradition: "new-testament",
          label: "New Testament",
          sourceName: "World English Bible",
          language: "english",
          text,
        },
      ],
    });
  }
}

const fileContent = `import type { Verse } from "../types";

export const generatedWEB: Verse[] = ${JSON.stringify(allVerses, null, 2)};
`;

fs.writeFileSync(outputFile, fileContent);

console.log(`Generated ${allVerses.length} WEB New Testament verses at ${outputFile}`);