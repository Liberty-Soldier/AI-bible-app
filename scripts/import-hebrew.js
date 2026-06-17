const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

const inputDir = path.join(
  process.cwd(),
  "sources",
  "hebrew",
  "morphhb-master",
  "morphhb-master",
  "wlc"
);

const outputFile = path.join(
  process.cwd(),
  "app",
  "data",
  "scripture",
  "generatedHebrew.ts"
);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  preserveOrder: false,
});

function cleanText(value) {
  if (!value) return "";

  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    return value.map(cleanText).join(" ").replace(/\s+/g, " ").trim();
  }

  if (typeof value === "object") {
    let parts = [];

    for (const key of Object.keys(value)) {
      if (key === "@_osisID" || key.startsWith("@_")) continue;
      parts.push(cleanText(value[key]));
    }

    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  return "";
}

function walk(node, currentBook = "", currentChapter = 0, verses = []) {
  if (!node) return verses;

  if (Array.isArray(node)) {
    for (const item of node) {
      walk(item, currentBook, currentChapter, verses);
    }
    return verses;
  }

  if (typeof node !== "object") return verses;

  if (node.div?.["@_type"] === "book") {
    currentBook = node.div["@_osisID"] || currentBook;
    walk(node.div, currentBook, currentChapter, verses);
  }

  if (node.chapter) {
    const chapters = Array.isArray(node.chapter) ? node.chapter : [node.chapter];

    for (const chapter of chapters) {
      const osisID = chapter["@_osisID"] || "";
      const parts = osisID.split(".");
      const chapterNum = Number(parts[1]);

      walk(chapter, currentBook, chapterNum, verses);
    }
  }

  if (node.verse) {
    const verseList = Array.isArray(node.verse) ? node.verse : [node.verse];

    for (const verse of verseList) {
      const osisID = verse["@_osisID"] || "";
      const parts = osisID.split(".");

      const book = parts[0] || currentBook;
      const chapter = Number(parts[1] || currentChapter);
      const verseNum = Number(parts[2]);

      const text = cleanText(verse);

      if (book && chapter && verseNum && text) {
        verses.push({
          book,
          chapter,
          verse: verseNum,
          text,
        });
      }
    }
  }

  for (const key of Object.keys(node)) {
    if (["div", "chapter", "verse"].includes(key)) continue;
    walk(node[key], currentBook, currentChapter, verses);
  }

  return verses;
}

const files = fs
  .readdirSync(inputDir)
  .filter((file) => file.endsWith(".xml"));

const allVerses = [];

for (const file of files) {
  const fullPath = path.join(inputDir, file);
  const xml = fs.readFileSync(fullPath, "utf8");
  const parsed = parser.parse(xml);

  const verses = walk(parsed);
  allVerses.push(...verses);
}

const output = `export const generatedHebrew = ${JSON.stringify(
  allVerses,
  null,
  2
)} as const;
`;

fs.writeFileSync(outputFile, output, "utf8");

console.log(
  `Generated ${allVerses.length} Hebrew verses at ${outputFile}`
);