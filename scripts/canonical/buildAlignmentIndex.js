const fs = require("fs");
const path = require("path");
const config = require("./config");
const {
  normalize,
  expandEnglishForEntry,
} = require("./utils/englishExpansion");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function add(index, word, category, entityId) {
  const key = normalize(word);
  if (!key || key.length < 2) return;

  if (!index[key]) {
    index[key] = {
      exact: [],
      morphology: [],
      synonyms: [],
    };
  }

  if (!index[key][category].some((item) => item.entityId === entityId)) {
    index[key][category].push({ entityId });
  }
}

function addKnownSynonyms(index, strong, entityId) {
  const synonyms = {
    H1254: ["create", "created", "creates", "creating", "make", "made"],
    H8064: ["heaven", "heavens", "sky", "skies"],
    H6153: ["evening", "nightfall", "sunset"],
    H3974: ["light", "lights", "luminary", "luminaries"],
    H6213: ["make", "made", "making", "do", "did", "done"],
    H2233: ["seed", "seeds", "offspring", "descendants", "posterity"],
  };

  for (const word of synonyms[strong] || []) {
    add(index, word, "synonyms", entityId);
  }
}

function addEntryToIndex(index, corpusConfig, entry) {
  if (!entry?.strong) return;

  const entityId = `${corpusConfig.source}:${entry.strong}`;
  const expansions = expandEnglishForEntry(entry);

  for (const word of expansions) {
    add(index, word, "morphology", entityId);
  }

  addKnownSynonyms(index, entry.strong, entityId);
}

function buildAlignmentIndex(corpusId, corpusConfig) {
  const lexicon = readJson(corpusConfig.lexiconFile);
  const index = {};

  for (const entry of lexicon) {
    addEntryToIndex(index, corpusConfig, entry);
  }

  const outputDir = path.join(
    process.cwd(),
    ".private",
    "alignment",
    corpusId
  );

  ensureDir(outputDir);

  const outputFile = path.join(outputDir, "generatedAlignmentIndex.json");

  fs.writeFileSync(outputFile, JSON.stringify(index), "utf8");

  console.log(`Built alignment index: ${corpusId}`);
  console.log({
    entries: Object.keys(index).length,
    outputFile,
  });
}

function main() {
  for (const [corpusId, corpusConfig] of Object.entries(config.corpora)) {
    buildAlignmentIndex(corpusId, corpusConfig);
  }
}

main();