"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const FALLBACK_ROOT = path.join(
  ROOT,
  "public/data/bibleiq/word-study/lxx-occurrence-fallback",
);
const EMET_ROOT = path.join(
  ROOT,
  "public/data/bibleiq/word-study/emet-final/lxx",
);
const EXPECTED = {
  fallbackEntities: 3997,
  reusableExplanations: 1609,
  rejectedExplanations: 2388,
};

function fail(message) {
  throw new Error(message);
}

function readEntities(root) {
  const entities = new Map();
  for (const file of fs.readdirSync(root)) {
    if (!file.endsWith(".json") || file === "manifest.json") continue;
    const document = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
    for (const [entityId, entity] of Object.entries(document.entities || {})) {
      entities.set(entityId, entity);
    }
  }
  return entities;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-zA-Z0-9]+/gu, " ")
    .toLowerCase()
    .trim();
}

function bookKey(value) {
  const key = normalize(value).replace(/\s+/gu, "");
  return key === "songofsongs" || key === "songofsolomon" ? "song" : key;
}

function isReusable(runtime, candidate) {
  if (
    !candidate ||
    candidate.status !== "approved" ||
    candidate.independentReviewerApproved !== true ||
    candidate.entityId !== runtime.entityId ||
    candidate.corpus !== runtime.corpus ||
    !String(candidate.explanation || "").trim() ||
    !Array.isArray(candidate.citations) ||
    candidate.citations.length === 0
  ) {
    return false;
  }

  const verifiedReferenceKeys = new Set(
    runtime.occurrences?.verifiedReferenceKeys || [],
  );
  if (
    !candidate.citations.every(
      (citation) =>
        citation.book &&
        Number.isFinite(citation.chapter) &&
        Number.isFinite(citation.verse) &&
        verifiedReferenceKeys.has(
          `${bookKey(citation.book)}:${citation.chapter}:${citation.verse}`,
        ),
    )
  ) {
    return false;
  }

  const explanation = normalize(candidate.explanation);
  const meanings = [
    ...(runtime.identity?.shortDefinitions || []),
    ...(runtime.identity?.glosses || []),
  ]
    .flatMap((value) => String(value || "").split(/[;,/]/u))
    .map(normalize)
    .filter((value) => value.length >= 3);

  return meanings.some((meaning) => explanation.includes(meaning));
}

function main() {
  const fallback = readEntities(FALLBACK_ROOT);
  const emet = readEntities(EMET_ROOT);
  const reusable = [];
  const rejected = [];

  for (const [entityId, runtime] of fallback) {
    if (isReusable(runtime, emet.get(entityId))) reusable.push(entityId);
    else rejected.push(entityId);
  }

  if (
    fallback.size !== EXPECTED.fallbackEntities ||
    reusable.length !== EXPECTED.reusableExplanations ||
    rejected.length !== EXPECTED.rejectedExplanations
  ) {
    fail(
      `LXX fallback EMET reuse census changed: ${JSON.stringify({
        fallbackEntities: fallback.size,
        reusableExplanations: reusable.length,
        rejectedExplanations: rejected.length,
      })}`,
    );
  }

  if (!reusable.includes("word:lxx:L709768")) {
    fail("Expected exact-ID explanation for word:lxx:L709768 to be reusable.");
  }

  console.log(
    JSON.stringify(
      {
        verdict: "LXX_FALLBACK_EMET_REUSE_VERIFIED",
        ...EXPECTED,
        policy: {
          exactEntityAndCorpus: true,
          independentApprovalRequired: true,
          everyCitationMustRemainAnOccurrence: true,
          currentGlossOrDefinitionMustMatchProse: true,
          otherwise: "fail-closed",
        },
        regression: "word:lxx:L709768",
      },
      null,
      2,
    ),
  );
}

main();
