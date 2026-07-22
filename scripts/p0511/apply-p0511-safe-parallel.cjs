const fs = require("fs");
const path = require("path");

const {
  normalizedToken,
  routeIds,
  entityIds,
  isAligned,
  arraysEqual,
  findRecord,
  localSourceIds,
  occurrenceOrdinal
} = require("../p0510/p0510-canonical-utils.cjs");

const root = process.cwd();

const canonicalRoot =
  process.argv.find(value =>
    value.startsWith("--canonical-root=")
  )?.slice("--canonical-root=".length) ||
  path.join(root, ".private", "scripture", "canonical");

const backupRoot =
  process.argv.find(value =>
    value.startsWith("--backup-root=")
  )?.slice("--backup-root=".length) ||
  null;

const planFile = path.join(
  root,
  "scripts",
  "p0511",
  "p0511-safe-parallel-plan.json"
);

if (!fs.existsSync(planFile)) {
  throw new Error(
    `Missing P05.11 plan: ${path.relative(root, planFile)}`
  );
}

const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));

if (
  plan?.version !== "p0511-safe-parallel-plan@1" ||
  plan?.routes?.length !== 120
) {
  throw new Error("Invalid P05.11 safe-parallel plan.");
}

if (!fs.existsSync(canonicalRoot)) {
  throw new Error(
    `Canonical root missing: ${canonicalRoot}`
  );
}

const cache = new Map();
const changedFiles = new Set();
const backedUpFiles = new Set();

