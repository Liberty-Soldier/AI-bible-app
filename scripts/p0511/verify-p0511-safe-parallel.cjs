"use strict";

const fs = require("fs");
const path = require("path");

const {
  normalizedToken,
  routeIds,
  arraysEqual,
  findRecord,
  localSourceIds,
} = require(
  path.join(
    process.cwd(),
    "scripts",
    "p0510",
    "p0510-canonical-utils.cjs",
  ),
);

function expectedMethod(candidate) {
  return `p0511-parallel-${candidate.parallelTranslation}`;
}

function routeIdentityMatches(token, candidate, localIds) {
  return (
    token &&
    normalizedToken(token) === candidate.expectedNormalized &&
    candidate.sourceTokenIds.every((id) => localIds.has(id)) &&
    arraysEqual(routeIds(token), candidate.sourceTokenIds)
  );
}

function completeRouteMatches(token, candidate, localIds) {
  return (
    routeIdentityMatches(token, candidate, localIds) &&
    token.alignmentStatus === "aligned" &&
    token.alignmentMethod === expectedMethod(candidate) &&
    token.alignmentKind === "same-verse-cross-translation"
  );
}

function resolveCandidate(tokens, candidate, localIds) {
  const legacyToken = tokens[candidate.tokenIndex];

  if (completeRouteMatches(legacyToken, candidate, localIds)) {
    return {
      status: "legacy-index-exact",
      tokenIndex: candidate.tokenIndex,
      token: legacyToken,
      candidates: [candidate.tokenIndex],
    };
  }

  const completeMatches = [];

  for (let index = 0; index < tokens.length; index += 1) {
    if (completeRouteMatches(tokens[index], candidate, localIds)) {
      completeMatches.push(index);
    }
  }

  if (completeMatches.length === 1) {
    return {
      status:
        completeMatches[0] === candidate.tokenIndex
          ? "legacy-index-exact"
          : "route-identity-rebased",
      tokenIndex: completeMatches[0],
      token: tokens[completeMatches[0]],
      candidates: completeMatches,
    };
  }

  const identityMatches = [];

  for (let index = 0; index < tokens.length; index += 1) {
    if (routeIdentityMatches(tokens[index], candidate, localIds)) {
      identityMatches.push(index);
    }
  }

  return {
    status:
      identityMatches.length === 0
        ? "missing-route-identity"
        : identityMatches.length === 1
          ? "route-metadata-mismatch"
          : "ambiguous-route-identity",
    tokenIndex:
      identityMatches.length === 1 ? identityMatches[0] : null,
    token:
      identityMatches.length === 1
        ? tokens[identityMatches[0]]
        : null,
    candidates: identityMatches,
  };
}

