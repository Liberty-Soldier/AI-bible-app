const fs = require("fs");
const path = require("path");

const inputDir = path.join(
  process.cwd(),
  "sources",
  "web-json",
  "world-english-bible-master",
  "html"
);

const outputFile = path.join(
  process.cwd(),
  "app",
  "data",
  "scripture",
  "generatedWEB.json"
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
  EST: "Esther",
  JOB: "Job",
  PSA: "Psalms",
  PRO: "Proverbs",
  ECC: "Ecclesiastes",
  SNG: "Song of Solomon",
  ISA: "Isaiah",
  JER: "Jeremiah",
  LAM: "Lamentations",
  EZK: "Ezekiel",
  DAN: "Daniel",
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
  MAT: "Matthew",
  MRK: "Mark",
  LUK: "Luke",
  JHN: "John",
  ACT: "Acts",
  ROM: "Romans",
  "1CO": "1 Corinthians",
  "2CO": "2 Corinthians",
  GAL: "Galatians",
  EPH: "Ephesians",
  PHP: "Philippians",
  COL: "Colossians",
  "1TH": "1 Thessalonians",
  "2TH": "2 Thessalonians",
  "1TI": "1 Timothy",
  "2TI": "2 Timothy",
  TIT: "Titus",
  PHM: "Philemon",
  HEB: "Hebrews",
  JAS: "James",
  "1PE": "1 Peter",
  "2PE": "2 Peter",
  "1JN": "1 John",
  "2JN": "2 John",
  "3JN": "3 John",
  JUD: "Jude",
  REV: "Revelation",
};

function stripHtml(html) {
  return html
    // remove WEB footnote/cross-reference blocks before removing tags
    .replace(/<div class="footnotes">[\s\S]*?<\/div>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, "")
    .replace(/<span class="footnote"[\s\S]*?<\/span>/gi, "")

    // remove verse marker
    .replace(/<span class="verse" id="V\d+">/gi, "")

    // remove remaining html
    .replace(/<[^>]+>/g, "")

    // decode common entities
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")

    // remove leftover footnote text that got captured inline
    .replace(/\*\s*The Hebrew word rendered[^.]+?\./gi, "")
    .replace(/\*\s*"Yahweh"[^.]+?\./gi, "")
    .replace(/\*\s*or,?\s*[^.]+?\./gi, "")

    .replace(/\s+/g, " ")
    .trim();
}

const files = fs
  .readdirSync(inputDir)
  .filter((file) => /^[0-9A-Z]+[0-9]+\.htm$/.test(file));

const verses = [];

for (const file of files) {
  const match = file.match(/^([0-9A-Z]+?)([0-9]+)\.htm$/);
  if (!match) continue;

  const rawBook = match[1];
  const chapter = Number(match[2]);
  const book = bookMap[rawBook];

  if (!book || chapter === 0) continue;

  const html = fs.readFileSync(path.join(inputDir, file), "utf8");

const verseRegex =
  /<span class="verse" id="V(\d+)">[\s\S]*?<\/span>([\s\S]*?)(?=<span class="verse" id="V\d+">|<\/div>|$)/g;

  let verseMatch;

  while ((verseMatch = verseRegex.exec(html)) !== null) {
    const verse = Number(verseMatch[1]);
    const text = stripHtml(verseMatch[2]);

    if (!text) continue;

 const reference = `${book} ${chapter}:${verse}`;
const id = `${book.toLowerCase().replace(/\s+/g, "-")}-${chapter}-${verse}`;

const isNewTestament =
  Object.keys(bookMap).indexOf(rawBook) >=
  Object.keys(bookMap).indexOf("MAT");

verses.push({
  id,
  book,
  chapter,
  verse,
  reference,
  sources: [
    {
      tradition: isNewTestament ? "new-testament" : "masoretic",
      label: isNewTestament ? "New Testament" : "Masoretic / WEB",
      sourceName: "World English Bible",
      language: "english",
      text,
    },
  ],
});
  }
}

verses.sort((a, b) => {
  const bookOrder = Object.values(bookMap);
  return (
    bookOrder.indexOf(a.book) - bookOrder.indexOf(b.book) ||
    a.chapter - b.chapter ||
    a.verse - b.verse
  );
});

fs.writeFileSync(outputFile, JSON.stringify(verses, null, 2), "utf8");

console.log(`Generated ${verses.length} WEB verses at ${outputFile}`);