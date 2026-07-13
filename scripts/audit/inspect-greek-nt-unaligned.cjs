const fs = require("fs");
const path = require("path");

const root = process.cwd();

const greekNtDir = path.join(
  root,
  "app",
  "data",
  "bibleiq",
  "canonical",
  "greek-nt"
);

const TARGET_WORDS = new Set(
  process.argv.slice(2).map((word) => word.toLowerCase())
);

if (!TARGET_WORDS.size) {
  console.error(
    "Usage: node scripts\\audit\\inspect-greek-nt-unaligned.cjs man son jesus god lord christ word"
  );
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function summarizeSourceTokens(tokens) {
  return tokens.map((token) => ({
    id: token.id,
    index: token.index,
    surface: token.surface,
    strong: token.strong,
    entityId: token.entityId,
    gloss: token.gloss,
    mounceGloss: token.mounceGloss,
    tyndaleGloss: token.tyndaleGloss,
  }));
}

const examples = [];

for (const file of fs.readdirSync(greekNtDir)) {
  if (!file.endsWith(".json")) continue;

  const bookData = readJson(path.join(greekNtDir, file));

  for (const [verseKey, verse] of Object.entries(bookData)) {
    for (const translationId of ["kjv", "web"]) {
      const translation = verse.translations?.[translationId];
      if (!translation?.tokens) continue;

      for (const token of translation.tokens) {
        const word = normalize(token.normalized || token.text);

        if (!TARGET_WORDS.has(word)) continue;
        if (token.alignmentStatus !== "unaligned") continue;

        examples.push({
          verseKey,
          translation: translationId,
          text: translation.text,
          targetToken: {
            index: token.index,
            text: token.text,
            normalized: token.normalized,
            status: token.alignmentStatus,
          },
          translationTokens: translation.tokens.map((item) => ({
            index: item.index,
            text: item.text,
            normalized: item.normalized,
            status: item.alignmentStatus,
            ids: item.alignedSourceTokenIds,
            entities: item.alignedSourceEntityIds,
            method: item.alignmentMethod,
          })),
          sourceTokens: summarizeSourceTokens(verse.sourceTokens),
        });

        if (examples.length >= 30) {
          console.log(JSON.stringify(examples, null, 2));
          process.exit(0);
        }
      }
    }
  }
}

console.log(JSON.stringify(examples, null, 2));