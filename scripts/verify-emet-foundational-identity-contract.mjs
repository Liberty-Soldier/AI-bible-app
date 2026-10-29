import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { buildEmetAiQuestionContract } from "../app/lib/emet/EmetAiQuestionContract.ts";
import { validateEmetAiEvidencePacket } from "../app/lib/emet/EmetAiContract.ts";
import {
  EMET_AI_FOUNDATIONAL_IDENTITY_CONTRACT_VERSION,
  planFoundationalIdentityContract,
} from "../app/lib/emet/simple/EmetAiFoundationalIdentityContract.ts";
import { answerWithFastTwoPathEmet } from "../app/lib/emet/simple/EmetAiFastTwoPathService.ts";
import { validateEmetAiSimpleAnswer } from "../app/lib/emet/simple/EmetAiSimpleContract.ts";

function plan(question) {
  return planFoundationalIdentityContract(buildEmetAiQuestionContract({ question }));
}

function assertReferences(question, expected, excluded = []) {
  const result = plan(question);
  assert.ok(result, `${question} must activate the identity contract`);
  assert.equal(result.version, EMET_AI_FOUNDATIONAL_IDENTITY_CONTRACT_VERSION);
  for (const reference of expected) {
    assert.ok(result.requiredReferences.includes(reference), `${question} must require ${reference}`);
  }
  for (const reference of excluded) {
    assert.ok(!result.requiredReferences.includes(reference), `${question} must not mechanically require ${reference}`);
  }
  return result;
}

const jesusGod = assertReferences(
  "Is Jesus God?",
  ["John 17:3", "John 20:17", "John 1:1", "John 1:14", "John 20:28", "Hebrews 1:8", "Hebrews 1:9"],
  ["Exodus 3:14", "Deuteronomy 6:4"],
);
assert.deepEqual(jesusGod.senses, ["divine-designation"]);

const jesusFather = assertReferences(
  "Is Jesus the Father?",
  ["John 17:3", "John 20:17", "John 1:1", "John 1:14", "Hebrews 1:8", "Hebrews 1:9"],
  ["Exodus 3:14", "Deuteronomy 6:4"],
);
assert.deepEqual(jesusFather.senses, ["father-personal-identity"]);

for (const question of [
  "Is Jesus Yahweh?",
  "Who is Yahweh, and is Yahshua the same person as Yahweh?",
]) {
  const result = assertReferences(question, [
    "Exodus 3:14", "Exodus 3:15", "Deuteronomy 6:4",
    "John 17:3", "John 20:17", "John 1:1", "John 1:14",
    "John 20:28", "Hebrews 1:8", "Hebrews 1:9",
  ]);
  assert.deepEqual(result.senses, ["yahweh-identification"]);
}

const onlyTrueGod = assertReferences("Who is the only true God?", ["John 17:3"]);
assert.deepEqual(onlyTrueGod.senses, ["passage-referent"]);

const john173 = assertReferences("Explain John 17:3.", ["John 17:3"]);
assert.deepEqual(john173.senses, ["passage-referent"]);
assert.equal(john173.propositionIds.length, 1);

for (const question of [
  "Should Christians keep the Sabbath?",
  "What happens at the last trumpet?",
  "What does the Hebrew word echad mean in Deuteronomy 6:4?",
  "Who betrayed Jesus?",
]) {
  assert.equal(plan(question), null, `${question} must not activate the identity contract`);
}

