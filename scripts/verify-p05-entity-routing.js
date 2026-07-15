#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const ALIGNMENT_ROOT = path.join(
  ROOT,
  "public",
  "data",
  "bibleiq",
  "word-study",
);
const ENTITY_ROOT = path.join(ALIGNMENT_ROOT, "entities");
const REPORT_ROOT = path.join(ROOT, "reports");
const CORPORA = ["hebrew", "greek-nt", "lxx"];

function fail(message) {
  throw new Error(`[P05 routing] ${message}`);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) fail(`Missing file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function normalizeWordEntityId(entityId) {
  const value = String(entityId || "").trim();
  if (!value) return null;

  const parts = value.split(":").filter(Boolean);
  const hasWordPrefix = parts[0] === "word";
  const corpus = hasWordPrefix ? parts[1] : parts[0];
  const lexicalId = (hasWordPrefix ? parts.slice(2) : parts.slice(1)).join(":");

  const valid =
    corpus === "hebrew"
      ? /^H\d+$/.test(lexicalId)
      : corpus === "greek-nt"
        ? /^G\d+$/.test(lexicalId)
        : corpus === "lxx"
          ? /^L\d+$/.test(lexicalId)
          : false;

  return valid ? `word:${corpus}:${lexicalId}` : null;
}

function hashEntityId(entityId) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < entityId.length; index += 1) {
    hash ^= entityId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function shardIdForEntity(entityId, shardCount) {
  return (hashEntityId(entityId) % shardCount)
    .toString(16)
    .padStart(2, "0");
}

function main() {
  const alignmentManifest = readJson(path.join(ALIGNMENT_ROOT, "manifest.json"));
  const entityManifest = readJson(path.join(ENTITY_ROOT, "manifest.json"));

  const uniqueByCorpus = Object.fromEntries(
    CORPORA.map((corpus) => [corpus, new Map()]),
  );
  const rawShapeCounts = {};
  const invalid = [];
  let sourceTokenCount = 0;
  let tokensWithEntityId = 0;

  for (const corpus of CORPORA) {
    const books = alignmentManifest?.corpora?.[corpus]?.books || {};

    for (const [bookFile, metadata] of Object.entries(books)) {
      const relativeFile = metadata?.file || bookFile;
      const document = readJson(path.join(ALIGNMENT_ROOT, corpus, relativeFile));

      for (const verse of Object.values(document?.verses || {})) {
        for (const token of verse?.s || []) {
          sourceTokenCount += 1;
          const rawEntityId = String(token?.[4] || "").trim();
          if (!rawEntityId) continue;
          tokensWithEntityId += 1;

          const shape = rawEntityId.startsWith("word:")
            ? "canonical-word-prefix"
            : rawEntityId.split(":").length >= 2
              ? "legacy-corpus-prefix"
              : "invalid";
          rawShapeCounts[`${corpus}:${shape}`] =
            (rawShapeCounts[`${corpus}:${shape}`] || 0) + 1;

          const canonical = normalizeWordEntityId(rawEntityId);
          if (!canonical) {
            if (invalid.length < 100) invalid.push({ corpus, rawEntityId });
            continue;
          }

          const canonicalCorpus = canonical.split(":")[1];
          if (canonicalCorpus !== corpus) {
            if (invalid.length < 100) {
              invalid.push({ corpus, rawEntityId, canonical, reason: "corpus-mismatch" });
            }
            continue;
          }

          const existing = uniqueByCorpus[corpus].get(canonical);
          if (existing) {
            existing.tokenCount += 1;
            existing.rawIds.add(rawEntityId);
          } else {
            uniqueByCorpus[corpus].set(canonical, {
              tokenCount: 1,
              rawIds: new Set([rawEntityId]),
            });
          }
        }
      }
    }
  }

  const missing = [];
  const shardGroups = new Map();

  for (const corpus of CORPORA) {
    for (const entityId of uniqueByCorpus[corpus].keys()) {
      const shardId = shardIdForEntity(entityId, entityManifest.shardCount);
      const key = `${corpus}|${shardId}`;
      if (!shardGroups.has(key)) shardGroups.set(key, []);
      shardGroups.get(key).push(entityId);
    }
  }

  for (const [key, entityIds] of shardGroups) {
    const [corpus, shardId] = key.split("|");
    const metadata = entityManifest?.corpora?.[corpus]?.shards?.[shardId];
    if (!metadata) {
      for (const entityId of entityIds) {
        if (missing.length < 500) missing.push({ entityId, reason: "missing-shard" });
      }
      continue;
    }

    const shard = readJson(path.join(ENTITY_ROOT, metadata.file));
    for (const entityId of entityIds) {
      if (!shard?.entities?.[entityId] && missing.length < 500) {
        missing.push({ entityId, reason: "missing-entity", shard: metadata.file });
      }
    }
  }

  const byCorpus = {};
  for (const corpus of CORPORA) {
    const entries = [...uniqueByCorpus[corpus].entries()];
    byCorpus[corpus] = {
      uniqueEntitiesFromAlignment: entries.length,
      tokens: entries.reduce((sum, [, value]) => sum + value.tokenCount, 0),
      legacyIdEntities: entries.filter(([, value]) =>
        [...value.rawIds].some((raw) => !raw.startsWith("word:")),
      ).length,
      canonicalIdEntities: entries.filter(([, value]) =>
        [...value.rawIds].some((raw) => raw.startsWith("word:")),
      ).length,
      sample: entries.slice(0, 10).map(([entityId, value]) => ({
        entityId,
        rawIds: [...value.rawIds],
        tokenCount: value.tokenCount,
      })),
    };
  }

  const requiredSamples = ["word:hebrew:H430", "word:greek-nt:G2424"];
  const sampleChecks = requiredSamples.map((entityId) => {
    const corpus = entityId.split(":")[1];
    const shardId = shardIdForEntity(entityId, entityManifest.shardCount);
    const metadata = entityManifest?.corpora?.[corpus]?.shards?.[shardId];
    const exists = Boolean(
      metadata && readJson(path.join(ENTITY_ROOT, metadata.file))?.entities?.[entityId],
    );
    return { entityId, shardId, exists };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    sourceTokenCount,
    tokensWithEntityId,
    rawShapeCounts,
    byCorpus,
    invalidCount: invalid.length,
    invalid,
    missingCount: missing.length,
    missing,
    sampleChecks,
  };

  fs.mkdirSync(REPORT_ROOT, { recursive: true });
  fs.writeFileSync(
    path.join(REPORT_ROOT, "p05-entity-routing-audit.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  if (invalid.length > 0) fail(`Found ${invalid.length} invalid aligned entity IDs.`);
  if (missing.length > 0) fail(`Found ${missing.length} aligned entities missing from the P05 runtime.`);
  if (sampleChecks.some((sample) => !sample.exists)) {
    fail("Required Hebrew/Greek sample entities did not resolve.");
  }

  const totalUnique = CORPORA.reduce(
    (sum, corpus) => sum + byCorpus[corpus].uniqueEntitiesFromAlignment,
    0,
  );

  console.log("P05 end-to-end entity routing verified.");
  console.log(`- Source tokens scanned: ${sourceTokenCount.toLocaleString()}`);
  console.log(`- Tokens with entity IDs: ${tokensWithEntityId.toLocaleString()}`);
  console.log(`- Unique aligned entities: ${totalUnique.toLocaleString()}`);
  for (const corpus of CORPORA) {
    console.log(
      `- ${corpus}: ${byCorpus[corpus].uniqueEntitiesFromAlignment.toLocaleString()} entities (${byCorpus[corpus].legacyIdEntities.toLocaleString()} required prefix normalization)`,
    );
  }
  console.log("- Missing runtime entities: 0");
  console.log(`- Report: reports/p05-entity-routing-audit.json`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
