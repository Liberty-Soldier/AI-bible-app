const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.cwd();
const P03_PATH = path.join(
  ROOT,
  ".private",
  "entity",
  "build",
  "P03",
  "evidence-packets.json",
);
const P04_PATH = path.join(
  ROOT,
  ".private",
  "entity",
  "build",
  "P04",
  "cached-explanations.json",
);
const GENERATED_LEXICON_PATHS = {
  hebrew: path.join(
    ROOT,
    "app",
    "data",
    "lexicon",
    "generatedHebrewLexiconV12.json",
  ),
  "greek-nt": path.join(
    ROOT,
    "app",
    "data",
    "lexicon",
    "generatedNTGreekLexiconV12.json",
  ),
  lxx: path.join(
    ROOT,
    "app",
    "data",
    "lexicon",
    "generatedLXXGreekLexiconV12.json",
  ),
};
const HEBREW_STRONG_DICTIONARY_PATH = path.join(
  ROOT,
  "sources",
  "hebrew-lexicon",
  "HebrewLexicon-master",
  "sinri",
  "json",
  "StrongHebrewDictionary.json",
);
const OUTPUT_ROOT = path.join(
  ROOT,
  "public",
  "data",
  "bibleiq",
  "word-study",
  "entities",
);

const RUNTIME_VERSION = 1;
const RUNTIME_SCHEMA_VERSION = "1.0.0";
const SHARD_COUNT = 128;
const EXPECTED_ENTITY_COUNT = 27_206;
const EXPECTED_P04_CHECKSUM =
  "574c50eab68c6932fa2e29cf0af26e30c18834e9dbf231dfb08ce97f9a88e4a5";
const EXPECTED_P04_PROMPT_ID = "emet-free-tier-entity-explanation";
const EXPECTED_P04_PROMPT_VERSION = "1.4.5";
const CORPORA = ["hebrew", "greek-nt", "lxx"];
const EXPECTED_BY_CORPUS = {
  hebrew: 8_634,
  "greek-nt": 5_402,
  lxx: 13_170,
};
const SAMPLE_ENTITY_IDS = [
  "word:hebrew:H802",
  "word:greek-nt:G1135",
  "word:lxx:L703209",
];

