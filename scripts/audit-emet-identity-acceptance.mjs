import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { validateEmetAiSimpleAnswer } from "../app/lib/emet/simple/EmetAiSimpleContract.ts";

const root = process.cwd();
const artifacts = {
  phase2bFirst: JSON.parse(await fs.readFile(path.join(root, ".private/reliability-recovery-phase2b/final-live-acceptance-2026-10-28T17-58-01-456Z.json"), "utf8")),
  phase2bFinal: JSON.parse(await fs.readFile(path.join(root, ".private/reliability-recovery-phase2b/final-live-acceptance-2026-10-28T18-21-21-685Z.json"), "utf8")),
  phase2c: JSON.parse(await fs.readFile(path.join(root, ".private/emet-fast-retrieval-audits/two-path-live-2026-10-28T18-52-44-799Z.json"), "utf8")),
};

function nestedResult(row) {
  return row.result || row;
}

function find(artifact, id) {
  const row = artifact.results.find((item) => item.id === id);
  assert.ok(row, `Missing preserved result ${id}`);
  return { row, result: nestedResult(row) };
}

const fixtures = [
  {
    key: "phase2b-first-yahweh-yahshua",
    ...find(artifacts.phase2bFirst, "yahweh-yahshua"),
    humanAssessment: {
      fatherSonConclusion: "acceptable-project-governed-synthesis",
      divineIdentityClaim: "unsupported-undefined-phrase",
      overall: "not-fully-acceptable",
      note: "The Yahweh/Father premise now supports the personal-distinction conclusion, but 'truly shares in God's identity' is not defined by the answer.",
    },
  },
  {
    key: "phase2b-final-yahweh-yahshua",
    ...find(artifacts.phase2bFinal, "yahweh-yahshua"),
    humanAssessment: {
      fatherSonConclusion: "acceptable-project-governed-synthesis",
      divineIdentityClaim: "unsupported-undefined-phrase",
      overall: "not-fully-acceptable",
      note: "The main personal-identity conclusion is acceptable; 'shares in divine identity' remains undefined.",
    },
  },
  {
    key: "phase2c-yahweh-yahshua",
    ...find(artifacts.phase2c, "phase2c-yahweh-yahshua"),
    humanAssessment: {
      fatherSonConclusion: "acceptable-project-governed-synthesis",
      divineIdentityClaim: "partly-supported-title-but-overstated-identity",
      overall: "not-fully-acceptable",
      note: "God-language and divine title are supported, but 'fully shares in divine identity' is not defined or established at that breadth.",
    },
  },
  {
    key: "phase2b-first-jesus-god",
    ...find(artifacts.phase2bFirst, "jesus-god"),
    humanAssessment: {
      godLanguageClaim: "supported",
      personalIdentityDistinction: "omitted",
      overall: "citation-valid-but-incomplete-under-corrected-standard",
      note: "The answer establishes that Scripture applies God-language to Yahshua but does not distinguish title/designation from identity with the Father.",
    },
  },
  {
    key: "phase2b-final-jesus-god",
    ...find(artifacts.phase2bFinal, "jesus-god"),
    humanAssessment: {
      godLanguageClaim: "supported",
      personalIdentityDistinction: "omitted",
      overall: "citation-valid-but-incomplete-under-corrected-standard",
      note: "The cited passages support God-language, deity language, and address to the Son, but the categorical wording leaves the sense of God undefined.",
    },
  },
];

const results = fixtures.map((fixture) => {
  const validation = validateEmetAiSimpleAnswer({
    packet: fixture.result.packet,
    draft: structuredClone(fixture.result.generatedDraft),
  });
  return {
    key: fixture.key,
    question: fixture.row.question,
    rawAnswer: fixture.result.generatedDraft.answer,
    rawConclusion: fixture.result.generatedDraft.conclusion,
    references: fixture.result.generatedDraft.references,
    currentValidator: {
      accepted: validation.ok,
      errors: validation.ok ? [] : validation.errors,
      rejectionKind: validation.ok
        ? "none"
        : validation.errors.every((error) => error.includes("designation"))
          ? "structural-false-rejection"
          : "structural-or-substantive-review-required",
    },
    humanAssessment: fixture.humanAssessment,
  };
});

assert.equal(results.find((item) => item.key === "phase2b-first-yahweh-yahshua").currentValidator.accepted, false);
assert.ok(results.find((item) => item.key === "phase2b-first-yahweh-yahshua").currentValidator.errors.some((error) => error.includes("exact identity pair")));
assert.equal(results.find((item) => item.key === "phase2b-final-yahweh-yahshua").currentValidator.accepted, true);
assert.equal(results.find((item) => item.key === "phase2c-yahweh-yahshua").currentValidator.accepted, false);
assert.ok(results.find((item) => item.key === "phase2c-yahweh-yahshua").currentValidator.errors.some((error) =>
  error.includes("evidence level") || error.includes("not constructed from the exact approved structured claims")
));
assert.equal(results.find((item) => item.key === "phase2b-first-jesus-god").currentValidator.accepted, true);
assert.equal(results.find((item) => item.key === "phase2b-final-jesus-god").currentValidator.accepted, true);

const artifact = {
  schemaVersion: "emet-identity-acceptance-audit@1",
  createdAt: new Date().toISOString(),
  modelCalls: 0,
  approvedStandard: {
    governingInterpretation: "Yahweh is the Father. Yahshua is Yahweh's Son and is personally distinct from the Father.",
    evidenceLevels: ["direct-scripture", "contextual-inference", "project-governed-synthesis"],
    undefinedIdentityLanguageRequiresClarification: true,
  },
  results,
};
const outputDir = path.join(root, ".private", "reliability-recovery-phase2c");
await fs.mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, `identity-acceptance-audit-${artifact.createdAt.replace(/[:.]/g, "-")}.json`);
await fs.writeFile(outputPath, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify({ outputPath, results: results.map((item) => ({
  key: item.key,
  validatorAccepted: item.currentValidator.accepted,
  validatorErrors: item.currentValidator.errors,
  humanAssessment: item.humanAssessment,
})) }, null, 2));
