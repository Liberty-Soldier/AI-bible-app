const fs = require("fs");
const path = require("path");

const {
  normalizedToken,
  routeIds,
  arraysEqual,
  findRecord,
  localSourceIds
} = require("../p0510/p0510-canonical-utils.cjs");

function verifyP0511CanonicalRoot({
  root = process.cwd(),
  canonicalRoot,
  label = "canonical root"
}) {
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

  const plan = JSON.parse(
    fs.readFileSync(planFile, "utf8")
  );

  if (
    plan?.version !==
      "p0511-safe-parallel-plan@1" ||
    plan?.routes?.length !== 120
  ) {
    throw new Error(
      "Invalid P05.11 safe-parallel plan."
    );
  }

  const cache = new Map();

  function load(corpus, filename) {
    const key = `${corpus}|${filename}`;

    if (!cache.has(key)) {
      const filePath = path.join(
        canonicalRoot,
        corpus,
        filename
      );

      if (!fs.existsSync(filePath)) {
        throw new Error(
          `${label} file missing: ${path.relative(root, filePath)}`
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

  const result = {
    generatedAt: new Date().toISOString(),
    label,
    canonicalRoot,
    expectedRoutes: plan.routes.length,
    exactRoutes: 0,
    mismatches: []
  };

  for (const candidate of plan.routes) {
    const state = load(
      candidate.corpus,
      candidate.filename
    );

    const resolved = findRecord(
      state.data,
      candidate.objectKey,
      candidate.reference
    );

    const record = resolved.record;

    const token =
      record.translations?.[
        candidate.translation
      ]?.tokens?.[
        candidate.tokenIndex
      ];

    const localIds = localSourceIds(
      candidate.corpus,
      record,
      candidate.filename
    );

    const method =
      `p0511-parallel-${candidate.parallelTranslation}`;

    if (
      token &&
      normalizedToken(token) ===
        candidate.expectedNormalized &&
      candidate.sourceTokenIds.every(id =>
        localIds.has(id)
      ) &&
      arraysEqual(
        routeIds(token),
        candidate.sourceTokenIds
      ) &&
      token.alignmentStatus === "aligned" &&
      token.alignmentMethod === method &&
      token.alignmentKind ===
        "same-verse-cross-translation"
    ) {
      result.exactRoutes += 1;
    } else {
      result.mismatches.push({
        corpus: candidate.corpus,
        translation:
          candidate.translation,
        filename:
          candidate.filename,
        reference:
          candidate.reference,
        tokenIndex:
          candidate.tokenIndex,
        expectedNormalized:
          candidate.expectedNormalized,
        expectedRoutes:
          candidate.sourceTokenIds,
        actualNormalized:
          token
            ? normalizedToken(token)
            : null,
        actualRoutes:
          token ? routeIds(token) : [],
        actualStatus:
          token?.alignmentStatus ?? null,
        actualMethod:
          token?.alignmentMethod ?? null,
        actualKind:
          token?.alignmentKind ?? null
      });
    }
  }

  result.passed =
    result.exactRoutes ===
      plan.routes.length &&
    result.mismatches.length === 0;

  return result;
}

if (require.main === module) {
  const root = process.cwd();

  const canonicalRoot =
    process.argv.find(value =>
      value.startsWith("--canonical-root=")
    )?.slice("--canonical-root=".length) ||
    path.join(
      root,
      ".private",
      "scripture",
      "canonical"
    );

  const label =
    process.argv.find(value =>
      value.startsWith("--label=")
    )?.slice("--label=".length) ||
    "canonical root";

  const result =
    verifyP0511CanonicalRoot({
      root,
      canonicalRoot,
      label
    });

  const reportDirectory = path.join(
    root,
    "reports",
    "p0511-safe-parallel-apply"
  );

  fs.mkdirSync(reportDirectory, {
    recursive: true
  });

  const safeLabel = label
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .toLowerCase();

  fs.writeFileSync(
    path.join(
      reportDirectory,
      `verify-${safeLabel}.json`
    ),
    JSON.stringify(result, null, 2),
    "utf8"
  );

  console.log(JSON.stringify(result, null, 2));

  if (!result.passed) {
    process.exitCode = 2;
  } else {
    console.log(
      `P05.11 ${label} verification passed.`
    );
  }
}

module.exports = {
  verifyP0511CanonicalRoot
};
