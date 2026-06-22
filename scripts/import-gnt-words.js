const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const keyedPath = path.join(
  ROOT,
  "sources/gnt/OpenGNT-master/OpenGNT-master/unzipped-keyed/OpenGNT_keyedFeatures.csv"
);

const morphPath = path.join(
  ROOT,
  "sources/gnt/OpenGNT-master/OpenGNT-master/unzipped-morphology/OpenGNT_morphology_English.csv"
);

const outPath = path.join(
  ROOT,
  "app/data/scripture/generatedGreekNTWords.json"
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

function cleanBox(value) {
  return value.replace(/^〔|〕$/g, "").trim();
}

function fixMojibake(value) {
  return Buffer.from(value, "latin1").toString("utf8");
}

function parseBoxParts(value) {
  return cleanBox(value).split("｜").map((v) => v.trim());
}

function readTsv(filePath) {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
}

const morphLines = readTsv(morphPath);
const morphMap = new Map();

for (const line of morphLines.slice(1)) {
  const [sort, strong, rmac, english] = line.split(/\t/);
  morphMap.set(sort, {
    strong,
    morph: rmac,
    morphEnglish: english,
  });
}

const keyedLines = readTsv(keyedPath);
const words = [];

for (const line of keyedLines.slice(1)) {
  const cols = line.split(/\t/);

  const sort = cols[0];
  const [bookNum, chapter, verse] = parseBoxParts(cols[4]);
  const tantt = cleanBox(cols[7]);
  const glosses = parseBoxParts(cols[8]);

  const firstWordData = tantt.split(";")[0];
  const parts = firstWordData.split("=");

  const greekWord = fixMojibake(parts[1]);
  const strong = parts[2];
  const morph = parts[3];

  if (!greekWord || !strong) continue;

  const morphInfo = morphMap.get(sort);

  words.push({
    sort,
    book: bookMap[Number(bookNum)] || bookNum,
    chapter: Number(chapter),
    verse: Number(verse),
    word: greekWord,
    strong,
    morph,
    morphEnglish: morphInfo?.morphEnglish || "",
    gloss: glosses[2] || glosses[0] || "",
    mounceGloss: glosses[0] || "",
    tyndaleGloss: glosses[1] || "",
  });
}

fs.writeFileSync(outPath, JSON.stringify(words, null, 2), "utf8");

console.log(`Imported ${words.length} Greek NT word entries`);
console.log(`Saved to ${outPath}`);