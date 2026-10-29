import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { validateEmetAiAnswer, validateEmetAiEvidencePacket } from "../app/lib/emet/EmetAiContract.ts";
import { buildEmetAiQuestionContract } from "../app/lib/emet/EmetAiQuestionContract.ts";
import { adaptFastEmetAnswer } from "../app/lib/emet/simple/EmetAiFastAnswerAdapter.ts";
import {
  materializeFoundationalIdentityContract,
  planFoundationalIdentityContract,
} from "../app/lib/emet/simple/EmetAiFoundationalIdentityContract.ts";
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
  "final-live-acceptance-2026-10-28T19-57-18-422Z.json",
);
const sourceArtifact = JSON.parse(await fs.readFile(sourceArtifactPath, "utf8"));

function sourceResult(id) {
  const item = sourceArtifact.results.find((entry) => entry.id === id);
  assert.ok(item?.result?.packet && item.result.generatedRawOutput, `Missing exact Phase 2D ${id} output.`);
  return item;
}

function upgradePacket(item) {
  const packet = structuredClone(item.result.packet);
  const questionContract = buildEmetAiQuestionContract({ question: item.question });
  const plan = planFoundationalIdentityContract(questionContract);
  packet.foundationalIdentityContract = materializeFoundationalIdentityContract({ plan, evidence: packet.evidence });
  const validation = validateEmetAiEvidencePacket(packet);
  assert.equal(validation.ok, true, validation.errors?.join(" | "));
  return packet;
}

function legacyProposal(item) {
  const raw = JSON.parse(item.result.generatedRawOutput);
  const parsed = parseEmetAiSimpleGenerationDraft({
    ...raw,
    schemaVersion: EMET_AI_SIMPLE_GENERATION_SCHEMA,
    reasoning: raw.reasoning.map((reason, index) => ({
      text: reason.text,
      support: reason.support,
      answerBearing: reason.answerBearing,
      authorityId: reason.contractInterpretationId && reason.contractInterpretationId !== "none"
        ? reason.contractInterpretationId
        : `legacy-untyped-claim-${index + 1}`,
      references: reason.references,
    })),
  });
  assert.ok(parsed, `${item.id}: exact malformed output did not enter the current proposal parser.`);
  return parsed;
}

function evaluate(packet, generation) {
  const hydrated = hydrateEmetAiSimpleGenerationDraft({ packet, draft: generation });
  const simple = validateEmetAiSimpleAnswer({ packet, draft: structuredClone(hydrated) });
  const full = simple.ok
    ? validateEmetAiAnswer(packet, adaptFastEmetAnswer({ answer: simple.value, packet }))
    : null;
  return { generation, hydrated, simple, full };
}

const sacredSource = sourceResult("yahweh-yahshua");
const jesusSource = sourceResult("jesus-god");
const sacredPacket = upgradePacket(sacredSource);
const jesusPacket = upgradePacket(jesusSource);
const sacredReplay = evaluate(sacredPacket, legacyProposal(sacredSource));
const jesusReplay = evaluate(jesusPacket, legacyProposal(jesusSource));

assert.equal(sacredReplay.simple.ok, true, sacredReplay.simple.errors?.join(" | "));
assert.equal(sacredReplay.full?.ok, true, sacredReplay.full?.errors?.join(" | "));
assert.equal(jesusReplay.simple.ok, true, jesusReplay.simple.errors?.join(" | "));
assert.equal(jesusReplay.full?.ok, true, jesusReplay.full?.errors?.join(" | "));

assert.deepEqual(sacredReplay.hydrated.references, [
  "Exodus 3:15", "Deuteronomy 6:4", "John 17:3", "John 20:17",
]);
assert.match(sacredReplay.hydrated.answer, /identifies Yahweh as the Father/i);
assert.match(sacredReplay.hydrated.answer, /not the same person as Yahweh/i);
assert.doesNotMatch(sacredReplay.hydrated.answer, /divine titles|shared nature|unity of nature/i);

assert.deepEqual(jesusReplay.hydrated.references, [
  "John 20:28", "Hebrews 1:8", "John 17:3", "John 20:17",
]);
assert.match(jesusReplay.hydrated.answer, /^Yes—Scripture applies God-language to Yahshua/i);
assert.match(jesusReplay.hydrated.answer, /personally distinct/i);
assert.doesNotMatch(jesusReplay.hydrated.answer, /shared nature|unity of nature|divine identity/i);

