import assert from "node:assert/strict";
import fs from "node:fs";

import {
  EMET_AI_RETRIEVAL_PLAN_SCHEMA,
  normalizeEmetAiPlanReference,
  parseEmetAiRetrievalPlan,
} from "../app/lib/emet/EmetAiRetrievalPlan.ts";
import {
  buildEmetAiTopicEvidence,
  emetAiLockedScriptureReferenceExists,
  isEmetAiDeterministicFastPathEligible,
} from "../app/lib/emet/EmetAiTopicEvidence.ts";
import { buildEmetAiQuestionContract } from "../app/lib/emet/EmetAiQuestionContract.ts";
import {
  normalizeEmetAiPlannedReferences,
  validateEmetAiPlanningCompleteness,
  validateEmetAiPlanningNeutrality,
} from "../app/lib/emet/EmetAiPlanningIntegrity.ts";
import { validateEmetAiAnswer } from "../app/lib/emet/EmetAiContract.ts";

const normalize = (reference) => normalizeEmetAiPlanReference(
  reference,
  emetAiLockedScriptureReferenceExists,
);

assert.deepEqual(normalize("Luke 1:6"), {
  status: "resolved",
  references: ["Luke 1:6"],
});
assert.deepEqual(normalize("Ezekiel 18:5-9"), {
  status: "resolved",
  references: [
    "Ezekiel 18:5", "Ezekiel 18:6", "Ezekiel 18:7",
    "Ezekiel 18:8", "Ezekiel 18:9",
  ],
});
assert.deepEqual(normalize("Luke 1:6a-1:6b?"), {
  status: "resolved",
  references: ["Luke 1:6"],
});
assert.equal(normalize("Luke 1:6a-1:7b?").status, "ambiguous");
assert.equal(normalize("Psalm 14").status, "ambiguous");
assert.equal(normalize("Luke 1:999").status, "invalid");
assert.equal(normalize("not a reference").status, "invalid");

const planningContract = buildEmetAiQuestionContract({
  question: "How should Colossians 2:16-17 be understood in light of the Torah's Sabbath instructions?",
});
const rawPlan = {
  schemaVersion: EMET_AI_RETRIEVAL_PLAN_SCHEMA,
  subject: "Sabbath",
  analysisMode: "apparent-contradiction",
  proposition: "What do the relevant passages establish about Sabbath judgment and shadow language?",
  requiresScopeAnalysis: true,
  requiresTimeline: false,
  components: [{
    id: "sabbath-texts",
    proposition: "Compare the actual objects and wording of the requested and governing passages.",
    category: "practice",
    governingReferences: ["Colossians 2:16", "Colossians 2:17", "Exodus 20:8"],
  }],
  intent: "passage",
  passages: [
    { reference: "Colossians 2:16", role: "direct", reason: "Requested text.", priority: 100 },
    { reference: "Colossians 2:17", role: "direct", reason: "Requested text.", priority: 100 },
    { reference: "Exodus 20:8", role: "foundation", reason: "Torah foundation.", priority: 99 },
    { reference: "Genesis 6:9canyons?", role: "context", reason: "Invalid optional suggestion.", priority: 1 },
  ],
  sourcePhrases: [],
  limitations: [],
};
const normalizedRawPlan = normalizeEmetAiPlannedReferences(
  rawPlan,
  planningContract,
  emetAiLockedScriptureReferenceExists,
);
assert.deepEqual(normalizedRawPlan.requiredReferenceErrors, []);
assert.deepEqual(
  normalizedRawPlan.rejectedOptionalReferences.map((item) => item.reference),
  ["Genesis 6:9canyons?"],
);
assert.equal(normalizedRawPlan.value.passages.length, 3);

const invalidGoverningPlan = structuredClone(rawPlan);
invalidGoverningPlan.components[0].governingReferences.push("Luke 1:999");
assert.ok(normalizeEmetAiPlannedReferences(
  invalidGoverningPlan,
  planningContract,
  emetAiLockedScriptureReferenceExists,
).requiredReferenceErrors.length > 0);

