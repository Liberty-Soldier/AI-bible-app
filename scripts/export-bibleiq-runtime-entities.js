const fs = require("fs");
const path = require("path");

const root = process.cwd();

const inputFile = path.join(
  root,
  "app",
  "data",
  "lexicon",
  "generatedBibleIQEntities.json"
);

const outputRoot = path.join(
  root,
  "app",
  "data",
  "bibleiq",
  "entities"
);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safePart(value) {
  return String(value || "").replace(/[^A-Za-z0-9_-]/g, "");
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  ensureDir(dir);
}

function main() {
  if (!fs.existsSync(inputFile)) {
    console.error(`Missing input file: ${inputFile}`);
    process.exit(1);
  }

  cleanDir(outputRoot);

const raw = JSON.parse(fs.readFileSync(inputFile, "utf8"));

const entities = Array.isArray(raw)
  ? raw
  : Array.isArray(raw.entities)
  ? raw.entities
  : Object.values(raw.entities || {});

let count = 0;

for (const entity of entities) {
    const lemmaId =
  entity?.evidence?.originalLanguage?.lemmaId ||
  entity?.entityId ||
  entity?.id;

if (!lemmaId) continue;

const [source, strong] = String(lemmaId).split(":");

if (!source || !strong) continue;

    const dir = path.join(outputRoot, safePart(source));
    ensureDir(dir);

    fs.writeFileSync(
      path.join(dir, `${safePart(strong)}.json`),
      JSON.stringify(entity),
      "utf8"
    );

    count += 1;
  }

  console.log(`Exported BibleIQ runtime entities: ${count}`);
}

main();