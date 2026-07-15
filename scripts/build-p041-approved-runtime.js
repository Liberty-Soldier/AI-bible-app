#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = process.cwd();
const SOURCE_PATH = path.join(
  ROOT,
  ".private",
  "entity",
  "build",
  "P04.1",
  "approved-overrides.json",
);
const OUTPUT_ROOT = path.join(
  ROOT,
  "public",
  "data",
  "bibleiq",
  "word-study",
  "emet-approved",
);
const BASE_P04_CHECKSUM =
  "574c50eab68c6932fa2e29cf0af26e30c18834e9dbf231dfb08ce97f9a88e4a5";
const SHARD_COUNT = 256;
const CORPORA = ["hebrew", "greek-nt", "lxx"];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
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

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function readSource() {
  if (!fs.existsSync(SOURCE_PATH)) {
    return {
      schemaVersion: "1.0.0",
      baseP04Checksum: BASE_P04_CHECKSUM,
      records: {},
    };
  }
  return JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8").replace(/^\uFEFF/, ""));
}

function validateRecord(entityId, record) {
  const corpus = /^word:hebrew:H\d+$/.test(entityId)
    ? "hebrew"
    : /^word:greek-nt:G\d+$/.test(entityId)
      ? "greek-nt"
      : /^word:lxx:L\d+$/.test(entityId)
        ? "lxx"
        : null;
  if (!corpus) throw new Error(`Invalid approved entity ID: ${entityId}`);
  if (record?.approval?.status !== "approved") {
    throw new Error(`${entityId} is not marked approved.`);
  }
  if (!clean(record.headline) || !clean(record.explanation)) {
    throw new Error(`${entityId} is missing headline or explanation.`);
  }
  if (!clean(record.approval.approvedBy) || !clean(record.approval.approvedAt)) {
    throw new Error(`${entityId} is missing human approval provenance.`);
  }
  if (!clean(record.semanticViewChecksum)) {
    throw new Error(`${entityId} is missing semanticViewChecksum.`);
  }
  const citations = Array.isArray(record.citations) ? record.citations : [];
  for (const citation of citations) {
    if (!citation.book || !citation.chapter || !citation.verse) {
      throw new Error(`${entityId} contains an invalid Scripture citation.`);
    }
  }
  return { corpus, citations };
}

function compactRecord(entityId, record, corpus, citations) {
  const explanationChecksum = sha256(clean(record.explanation));
  return {
    c: corpus,
    h: clean(record.headline),
    t: clean(record.explanation),
    r: citations.map((citation) => [
      clean(citation.book),
      Number(citation.chapter),
      Number(citation.verse),
      clean(citation.label),
      clean(citation.evidenceId),
      clean(citation.kind),
    ]),
    x: explanationChecksum,
    s: clean(record.semanticViewChecksum),
    p: clean(record.promptVersion || "emet-p04.1-generator@1.0.0"),
    v: clean(record.reviewerVersion || "emet-p04.1-reviewer@1.0.0"),
    a: clean(record.approval.approvedAt),
    b: clean(record.approval.approvedBy),
  };
}

function main() {
  const source = readSource();
  if (source.baseP04Checksum !== BASE_P04_CHECKSUM) {
    throw new Error("Approved override source does not match the locked P04 checksum.");
  }

  const records = source.records || {};
  const shards = Object.fromEntries(
    CORPORA.map((corpus) => [corpus, new Map()]),
  );

  for (const [entityId, record] of Object.entries(records)) {
    const { corpus, citations } = validateRecord(entityId, record);
    const shardId = shardIdForEntity(entityId);
    if (!shards[corpus].has(shardId)) shards[corpus].set(shardId, {});
    shards[corpus].get(shardId)[entityId] = compactRecord(
      entityId,
      record,
      corpus,
      citations,
    );
  }

  fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

  const corporaManifest = {};
  let totalApproved = 0;
  let totalShards = 0;

  for (const corpus of CORPORA) {
    const shardManifest = {};
    let corpusApproved = 0;
    const corpusRoot = path.join(OUTPUT_ROOT, corpus);
    fs.mkdirSync(corpusRoot, { recursive: true });

    for (const [shardId, entities] of [...shards[corpus].entries()].sort()) {
      const document = {
        version: 1,
        corpus,
        shard: shardId,
        entities,
      };
      const json = `${JSON.stringify(document)}\n`;
      const relativeFile = `${corpus}/${shardId}.json`;
      fs.writeFileSync(path.join(OUTPUT_ROOT, relativeFile), json, "utf8");
      const approved = Object.keys(entities).length;
      shardManifest[shardId] = {
        file: relativeFile,
        approved,
        checksum: sha256(json),
      };
      corpusApproved += approved;
      totalShards += 1;
    }

    corporaManifest[corpus] = {
      approved: corpusApproved,
      shards: shardManifest,
    };
    totalApproved += corpusApproved;
  }

  const manifestWithoutChecksum = {
    version: 1,
    schemaVersion: "1.0.0",
    shardAlgorithm: "fnv1a-32-mod",
    shardCount: SHARD_COUNT,
    source: {
      baseP04Checksum: BASE_P04_CHECKSUM,
    },
    corpora: corporaManifest,
    totals: {
      approved: totalApproved,
      shards: totalShards,
    },
  };
  const manifest = {
    ...manifestWithoutChecksum,
    checksum: sha256(stableStringify(manifestWithoutChecksum)),
  };
  fs.writeFileSync(
    path.join(OUTPUT_ROOT, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  console.log("P04.1 approved runtime built. No AI calls were made.");
  console.log(`- Approved explanations: ${totalApproved}`);
  console.log(`- Shards: ${totalShards}`);
  console.log(`- Output: ${path.relative(ROOT, OUTPUT_ROOT)}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