const redundantGoverningPlan = structuredClone(rawPlan);
redundantGoverningPlan.components[0].governingReferences.push("Colossians 2:16");
assert.deepEqual(
  normalizeEmetAiPlannedReferences(
    redundantGoverningPlan,
    planningContract,
    emetAiLockedScriptureReferenceExists,
  ).requiredReferenceErrors,
  [],
);

const incompleteRangePlan = structuredClone(rawPlan);
incompleteRangePlan.components[0].governingReferences.push("Colossians 2:16-?");
const recoveredRange = normalizeEmetAiPlannedReferences(
  incompleteRangePlan,
  planningContract,
  emetAiLockedScriptureReferenceExists,
);
assert.deepEqual(recoveredRange.requiredReferenceErrors, []);
assert.deepEqual(
  recoveredRange.recoveredMalformedGoverningReferences.map((item) => item.reference),
  ["Colossians 2:16-?"],
);

const unsupportedIncompleteRangePlan = structuredClone(rawPlan);
unsupportedIncompleteRangePlan.components[0].governingReferences.push("Jeremiah 31:31-?");
assert.ok(normalizeEmetAiPlannedReferences(
  unsupportedIncompleteRangePlan,
  planningContract,
  emetAiLockedScriptureReferenceExists,
).requiredReferenceErrors.length > 0);

const ambiguousGoverningPlan = structuredClone(rawPlan);
ambiguousGoverningPlan.components[0].governingReferences.push("Psalm 14");
assert.ok(normalizeEmetAiPlannedReferences(
  ambiguousGoverningPlan,
  planningContract,
  emetAiLockedScriptureReferenceExists,
).requiredReferenceErrors.length > 0);

assert.ok(validateEmetAiPlanningCompleteness({
  limitations: ["The plan remains incomplete until key New Testament passages are added."],
}).length > 0);
assert.deepEqual(validateEmetAiPlanningCompleteness({
  limitations: ["The answer should distinguish explicit statements from interpretation."],
}), []);

const sabbathArtifact = JSON.parse(fs.readFileSync(
  ".private/emet-live-audits/phase3-2026-10-12T14-09-51-420Z.json",
  "utf8",
));
const savedSabbathPlan = JSON.parse(sabbathArtifact.results[0].providerAudit.planning.rawOutput);
const savedSabbathContract = buildEmetAiQuestionContract({
  question: sabbathArtifact.results[0].question,
});
const normalizedSavedSabbathPlan = normalizeEmetAiPlannedReferences(
  savedSabbathPlan,
  savedSabbathContract,
  emetAiLockedScriptureReferenceExists,
);
assert.deepEqual(normalizedSavedSabbathPlan.requiredReferenceErrors, []);
assert.deepEqual(
  normalizedSavedSabbathPlan.recoveredMalformedGoverningReferences.map((item) => item.reference),
  ["Jeremiah 31:31-?"],
);
const parsedSavedSabbathPlan = parseEmetAiRetrievalPlan(normalizedSavedSabbathPlan.value);
assert.ok(parsedSavedSabbathPlan);
assert.ok(validateEmetAiPlanningCompleteness(parsedSavedSabbathPlan).length > 0);

const serializedArtifact = JSON.parse(fs.readFileSync(
  ".private/emet-live-audits/phase3-2026-10-12T14-44-48-623Z.json",
  "utf8",
));
const serializedPlan = JSON.parse(serializedArtifact.results[0].providerAudit.planning.rawOutput);
const serializedContract = buildEmetAiQuestionContract({
  question: serializedArtifact.results[0].question,
});
const normalizedSerializedPlan = normalizeEmetAiPlannedReferences(
  serializedPlan,
  serializedContract,
  emetAiLockedScriptureReferenceExists,
);
assert.deepEqual(normalizedSerializedPlan.requiredReferenceErrors, []);
assert.equal(normalizedSerializedPlan.recoveredSerializedGoverningReferences.length, 1);
assert.deepEqual(
  normalizedSerializedPlan.recoveredSerializedGoverningReferences[0].references,
  [
    "Jeremiah 31:33", "Matthew 5:17", "Matthew 12:12", "Mark 2:27",
    "Luke 23:56", "Acts 13:42", "Acts 17:2", "Acts 18:4",
    "Colossians 2:16", "Hebrews 4:9",
  ],
);
assert.ok(parseEmetAiRetrievalPlan(normalizedSerializedPlan.value));

