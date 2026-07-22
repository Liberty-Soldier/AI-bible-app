const fs = require("fs");
const path = require("path");

const root = process.cwd();

const inputFile = path.join(
  root,
  "reports",
  "p0511-safe-parallel-validator",
  "apply-ready.json"
);

if (!fs.existsSync(inputFile)) {
  throw new Error(
    `Missing validated P05.11 apply set: ${path.relative(root, inputFile)}`
  );
}

const input = JSON.parse(fs.readFileSync(inputFile, "utf8"));

if (input.length !== 120) {
  throw new Error(
    `Expected 120 validated P05.11 routes, found ${input.length}.`
  );
}

const routes = input.map(candidate => ({
  corpus: candidate.corpus,
  translation: candidate.translation,
  parallelTranslation: candidate.parallelTranslation,
  filename: candidate.filename,
  objectKey: candidate.objectKey ?? null,
  reference: candidate.reference,
  tokenIndex: candidate.tokenIndex,
  expectedText: candidate.text,
  expectedNormalized: candidate.normalized,
  parallelTokenIndex: candidate.parallelTokenIndex,
  parallelText: candidate.parallelText,
  sourceTokenIds: candidate.proposedSourceTokenIds ?? [],
  sourceEntityIds: candidate.proposedEntityIds ?? [],
  validatorClass: candidate.validatorClass
}));

if (
  routes.some(route =>
    !["hebrew", "greek-nt"].includes(route.corpus) ||
    !["web", "kjv"].includes(route.translation) ||
    !["web", "kjv"].includes(route.parallelTranslation) ||
    route.translation === route.parallelTranslation ||
    route.sourceTokenIds.length !== 1 ||
    route.validatorClass !== "apply-ready-content"
  )
) {
  throw new Error(
    "The validated P05.11 set contains an unsupported or non-single route."
  );
}

const targetKeys = new Set();

for (const route of routes) {
  const key = [
    route.corpus,
    route.translation,
    route.filename,
    route.reference,
    route.tokenIndex
  ].join("|");

  if (targetKeys.has(key)) {
    throw new Error(`Duplicate P05.11 target: ${key}`);
  }

  targetKeys.add(key);
}

const byCorpusTranslation = {};

for (const route of routes) {
  const key = `${route.corpus}/${route.translation}`;
  byCorpusTranslation[key] =
    (byCorpusTranslation[key] ?? 0) + 1;
}

const expected = {
  "hebrew/web": 59,
  "hebrew/kjv": 29,
  "greek-nt/web": 18,
  "greek-nt/kjv": 14
};

if (
  JSON.stringify(Object.fromEntries(Object.entries(byCorpusTranslation).sort())) !== JSON.stringify(Object.fromEntries(Object.entries(expected).sort()))
) {
  throw new Error(
    `Validated distribution changed: ${JSON.stringify(byCorpusTranslation)}`
  );
}

const plan = {
  version: "p0511-safe-parallel-plan@1",
  generatedAt: new Date().toISOString(),
  sourceValidator: "p0511-safe-parallel-validator@1",
  expected: {
    routes: 120,
    byCorpusTranslation
  },
  routes
};

const outputFile = path.join(
  root,
  "scripts",
  "p0511",
  "p0511-safe-parallel-plan.json"
);

fs.mkdirSync(path.dirname(outputFile), {
  recursive: true
});

fs.writeFileSync(
  outputFile,
  `${JSON.stringify(plan, null, 2)}\n`,
  "utf8"
);

console.log(JSON.stringify({
  output: path.relative(root, outputFile),
  routes: routes.length,
  byCorpusTranslation
}, null, 2));

console.log("P05.11 safe-parallel plan built.");
