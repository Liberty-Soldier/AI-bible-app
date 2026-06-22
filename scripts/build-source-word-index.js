const fs = require("fs");
const path = require("path");

const SOURCE_DIR = path.join(
  process.cwd(),
  "sources/hebrew/morphhb-master/morphhb-master/wlc"
);

const OUTPUT_FILE = path.join(
  process.cwd(),
  "app/data/lexicon/generatedHebrewWordIndex.json"
);

function cleanText(value) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getAttribute(tag, attr) {
  const match = tag.match(new RegExp(`${attr}="([^"]+)"`));
  return match ? match[1] : "";
}

function normalizeLemma(lemma) {
  return lemma
    .split("/")
    .pop()
    .replace(/\s+[a-z]$/i, "")
    .trim();
}

function parseBookFile(filePath, bookName) {
  const xml = fs.readFileSync(filePath, "utf8");
  const verseBlocks = xml.match(/<verse osisID="[^"]+">[\s\S]*?<\/verse>/g) || [];

  const entries = [];

  for (const block of verseBlocks) {
    const verseId = getAttribute(block.match(/<verse[^>]+>/)?.[0] || "", "osisID");

    const wordTags = block.match(/<w [\s\S]*?<\/w>/g) || [];

    for (const wordTag of wordTags) {
      const openingTag = wordTag.match(/<w [^>]+>/)?.[0] || "";

      const rawLemma = getAttribute(openingTag, "lemma");
      const morph = getAttribute(openingTag, "morph");
      const surface = cleanText(wordTag);

      const lemma = normalizeLemma(rawLemma);

      if (!lemma || !surface) continue;

      entries.push({
        testament: "old",
        language: "hebrew",
        book: bookName,
        reference: verseId,
        surface,
        lemma,
        rawLemma,
        morph,
      });
    }
  }

  return entries;
}

function main() {
  const files = fs
    .readdirSync(SOURCE_DIR)
    .filter((file) => file.endsWith(".xml"));

  const index = [];

  for (const file of files) {
    const bookName = file.replace(".xml", "");
    const filePath = path.join(SOURCE_DIR, file);

    console.log(`Parsing ${bookName}...`);

    index.push(...parseBookFile(filePath, bookName));
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2));

  console.log(`Done. Wrote ${index.length} Hebrew word entries.`);
}

main();