const sacredQuestion = "Who is Yahweh, and is Yahshua the same person as Yahweh?";
const serviceResult = await answerWithFastTwoPathEmet({
  question: sacredQuestion,
  discoveryProvider: {
    model: "fixture",
    async discover() {
      return {
        draft: {
          schemaVersion: "emet-ai-fast-discovery@1",
          references: [
            { reference: "Exodus 3:14-15", relevance: "Direct identity of Yahweh.", required: true, covers: ["prophetic-testimony"] },
            { reference: "John 17:3", relevance: "Direct Father and Son relationship statement.", required: true, covers: ["messiah-teaching"] },
            { reference: "John 20:28", relevance: "Direct apostolic address to Yahshua.", required: true, covers: ["apostolic-testimony"] },
          ],
          lexicalLookups: [], limitations: [], blockingIssues: [],
        },
        rawOutput: "fixture", latencyMs: 0, estimatedInputCharacters: 0,
        usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
      };
    },
  },
  answerProvider: {
    model: "fixture",
    async generate() {
      return {
        draft: null, rawOutput: "", latencyMs: 0,
        usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
      };
    },
  },
});
assert.ok(serviceResult.packet, serviceResult.validationErrors.join(" | "));
assert.equal(serviceResult.packet.foundationalIdentityContract?.version, EMET_AI_FOUNDATIONAL_IDENTITY_CONTRACT_VERSION);
assert.deepEqual(serviceResult.packet.foundationalIdentityContract?.senses, ["yahweh-identification"]);
assert.ok(serviceResult.packet.foundationalIdentityContract?.propositions.every((item) => item.evidenceLevel === "direct-scripture"));
assert.deepEqual(
  serviceResult.packet.foundationalIdentityContract?.interpretations.map((item) => [item.id, item.evidenceLevel]),
  [
    ["yahshua-personally-distinct-from-father", "contextual-inference"],
    ["yahweh-is-the-father", "project-governed-synthesis"],
    ["yahshua-not-the-same-person-as-yahweh", "project-governed-synthesis"],
  ],
);
assert.ok(serviceResult.packet.foundationalIdentityContract?.termDistinctions.some((item) =>
  item.term === "God" && /does not|must be established/i.test(item.meaning)
));
assert.ok(serviceResult.packet.foundationalIdentityContract?.acceptanceRules.some((rule) =>
  /Undefined phrases.*divine identity/i.test(rule)
));
for (const reference of plan(sacredQuestion).requiredReferences) {
  assert.ok(serviceResult.packet.scope.references.includes(reference), `${reference} must reach generation`);
}
for (const proposition of serviceResult.packet.foundationalIdentityContract.propositions) {
  assert.ok(proposition.evidenceIds.length > 0, `${proposition.id} must have verified packet evidence`);
}
const unsupportedContractPacket = structuredClone(serviceResult.packet);
unsupportedContractPacket.foundationalIdentityContract.propositions[0].evidenceIds = ["missing-evidence"];
const unsupportedContractValidation = validateEmetAiEvidencePacket(unsupportedContractPacket);
assert.equal(unsupportedContractValidation.ok, false);
assert.ok(unsupportedContractValidation.errors.some((error) => error.includes("not backed by verified packet evidence")));

const liveArtifact = JSON.parse(await fs.readFile(
  path.join(process.cwd(), ".private", "reliability-recovery-phase2b", "final-live-acceptance-2026-10-28T18-21-21-685Z.json"),
  "utf8",
));
const sacredLive = liveArtifact.results.find((item) => item.id === "yahweh-yahshua");
assert.ok(sacredLive, "The Phase 2B sacred-name replay must exist.");
const descriptiveValidation = validateEmetAiSimpleAnswer({
  packet: sacredLive.result.packet,
  draft: structuredClone(sacredLive.result.generatedDraft),
});
assert.ok(descriptiveValidation.ok || !descriptiveValidation.errors.some((error) => error.includes("Claim designation")),
  "Nehemiah 9:6's relative description must not be treated as a proper-name designation");

const mismatchedDraft = structuredClone(sacredLive.result.generatedDraft);
mismatchedDraft.claims[0].text = "The Torah identifies Judas as Yahweh.";
mismatchedDraft.answer = mismatchedDraft.answer.replace(/^Yahweh is[^.]+\./, "The Torah identifies Judas as Yahweh.");
const mismatchedValidation = validateEmetAiSimpleAnswer({
  packet: sacredLive.result.packet,
  draft: mismatchedDraft,
});
assert.ok(!mismatchedValidation.ok);
assert.ok(mismatchedValidation.errors.some((error) => error.includes("Claim designation")),
  "A genuine subject/designation mismatch must remain rejected");

console.log(JSON.stringify({
  contractVersion: EMET_AI_FOUNDATIONAL_IDENTITY_CONTRACT_VERSION,
  routingScenarios: 10,
  productionPacketReferences: serviceResult.packet.scope.references,
  designationFalseRejectionFixed: true,
  unsupportedContractEvidenceRejected: true,
  subjectMismatchStillRejected: true,
}, null, 2));