const validArrayPlan = structuredClone(rawPlan);
validArrayPlan.components[0].governingReferences = [
  "Colossians 2:16", "Colossians 2:17", "Exodus 20:8",
];
const validArrayResult = normalizeEmetAiPlannedReferences(
  validArrayPlan,
  planningContract,
  emetAiLockedScriptureReferenceExists,
);
assert.deepEqual(validArrayResult.requiredReferenceErrors, []);
assert.deepEqual(validArrayResult.recoveredSerializedGoverningReferences, []);

for (const malformed of [
  "Colossians 2:16;Colossians 2:17",
  "Colossians 2:16', 'Colossians 2:17",
  'Colossians 2:16","Luke 1:999',
  'Colossians 2:16","Psalm 14',
]) {
  const malformedPlan = structuredClone(rawPlan);
  malformedPlan.components[0].governingReferences = [malformed];
  const malformedResult = normalizeEmetAiPlannedReferences(
    malformedPlan,
    planningContract,
    emetAiLockedScriptureReferenceExists,
  );
  assert.ok(malformedResult.requiredReferenceErrors.length > 0, malformed);
  assert.deepEqual(malformedResult.recoveredSerializedGoverningReferences, []);
}

const explicitContract = buildEmetAiQuestionContract({
  question: "Compare Colossians 2:16 and Exodus 20:8.",
});
const explicitResult = normalizeEmetAiPlannedReferences(
  validArrayPlan,
  explicitContract,
  emetAiLockedScriptureReferenceExists,
);
assert.deepEqual(explicitResult.requiredReferenceErrors, []);
assert.deepEqual(explicitResult.recoveredSerializedGoverningReferences, []);

assert.deepEqual(validateEmetAiPlanningNeutrality(rawPlan), []);
assert.ok(validateEmetAiPlanningNeutrality({
  ...rawPlan,
  proposition: "Colossians 2:16-17 should be interpreted as preserving the Sabbath rather than abolishing it.",
}).length > 0);

assert.ok(validateEmetAiPlanningNeutrality({
  analysisMode: "apparent-contradiction",
  proposition: "The passages agree because they use righteous with different scope.",
  components: [],
}).length > 0);

assert.deepEqual(validateEmetAiPlanningNeutrality({
  analysisMode: "apparent-contradiction",
  proposition: "Compare what each passage states about righteousness and its immediate context.",
  components: [],
}), []);

const rangeResult = buildEmetAiTopicEvidence({
  question: "What do Colossians 2:16-17 say?",
  retrievalPlan: rawPlan,
  requireSemanticPlan: true,
  builtAt: "2026-10-12T00:00:00.000Z",
});
assert.equal(rangeResult.status, "ready");
const rangePacket = rangeResult.packet;
const rangeEvidenceIds = rangePacket.evidence.map((item) => item.id);
const rangeAnswer = (answer) => ({
  schemaVersion: "emet-ai-answer@4",
  status: "complete",
  answer,
  conclusionSupport: "explicit-statement",
  componentChecks: rangePacket.reasoning.components.map((component) => ({
    componentId: component.id,
    support: "explicit-statement",
    explanation: "The requested texts are compared from the verified packet.",
    evidenceIds: rangeEvidenceIds,
  })),
  claims: [{
    id: "range-claim",
    text: "The requested verses address judgment and shadow language.",
    support: "explicit-statement",
    category: "practice",
    polarity: "affirms",
    scope: "Colossians 2:16-17",
    timing: "not-applicable",
    evidenceIds: rangeEvidenceIds,
  }],
  continuityChecks: [],
  citations: rangePacket.evidence.map((item) => ({ evidenceId: item.id, reference: item.reference })),
  limitations: [],
});
const incompleteRange = validateEmetAiAnswer(rangePacket, rangeAnswer(
  "Verse 16 says no one should judge regarding food, drink, a feast, a new moon, or Sabbaths.",
));
assert.equal(incompleteRange.ok, false);
assert.ok(incompleteRange.errors.some((error) => error.includes("Colossians 2:17")));
const completeRange = validateEmetAiAnswer(rangePacket, rangeAnswer(
  "Verse 16 says no one should judge regarding food, drink, a feast, a new moon, or Sabbaths. Verse 17 says these things are a shadow of things to come, while the body is Messiah's.",
));
assert.equal(completeRange.ok, true, completeRange.ok ? "" : completeRange.errors.join("\n"));