function getFile(corpus, filename) {
  const key = `${corpus}|${filename}`;

  if (!cache.has(key)) {
    const filePath = path.join(
      canonicalRoot,
      corpus,
      filename
    );

    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Canonical file missing: ${filePath}`
      );
    }

    cache.set(key, {
      filePath,
      data: JSON.parse(
        fs.readFileSync(filePath, "utf8")
      )
    });
  }

  return cache.get(key);
}

function markChanged(state) {
  changedFiles.add(state.filePath);

  if (
    backupRoot &&
    !backedUpFiles.has(state.filePath)
  ) {
    const destination = path.join(
      backupRoot,
      path.relative(canonicalRoot, state.filePath)
    );

    fs.mkdirSync(path.dirname(destination), {
      recursive: true
    });

    fs.copyFileSync(
      state.filePath,
      destination
    );

    backedUpFiles.add(state.filePath);
  }
}

const result = {
  generatedAt: new Date().toISOString(),
  canonicalRoot,
  backupRoot,
  approvedRoutes: plan.routes.length,
  created: 0,
  alreadyExact: 0,
  changedFiles: [],
  errors: []
};

for (const candidate of plan.routes) {
  const state = getFile(
    candidate.corpus,
    candidate.filename
  );

  const resolved = findRecord(
    state.data,
    candidate.objectKey,
    candidate.reference
  );

  const record = resolved.record;

  const targetBlock =
    record.translations?.[candidate.translation];

  const parallelBlock =
    record.translations?.[
      candidate.parallelTranslation
    ];

  const targetToken =
    targetBlock?.tokens?.[
      candidate.tokenIndex
    ];

  if (!targetToken) {
    result.errors.push({
      candidate,
      reason: "target-token-missing"
    });
    continue;
  }

  if (!parallelBlock) {
    result.errors.push({
      candidate,
      reason: "parallel-block-missing"
    });
    continue;
  }

  const normalized = normalizedToken(targetToken);

  if (
    normalized !== candidate.expectedNormalized
  ) {
    result.errors.push({
      candidate,
      reason: "target-token-changed",
      actualNormalized: normalized
    });
    continue;
  }

  const localIds = localSourceIds(
    candidate.corpus,
    record,
    candidate.filename
  );

  if (
    candidate.sourceTokenIds.length !== 1 ||
    !candidate.sourceTokenIds.every(id =>
      localIds.has(id)
    )
  ) {
    result.errors.push({
      candidate,
      reason: "approved-route-not-local"
    });
    continue;
  }

  const targetOccurrence = occurrenceOrdinal(
    targetBlock.tokens,
    normalized,
    candidate.tokenIndex
  );

  const parallelIndexes = [];

  (parallelBlock.tokens ?? []).forEach(
    (token, index) => {
      if (normalizedToken(token) === normalized) {
        parallelIndexes.push(index);
      }
    }
  );

  if (
    targetOccurrence.ordinal < 0 ||
    targetOccurrence.matchingIndexes.length !==
      parallelIndexes.length ||
    parallelIndexes[targetOccurrence.ordinal] ===
      undefined
  ) {
    result.errors.push({
      candidate,
      reason: "parallel-occurrence-mismatch"
    });
    continue;
  }

  const parallelTokenIndex =
    parallelIndexes[targetOccurrence.ordinal];

  if (
    parallelTokenIndex !==
      candidate.parallelTokenIndex
  ) {
    result.errors.push({
      candidate,
      reason: "parallel-index-changed",
      actualParallelTokenIndex:
        parallelTokenIndex
    });
    continue;
  }

  const parallelToken =
    parallelBlock.tokens[parallelTokenIndex];

  const parallelRoutes =
    routeIds(parallelToken);

  if (
    parallelRoutes.length !== 1 ||
    !arraysEqual(
      parallelRoutes,
      candidate.sourceTokenIds
    )
  ) {
    result.errors.push({
      candidate,
      reason: "parallel-route-changed",
      parallelRoutes
    });
    continue;
  }

  const sourceRoute =
    candidate.sourceTokenIds[0];

  const duplicateConsumers = [];

  (targetBlock.tokens ?? []).forEach(
    (otherToken, index) => {
      if (index === candidate.tokenIndex) {
        return;
      }

      if (
        routeIds(otherToken).includes(sourceRoute)
      ) {
        duplicateConsumers.push({
          index,
          text: otherToken?.text ?? null,
          routes: routeIds(otherToken)
        });
      }
    }
  );

  if (duplicateConsumers.length > 0) {
    result.errors.push({
      candidate,
      reason:
        "source-route-now-used-by-another-target-token",
      duplicateConsumers
    });
    continue;
  }

  const alreadyExact =
    arraysEqual(
      routeIds(targetToken),
      candidate.sourceTokenIds
    ) &&
    targetToken.alignmentStatus === "aligned" &&
    targetToken.alignmentMethod ===
      `p0511-parallel-${candidate.parallelTranslation}`;

  if (alreadyExact) {
    result.alreadyExact += 1;
    continue;
  }

  if (
    isAligned(targetToken) &&
    !arraysEqual(
      routeIds(targetToken),
      candidate.sourceTokenIds
    )
  ) {
    result.errors.push({
      candidate,
      reason: "conflicting-existing-route",
      actualRoutes: routeIds(targetToken)
    });
    continue;
  }

  targetToken.alignedSourceTokenIds = [
    ...candidate.sourceTokenIds
  ];

  if (
    Array.isArray(candidate.sourceEntityIds) &&
    candidate.sourceEntityIds.length > 0
  ) {
    targetToken.alignedSourceEntityIds = [
      ...candidate.sourceEntityIds
    ];
  }

  const method =
    `p0511-parallel-${candidate.parallelTranslation}`;

  targetToken.alignmentStatus = "aligned";
  targetToken.alignmentConfidence = "high";
  targetToken.confidence = "high";
  targetToken.alignmentMethod = method;
  targetToken.method = method;
  targetToken.alignmentKind =
    "same-verse-cross-translation";

  markChanged(state);
  result.created += 1;
}

if (result.errors.length > 0) {
  const failureDirectory = path.join(
    root,
    "reports",
    "p0511-safe-parallel-apply"
  );

  fs.mkdirSync(failureDirectory, {
    recursive: true
  });

  fs.writeFileSync(
    path.join(
      failureDirectory,
      "failure.json"
    ),
    JSON.stringify(result, null, 2),
    "utf8"
  );

  throw new Error(
    `P05.11 apply failed validation for ${result.errors.length} routes.`
  );
}

for (const state of cache.values()) {
  if (!changedFiles.has(state.filePath)) {
    continue;
  }

  fs.writeFileSync(
    state.filePath,
    JSON.stringify(state.data),
    "utf8"
  );
}

result.changedFiles = [...changedFiles]
  .map(file => path.relative(root, file))
  .sort();

result.passed =
  result.created + result.alreadyExact ===
    plan.routes.length &&
  result.errors.length === 0;

const reportDirectory = path.join(
  root,
  "reports",
  "p0511-safe-parallel-apply"
);

fs.mkdirSync(reportDirectory, {
  recursive: true
});

fs.writeFileSync(
  path.join(
    reportDirectory,
    "apply-report.json"
  ),
  JSON.stringify(result, null, 2),
  "utf8"
);

console.log(JSON.stringify(result, null, 2));

if (!result.passed) {
  process.exitCode = 2;
} else {
  console.log(
    "P05.11 safe-parallel apply passed."
  );
}