function fail(message) {
  throw new Error(`[P05] ${message}`);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing required file: ${filePath}`);
  }

  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text);
}

function normalizeLexicalId(value, corpus) {
  const raw = stringValue(value).toUpperCase();
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";

  if (corpus === "hebrew") return `H${Number(digits)}`;
  if (corpus === "greek-nt") return `G${Number(digits)}`;
  if (corpus === "lxx") return `L${Number(digits)}`;
  return "";
}

function generatedLexiconId(entry, corpus) {
  if (corpus === "lxx") {
    return normalizeLexicalId(entry?.lxxId || entry?.id, corpus);
  }

  return normalizeLexicalId(
    entry?.strong || entry?.lexicalId || entry?.id,
    corpus,
  );
}

function loadGeneratedLexiconIndexes() {
  const indexes = {};

  for (const corpus of CORPORA) {
    const filePath = GENERATED_LEXICON_PATHS[corpus];
    const document = readJson(filePath);
    const entries = Array.isArray(document)
      ? document
      : Array.isArray(document?.entries)
        ? document.entries
        : [];

    const index = new Map();

    for (const entry of entries) {
      const lexicalId = generatedLexiconId(entry, corpus);
      if (!lexicalId) continue;

      const current = index.get(lexicalId) || {};

      index.set(
        lexicalId,
        compactObject({
          lemma:
            stringValue(current?.lemma) ||
            stringValue(entry?.lemma),
          normalizedLemma:
            stringValue(current?.normalizedLemma) ||
            stringValue(entry?.normalizedLemma),
          transliteration:
            stringValue(current?.transliteration) ||
            stringValue(entry?.transliteration),
          pronunciation:
            stringValue(current?.pronunciation) ||
            stringValue(entry?.pronunciation),
          language:
            stringValue(current?.language) ||
            stringValue(entry?.language),
        }),
      );
    }

    indexes[corpus] = index;
  }

  const strongDocument = readJson(HEBREW_STRONG_DICTIONARY_PATH);
  const strongEntries =
    strongDocument?.dict &&
    typeof strongDocument.dict === "object" &&
    !Array.isArray(strongDocument.dict)
      ? Object.entries(strongDocument.dict)
      : [];

  for (const [rawLexicalId, entry] of strongEntries) {
    const lexicalId = normalizeLexicalId(rawLexicalId, "hebrew");
    if (!lexicalId) continue;

    const current = indexes.hebrew.get(lexicalId) || {};
    const word = entry?.w || {};

    indexes.hebrew.set(
      lexicalId,
      compactObject({
        lemma:
          stringValue(current?.lemma) ||
          stringValue(word?.w),
        normalizedLemma:
          stringValue(current?.normalizedLemma),
        transliteration:
          stringValue(current?.transliteration) ||
          stringValue(word?.xlit),
        pronunciation:
          stringValue(current?.pronunciation) ||
          stringValue(word?.pron),
        language:
          stringValue(current?.language) ||
          "hebrew",
      }),
    );
  }

  return indexes;
}

function enrichIdentity(identity, corpus, generatedLexicons) {
  const lexicalId = normalizeLexicalId(
    identity?.lexicalId || identity?.strong,
    corpus,
  );
  const fallback = generatedLexicons?.[corpus]?.get(lexicalId) || {};

  return {
    ...identity,
    lemma: stringValue(identity?.lemma) || stringValue(fallback?.lemma),
    normalizedLemma:
      stringValue(identity?.normalizedLemma) ||
      stringValue(fallback?.normalizedLemma),
    lexicalId: stringValue(identity?.lexicalId) || lexicalId,
    strong:
      corpus === "lxx"
        ? undefined
        : stringValue(identity?.strong) || lexicalId,
    language:
      stringValue(identity?.language) || stringValue(fallback?.language),
    transliteration:
      stringValue(identity?.transliteration) ||
      stringValue(fallback?.transliteration),
    pronunciation:
      stringValue(identity?.pronunciation) ||
      stringValue(fallback?.pronunciation),
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function cleanDirectory(directory) {
  if (fs.existsSync(directory)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  fs.mkdirSync(directory, { recursive: true });
}

function stringValue(value) {
  return value == null ? "" : String(value).trim();
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value) {
  return value === true;
}

function uniqueStrings(values) {
  const result = [];
  const seen = new Set();

  for (const value of Array.isArray(values) ? values : []) {
    const clean = stringValue(value);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
  }

  return result;
}

function compactObject(value) {
  const result = {};

  for (const [key, item] of Object.entries(value)) {
    if (item == null) continue;
    if (typeof item === "string" && item.length === 0) continue;
    if (Array.isArray(item) && item.length === 0) continue;
    if (
      typeof item === "object" &&
      !Array.isArray(item) &&
      Object.keys(item).length === 0
    ) {
      continue;
    }
    result[key] = item;
  }

  return result;
}

function entityCorpus(entityId) {
  const parts = stringValue(entityId).split(":");
  const corpus = parts.length >= 3 ? parts[1] : "";
  if (!CORPORA.includes(corpus)) {
    fail(`Unsupported entity corpus for ${entityId}`);
  }
  return corpus;
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

function parseReferenceString(value) {
  const raw = stringValue(value);
  if (!raw) return null;

  let match = raw.match(/^canon:(.+):(\d+):(\d+)$/);
  if (match) {
    return {
      book: match[1],
      chapter: Number(match[2]),
      verse: Number(match[3]),
    };
  }

  match = raw.match(/^(.+)\.(\d+)\.(\d+)$/);
  if (match) {
    return {
      book: match[1],
      chapter: Number(match[2]),
      verse: Number(match[3]),
    };
  }

  match = raw.match(/^(.+?):(\d+):(\d+)$/);
  if (match) {
    return {
      book: match[1],
      chapter: Number(match[2]),
      verse: Number(match[3]),
    };
  }

  match = raw.match(/^(.+?)\s+(\d+):(\d+)$/);
  if (match) {
    return {
      book: match[1],
      chapter: Number(match[2]),
      verse: Number(match[3]),
    };
  }

  return null;
}

function referenceFromObject(value) {
  if (!value || typeof value !== "object") return null;

  const book = stringValue(value.book);
  const chapter = numberValue(value.chapter, -1);
  const verse = numberValue(value.verse, -1);

  if (book && chapter > 0 && verse > 0) {
    return { book, chapter, verse };
  }

  return parseReferenceString(value.reference);
}

function compactRenderings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  return Object.entries(value)
    .map(([translation, renderings]) => [
      stringValue(translation).toLowerCase(),
      uniqueStrings(renderings),
    ])
    .filter(([translation, renderings]) => translation && renderings.length > 0)
    .sort(([left], [right]) => left.localeCompare(right));
}

function compactOccurrence(value) {
  const reference = referenceFromObject(value);
  if (!reference) return null;

  return [
    reference.book,
    reference.chapter,
    reference.verse,
    Math.max(1, numberValue(value?.occurrenceCount, 1)),
    stringValue(value?.evidenceId),
    compactRenderings(value?.renderings),
  ];
}

function compactReferenceList(values) {
  const result = [];
  const seen = new Set();

  for (const value of Array.isArray(values) ? values : []) {
    const compact = compactOccurrence(value);
    if (!compact) continue;

    const key = `${compact[0]}|${compact[1]}|${compact[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(compact);
  }

  return result;
}

function compactChronologyReference(value) {
  const reference = parseReferenceString(value);
  if (!reference) return null;
  return [reference.book, reference.chapter, reference.verse];
}

function compactCitation(value) {
  const reference = referenceFromObject(value);
  if (!reference) return null;

  return [
    reference.book,
    reference.chapter,
    reference.verse,
    stringValue(value?.label || value?.reference),
    stringValue(value?.evidenceId),
    stringValue(value?.kind),
  ];
}

function compactCitations(values) {
  const result = [];
  const seen = new Set();

  for (const value of Array.isArray(values) ? values : []) {
    const compact = compactCitation(value);
    if (!compact) continue;

    const key = `${compact[0]}|${compact[1]}|${compact[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(compact);
  }

  return result;
}

function compactSourceForms(sourceForms) {
  const forms = Array.isArray(sourceForms?.forms)
    ? sourceForms.forms
        .map((form) => [
          stringValue(form?.surface),
          numberValue(form?.count),
        ])
        .filter(([surface, count]) => surface && count > 0)
    : [];

  return [
    numberValue(sourceForms?.countedOccurrences),
    numberValue(sourceForms?.distinctForms),
    forms,
  ];
}

function compactIdentity(identity, corpus) {
  return compactObject({
    l: stringValue(identity?.lemma),
    n: stringValue(identity?.normalizedLemma),
    x: stringValue(identity?.lexicalId),
    s: corpus === "lxx" ? undefined : stringValue(identity?.strong),
    g: stringValue(identity?.language),
    t: stringValue(identity?.transliteration),
    p: stringValue(identity?.pronunciation),
    ps: uniqueStrings(identity?.partsOfSpeech),
    gl: uniqueStrings(identity?.glosses),
    d: uniqueStrings(identity?.shortDefinitions),
    w: uniqueStrings(identity?.witnesses),
    m: uniqueStrings(identity?.morphology),
    me: uniqueStrings(identity?.morphologyEnglish),
    f: compactSourceForms(identity?.sourceForms),
  });
}

function compactOccurrences(occurrences) {
  return compactObject({
    c: numberValue(occurrences?.corpusOccurrenceCount),
    t: numberValue(occurrences?.totalEntityOccurrences),
    u: numberValue(occurrences?.uniqueVerseCount),
    a: numberValue(occurrences?.alignedSourceTokenCount),
    v: numberValue(occurrences?.alignedVerseCount),
    ta: numberValue(occurrences?.translationAlignmentCount),
    f: compactChronologyReference(occurrences?.chronology?.firstOccurrence),
    l: compactChronologyReference(occurrences?.chronology?.lastOccurrence),
    r: compactReferenceList(occurrences?.orderedReferences),
    p: compactReferenceList(occurrences?.representativeReferences),
  });
}

function compactRenderingStats(renderings) {
  const translationCounts =
    renderings?.translationCounts &&
    typeof renderings.translationCounts === "object"
      ? Object.entries(renderings.translationCounts)
          .map(([translation, count]) => [
            stringValue(translation).toLowerCase(),
            numberValue(count),
          ])
          .filter(([translation, count]) => translation && count > 0)
          .sort(([left], [right]) => left.localeCompare(right))
      : [];

  const mostCommon = Array.isArray(renderings?.mostCommon)
    ? renderings.mostCommon
        .map((item) => [
          stringValue(item?.text),
          numberValue(item?.count),
          stringValue(item?.translation).toLowerCase(),
        ])
        .filter(([text, count]) => text && count > 0)
    : [];

  const byTranslation =
    renderings?.byTranslation &&
    typeof renderings.byTranslation === "object"
      ? Object.entries(renderings.byTranslation)
          .map(([translation, values]) => [
            stringValue(translation).toLowerCase(),
            Array.isArray(values)
              ? values
                  .map((item) => [
                    stringValue(item?.text),
                    numberValue(item?.count),
                  ])
                  .filter(([text, count]) => text && count > 0)
              : [],
          ])
          .filter(([translation, values]) => translation && values.length > 0)
          .sort(([left], [right]) => left.localeCompare(right))
      : [];

  return compactObject({
    a: booleanValue(renderings?.available),
    t: numberValue(renderings?.totalAlignedRenderings),
    c: translationCounts,
    m: mostCommon,
    b: byTranslation,
  });
}

function humanizeId(value) {
  const clean = stringValue(value)
    .replace(/^(theme|event|relationship):/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

  if (!clean) return "";
  return clean.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function canonicalReferenceFromPointer(value) {
  return parseReferenceString(value?.pointer?.canonicalId || value?.canonicalId);
}

function compactKnowledgeExample(value, kind) {
  const reference = canonicalReferenceFromPointer(value);
  const referenceTuple = reference
    ? [reference.book, reference.chapter, reference.verse]
    : null;

  if (kind === "relationship") {
    const subject = stringValue(value?.subject);
    const predicate = stringValue(value?.predicate);
    const object = stringValue(value?.object);
    const label = [subject, predicate, object].filter(Boolean).join(" → ");
    const details = uniqueStrings(value?.roles).join(", ");

    return [
      referenceTuple,
      label || "Relationship evidence",
      details ? `Role: ${details}` : "",
      stringValue(value?.confidence),
    ];
  }

  if (kind === "event") {
    const eventType = humanizeId(value?.type) || "Event evidence";
    const participants = uniqueStrings(value?.participantEntityIds);
    const roles = uniqueStrings(value?.roles);
    const details = [
      participants.length ? `Participants: ${participants.join(", ")}` : "",
      roles.length ? `Role: ${roles.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" • ");

    return [
      referenceTuple,
      eventType,
      details,
      stringValue(value?.confidence),
    ];
  }

  const theme = humanizeId(value?.themeId) || "Theme evidence";
  const eventType = humanizeId(value?.eventType);

  return [
    referenceTuple,
    theme,
    eventType ? `Event type: ${eventType}` : "",
    "",
  ];
}

function compactKnowledgeExamples(values, kind) {
  return (Array.isArray(values) ? values : [])
    .map((value) => compactKnowledgeExample(value, kind))
    .filter(Boolean);
}

function compactSeeKnowledge(seeKnowledge) {
  const counts = seeKnowledge?.referenceCounts || {};

  return compactObject({
    a: booleanValue(seeKnowledge?.available),
    c: [
      numberValue(counts.relationships),
      numberValue(counts.events),
      numberValue(counts.themes),
      numberValue(counts.total),
    ],
    r: compactKnowledgeExamples(
      seeKnowledge?.relationships?.excerpts,
      "relationship",
    ),
    e: compactKnowledgeExamples(seeKnowledge?.events?.excerpts, "event"),
    t: compactKnowledgeExamples(seeKnowledge?.themes?.excerpts, "theme"),
  });
}

function compactHealth(health) {
  return compactObject({
    s: stringValue(health?.status),
    a: numberValue(health?.alignmentCoverage),
    e: booleanValue(health?.hasEnglishRenderings),
    g: booleanValue(health?.hasGloss),
    l: booleanValue(health?.hasLemma),
    x: booleanValue(health?.hasLexicalId),
    r: booleanValue(health?.hasReferences),
    c: stringValue(health?.compilerVersion),
  });
}

function compactExplanation(explanation) {
  const headline = stringValue(explanation?.explanation?.headline);
  const text = stringValue(explanation?.explanation?.text);

  if (!text) {
    fail(`P04 explanation text is missing for ${explanation?.entityId}`);
  }

  return compactObject({
    h: headline,
    t: text,
    c: compactCitations(explanation?.citations),
    x: stringValue(explanation?.checksum),
    p: stringValue(explanation?.packetChecksum),
  });
}

function compactEntity(packet, explanation, generatedLexicons) {
  const entityId = stringValue(packet?.entityId);
  const corpus = entityCorpus(entityId);

  if (stringValue(explanation?.entityId) !== entityId) {
    fail(`P03/P04 entity mismatch for ${entityId}`);
  }

  if (stringValue(packet?.corpus) !== corpus) {
    fail(`P03 corpus mismatch for ${entityId}`);
  }

  if (stringValue(explanation?.corpus) !== corpus) {
    fail(`P04 corpus mismatch for ${entityId}`);
  }

  if (
    stringValue(explanation?.packetChecksum) !== stringValue(packet?.checksum)
  ) {
    fail(`P04 packet checksum mismatch for ${entityId}`);
  }

  return compactObject({
    c: corpus,
    i: compactIdentity(
      enrichIdentity(packet?.identity, corpus, generatedLexicons),
      corpus,
    ),
    o: compactOccurrences(packet?.occurrences),
    r: compactRenderingStats(packet?.renderings),
    k: compactSeeKnowledge(packet?.seeKnowledge),
    h: compactHealth(packet?.health),
    e: compactExplanation(explanation),
  });
}

function validateSourceDocuments(p03, p04) {
  const packets = p03?.packets;
  const explanations = p04?.explanations;

  if (!packets || typeof packets !== "object" || Array.isArray(packets)) {
    fail("P03 packets object is missing.");
  }

  if (
    !explanations ||
    typeof explanations !== "object" ||
    Array.isArray(explanations)
  ) {
    fail("P04 explanations object is missing.");
  }

  const p03Ids = Object.keys(packets);
  const p04Ids = Object.keys(explanations);

  if (p03Ids.length !== EXPECTED_ENTITY_COUNT) {
    fail(
      `P03 entity count is ${p03Ids.length}; expected ${EXPECTED_ENTITY_COUNT}.`,
    );
  }

  if (p04Ids.length !== EXPECTED_ENTITY_COUNT) {
    fail(
      `P04 explanation count is ${p04Ids.length}; expected ${EXPECTED_ENTITY_COUNT}.`,
    );
  }

  if (stringValue(p04?.checksum) !== EXPECTED_P04_CHECKSUM) {
    fail(
      `P04 checksum is ${stringValue(
        p04?.checksum,
      )}; expected locked checksum ${EXPECTED_P04_CHECKSUM}.`,
    );
  }

  if (stringValue(p04?.prompt?.id) !== EXPECTED_P04_PROMPT_ID) {
    fail(`Unexpected P04 prompt id: ${stringValue(p04?.prompt?.id)}`);
  }

  if (stringValue(p04?.prompt?.version) !== EXPECTED_P04_PROMPT_VERSION) {
    fail(`Unexpected P04 prompt version: ${stringValue(p04?.prompt?.version)}`);
  }

  const p03Set = new Set(p03Ids);
  const missingPackets = p04Ids.filter((entityId) => !p03Set.has(entityId));
  if (missingPackets.length > 0) {
    fail(`P04 contains ${missingPackets.length} entities missing from P03.`);
  }

  const byCorpus = Object.fromEntries(CORPORA.map((corpus) => [corpus, 0]));

  for (const entityId of p04Ids) {
    byCorpus[entityCorpus(entityId)] += 1;
  }

  for (const corpus of CORPORA) {
    if (byCorpus[corpus] !== EXPECTED_BY_CORPUS[corpus]) {
      fail(
        `${corpus} entity count is ${byCorpus[corpus]}; expected ${EXPECTED_BY_CORPUS[corpus]}.`,
      );
    }
  }

  return {
    packets,
    explanations,
    entityIds: Array.isArray(p04?.entityOrder)
      ? p04.entityOrder.map(stringValue).filter(Boolean)
      : p04Ids.sort(),
    byCorpus,
  };
}

function buildRuntime() {
  console.log("[P05] Reading locked P03 and P04 artifacts...");
  const p03 = readJson(P03_PATH);
  const p04 = readJson(P04_PATH);
  const validated = validateSourceDocuments(p03, p04);
  const generatedLexicons = loadGeneratedLexiconIndexes();

  cleanDirectory(OUTPUT_ROOT);

  const shards = new Map();
  for (const corpus of CORPORA) {
    shards.set(
      corpus,
      Array.from({ length: SHARD_COUNT }, () => ({})),
    );
  }

  const counts = Object.fromEntries(CORPORA.map((corpus) => [corpus, 0]));

  for (const entityId of validated.entityIds) {
    const packet = validated.packets[entityId];
    const explanation = validated.explanations[entityId];

    if (!packet || !explanation) {
      fail(`Missing P03 or P04 record for ${entityId}`);
    }

    const corpus = entityCorpus(entityId);
    const shardId = Number.parseInt(shardIdForEntity(entityId), 16);
    shards.get(corpus)[shardId][entityId] = compactEntity(
      packet,
      explanation,
      generatedLexicons,
    );
    counts[corpus] += 1;
  }

  const manifest = {
    version: RUNTIME_VERSION,
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    shardAlgorithm: "fnv1a-32-mod",
    shardCount: SHARD_COUNT,
    source: {
      p03Checksum: stringValue(p03?.checksum),
      p04Checksum: stringValue(p04?.checksum),
      p04Prompt: {
        id: stringValue(p04?.prompt?.id),
        version: stringValue(p04?.prompt?.version),
        checksum: stringValue(p04?.prompt?.checksum),
      },
    },
    corpora: {},
    totals: {
      entities: 0,
      shards: 0,
      bytes: 0,
      byCorpus: counts,
    },
  };

  for (const corpus of CORPORA) {
    const corpusManifest = {
      entities: counts[corpus],
      shards: {},
    };

    for (let index = 0; index < SHARD_COUNT; index += 1) {
      const records = shards.get(corpus)[index];
      const entityCount = Object.keys(records).length;
      if (entityCount === 0) continue;

      const shardId = index.toString(16).padStart(2, "0");
      const relativeFile = `${corpus}/${shardId}.json`;
      const filePath = path.join(OUTPUT_ROOT, relativeFile);
      const document = {
        version: RUNTIME_VERSION,
        corpus,
        shard: shardId,
        entities: records,
      };
      const serialized = `${JSON.stringify(document)}\n`;

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, serialized, "utf8");

      const bytes = Buffer.byteLength(serialized);
      corpusManifest.shards[shardId] = {
        file: relativeFile,
        entities: entityCount,
        bytes,
        checksum: sha256(serialized),
      };
      manifest.totals.shards += 1;
      manifest.totals.bytes += bytes;
    }

    manifest.corpora[corpus] = corpusManifest;
    manifest.totals.entities += counts[corpus];
  }

  const checksumSource = JSON.stringify(manifest);
  manifest.checksum = sha256(checksumSource);
  writeJson(path.join(OUTPUT_ROOT, "manifest.json"), manifest);

  console.log("");
  console.log("========================================");
  console.log(" EMETSEES P05 Entity Runtime");
  console.log("========================================");
  console.log(`Entities : ${manifest.totals.entities}`);
  console.log(`Hebrew   : ${counts.hebrew}`);
  console.log(`Greek NT : ${counts["greek-nt"]}`);
  console.log(`LXX      : ${counts.lxx}`);
  console.log(`Shards   : ${manifest.totals.shards}`);
  console.log(
    `Size     : ${(manifest.totals.bytes / 1024 / 1024).toFixed(2)} MB`,
  );
  console.log(`P04      : ${manifest.source.p04Checksum}`);
  console.log(`Checksum : ${manifest.checksum}`);
  console.log(`Output   : ${OUTPUT_ROOT}`);
  console.log("");

  verifyRuntime();
}

