const fs = require("fs");
const path = require("path");

const SOURCE_DIR = path.join(
  __dirname,
  "..",
  "sources",
  "kjv-json",
  "Bible-kjv-master"
);

const OUTPUT_FILE = path.join(
  __dirname,
  "..",
  "app",
  "data",
  "scripture",
  "generatedKJV.ts"
);

const verses = [];
const skipped = [];

const files = fs
  .readdirSync(SOURCE_DIR)
  .filter((file) => file.endsWith(".json"));

for (const file of files) {
  const filePath = path.join(SOURCE_DIR, file);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (!data.book || !Array.isArray(data.chapters)) {
    skipped.push(file);
    continue;
  }

  const book = data.book;

  for (const chapter of data.chapters) {
    if (!Array.isArray(chapter.verses)) continue;

    for (const verse of chapter.verses) {
      verses.push({
        id: `kjv-${book
          .toLowerCase()
          .replace(/\s+/g, "-")}-${chapter.chapter}-${verse.verse}`,
        reference: `${book} ${chapter.chapter}:${verse.verse}`,
        book,
        chapter: Number(chapter.chapter),
        verse: Number(verse.verse),
        sources: [
          {
            tradition: "masoretic",
            label: "Masoretic / KJV",
            sourceName: "King James Version",
            language: "english",
            text: verse.text,
          },
        ],
      });
    }
  }
}

const output = `import type { Verse } from "../types";

export const generatedKJV: Verse[] = ${JSON.stringify(verses, null, 2)};
`;

fs.writeFileSync(OUTPUT_FILE, output);

console.log(`Generated ${verses.length} KJV verses at ${OUTPUT_FILE}`);

if (skipped.length > 0) {
  console.log("Skipped files:", skipped.join(", "));
}