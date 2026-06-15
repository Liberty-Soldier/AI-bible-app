const fs = require("fs");
const path = require("path");

const sourceDir = path.join(__dirname, "../sources/brenton-readaloud");
const outputFile = path.join(
  __dirname,
  "../app/data/scripture/generatedBrenton.ts"
);

const bookMap = {
  GEN: "Genesis",
  EXO: "Exodus",
  LEV: "Leviticus",
  NUM: "Numbers",
  DEU: "Deuteronomy",
  JOS: "Joshua",
  JDG: "Judges",
  RUT: "Ruth",
  "1SA": "1 Samuel",
  "2SA": "2 Samuel",
  "1KI": "1 Kings",
  "2KI": "2 Kings",
  "1CH": "1 Chronicles",
  "2CH": "2 Chronicles",
  EZR: "Ezra",
  NEH: "Nehemiah",
  JOB: "Job",
  PSA: "Psalms",
  PRO: "Proverbs",
  ECC: "Ecclesiastes",
  SNG: "Song of Songs",
  ISA: "Isaiah",
  JER: "Jeremiah",
  LAM: "Lamentations",
  EZK: "Ezekiel",
  HOS: "Hosea",
  JOL: "Joel",
  AMO: "Amos",
  OBA: "Obadiah",
  JON: "Jonah",
  MIC: "Micah",
  NAM: "Nahum",
  HAB: "Habakkuk",
  ZEP: "Zephaniah",
  HAG: "Haggai",
  ZEC: "Zechariah",
  MAL: "Malachi",

  TOB: "Tobit",
  JDT: "Judith",
  ESG: "Esther Greek",
  WIS: "Wisdom",
  SIR: "Sirach",
  BAR: "Baruch",
  LJE: "Letter of Jeremiah",
  SUS: "Susanna",
  BEL: "Bel and the Dragon",
  "1MA": "1 Maccabees",
  "2MA": "2 Maccabees",
  "3MA": "3 Maccabees",
  "4MA": "4 Maccabees",
  "1ES": "1 Esdras",
  MAN: "Prayer of Manasseh",
  DAG: "Daniel Greek",
};

const files = fs
  .readdirSync(sourceDir)
  .filter((file) => file.endsWith("_read.txt"))
  .filter((file) => !file.includes("_000_000_000_"))
  .sort();

const allVerses = [];

for (const file of files) {
  const match = file.match(/eng-Brenton_\d+_([A-Z0-9]+)_(\d+)_read\.txt/);

  if (!match) continue;

  const bookCode = match[1];
  const chapter = Number(match[2]);
  const book = bookMap[bookCode];

  if (!book) continue;

  const inputFile = path.join(sourceDir, file);
  const raw = fs.readFileSync(inputFile, "utf8");

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const verseLines = lines.slice(2);

  const bookId = bookCode.toLowerCase();

  verseLines.forEach((text, index) => {
    const verseNumber = index + 1;

    allVerses.push({
      id: `${bookId}-${chapter}-${verseNumber}`,
      reference: `${book} ${chapter}:${verseNumber}`,
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
    });
  });
}

const fileContent = `import type { Verse } from "../types";

export const generatedBrenton: Verse[] = ${JSON.stringify(allVerses, null, 2)};
`;

fs.writeFileSync(outputFile, fileContent);

console.log(`Generated ${allVerses.length} Brenton verses at ${outputFile}`);