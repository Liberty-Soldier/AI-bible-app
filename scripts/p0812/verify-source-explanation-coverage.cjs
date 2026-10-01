"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const ENTITY_ROOT = path.join(
  ROOT,
  "public/data/bibleiq/word-study/entities",
);
const LXX_FALLBACK_ROOT = path.join(
  ROOT,
  "public/data/bibleiq/word-study/lxx-occurrence-fallback",
);
const EMET_ROOT = path.join(
  ROOT,
  "public/data/bibleiq/word-study/emet-final",
);

const EXPECTED = {
  hebrew: {
    entities: 8640,
    resolvedEntityOccurrences: 300459,
    reviewedExplanations: 8529,
    evidenceDerivedBaselines: 111,
    unavailable: 0,
    complete: true,
  },
  "greek-nt": {
    entities: 5402,
    resolvedEntityOccurrences: 138013,
    reviewedExplanations: 5369,
    evidenceDerivedBaselines: 33,
    unavailable: 0,
    complete: true,
  },
  lxx: {
    entities: 3997,
    resolvedEntityOccurrences: 547009,
    reviewedExplanations: 1609,
    evidenceDerivedBaselines: 2388,
    unavailable: 0,
    complete: true,
  },
};

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readEntityDocuments(root) {
  const entities = new Map();
  for (const file of fs.readdirSync(root)) {
    if (!file.endsWith(".json") || file === "manifest.json") continue;
    const document = readJson(path.join(root, file));
    for (const [entityId, entity] of Object.entries(document.entities || {})) {
      entities.set(entityId, entity);
    }
  }
  return entities;
}

function expandCompact(entityId, compact) {
  const identity = compact.i || {};
  const occurrences = compact.o || {};
  return {
    entityId,
    corpus: compact.c,
    identity: {
      lemma: identity.l,
      normalizedLemma: identity.n,
      lexicalId: identity.x,
      glosses: identity.gl || [],
      shortDefinitions: identity.d || [],
    },
    occurrences: {
      corpusOccurrenceCount: occurrences.c || 0,
      verifiedReferenceKeys: [],
    },
  };
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

function isReviewed(candidate, runtime, strictOccurrenceEvidence) {
  if (
    !candidate ||
    candidate.status !== "approved" ||
    candidate.entityId !== runtime.entityId ||
    candidate.corpus !== runtime.corpus ||
    !String(candidate.explanation || "").trim()
  ) {
    return false;
  }

  if (!strictOccurrenceEvidence) return true;
  if (
    candidate.independentReviewerApproved !== true ||
    !Array.isArray(candidate.citations) ||
    candidate.citations.length === 0
  ) {
    return false;
  }

  const verifiedReferenceKeys = new Set(
    runtime.occurrences?.verifiedReferenceKeys || [],
  );
  const citationsRemainValid = candidate.citations.every(
    (citation) =>
      citation.book &&
      Number.isFinite(citation.chapter) &&
      Number.isFinite(citation.verse) &&
      verifiedReferenceKeys.has(
        `${bookKey(citation.book)}:${citation.chapter}:${citation.verse}`,
      ),
  );
  if (!citationsRemainValid) return false;

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

function isBaselineEligible(runtime) {
  const lexicalId = String(runtime.identity?.lexicalId || "").trim();
  const lemma = String(
    runtime.identity?.lemma || runtime.identity?.normalizedLemma || "",
  ).trim();
  const meaning = [
    ...(runtime.identity?.shortDefinitions || []),
    ...(runtime.identity?.glosses || []),
  ].some((value) => String(value || "").trim());

  return Boolean(
    lexicalId &&
      lemma &&
      meaning &&
      runtime.entityId === `word:${runtime.corpus}:${lexicalId}`,
  );
}

function auditCorpus(runtimeEntities, emetEntities, strictOccurrenceEvidence) {
  const result = {
    entities: runtimeEntities.size,
    resolvedEntityOccurrences: 0,
    reviewedExplanations: 0,
    evidenceDerivedBaselines: 0,
    unavailable: 0,
  };
  const unavailable = [];

  for (const [entityId, runtime] of runtimeEntities) {
    result.resolvedEntityOccurrences +=
      runtime.occurrences?.corpusOccurrenceCount || 0;
    if (
      isReviewed(
        emetEntities.get(entityId),
        runtime,
        strictOccurrenceEvidence,
      )
    ) {
      result.reviewedExplanations += 1;
    } else if (isBaselineEligible(runtime)) {
      result.evidenceDerivedBaselines += 1;
    } else {
      result.unavailable += 1;
      unavailable.push(entityId);
    }
  }

  result.complete =
    result.entities ===
      result.reviewedExplanations +
        result.evidenceDerivedBaselines +
        result.unavailable &&
    result.unavailable === 0;
  return { result, unavailable };
}

function exactExpected(actual, expected, corpus) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      `${corpus} explanation coverage census changed: ${JSON.stringify(actual)}`,
    );
  }
}

function main() {
  const entityManifest = readJson(path.join(ENTITY_ROOT, "manifest.json"));
  const results = {};

  for (const corpus of ["hebrew", "greek-nt"]) {
    const compact = readEntityDocuments(path.join(ENTITY_ROOT, corpus));
    const runtime = new Map(
      Array.from(compact, ([entityId, entity]) => [
        entityId,
        expandCompact(entityId, entity),
      ]),
    );
    const emet = readEntityDocuments(path.join(EMET_ROOT, corpus));
    const audited = auditCorpus(runtime, emet, false);
    if (runtime.size !== entityManifest.corpora[corpus].entities) {
      fail(`${corpus} entity runtime is incomplete.`);
    }
    if (audited.unavailable.length) {
      fail(
        `${corpus} has entities without an honest explanation path: ${audited.unavailable
          .slice(0, 10)
          .join(", ")}`,
      );
    }
    results[corpus] = audited.result;
    exactExpected(audited.result, EXPECTED[corpus], corpus);
  }

  const lxxRuntime = readEntityDocuments(LXX_FALLBACK_ROOT);
  const lxxEmet = readEntityDocuments(path.join(EMET_ROOT, "lxx"));
  const lxxAudited = auditCorpus(lxxRuntime, lxxEmet, true);
  if (lxxAudited.unavailable.length) {
    fail(
      `lxx has entities without an honest explanation path: ${lxxAudited.unavailable
        .slice(0, 10)
        .join(", ")}`,
    );
  }
  results.lxx = lxxAudited.result;
  exactExpected(lxxAudited.result, EXPECTED.lxx, "lxx");

  console.log(
    JSON.stringify(
      {
        verdict: "SOURCE_EXPLANATION_COVERAGE_VERIFIED",
        results,
        contract: {
          reviewedProsePreferred: true,
          baselineRequiresExactEntityCorpusAndLexicalId: true,
          baselineUsesLexiconMeaningOnly: true,
          translationDoesNotChooseIdentity: true,
          unresolvedOccurrenceBehavior: "Gloss unavailable",
        },
      },
      null,
      2,
    ),
  );
}

main();