function verifyP0511CanonicalRoot({
  root = process.cwd(),
  canonicalRoot,
  label = "canonical root",
}) {
  const planFile = path.join(
    root,
    "scripts",
    "p0511",
    "p0511-safe-parallel-plan.json",
  );

  if (!fs.existsSync(planFile)) {
    throw new Error(
      `Missing P05.11 plan: ${path.relative(root, planFile)}`,
    );
  }

  const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));

  if (
    plan?.version !== "p0511-safe-parallel-plan@1" ||
    plan?.routes?.length !== 120
  ) {
    throw new Error("Invalid P05.11 safe-parallel plan.");
  }

  const cache = new Map();

  function load(corpus, filename) {
    const key = `${corpus}|${filename}`;

    if (!cache.has(key)) {
      const filePath = path.join(
        canonicalRoot,
        corpus,
        filename,
      );

      if (!fs.existsSync(filePath)) {
        throw new Error(
          `${label} file missing: ${path.relative(root, filePath)}`,
        );
      }

      cache.set(key, {
        filePath,
        data: JSON.parse(fs.readFileSync(filePath, "utf8")),
      });
    }

    return cache.get(key);
  }

  const result = {
    generatedAt: new Date().toISOString(),
    label,
    canonicalRoot,
    expectedRoutes: plan.routes.length,
    exactRoutes: 0,
    legacyIndexExact: 0,
    routeIdentityRebased: 0,
    resolutions: [],
    mismatches: [],
  };

  for (const candidate of plan.routes) {
    const state = load(candidate.corpus, candidate.filename);
    const resolvedRecord = findRecord(
      state.data,
      candidate.objectKey,
      candidate.reference,
    );
    const record = resolvedRecord.record;
    const tokens =
      record.translations?.[candidate.translation]?.tokens || [];
    const localIds = localSourceIds(
      candidate.corpus,
      record,
      candidate.filename,
    );
    const resolution = resolveCandidate(
      tokens,
      candidate,
      localIds,
    );

    if (
      resolution.status === "legacy-index-exact" ||
      resolution.status === "route-identity-rebased"
    ) {
      result.exactRoutes += 1;

      if (resolution.status === "legacy-index-exact") {
        result.legacyIndexExact += 1;
      } else {
        result.routeIdentityRebased += 1;
      }

      result.resolutions.push({
        corpus: candidate.corpus,
        translation: candidate.translation,
        filename: candidate.filename,
        reference: candidate.reference,
        expectedNormalized: candidate.expectedNormalized,
        sourceTokenIds: candidate.sourceTokenIds,
        legacyTokenIndex: candidate.tokenIndex,
        resolvedTokenIndex: resolution.tokenIndex,
        status: resolution.status,
      });
      continue;
    }

    result.mismatches.push({
      corpus: candidate.corpus,
      translation: candidate.translation,
      parallelTranslation: candidate.parallelTranslation,
      filename: candidate.filename,
      reference: candidate.reference,
      legacyTokenIndex: candidate.tokenIndex,
      expectedNormalized: candidate.expectedNormalized,
      expectedRoutes: candidate.sourceTokenIds,
      expectedMethod: expectedMethod(candidate),
      expectedKind: "same-verse-cross-translation",
      resolutionStatus: resolution.status,
      candidateTokenIndexes: resolution.candidates,
      actualNormalized: resolution.token
        ? normalizedToken(resolution.token)
        : null,
      actualRoutes: resolution.token
        ? routeIds(resolution.token)
        : [],
      actualStatus:
        resolution.token?.alignmentStatus ?? null,
      actualMethod:
        resolution.token?.alignmentMethod ?? null,
      actualKind:
        resolution.token?.alignmentKind ?? null,
    });
  }

  result.passed =
    result.exactRoutes === plan.routes.length &&
    result.mismatches.length === 0;

  return result;
}

if (require.main === module) {
  const root = process.cwd();
  const canonicalRoot =
    process.argv
      .find((value) =>
        value.startsWith("--canonical-root="),
      )
      ?.slice("--canonical-root=".length) ||
    path.join(root, ".private", "scripture", "canonical");
  const label =
    process.argv
      .find((value) => value.startsWith("--label="))
      ?.slice("--label=".length) ||
    "canonical root";

  const result = verifyP0511CanonicalRoot({
    root,
    canonicalRoot,
    label,
  });

  const reportDirectory = path.join(
    root,
    "reports",
    "p0511-safe-parallel-apply",
  );
  fs.mkdirSync(reportDirectory, { recursive: true });

  const safeLabel = label
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .toLowerCase();

  fs.writeFileSync(
    path.join(
      reportDirectory,
      `verify-${safeLabel}.json`,
    ),
    JSON.stringify(result, null, 2),
    "utf8",
  );

  console.log(JSON.stringify(result, null, 2));

  if (!result.passed) {
    process.exitCode = 2;
  } else {
    console.log(
      `P05.11 ${label} verification passed: ` +
        `${result.legacyIndexExact} legacy indexes, ` +
        `${result.routeIdentityRebased} route-identity rebases.`,
    );
  }
}

module.exports = {
  verifyP0511CanonicalRoot,
  resolveCandidate,
  routeIdentityMatches,
  completeRouteMatches,
};
