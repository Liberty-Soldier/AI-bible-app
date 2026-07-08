const fs = require("fs");
const path = require("path");

const {
  cleanText,
  stripStrongPrefix,
  toStrong,
  unique,
} = require("./bibleiq/text-utils");
const { buildOccurrences } = require("./bibleiq/build-occurrences");
const { buildSimple, isProperName } = require("./bibleiq/build-simple");
const { buildContextConnections } = require("./bibleiq/build-context");
const { buildEvidenceModel } = require("./bibleiq/build-evidence-model");

const root = process.cwd();

const hebrewLexiconPath = path.join(
  root,
  "app",
  "data",
  "lexicon",
  "generatedHebrewLexiconV12.json"
);

const hebrewLemmaIndexPath = path.join(
  root,
  "app",
  "data",
  "lexicon",
  "generatedHebrewLemmaIndex.json"
);

const outputPath = path.join(
  root,
  "app",
  "data",
  "lexicon",
  "generatedBibleIQEntities.json"
);

const runtimeEntityRoot = path.join(
  root,
  "public",
  "data",
  "bibleiq",
  "entities"
);

const legacyRuntimeEntityRoot = path.join(
  root,
  "app",
  "data",
  "bibleiq",
  "entities"
);

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required build-time file: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function safePathPart(value) {
  return String(value || "").replace(/[^A-Za-z0-9_-]/g, "");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeRuntimeEntity(entity) {
  const cleanId = entity.id.startsWith("word:")
    ? entity.id.replace(/^word:/, "")
    : entity.id;

  const [source, strong] = cleanId.split(":");

  if (!source || !strong) return false;

  const filePath = path.join(
    runtimeEntityRoot,
    safePathPart(source),
    `${safePathPart(strong)}.json`
  );

  writeJson(filePath, entity);
  return true;
}

function clearRuntimeEntities() {
  for (const targetRoot of [runtimeEntityRoot, legacyRuntimeEntityRoot]) {
    const hebrewDir = path.join(targetRoot, "hebrew");

    if (fs.existsSync(hebrewDir)) {
      fs.rmSync(hebrewDir, { recursive: true, force: true });
    }
  }
}

function buildEntity(lex, lemmaEntry) {
  const strong = toStrong(lex.strong || lex.normalizedLemma || lemmaEntry?.lemma);
  const lemma = lex.lemma || strong;
  const occurrenceCount =
    Number(lex.occurrenceCount || lemmaEntry?.occurrenceCount || 0) || 0;

  const occurrences = buildOccurrences(lemmaEntry);
  const firstOccurrence = occurrences[0]?.reference;
  const properName = isProperName(lex, lemmaEntry);

  const forms = Array.isArray(lex.forms)
    ? lex.forms.slice(0, 8).map(([form]) => form).filter(Boolean)
    : [];

const evidenceModel = buildEvidenceModel({
  lex,
  lemma,
  strong,
  occurrenceCount,
  occurrences,
  properName,
});

const simple = buildSimple({
  lex,
  lemma,
  strong,
  occurrenceCount,
  occurrences,
  properName,
  evidenceModel,
});

  return {
    id: `word:hebrew:${strong}`,
    type: "word",
    title: lemma,
    subtitle: `${strong} • Hebrew ${properName ? "name" : "word"}`,

    simple,

contextConnections: buildContextConnections({
  lemma,
  properName,
  occurrences,
}),

structuredEvidence: evidenceModel,

evidence: {
      originalLanguage: {
        source: "hebrew",
        word: lemma,
        transliteration: lex.transliteration || undefined,
        pronunciation: lex.pronunciation || undefined,
        strong,
        lemmaId: `hebrew:${strong}`,
        partOfSpeech: lex.partOfSpeech || undefined,
        forms,
        morphs: Array.isArray(lex.morphs) ? lex.morphs.slice(0, 10) : [],
      },

      definitions: {
        short: cleanText(lex.shortDefinition),
        usage: cleanText(lex.usage),
        full: cleanText(lex.fullDefinition),
        rootNote: cleanText(lex.sourceRootNote),
        sources: Array.isArray(lex.sources) ? lex.sources : [],
      },

      firstMention: firstOccurrence,
      keyReferences: unique(occurrences.map((item) => item.reference)).slice(
        0,
        8
      ),

      related: {
        people: [],
        places: [],
        concepts: [],
        events: [],
      },

      occurrenceCount,
      occurrences,
    },
  };
}

function main() {
  const hebrewLexicon = readJson(hebrewLexiconPath);
  const hebrewLemmaIndex = readJson(hebrewLemmaIndexPath);

  const lemmaByNumber = new Map();

  for (const item of Array.isArray(hebrewLemmaIndex) ? hebrewLemmaIndex : []) {
    if (!item?.lemma) continue;
    lemmaByNumber.set(String(item.lemma), item);
  }

  const entities = {};

clearRuntimeEntities();

for (const lex of Object.values(hebrewLexicon || {})) {
  const strong = toStrong(lex.strong || lex.normalizedLemma);
  const lemmaNumber = stripStrongPrefix(strong);

  if (!strong || !lemmaNumber) continue;

  const lemmaEntry = lemmaByNumber.get(lemmaNumber);
  const entity = buildEntity(lex, lemmaEntry);

  entities[entity.id] = entity;
}

let runtimeEntityCount = 0;

for (const entity of Object.values(entities)) {
  if (writeRuntimeEntity(entity)) {
    runtimeEntityCount++;
  }
}

  const output = {
    version: 5,
    generatedAt: new Date().toISOString(),
    sourceFiles: [
      "generatedHebrewLexiconV12.json",
      "generatedHebrewLemmaIndex.json",
      "generatedWEB.json",
      "generatedKJV.json",
    ],
    entityCount: Object.keys(entities).length,
    runtimeEntityCount,
    runtimeEntityRoot: "public/data/bibleiq/entities",
    entities,
  };

  writeJson(outputPath, output);

  console.log(`Generated ${output.entityCount} BibleIQ entities`);
  console.log(`Wrote ${runtimeEntityCount} runtime split entities`);
  console.log(outputPath);
  console.log(runtimeEntityRoot);
}

main();