function verifyRuntime() {
  const manifestPath = path.join(OUTPUT_ROOT, "manifest.json");
  const manifest = readJson(manifestPath);

  if (manifest?.version !== RUNTIME_VERSION) {
    fail(`Runtime version mismatch in ${manifestPath}`);
  }

  if (manifest?.schemaVersion !== RUNTIME_SCHEMA_VERSION) {
    fail(`Runtime schema mismatch in ${manifestPath}`);
  }

  if (manifest?.shardCount !== SHARD_COUNT) {
    fail(`Runtime shard count mismatch in ${manifestPath}`);
  }

  if (manifest?.source?.p04Checksum !== EXPECTED_P04_CHECKSUM) {
    fail(
      `Runtime P04 checksum is ${manifest?.source?.p04Checksum}; expected ${EXPECTED_P04_CHECKSUM}.`,
    );
  }

  if (manifest?.totals?.entities !== EXPECTED_ENTITY_COUNT) {
    fail(
      `Runtime contains ${manifest?.totals?.entities} entities; expected ${EXPECTED_ENTITY_COUNT}.`,
    );
  }

  let verifiedEntities = 0;
  let verifiedShards = 0;
  let verifiedBytes = 0;

  for (const corpus of CORPORA) {
    const corpusManifest = manifest?.corpora?.[corpus];
    if (!corpusManifest) {
      fail(`Runtime manifest is missing corpus ${corpus}.`);
    }

    if (corpusManifest.entities !== EXPECTED_BY_CORPUS[corpus]) {
      fail(
        `Runtime ${corpus} count is ${corpusManifest.entities}; expected ${EXPECTED_BY_CORPUS[corpus]}.`,
      );
    }

    for (const [shardId, shard] of Object.entries(
      corpusManifest.shards || {},
    )) {
      const filePath = path.join(OUTPUT_ROOT, shard.file);
      if (!fs.existsSync(filePath)) {
        fail(`Missing runtime shard ${filePath}`);
      }

      const stat = fs.statSync(filePath);
      if (stat.size !== shard.bytes) {
        fail(`Byte count mismatch for ${shard.file}`);
      }

      if (fileSha256(filePath) !== shard.checksum) {
        fail(`Checksum mismatch for ${shard.file}`);
      }

      const document = readJson(filePath);
      if (
        document?.version !== RUNTIME_VERSION ||
        document?.corpus !== corpus ||
        document?.shard !== shardId
      ) {
        fail(`Shard identity mismatch for ${shard.file}`);
      }

      const entityCount = Object.keys(document?.entities || {}).length;
      if (entityCount !== shard.entities) {
        fail(`Entity count mismatch for ${shard.file}`);
      }

      for (const [entityId, record] of Object.entries(
        document?.entities || {},
      )) {
        if (entityCorpus(entityId) !== corpus || record?.c !== corpus) {
          fail(`Corpus identity mismatch for ${entityId}`);
        }

        if (!stringValue(record?.e?.t)) {
          fail(`Cached explanation is missing for ${entityId}`);
        }

        if (corpus === "lxx" && stringValue(record?.i?.s)) {
          fail(`LXX entity ${entityId} unexpectedly contains a Strong number.`);
        }
      }

      verifiedEntities += entityCount;
      verifiedShards += 1;
      verifiedBytes += stat.size;
    }
  }

  if (verifiedEntities !== EXPECTED_ENTITY_COUNT) {
    fail(
      `Verified ${verifiedEntities} runtime entities; expected ${EXPECTED_ENTITY_COUNT}.`,
    );
  }

  for (const entityId of SAMPLE_ENTITY_IDS) {
    const corpus = entityCorpus(entityId);
    const shardId = shardIdForEntity(entityId);
    const shardMeta = manifest?.corpora?.[corpus]?.shards?.[shardId];
    if (!shardMeta) {
      fail(`Sample shard is missing for ${entityId}`);
    }

    const document = readJson(path.join(OUTPUT_ROOT, shardMeta.file));
    if (!document?.entities?.[entityId]) {
      fail(`Sample entity is missing from runtime: ${entityId}`);
    }
  }

  console.log(
    `[P05] Runtime verified: ${verifiedEntities} entities, ${verifiedShards} shards, ${(verifiedBytes / 1024 / 1024).toFixed(2)} MB.`,
  );
}

const verifyOnly = process.argv.includes("--verify-runtime");

try {
  if (verifyOnly) {
    verifyRuntime();
  } else {
    buildRuntime();
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