const unauthorizedExpansion = structuredClone(legacyProposal(sacredSource));
unauthorizedExpansion.reasoning.push({
  text: "Yahshua and Yahweh share one divine nature.",
  support: "theological-synthesis",
  answerBearing: false,
  authorityId: "shared-divine-nature",
  references: ["John 1:1", "Hebrews 1:8"],
});
const unauthorizedReplay = evaluate(sacredPacket, unauthorizedExpansion);
assert.equal(unauthorizedReplay.simple.ok, true, unauthorizedReplay.simple.errors?.join(" | "));
assert.doesNotMatch(unauthorizedReplay.hydrated.answer, /shared|nature/i);

const noAnswerProposal = structuredClone(legacyProposal(jesusSource));
for (const claim of noAnswerProposal.reasoning) claim.answerBearing = false;
const noAnswerReplay = evaluate(jesusPacket, noAnswerProposal);
assert.equal(noAnswerReplay.hydrated.status, "insufficient-evidence");
assert.equal(noAnswerReplay.hydrated.references.length, 0);

const irrelevantEvidenceProposal = structuredClone(legacyProposal(jesusSource));
irrelevantEvidenceProposal.reasoning = [{
  text: "An unrelated proposal.",
  support: "possible-interpretation",
  answerBearing: true,
  authorityId: "legacy-untyped-claim",
  references: ["John 1:1"],
}];
const irrelevantReplay = evaluate(jesusPacket, irrelevantEvidenceProposal);
assert.equal(irrelevantReplay.hydrated.status, "insufficient-evidence");

const missingEvidencePacket = structuredClone(jesusPacket);
missingEvidencePacket.evidence = missingEvidencePacket.evidence.filter((item) => item.reference !== "Hebrews 1:8");
const missingPacketValidation = validateEmetAiEvidencePacket(missingEvidencePacket);
assert.equal(missingPacketValidation.ok, false);
const missingEvidenceReplay = evaluate(missingEvidencePacket, legacyProposal(jesusSource));
assert.equal(missingEvidenceReplay.hydrated.status, "insufficient-evidence");
assert.equal(missingEvidenceReplay.hydrated.references.length, 0);

const output = {
  schemaVersion: "emet-identity-deterministic-authority-offline@1",
  createdAt: new Date().toISOString(),
  sourceArtifact: path.relative(root, sourceArtifactPath).replaceAll("\\", "/"),
  results: {
    yahwehYahshua: {
      rawModelOutput: sacredSource.result.generatedRawOutput,
      proposedClaims: sacredReplay.generation.reasoning,
      authoritativeClaims: sacredReplay.hydrated.claims,
      finalAnswer: sacredReplay.hydrated.answer,
      citations: sacredReplay.hydrated.references,
      simpleValidation: sacredReplay.simple,
      fullValidation: sacredReplay.full,
    },
    jesusGod: {
      rawModelOutput: jesusSource.result.generatedRawOutput,
      proposedClaims: jesusReplay.generation.reasoning,
      authoritativeClaims: jesusReplay.hydrated.claims,
      finalAnswer: jesusReplay.hydrated.answer,
      citations: jesusReplay.hydrated.references,
      simpleValidation: jesusReplay.simple,
      fullValidation: jesusReplay.full,
    },
    adversarial: {
      unauthorizedSharedNatureDiscarded: !/shared|nature/i.test(unauthorizedReplay.hydrated.answer),
      noAnswerBearingWithheld: noAnswerReplay.hydrated.status === "insufficient-evidence",
      irrelevantEvidenceWithheld: irrelevantReplay.hydrated.status === "insufficient-evidence",
      missingRegistryEvidenceWithheld: missingEvidenceReplay.hydrated.status === "insufficient-evidence",
      missingPacketErrors: missingPacketValidation.errors,
    },
  },
};

const outputDirectory = path.join(root, ".private", "reliability-recovery-phase2e");
await fs.mkdir(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, "deterministic-claim-authority-offline.json");
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  outputPath,
  yahwehYahshua: {
    answer: sacredReplay.hydrated.answer,
    citations: sacredReplay.hydrated.references,
    validators: { simple: sacredReplay.simple.ok, full: sacredReplay.full?.ok },
  },
  jesusGod: {
    answer: jesusReplay.hydrated.answer,
    citations: jesusReplay.hydrated.references,
    validators: { simple: jesusReplay.simple.ok, full: jesusReplay.full?.ok },
  },
  adversarial: output.results.adversarial,
}, null, 2));