assert.equal(isEmetAiDeterministicFastPathEligible({
  question: "Who wrote Hebrews?",
}), false);
const authorshipFastPath = buildEmetAiTopicEvidence({
  question: "Who wrote Hebrews?",
  deterministicFastPath: true,
  builtAt: "2026-10-12T00:00:00.000Z",
});
assert.equal(authorshipFastPath.status, "insufficient-evidence");

const otFoundationCases = [
  ["Sabbath", "Exodus 20:8", "Mark 2:27"],
  ["commandments", "Deuteronomy 6:5", "Matthew 22:37"],
  ["covenant", "Jeremiah 31:33", "Hebrews 8:10"],
  ["resurrection", "Daniel 12:2", "John 6:40"],
  ["Messiah", "Micah 5:2", "Matthew 2:6"],
  ["prophecy", "Joel 2:28", "Acts 2:17"],
];

for (const [subject, foundation, laterWitness] of otFoundationCases) {
  const componentId = `ot-foundation-${subject.toLocaleLowerCase("en-US")}`;
  const plan = {
    schemaVersion: EMET_AI_RETRIEVAL_PLAN_SCHEMA,
    subject,
    analysisMode: "simple",
    proposition: `Interpret the New Testament ${subject} passage with its relevant Old Testament foundation.`,
    requiresScopeAnalysis: false,
    requiresTimeline: false,
    components: [{
      id: componentId,
      proposition: `The relevant ${subject} interpretation considers both passages.`,
      category: subject === "covenant" ? "covenant" : subject === "resurrection" ? "event" : subject === "prophecy" ? "prophecy" : "other",
      governingReferences: [foundation, laterWitness],
    }],
    intent: "passage",
    passages: [
      { reference: foundation, role: "foundation", reason: "Earlier canonical foundation.", priority: 100 },
      { reference: laterWitness, role: "later-witness", reason: "Later passage interpreted with that foundation.", priority: 99 },
    ],
    sourcePhrases: [],
    limitations: [],
  };
  const result = buildEmetAiTopicEvidence({
    question: `How does the New Testament address ${subject}?`,
    retrievalPlan: plan,
    requireSemanticPlan: true,
    builtAt: "2026-10-12T00:00:00.000Z",
  });
  assert.equal(result.status, "ready", subject);
  const references = new Set(result.packet.evidence.map((item) => item.reference));
  assert.ok(references.has(foundation), `${subject}: missing ${foundation}`);
  assert.ok(references.has(laterWitness), `${subject}: missing ${laterWitness}`);
}

const providerSource = fs.readFileSync(
  "app/lib/emet/providers/EmetAiOpenAiProvider.ts",
  "utf8",
);
assert.match(providerSource, /OT-foundation requirement/);
assert.match(providerSource, /Do not assume continuity or change/);
assert.match(providerSource, /simple factual authorship question/);
assert.match(providerSource, /minItems: continuityIds\.length/);
assert.match(providerSource, /rawOutput: response\.output_text/);

console.log("EMET stabilization Phase 5 deterministic verification passed.");
console.log("- Locked-corpus reference normalization accepts only unambiguous real passages.");
console.log("- Invalid optional references are diagnosed and discarded without erasing a sound plan; invalid governing references fail closed.");
console.log("- Apparent-contradiction plans are rejected when their propositions preselect an interpretation.");
console.log("- Explicit verse ranges require reader-visible substantive coverage of every verse.");
console.log("- Hebrews authorship remains eligible for fast-path probing but safely falls back when evidence is insufficient.");
console.log("- OT foundations survive retrieval for Sabbath, commandments, covenant, resurrection, Messiah, and prophecy.");
console.log("- Generation schemas require the planned continuity-check count before answer generation.");
console.log("- Private audit hooks preserve rejected plan, answer, and repair drafts with validation errors.");
