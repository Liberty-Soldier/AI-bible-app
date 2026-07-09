const fs = require("fs");
const path = require("path");

const [book, chapter, verse] = process.argv.slice(2);

if (!book || !chapter || !verse) {
  console.error("Usage: node scripts/audit/inspect-canonical-verse.js 1Chr 6 15");
  process.exit(1);
}

const filePath = path.join(
  process.cwd(),
  "app",
  "data",
  "bibleiq",
  "canonical",
  "hebrew",
  `${book}.json`
);

const verseKey = `${book}:${chapter}:${verse}`;

if (!fs.existsSync(filePath)) {
  console.error(`Missing file: ${filePath}`);
  process.exit(1);
}

const bookData = JSON.parse(fs.readFileSync(filePath, "utf8"));
const data = bookData[verseKey];

if (!data) {
  console.error(`Missing verse: ${verseKey}`);
  process.exit(1);
}

console.log("\nREFERENCE");
console.log(data.reference);

console.log("\nSOURCE TOKENS");
for (const token of data.sourceTokens || []) {
  console.log({
    id: token.id,
    index: token.index,
    surface: token.surface,
    lemma: token.lemma,
    strong: token.strong,
    entityId: token.entityId,
    morph: token.morph,
  });
}

console.log("\nTRANSLATIONS");

for (const [translation, translationData] of Object.entries(
  data.translations || {}
)) {
  console.log(`\n--- ${translation.toUpperCase()} ---`);
  console.log(translationData.text);

  for (const token of translationData.tokens || []) {
    const aligned = Array.isArray(token.alignedSourceTokenIds)
      ? token.alignedSourceTokenIds
      : [];

    console.log({
      index: token.index,
      text: token.text,
      normalized: token.normalized,
      alignedSourceTokenIds: aligned,
      confidence: token.confidence,
      method: token.method,
    });
  }
}