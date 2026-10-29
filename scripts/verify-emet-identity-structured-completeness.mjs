import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { buildEmetAiQuestionContract } from "../app/lib/emet/EmetAiQuestionContract.ts";
import { materializeFoundationalIdentityContract, planFoundationalIdentityContract } from "../app/lib/emet/simple/EmetAiFoundationalIdentityContract.ts";

import { validateEmetAiAnswer } from "../app/lib/emet/EmetAiContract.ts";
import { adaptFastEmetAnswer } from "../app/lib/emet/simple/EmetAiFastAnswerAdapter.ts";
import {
  EMET_AI_SIMPLE_GENERATION_SCHEMA,
  hydrateEmetAiSimpleGenerationDraft,
  parseEmetAiSimpleGenerationDraft,
  validateEmetAiSimpleAnswer,
} from "../app/lib/emet/simple/EmetAiSimpleContract.ts";

const root = process.cwd();
const sourceArtifactPath = path.join(
  root,
  ".private",
  "reliability-recovery-phase2b",
  "final-live-acceptance-2026-10-28T19-22-32-553Z.json",
);
const sourceArtifact = JSON.parse(await fs.readFile(sourceArtifactPath, "utf8"));

function result(id) {
  const item = sourceArtifact.results.find((entry) => entry.id === id);
  assert.ok(item?.result?.packet && item.result.generatedRawOutput, `Missing ${id} Phase 2C failure data.`);
  const packet = structuredClone(item.result.packet);
  packet.foundationalIdentityContract = materializeFoundationalIdentityContract({
    plan: planFoundationalIdentityContract(buildEmetAiQuestionContract({ question: item.question })),
    evidence: packet.evidence,
  });
  return { ...item, result: { ...item.result, packet } };
}

function generationFromRaw(item, mutate) {
  const raw = JSON.parse(item.result.generatedRawOutput);
  const candidate = {
    ...raw,
    schemaVersion: EMET_AI_SIMPLE_GENERATION_SCHEMA,
    reasoning: raw.reasoning.map((claim, index) => ({
      ...claim,
      answerBearing: false,
      authorityId: claim.contractInterpretationId && claim.contractInterpretationId !== "none"
        ? claim.contractInterpretationId
        : `legacy-untyped-claim-${index + 1}`,
    })),
  };
  mutate?.(candidate);
  const parsed = parseEmetAiSimpleGenerationDraft(candidate);
  assert.ok(parsed, `${item.id}: corrected generation did not parse.`);
  return parsed;
}

function evaluate(item, generation) {
  const draft = hydrateEmetAiSimpleGenerationDraft({ packet: item.result.packet, draft: generation });
  const simple = validateEmetAiSimpleAnswer({ packet: item.result.packet, draft: structuredClone(draft) });
  const full = simple.ok
    ? validateEmetAiAnswer(item.result.packet, adaptFastEmetAnswer({ answer: simple.value, packet: item.result.packet }))
    : { ok: false, errors: ["Full validation skipped because simple validation failed."] };
  return { generation, draft, simple, full };
}

const sacred = result("yahweh-yahshua");
const jesusGod = result("jesus-god");

// Schema @4 discards untyped legacy claims; hydration must withhold the answer.
const missingAuthority = structuredClone(generationFromRaw(sacred));
for (const claim of missingAuthority.reasoning) delete claim.authorityId;
const untypedProposal = parseEmetAiSimpleGenerationDraft(missingAuthority);
assert.deepEqual(untypedProposal.reasoning, []);
assert.equal(evaluate(sacred, untypedProposal).draft.status, "insufficient-evidence");

const sacredBaseline = evaluate(sacred, generationFromRaw(sacred));
assert.equal(sacredBaseline.draft.status, "insufficient-evidence");
assert.deepEqual(sacredBaseline.draft.claims, []);

const sacredCorrected = evaluate(sacred, generationFromRaw(sacred, (draft) => {
  draft.reasoning[0].answerBearing = true;
  draft.reasoning[2].answerBearing = true;
}));
assert.equal(sacredCorrected.simple.ok, true, sacredCorrected.simple.errors?.join(" | "));
assert.equal(sacredCorrected.full.ok, true, sacredCorrected.full.errors?.join(" | "));
assert.deepEqual(sacredCorrected.draft.references, ["Exodus 3:15", "Deuteronomy 6:4", "John 17:3", "John 20:17"]);
assert.match(sacredCorrected.draft.answer, /not the same person as Yahweh/i);
assert.doesNotMatch(sacredCorrected.draft.answer, /shared nature|unity of nature|divine identity/i);

const jesusBaseline = evaluate(jesusGod, generationFromRaw(jesusGod));
assert.equal(jesusBaseline.draft.status, "insufficient-evidence");
assert.deepEqual(jesusBaseline.draft.claims, []);

