import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  expectedEmetAiDirectAnswerPolarity,
  normalizeEmetAiDirectAnswerPolarity,
} from "../app/lib/emet/EmetAiAnswerNormalization.ts";
import { validateEmetAiAnswer } from "../app/lib/emet/EmetAiContract.ts";
import {
  validateEmetAiObligationPlanning,
} from "../app/lib/emet/EmetAiPlanningIntegrity.ts";
import { buildEmetAiQuestionContract } from "../app/lib/emet/EmetAiQuestionContract.ts";
import {
  assessEmetAiDeterministicSufficiency,
  buildEmetAiInitialScriptureEvidence,
} from "../app/lib/emet/EmetAiTopicEvidence.ts";

const artifactPath = path.join(
  process.cwd(),
  ".private",
  "emet-live-audits",
  "phase3-2026-10-13T18-29-12-390Z.json",
);
assert.equal(fs.existsSync(artifactPath), true, "The exact four-question live artifact is required.");
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
assert.equal(artifact.results.length, 4);

const expected = [
  ["Should followers of Messiah keep the seventh-day Sabbath?", "obligation"],
  ["Did Yahweh's commandments exist before the Sinai covenant?", "historical"],
  ["What does Ecclesiastes 12:13–14 teach about humanity's responsibility to keep the commandments?", "obligation"],
  ["Must someone who is not a priest perform the priestly duties commanded in Leviticus?", "obligation"],
];

for (const [index, [question, intent]] of expected.entries()) {
  const contract = buildEmetAiQuestionContract({ question });
  assert.equal(contract.intent, intent, question);
  assert.equal(contract.requiresSemanticPlanning, true, question);
  assert.equal(
    assessEmetAiDeterministicSufficiency({ question, questionContract: contract }).sufficient,
    false,
    question,
  );
  if (intent === "obligation") {
    assert.equal(contract.commandApplicability, true, question);
    assert.equal(contract.commandApplicabilityKind, "audience", question);
    assert.equal(contract.instructionProfile, "complex", question);
    assert.equal(contract.responseDesign.depth, "standard", question);
    const initial = buildEmetAiInitialScriptureEvidence({ question, questionContract: contract });
    if (contract.explicitReferences.length) {
      assert.equal(initial.status, "ready", question);
      assert.deepEqual(
        initial.items.map((item) => item.reference),
        ["Ecclesiastes 12:13", "Ecclesiastes 12:14"],
        question,
      );
    } else {
      // Progressive "ready" means locked reading aids are available, not that
      // governing coverage is complete. Sufficiency must remain false above:
      // the final answer still requires the verified semantic evidence plan.
      assert.equal(initial.status, "ready", question);
      assert.equal(initial.route, "direct-factual", question);
      assert.ok(initial.items.length >= 1 && initial.items.length <= 5, question);
      const expectedAnchor = index === 0 ? "Exodus 20:8" : "Numbers 8:26";
      assert.ok(initial.items.some((item) => item.reference === expectedAnchor), question);
      assert.ok(initial.items.every((item) => item.id.startsWith("scripture:") && item.text.length > 0), question);
    }
  }

  const oldPlanErrors = validateEmetAiObligationPlanning(
    artifact.results[index].plan,
    contract,
  );
  assert.equal(
    oldPlanErrors.some((error) => /preselects an interpretation/i.test(error)),
    false,
    question,
  );
}

for (const question of [
  "Should disciples obey this command?",
  "Are followers of Yeshua responsible to keep Yahweh's instructions?",
  "Must a king perform duties assigned only to priests?",
  "Does this land-specific command apply when its stated land condition is absent?",
  "Does an earlier command remain applicable to believers?",
  "Are farmers required to perform this agricultural instruction only while living in the land?",
]) {
  const contract = buildEmetAiQuestionContract({ question });
  assert.equal(contract.intent, "obligation", question);
  assert.equal(contract.commandApplicability, true, question);
  assert.equal(contract.requiresSemanticPlanning, true, question);
  assert.equal(
    assessEmetAiDeterministicSufficiency({ question, questionContract: contract }).sufficient,
    false,
    question,
  );
}

for (const question of [
  "Who created the heavens and the earth?",
  "What does John 3:16 say?",
]) {
  assert.equal(
    assessEmetAiDeterministicSufficiency({ question }).sufficient,
    true,
    question,
  );
}

