"use strict";

const fs = require("fs");
const path = require("path");
const { parseTaggedOccurrenceStream } = require("./lxx-occurrence-resolver.cjs");

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(
  ROOT,
  "public/data/bibleiq/source-breakdown/runtime/lxx",
);
const ENTITY_ROOT = path.join(ROOT, "public/data/bibleiq/word-study/entities/lxx");
const LEXICON_PATH = path.join(
  ROOT,
  "app/data/lexicon/generatedLXXGreekLexiconV12.json",
);
const MORPH_PATH = path.join(
  ROOT,
  "sources/lxx-greek/LXX-Rahlfs-1935-master/11_end-users_files/MyBible/Bibles/LXX_final_main.csv",
);
const OUTPUT_ROOT = path.join(
  ROOT,
  "public/data/bibleiq/word-study/lxx-occurrence-fallback",
);
const SHARD_COUNT = 64;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function hashEntityId(entityId) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < entityId.length; index += 1) {
    hash ^= entityId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

function shardIdForEntity(entityId) {
  return (hashEntityId(entityId) % SHARD_COUNT)
    .toString(16)
    .padStart(2, "0");
}

function verifyRuntimeArtifacts() {
  const manifestPath = path.join(OUTPUT_ROOT, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("LXX occurrence fallback manifest is missing.");
  }

  const manifest = readJson(manifestPath);
  if (
    manifest.schema !== "emet-lxx-occurrence-entity-fallback-manifest/v1" ||
    manifest.shardAlgorithm !== "fnv1a-32-mod" ||
    manifest.shardCount !== SHARD_COUNT ||
    manifest.policy?.identityAuthority !==
      "LXX_final_main.csv occurrence stream" ||
    manifest.policy?.englishAlignmentChoosesIdentity !== false ||
    manifest.policy?.cachedEmetExplanationAvailable !== false
  ) {
    throw new Error("LXX occurrence fallback manifest contract is invalid.");
  }

  const expectedFiles = new Set(["manifest.json"]);
  let entityCount = 0;

  for (let index = 0; index < SHARD_COUNT; index += 1) {
    const shardId = index.toString(16).padStart(2, "0");
    const meta = manifest.shards?.[shardId];
    if (!meta || meta.file !== `${shardId}.json`) {
      throw new Error(`LXX occurrence fallback shard metadata is missing: ${shardId}.`);
    }

    expectedFiles.add(meta.file);
    const shardPath = path.join(OUTPUT_ROOT, meta.file);
    if (!fs.existsSync(shardPath)) {
      throw new Error(`LXX occurrence fallback shard is missing: ${meta.file}.`);
    }
    if (fs.statSync(shardPath).size !== meta.bytes) {
      throw new Error(`LXX occurrence fallback shard byte count is stale: ${meta.file}.`);
    }

    const shard = readJson(shardPath);
    const entries = Object.entries(shard.entities || {});
    if (
      shard.schema !== "emet-lxx-occurrence-entity-fallback-shard/v1" ||
      shard.shard !== shardId ||
      shard.entityCount !== entries.length ||
      meta.entityCount !== entries.length
    ) {
      throw new Error(`LXX occurrence fallback shard contract is invalid: ${meta.file}.`);
    }

    for (const [entityId, entity] of entries) {
      const lexicalId = entityId.replace(/^word:lxx:/, "");
      if (
        !/^word:lxx:L\d+$/.test(entityId) ||
        shardIdForEntity(entityId) !== shardId ||
        entity?.entityId !== entityId ||
        entity?.corpus !== "lxx" ||
        entity?.identity?.lexicalId !== lexicalId ||
        entity?.health?.status !== "occurrence-backed-lexical-fallback" ||
        entity?.explanation?.citations?.length !== 0
      ) {
        throw new Error(`LXX occurrence fallback entity contract is invalid: ${entityId}.`);
      }
    }

    entityCount += entries.length;
  }

  const actualFiles = fs
    .readdirSync(OUTPUT_ROOT)
    .filter((file) => file.endsWith(".json"));
  if (
    actualFiles.length !== expectedFiles.size ||
    actualFiles.some((file) => !expectedFiles.has(file)) ||
    entityCount !== manifest.entityCount
  ) {
    throw new Error("LXX occurrence fallback runtime set is incomplete or stale.");
  }

  console.log(
    `[LXX occurrence fallback] ${entityCount} committed entities across ${SHARD_COUNT} shards verified without private source inputs.`,
  );
}

function main() {
  if (process.argv.includes("--verify-runtime")) {
    verifyRuntimeArtifacts();
    return;
  }

  const existing = new Map();
  for (const file of fs.readdirSync(ENTITY_ROOT)) {
    if (!file.endsWith(".json")) continue;
    const shard = readJson(path.join(ENTITY_ROOT, file));
    for (const [entityId, entity] of Object.entries(shard.entities || {})) {
      existing.set(entityId, entity);
    }
  }

  const lexicon = readJson(LEXICON_PATH);
  const lexiconById = new Map(lexicon.map((entry) => [entry.lxxId, entry]));
  const aggregates = new Map();

  for (const line of fs.readFileSync(MORPH_PATH, "utf8").split(/\r?\n/)) {
    if (!line) continue;
    const first = line.indexOf("\t");
    const second = line.indexOf("\t", first + 1);
    const third = line.indexOf("\t", second + 1);
    if (first < 0 || second < 0 || third < 0) continue;
    const verseKey = line.slice(0, third);

    for (const occurrence of parseTaggedOccurrenceStream(line.slice(third + 1))) {
      const entityId = `word:lxx:${occurrence.lexicalId}`;
      if (!aggregates.has(entityId)) {
        aggregates.set(entityId, {
          lexicalId: occurrence.lexicalId,
          count: 0,
          forms: new Map(),
          morphology: new Set(),
          verseKeys: new Set(),
          references: new Map(),
        });
      }
      const aggregate = aggregates.get(entityId);
      aggregate.count += 1;
      increment(aggregate.forms, occurrence.surface);
      aggregate.morphology.add(occurrence.morphology);
      aggregate.verseKeys.add(verseKey);
    }
  }

  for (const file of fs.readdirSync(SOURCE_ROOT)) {
    if (!file.endsWith(".json")) continue;
    const shard = readJson(path.join(SOURCE_ROOT, file));

    for (const verse of Object.values(shard.verses || {})) {
      for (const occurrence of verse.occurrences || []) {
        if (
          occurrence.lexicalResolution?.status !== "resolved" ||
          !occurrence.entityId
        ) {
          continue;
        }

        const aggregate = aggregates.get(occurrence.entityId);
        if (!aggregate) continue;
        const referenceKey = `${verse.book}:${verse.chapter}:${verse.verse}`;
        if (!aggregate.references.has(referenceKey)) {
          aggregate.references.set(referenceKey, {
            book: verse.book,
            chapter: Number(verse.chapter),
            verse: Number(verse.verse),
            occurrenceCount: 0,
          });
        }
        aggregate.references.get(referenceKey).occurrenceCount += 1;
      }
    }
  }

  const entities = {};
  for (const [entityId, aggregate] of [...aggregates].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const lexical = lexiconById.get(aggregate.lexicalId);
    if (!lexical) throw new Error(`Missing LXX lexicon entry: ${aggregate.lexicalId}`);
    const authoritativeForms = [...aggregate.forms]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const existingEntity = existing.get(entityId);
    const existingForms = [...(existingEntity?.i?.f?.[2] || [])]
      .map(([surface, count]) => [String(surface), Number(count)])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const evidenceMatches = Boolean(
      existingEntity &&
        Number(existingEntity?.o?.c || existingEntity?.o?.t || 0) ===
          aggregate.count &&
        JSON.stringify(existingForms) === JSON.stringify(authoritativeForms),
    );
    if (evidenceMatches) continue;

    const references = [...aggregate.references.values()].sort(
      (a, b) =>
        a.book.localeCompare(b.book) ||
        a.chapter - b.chapter ||
        a.verse - b.verse,
    );

    entities[entityId] = {
      entityId,
      corpus: "lxx",
      identity: {
        lemma: lexical.lemma || undefined,
        normalizedLemma: lexical.normalizedLemma || undefined,
        lexicalId: aggregate.lexicalId,
        language: lexical.language || "greek",
        transliteration: lexical.transliteration || undefined,
        pronunciation: lexical.pronunciation || undefined,
        partsOfSpeech: lexical.partOfSpeech ? [lexical.partOfSpeech] : [],
        glosses: lexical.gloss ? [lexical.gloss] : [],
        shortDefinitions: lexical.shortDefinition
          ? [lexical.shortDefinition]
          : [],
        witnesses: ["LXX Rahlfs lexicon", "LXX_final_main.csv"],
        morphology: [...aggregate.morphology].sort(),
        morphologyEnglish: [],
        countedSourceForms: aggregate.count,
        distinctSourceForms: aggregate.forms.size,
        sourceForms: authoritativeForms
          .map(([surface, count]) => ({ surface, count })),
      },
      occurrences: {
        corpusOccurrenceCount: aggregate.count,
        totalEntityOccurrences: aggregate.count,
        uniqueVerseCount: aggregate.verseKeys.size,
        alignedSourceTokenCount: 0,
        alignedVerseCount: 0,
        translationAlignmentCount: 0,
        orderedReferences: references.slice(0, 100).map((reference) => ({
          ...reference,
          renderings: {},
        })),
        representativeReferences: references.slice(0, 20).map((reference) => ({
          ...reference,
          renderings: {},
        })),
      },
      renderings: {
        available: false,
        totalAlignedRenderings: 0,
        translationCounts: [],
        mostCommon: [],
        byTranslation: [],
      },
      seeKnowledge: {
        available: false,
        relationshipCount: 0,
        eventCount: 0,
        themeCount: 0,
        totalReferenceCount: 0,
        relationships: [],
        events: [],
        themes: [],
      },
      health: {
        status: "occurrence-backed-lexical-fallback",
        alignmentCoverage: 0,
        hasEnglishRenderings: false,
        hasGloss: Boolean(lexical.gloss || lexical.shortDefinition),
        hasLemma: Boolean(lexical.lemma),
        hasLexicalId: true,
        hasReferences: references.length > 0,
        compilerVersion: "lxx-occurrence-fallback/v1",
      },
      explanation: {
        text: "No cached EMET explanation is available for this occurrence-backed lexical entity.",
        citations: [],
      },
    };
  }

  const policy = {
    identityAuthority: "LXX_final_main.csv occurrence stream",
    lexicalMetadataAuthority: "generatedLXXGreekLexiconV12.json exact ID",
    englishAlignmentChoosesIdentity: false,
    cachedEmetExplanationAvailable: false,
    inclusion:
      "missing entities or entities whose locked occurrence evidence disagrees with the authoritative stream",
  };
  const shardEntities = new Map();
  for (const [entityId, entity] of Object.entries(entities)) {
    const shardId = shardIdForEntity(entityId);
    if (!shardEntities.has(shardId)) shardEntities.set(shardId, {});
    shardEntities.get(shardId)[entityId] = entity;
  }

  const outputFiles = new Map();
  const shardManifest = {};
  for (let index = 0; index < SHARD_COUNT; index += 1) {
    const shardId = index.toString(16).padStart(2, "0");
    const shard = {
      schema: "emet-lxx-occurrence-entity-fallback-shard/v1",
      shard: shardId,
      entityCount: Object.keys(shardEntities.get(shardId) || {}).length,
      entities: shardEntities.get(shardId) || {},
    };
    const serialized = `${JSON.stringify(shard)}\n`;
    const file = `${shardId}.json`;
    outputFiles.set(file, serialized);
    shardManifest[shardId] = {
      file,
      entityCount: shard.entityCount,
      bytes: Buffer.byteLength(serialized),
    };
  }

  const manifest = {
    schema: "emet-lxx-occurrence-entity-fallback-manifest/v1",
    shardAlgorithm: "fnv1a-32-mod",
    shardCount: SHARD_COUNT,
    policy: {
      ...policy,
    },
    entityCount: Object.keys(entities).length,
    shards: shardManifest,
  };
  outputFiles.set("manifest.json", `${JSON.stringify(manifest)}\n`);

  if (process.argv.includes("--verify")) {
    for (const [file, serialized] of outputFiles) {
      const outputPath = path.join(OUTPUT_ROOT, file);
      if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== serialized) {
        throw new Error(
          `LXX occurrence fallback shard is stale: ${file}. Rebuild without --verify.`,
        );
      }
    }
    const actualFiles = fs.existsSync(OUTPUT_ROOT)
      ? fs.readdirSync(OUTPUT_ROOT).filter((file) => file.endsWith(".json"))
      : [];
    if (
      actualFiles.length !== outputFiles.size ||
      actualFiles.some((file) => !outputFiles.has(file))
    ) {
      throw new Error("LXX occurrence fallback shard set is stale.");
    }
  } else {
    fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
    for (const file of fs.readdirSync(OUTPUT_ROOT)) {
      if (file.endsWith(".json") && !outputFiles.has(file)) {
        fs.unlinkSync(path.join(OUTPUT_ROOT, file));
      }
    }
    for (const [file, serialized] of outputFiles) {
      fs.writeFileSync(path.join(OUTPUT_ROOT, file), serialized, "utf8");
    }
  }

  console.log(
    `[LXX occurrence fallback] ${manifest.entityCount} authoritative entities across ${SHARD_COUNT} shards verified.`,
  );
}

main();
