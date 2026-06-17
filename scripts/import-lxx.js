const fs = require("fs");
const path = require("path");

const SOURCE_FILE = path.join(
  __dirname,
  "..",
  "sources",
  "lxx-greek",
  "LXX-Rahlfs-1935-master",
  "11_end-users_files",
  "MyBible",
  "Bibles",
  "LXX_final_main.csv"
);

const OUTPUT_FILE = path.join(
  __dirname,
  "..",
  "app",
  "data",
  "scripture",
  "generatedLXX.ts"
);

const bookMap = {
  10: "Genesis",
  20: "Exodus",
  30: "Leviticus",
  40: "Numbers",
  50: "Deuteronomy",
  60: "Joshua",
  70: "Judges",
  80: "Ruth",
  90: "1 Samuel",
  100: "2 Samuel",
  110: "1 Kings",
  120: "2 Kings",
  130: "1 Chronicles",
  140: "2 Chronicles",
  150: "Ezra",
  160: "Nehemiah",
  190: "Esther",
  220: "Job",
  230: "Psalms",
  240: "Proverbs",
  250: "Ecclesiastes",
  260: "Song of Songs",
  270: "Wisdom",
  280: "Sirach",
  290: "Isaiah",
  300: "Jeremiah",
  310: "Lamentations",
  315: "Epistle of Jeremiah",
  320: "Baruch",
  325: "Susanna",
  330: "Ezekiel",
  340: "Daniel",
  345: "Bel and the Dragon",
  350: "Hosea",
  360: "Joel",
  370: "Amos",
  380: "Obadiah",
  390: "Jonah",
  400: "Micah",
  410: "Nahum",
  420: "Habakkuk",
  430: "Zephaniah",
  440: "Haggai",
  450: "Zechariah",
  460: "Malachi",
  462: "1 Maccabees",
  464: "2 Maccabees",
  466: "3 Maccabees",
  467: "4 Maccabees",
};

function cleanGreek(text) {
  return text
    .replace(/<S>.*?<\/S>/g, "")
    .replace(/<m>.*?<\/m>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const raw = fs.readFileSync(SOURCE_FILE, "utf8");
const lines = raw.split(/\r?\n/).filter(Boolean);

const verses = [];

for (const line of lines) {
  const parts = line.split("\t");

  const bookId = Number(parts[0]);
  const chapter = Number(parts[1]);
  const verse = Number(parts[2]);
  const rawText = parts.slice(3).join(" ");

  const book = bookMap[bookId];

  if (!book || !chapter || !verse || !rawText) continue;

  verses.push({
    id: `lxx-${book.toLowerCase().replace(/\s+/g, "-")}-${chapter}-${verse}`,
    reference: `${book} ${chapter}:${verse}`,
    book,
    chapter,
    verse,
    sources: [
      {
        tradition: "lxx-greek",
        label: "Greek Septuagint",
        sourceName: "LXX Rahlfs",
        language: "greek",
        text: cleanGreek(rawText),
      },
    ],
  });
}

const output = `import type { Verse } from "../types";

export const generatedLXX: Verse[] = ${JSON.stringify(verses, null, 2)};
`;

fs.writeFileSync(OUTPUT_FILE, output);

console.log(`Generated ${verses.length} LXX Greek verses at ${OUTPUT_FILE}`);