const jesusCorrected = evaluate(jesusGod, generationFromRaw(jesusGod, (draft) => {
  draft.reasoning[1].answerBearing = true;
  draft.reasoning[1].authorityId = "scripture-applies-god-language-to-yahshua";
}));
assert.equal(jesusCorrected.simple.ok, true, jesusCorrected.simple.errors?.join(" | "));
assert.equal(jesusCorrected.full.ok, true, jesusCorrected.full.errors?.join(" | "));
assert.deepEqual(jesusCorrected.draft.references, ["John 20:28", "Hebrews 1:8", "John 17:3", "John 20:17"]);
assert.match(jesusCorrected.draft.answer, /^Yes/);
assert.match(jesusCorrected.draft.answer, /Father/i);

const missingAnswerBearing = structuredClone(sacredCorrected.draft);
for (const claim of missingAnswerBearing.claims) claim.answerBearing = false;
const missingAnswerBearingValidation = validateEmetAiSimpleAnswer({ packet: sacred.result.packet, draft: missingAnswerBearing });
assert.equal(missingAnswerBearingValidation.ok, false);

const missingPublicCitation = structuredClone(sacredCorrected.draft);
missingPublicCitation.references = missingPublicCitation.references.filter((reference) => reference !== "Exodus 3:15");
const missingPublicCitationValidation = validateEmetAiSimpleAnswer({ packet: sacred.result.packet, draft: missingPublicCitation });
assert.equal(missingPublicCitationValidation.ok, false);
assert.ok(missingPublicCitationValidation.errors.some((error) => error.includes("Exodus 3:15")));

const namedButUnstructured = structuredClone(jesusCorrected.draft);
namedButUnstructured.claims[0].references = namedButUnstructured.claims[0].references.filter((reference) => reference !== "Hebrews 1:8");
namedButUnstructured.claims[0].excerpts = namedButUnstructured.claims[0].excerpts.filter((excerpt) => excerpt.reference !== "Hebrews 1:8");
const namedButUnstructuredValidation = validateEmetAiSimpleAnswer({ packet: jesusGod.result.packet, draft: namedButUnstructured });
assert.equal(namedButUnstructuredValidation.ok, false);
assert.ok(namedButUnstructuredValidation.errors.some((error) => error.includes("Hebrews 1:8")));

const overLimit = structuredClone(jesusCorrected.draft);
overLimit.claims[0].references.push("John 1:1");
overLimit.claims[0].excerpts.push({
  reference: "John 1:1",
  text: jesusGod.result.packet.evidence.find((item) => item.reference === "John 1:1").text,
  evidenceKind: "scripture",
  verbatim: true,
});
overLimit.references = [...overLimit.references, "John 1:1"];
const overLimitValidation = validateEmetAiSimpleAnswer({ packet: jesusGod.result.packet, draft: overLimit });
assert.equal(overLimitValidation.ok, false);
assert.ok(overLimitValidation.errors.some((error) => error.includes("response design permits 4")));

const report = {
  schemaVersion: "emet-identity-structured-completeness-offline@1",
  createdAt: new Date().toISOString(),
  sourceArtifact: path.relative(root, sourceArtifactPath).replaceAll("\\", "/"),
  results: {
    yahwehYahshua: {
      rawModelOutput: sacred.result.generatedRawOutput,
      baselineErrors: sacredBaseline.simple.errors,
      deterministicChanges: [
        "Upgraded the saved proposal to schema @4 with authorityId and materialized the current registry.",
        "Closed public citations over all displayed structured claims.",
      ],
      displayedAnswer: sacredCorrected.draft.answer,
      citations: sacredCorrected.draft.references,
      simpleValidation: sacredCorrected.simple,
      fullValidation: sacredCorrected.full,
    },
    jesusGod: {
      rawModelOutput: jesusGod.result.generatedRawOutput,
      baselineErrors: jesusBaseline.simple.errors,
      deterministicChanges: [
        "Selected the approved God-language authority using schema @4 authorityId.",
        "Retained the Father/Son distinction as a separate structured claim.",
        "Closed citations over the current approved God-language and distinction authorities.",
        "Simplified the displayed evidence to remain within the four-citation limit.",
      ],
      displayedAnswer: jesusCorrected.draft.answer,
      citations: jesusCorrected.draft.references,
      simpleValidation: jesusCorrected.simple,
      fullValidation: jesusCorrected.full,
    },
    negativeChecks: {
      missingAnswerBearing: missingAnswerBearingValidation.errors,
      missingPublicCitation: missingPublicCitationValidation.errors,
      namedButUnstructured: namedButUnstructuredValidation.errors,
      overCitationLimit: overLimitValidation.errors,
    },
  },
};

const outputDirectory = path.join(root, ".private", "reliability-recovery-phase2d");
await fs.mkdir(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, "structured-answer-completeness-offline.json");
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, ...report.results }, null, 2));
