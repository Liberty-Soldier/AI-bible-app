const fs = require("fs");
const path = require("path");

const inputFile = path.join(
  __dirname,
  "../sources/brenton-readaloud/eng-Brenton_002_GEN_01_read.txt"
);

const outputFile = path.join(
  __dirname,
  "../app/data/scripture/generatedGenesis1.ts"
);

const raw = fs.readFileSync(inputFile, "utf8");

const lines = raw
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const book = "Genesis";
const chapter = 1;

const verseLines = lines.slice(2);

const verses = verseLines.map((text, index) => {
  const verseNumber = index + 1;

  return {
    id: `gen-1-${verseNumber}`,
    reference: `Genesis 1:${verseNumber}`,
    book,
    chapter,
    verse: verseNumber,
    sources: [
      {
        tradition: "septuagint",
        label: "Septuagint",
        sourceName: "Brenton Septuagint",
        language: "english",
        text,
      },
    ],
  };
});

const fileContent = `import type { Verse } from "../types";

export const generatedGenesis1: Verse[] = ${JSON.stringify(verses, null, 2)};
`;

fs.writeFileSync(outputFile, fileContent);

console.log(`Generated ${verses.length} verses at ${outputFile}`);