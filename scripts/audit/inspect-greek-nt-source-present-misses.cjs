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

const word = String(process.argv[2] || "").toLowerCase();
const limit = Number(process.argv[3] || 20);

if (!word) {
  console.error(
    "Usage: node scripts\\audit\\inspect-greek-nt-source-present-misses.cjs god 20"
  );
  process.exit(1);
}

const EXPECTED = {
  jesus: ["G2424"],
  christ: ["G5547"],
  messiah: ["G5547"],
  god: ["G2316"],
  lord: ["G2962"],
  man: ["G0444", "G0435"],
  son: ["G5207"],
  holy: ["G0040"],
  spirit: ["G4151"],
  word: ["G3056"],
  law: ["G3551"],
  believe: ["G4100"],
  light: ["G5457"],
  body: ["G4983"],
  death: ["G2288"],
  disciples: ["G3101"],
  faith: ["G4102"],
  father: ["G3962"],
  gospel: ["G2098"],
  jews: ["G2453"],
  king: ["G0935"],
  righteousness: ["G1343"],
  sins: ["G0266", "G0264"],
  works: ["G2041"],
  world: ["G2889"],
};

const expectedStrongs = new Set(EXPECTED[word] || []);

if (!expectedStrongs.size) {
  console.error(`No expected Strong family configured for: ${word}`);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function simplifyToken(token) {
  return {
    index: token.index,
    text: token.text,
    normalized: token.normalized,
    status: token.alignmentStatus,
    reason: token.alignmentReason,
    ids: token.alignedSourceTokenIds,
    entities: token.alignedSourceEntityIds,
    method: token.alignmentMethod,
  };
}

function simplifySource(token) {
  return {
    id: token.id,
    index: token.index,
    surface: token.surface,
    strong: token.strong,
    entityId: token.entityId,
    gloss: token.gloss,
    mounceGloss: token.mounceGloss,
    tyndaleGloss: token.tyndaleGloss,
  };
}

const examples = [];

for (const file of fs.readdirSync(greekNtDir)) {
  if (!file.endsWith(".json")) continue;

  const bookData = readJson(path.join(greekNtDir, file));

  for (const [verseKey, verse] of Object.entries(bookData)) {
    const expectedSourceTokens = verse.sourceTokens.filter((sourceToken) =>
      expectedStrongs.has(sourceToken.strong)
    );

    if (!expectedSourceTokens.length) continue;

    for (const translationId of ["kjv", "web"]) {
      const translation = verse.translations?.[translationId];
      if (!translation?.tokens) continue;

      for (const token of translation.tokens) {
        const normalized = normalize(token.normalized || token.text);

        if (normalized !== word) continue;
        if (token.alignmentStatus !== "unaligned") continue;

        examples.push({
          verseKey,
          translation: translationId,
          text: translation.text,
          target: simplifyToken(token),
          expectedSourceTokens: expectedSourceTokens.map(simplifySource),
          translationTokens: translation.tokens.map(simplifyToken),
        });

        if (examples.length >= limit) {
          console.log(JSON.stringify(examples, null, 2));
          process.exit(0);
        }
      }
    }
  }
}

console.log(JSON.stringify(examples, null, 2));