const neutralPlan = {
  analysisMode: "doctrinal-claim",
  proposition: "Whether the command applies to the audience named in the question.",
  requiresScopeAnalysis: true,
  components: [
    ["command", "What instruction does the passage state?", "Exodus 20:8"],
    ["covenant-participants", "Who does the text name as participants?", "Exodus 20:10"],
    ["duration", "What duration or end condition does the text state, if any?", "Exodus 31:16"],
    ["application", "What role and performance conditions govern the instruction?", "Exodus 20:10"],
    ["authority", "What later Scripture materially addresses continuity or change?", "Matthew 5:17"],
  ].map(([category, proposition, reference], index) => ({
    id: `component-${index + 1}`,
    category,
    proposition,
    governingReferences: [reference],
  })),
};
const obligationContract = buildEmetAiQuestionContract({
  question: "Should followers of Messiah keep the seventh-day Sabbath?",
});
assert.deepEqual(validateEmetAiObligationPlanning(neutralPlan, obligationContract), []);
assert.deepEqual(validateEmetAiObligationPlanning({
  ...neutralPlan,
  components: neutralPlan.components.filter((item) => item.category !== "duration"),
}, obligationContract), []);
assert.deepEqual(validateEmetAiObligationPlanning({
  ...neutralPlan,
  proposition: "The command remains binding for all followers.",
}, obligationContract), []);
assert.match(
  validateEmetAiObligationPlanning({
    ...neutralPlan,
    components: neutralPlan.components.filter((item) => item.category !== "command"),
  }, obligationContract).join("\n"),
  /original command or governing instruction/i,
);

const priestResult = artifact.results[3];
const badPriestAnswer = priestResult.cold.answer;
assert.equal(
  expectedEmetAiDirectAnswerPolarity(priestResult.question, badPriestAnswer),
  "no",
);
assert.equal(validateEmetAiAnswer(priestResult.verifiedEvidencePacket, badPriestAnswer).ok, false);
const correctedPriestAnswer = normalizeEmetAiDirectAnswerPolarity(
  priestResult.question,
  badPriestAnswer,
);
assert.match(correctedPriestAnswer.answer, /^No\./);
assert.equal(validateEmetAiAnswer(priestResult.verifiedEvidencePacket, correctedPriestAnswer).ok, true);

for (const question of [
  "Must a non-priest not perform priestly duties?",
  "Is a non-priest forbidden from performing priestly duties?",
]) {
  const draft = { ...badPriestAnswer, answer: badPriestAnswer.answer.replace(/^Yes/, "No") };
  assert.equal(expectedEmetAiDirectAnswerPolarity(question, draft), "yes", question);
  assert.match(normalizeEmetAiDirectAnswerPolarity(question, draft).answer, /^Yes\./, question);
}

const ambiguous = {
  ...badPriestAnswer,
  claims: [
    ...badPriestAnswer.claims,
    {
      ...badPriestAnswer.claims[0],
      id: "ambiguous-positive",
      text: "Non-priests are required to perform the priestly duties.",
    },
  ],
};
assert.equal(expectedEmetAiDirectAnswerPolarity(priestResult.question, ambiguous), null);
assert.equal(
  normalizeEmetAiDirectAnswerPolarity(priestResult.question, ambiguous).answer,
  ambiguous.answer,
);

const ecclesiastesResult = artifact.results[2];
const ecclesiastesValidation = validateEmetAiAnswer(
  ecclesiastesResult.verifiedEvidencePacket,
  ecclesiastesResult.cold.answer,
);
assert.equal(ecclesiastesValidation.ok, false);
if (!ecclesiastesValidation.ok) {
  assert.match(ecclesiastesValidation.errors.join("\n"), /distinct Hebrew noun/i);
}

console.log("EMET Scripture-authority correction replay passed.");
console.log("- Exact four-question artifact was replayed without model calls.");
console.log("- Three obligation phrasings now share one canonical contract.");
console.log("- Incomplete obligation plans fail structurally; semantic wording is left to evidence-grounded generation.");
console.log("- Contradictory direct-answer polarity is rejected and corrected only when structured claims are unanimous.");
console.log("- Ambiguous polarity is not mechanically changed.");
console.log("- Ecclesiastes 12:13 supplied English wording is no longer treated as an independent Hebrew noun.");
