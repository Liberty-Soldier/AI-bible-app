"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const RUNTIME_ROOT = path.join(
  ROOT,
  "public",
  "data",
  "bibleiq",
  "word-study",
  "entities",
);

function fail(message) {
  throw new Error(`[P05 language display] ${message}`);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing file: ${filePath}`);
  }
  return JSON.parse(
    fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""),
  );
}

function hashEntityId(entityId) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < entityId.length; index += 1) {
    hash ^= entityId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function loadCompactEntity(entityId) {
  const [, corpus] = entityId.split(":");
  const manifest = readJson(path.join(RUNTIME_ROOT, "manifest.json"));
  const shardId = (hashEntityId(entityId) % manifest.shardCount)
    .toString(16)
    .padStart(2, "0");
  const shardMeta = manifest?.corpora?.[corpus]?.shards?.[shardId];
  if (!shardMeta) fail(`Missing shard for ${entityId}`);
  const shard = readJson(path.join(RUNTIME_ROOT, shardMeta.file));
  const entity = shard?.entities?.[entityId];
  if (!entity) fail(`Missing entity ${entityId}`);
  return entity;
}

function requireText(value, label) {
  if (!String(value || "").trim()) fail(`${label} is missing`);
}

function main() {
  const hebrew = loadCompactEntity("word:hebrew:H430");
  requireText(hebrew?.i?.t, "H430 transliteration");
  requireText(hebrew?.i?.p, "H430 pronunciation");

  const hebrewDefinitions = [
    ...(Array.isArray(hebrew?.i?.d) ? hebrew.i.d : []),
    ...(Array.isArray(hebrew?.i?.gl) ? hebrew.i.gl : []),
  ];

  if (!hebrewDefinitions.some((value) => String(value || "").trim())) {
    fail("H430 Strong definition is missing");
  }

  const h430DefinitionText = hebrewDefinitions
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  for (const requiredWord of [
    "sense",
    "specifically",
    "supreme",
    "magistrates",
    "sometimes",
    "superlative",
  ]) {
    if (!h430DefinitionText.includes(requiredWord)) {
      fail(
        `H430 Strong definition is corrupted; missing "${requiredWord}"`,
      );
    }
  }

  const greekNt = loadCompactEntity("word:greek-nt:G2424");
  requireText(greekNt?.i?.t, "G2424 transliteration");

  const lxx = loadCompactEntity("word:lxx:L708210");
  requireText(lxx?.i?.t, "L708210 transliteration");

  if (String(lxx?.i?.s || "").trim()) {
    fail("LXX entity L708210 must not contain a Strong number");
  }

  const sheetPath = path.join(
    ROOT,
    "app",
    "components",
    "WordStudySheet.tsx",
  );
  const sheet = fs.readFileSync(sheetPath, "utf8");

  if (!sheet.includes('Transliteration:{" "}')) {
    fail("WordStudySheet must explicitly label transliteration");
  }

  if (!sheet.includes("Pronounced:")) {
    fail("WordStudySheet must retain a distinct pronunciation label");
  }

  if (!sheet.includes("Strong's definition")) {
    fail("WordStudySheet must expose the Strong definition in the lexicon view");
  }

  if (
    !sheet.includes(
      "const pronunciation = original?.pronunciation || lexical?.pronunciation;",
    )
  ) {
    fail("Pronunciation must remain optional and separate from transliteration");
  }

  console.log("P05 language-label verification passed.");
  console.log(`- H430 transliteration: ${hebrew.i.t}`);
  console.log(`- H430 pronunciation: ${hebrew.i.p}`);
  console.log(`- G2424 transliteration: ${greekNt.i.t}`);
  console.log(
    `- G2424 pronunciation: ${greekNt.i.p || "not supplied; transliteration is labeled correctly"}`,
  );
  console.log(`- L708210 transliteration: ${lxx.i.t}`);
  console.log(
    `- L708210 pronunciation: ${lxx.i.p || "not supplied; transliteration is labeled correctly"}`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
