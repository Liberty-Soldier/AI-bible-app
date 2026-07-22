const fs = require("fs");
const path = require("path");

const root = process.cwd();

const previewFile = path.join(
  root,
  "reports",
  "p0510-safe-missing-block-preview",
  "preview.json"
);

const safeCandidatesFile = path.join(
  root,
  "reports",
  "p0510-restored-token-alignment-audit",
  "safe-candidates.json"
);

for (const required of [previewFile, safeCandidatesFile]) {
  if (!fs.existsSync(required)) {
    throw new Error(
      `Missing approved P05.10 report: ${path.relative(root, required)}`
    );
  }
}

const preview = JSON.parse(fs.readFileSync(previewFile, "utf8"));
const safeCandidates = JSON.parse(
  fs.readFileSync(safeCandidatesFile, "utf8")
);

if (
  preview?.totals?.allCandidates !== 51 ||
  preview?.totals?.missingToCreate !== 50 ||
  preview?.totals?.existingExact !== 1 ||
  preview?.totals?.existingDifferent !== 0 ||
  safeCandidates.length !== 207
) {
  throw new Error(
    "Approved P05.10 populations differ from the verified 51-block / 207-route set."
  );
}

const blocks = (preview.candidates ?? []).map(candidate => ({
  corpus: candidate.corpus,
  translation: candidate.translation,
  filename: candidate.filename,
  canonicalReference: candidate.canonicalReference,
  canonicalObjectKey: candidate.canonicalObjectKey ?? null,
  canonicalChapter: candidate.canonicalChapter,
  canonicalVerse: candidate.canonicalVerse,
  generatedReference: candidate.generatedReference,
  generatedText: candidate.generatedText,
  kind: candidate.kind
}));

const routes = safeCandidates.map(candidate => ({
  corpus: candidate.corpus,
  translation: candidate.translation,
  filename: candidate.filename,
  objectKey: candidate.objectKey ?? null,
  reference: candidate.reference,
  tokenIndex: candidate.tokenIndex,
  expectedText: candidate.expectedText,
  expectedNormalized: candidate.expectedNormalized,
  sourcePhase: candidate.sourcePhase,
  sourceTokenIds: candidate.proposedRoute?.sourceTokenIds ?? [],
  sourceEntityIds: candidate.proposedRoute?.sourceEntityIds ?? []
}));

if (
  routes.some(route =>
    route.translation !== "web" ||
    route.sourceTokenIds.length !== 1
  )
) {
  throw new Error(
    "The approved route plan contains a non-WEB or non-single-source route."
  );
}

const plan = {
  version: "p0510-canonical-source-plan@1",
  generatedAt: new Date().toISOString(),
  expected: {
    approvedBlocks: 51,
    safeRoutes: 207,
    cleanWebMigrationChangedVerses: 1051,
    restoredWebTokens: 699
  },
  romansWebCrosswalk: {
    "Romans.16.25": "Rom:14:24",
    "Romans.16.26": "Rom:14:25",
    "Romans.16.27": "Rom:14:26"
  },
  blocks,
  routes
};

const outputFile = path.join(
  root,
  "scripts",
  "p0510",
  "p0510-canonical-source-plan.json"
);

fs.mkdirSync(path.dirname(outputFile), { recursive: true });

fs.writeFileSync(
  outputFile,
  `${JSON.stringify(plan, null, 2)}\n`,
  "utf8"
);

console.log(JSON.stringify({
  output: path.relative(root, outputFile),
  blocks: blocks.length,
  routes: routes.length
}, null, 2));

console.log("P05.10 canonical source plan built.");
