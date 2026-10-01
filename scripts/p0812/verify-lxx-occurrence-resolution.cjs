"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const RUNTIME_ROOT = path.join(
  ROOT,
  "public",
  "data",
  "bibleiq",
  "source-breakdown",
  "runtime",
);
const CANONICAL_ROOT = path.join(
  ROOT,
  "app",
  "data",
  "bibleiq",
  "canonical",
  "lxx",
);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function fail(message) {
  throw new Error(message);
}

function canonicalBySourceKey() {
  const result = new Map();

  for (const file of fs.readdirSync(CANONICAL_ROOT)) {
    if (!file.endsWith(".json")) continue;
    for (const verse of Object.values(readJson(path.join(CANONICAL_ROOT, file)))) {
      const key = [
        "lxx",
        String(verse.book || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase(),
        verse.chapter,
        verse.verse,
      ].join(":");
      result.set(key, verse);
    }
  }

  return result;
}

function main() {
  const manifest = readJson(path.join(RUNTIME_ROOT, "manifest.json"));
  const canonical = canonicalBySourceKey();
  const lexicon = readJson(
    path.join(ROOT, "app/data/lexicon/generatedLXXGreekLexiconV12.json"),
  );
  const lexiconById = new Map(lexicon.map((entry) => [entry.lxxId, entry]));
  const lxxFiles = fs
    .readdirSync(path.join(RUNTIME_ROOT, "lxx"))
    .filter((file) => file.endsWith(".json"));
  const counts = {
    occurrences: 0,
    resolved: 0,
    exact: 0,
    uniqueAnchor: 0,
    unresolved: 0,
    correctedFromCanonical: 0,
  };
  const genesis = [];

  for (const file of lxxFiles) {
    const shard = readJson(path.join(RUNTIME_ROOT, "lxx", file));

    for (const [sourceKey, verse] of Object.entries(shard.verses || {})) {
      const source = canonical.get(sourceKey);
      if (!source) fail(`Missing canonical source verse: ${sourceKey}`);

      const sourceTokens = [...(source.sourceTokens || [])].sort(
        (a, b) => Number(a.index) - Number(b.index),
      );
      const occurrences = verse.occurrences || [];
      if (sourceTokens.length !== occurrences.length) {
        fail(`Source occurrence count changed: ${sourceKey}`);
      }

      occurrences.forEach((occurrence, index) => {
        const sourceToken = sourceTokens[index];
        counts.occurrences += 1;

        if (
          occurrence.id !== (sourceToken.tokenId || sourceToken.id) ||
          Number(occurrence.sourceOrder) !== Number(sourceToken.index) ||
          occurrence.surface !== sourceToken.surface
        ) {
          fail(`Source text or order changed: ${sourceKey}:${index}`);
        }

        const resolution = occurrence.lexicalResolution;
        if (resolution?.status === "resolved") {
          counts.resolved += 1;
          if (resolution.method === "exact-occurrence-stream") counts.exact += 1;
          else if (resolution.method === "unique-monotonic-surface-anchor") {
            counts.uniqueAnchor += 1;
          } else {
            fail(`Unexpected resolution method: ${sourceKey}:${index}`);
          }

          const lexical = lexiconById.get(occurrence.lexicalId);
          if (!lexical) fail(`Unknown LXX lexical ID: ${occurrence.lexicalId}`);
          if (
            occurrence.entityId !== `word:lxx:${occurrence.lexicalId}` ||
            resolution.lexicalId !== occurrence.lexicalId ||
            resolution.entityId !== occurrence.entityId ||
            resolution.corpus !== "lxx" ||
            occurrence.lemma !== lexical.lemma ||
            occurrence.meaning !==
              (lexical.shortDefinition || lexical.gloss || null)
          ) {
            fail(`Resolved identity contract mismatch: ${sourceKey}:${index}`);
          }
          if (sourceToken.lxxId !== occurrence.lexicalId) {
            counts.correctedFromCanonical += 1;
          }
        } else if (resolution?.status === "unresolved") {
          counts.unresolved += 1;
          if (
            occurrence.lexicalId !== null ||
            occurrence.entityId !== null ||
            occurrence.lemma !== null ||
            occurrence.meaning !== null ||
            occurrence.morphology !== null ||
            resolution.method !== "fail-closed"
          ) {
            fail(`Unresolved occurrence did not fail closed: ${sourceKey}:${index}`);
          }
        } else {
          fail(`Missing lexical resolution provenance: ${sourceKey}:${index}`);
        }

        if (
          sourceKey === "lxx:genesis:2:2" &&
          ["ἕκτῃ", "αὐτοῦ", "ἃ", "ὧν"].includes(occurrence.surface)
        ) {
          genesis.push(occurrence);
        }
      });
    }
  }

  const manifestStats = manifest.stats?.lxx || {};
  const expectedCounts = {
    occurrences:
      Number(manifestStats.morphologyAttachedOccurrences) +
      Number(manifestStats.morphologyUnavailableOccurrences),
    resolved: Number(manifestStats.morphologyAttachedOccurrences),
    exact: Number(manifestStats.exactOccurrenceStreamResolutions),
    uniqueAnchor: Number(manifestStats.uniqueAnchorResolutions),
    unresolved: Number(manifestStats.unresolvedOccurrences),
    correctedFromCanonical: Number(manifestStats.correctedCanonicalIdentities),
  };
  if (JSON.stringify(counts) !== JSON.stringify(expectedCounts)) {
    fail(
      `Manifest count mismatch: ${JSON.stringify({ counts, expectedCounts })}`,
    );
  }

  const expectedRegression = {
    "ἕκτῃ": { lexicalId: "L704340", lemma: "ἕκτος", meaning: "sixth" },
    "αὐτοῦ": { lexicalId: "L702165", lemma: "αὐτός", meaning: "he; him" },
    "ἃ": { lexicalId: "L709781", lemma: "ὅς", meaning: "who; what" },
    "ὧν": { lexicalId: "L709781", lemma: "ὅς", meaning: "who; what" },
  };
  for (const [surface, expected] of Object.entries(expectedRegression)) {
    const matches = genesis.filter((occurrence) => occurrence.surface === surface);
    if (
      !matches.length ||
      matches.some(
        (occurrence) =>
          occurrence.lexicalId !== expected.lexicalId ||
          occurrence.lemma !== expected.lemma ||
          occurrence.meaning !== expected.meaning,
      )
    ) {
      fail(`Genesis 2:2 regression mismatch for ${surface}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        verdict: "LXX_OCCURRENCE_RESOLUTION_VERIFIED",
        counts,
        sourceTextAndOrderUnchanged: true,
        resolvedIdentityContractConsistent: true,
        unresolvedOccurrencesFailClosed: true,
        genesis2_2: genesis.map((occurrence) => ({
          surface: occurrence.surface,
          lexicalId: occurrence.lexicalId,
          entityId: occurrence.entityId,
          lemma: occurrence.lemma,
          meaning: occurrence.meaning,
          morphology: occurrence.morphology,
        })),
      },
      null,
      2,
    ),
  );
}

main();
