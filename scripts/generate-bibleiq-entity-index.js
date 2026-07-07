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

const outputFile = path.join(
  root,
  "app",
  "data",
  "bibleiq",
  "entity-index.json"
);

function main() {
  if (!fs.existsSync(inputFile)) {
    throw new Error(`Missing input file: ${inputFile}`);
  }

  const raw = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  const entities = raw.entities || {};

  const index = {};

  for (const entity of Object.values(entities)) {
    const lemmaId =
      entity?.evidence?.originalLanguage?.lemmaId ||
      entity?.entityId ||
      entity?.id;

    if (!lemmaId || !entity?.id) continue;

    const [source, strong] = String(lemmaId).split(":");
    if (!source || !strong) continue;

    index[entity.id] = `entities/${source}/${strong}.json`;
  }

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(index, null, 2));

  console.log(`Generated BibleIQ entity index: ${Object.keys(index).length}`);
}

main();