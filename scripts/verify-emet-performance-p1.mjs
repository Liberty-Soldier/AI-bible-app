import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { buildEmetConversationContext } from "../app/lib/emet/EmetAiConversation.ts";
import {
  assessEmetAiDeterministicSufficiency,
  buildEmetAiInitialScriptureEvidence,
  buildEmetAiTopicEvidence,
} from "../app/lib/emet/EmetAiTopicEvidence.ts";
import { buildEmetAiQuestionContract } from "../app/lib/emet/EmetAiQuestionContract.ts";
import { withAuthoritativeEmetClaims } from "../app/lib/emet/EmetAiConversation.ts";

const bypass = [
  {
    question: "Who created the heavens and the earth?",
    route: "direct-factual",
    references: ["Genesis 1:1"],
  },
  {
    question: "What does John 3:16 say?",
    route: "exact-reference-text",
    references: ["John 3:16"],
  },
  {
    question: "Explain John 3:16 in context.",
    route: "bounded-reference-explanation",
    references: ["John 3:1", "John 3:14", "John 3:16", "John 3:18", "John 3:21"],
  },
  {
    question: 'What Hebrew word is translated "one" in Deuteronomy 6:4, and what does it mean?',
    route: "single-reference-lexical",
    references: ["Deuteronomy 6:4"],
  },
  {
    question: "What are the Ten Commandments?",
    route: "named-list",
    references: ["Exodus 20:2", "Exodus 20:17"],
  },
];

const coldGateSamples = [];
for (const test of bypass) {
  const startedAt = performance.now();
  const assessment = assessEmetAiDeterministicSufficiency({ question: test.question });
  coldGateSamples.push(performance.now() - startedAt);
  assert.equal(assessment.sufficient, true, test.question);
  assert.equal(assessment.route, test.route, test.question);
  for (const reference of test.references) {
    assert.ok(assessment.references.includes(reference), `${test.question}: ${reference}`);
  }
  const evidence = buildEmetAiTopicEvidence({
    question: test.question,
    deterministicFastPath: true,
  });
  assert.equal(evidence.status, "ready", test.question);
}

const conversation = buildEmetConversationContext([{
  question: "What happens when we die and when are the dead raised?",
  answer: "The dead await resurrection.",
  references: ["Ecclesiastes 9:5", "Daniel 12:2"],
  outcome: "answered",
}]);

const recall = assessEmetAiDeterministicSufficiency({
  question: "What was my first question?",
  conversation,
});
assert.equal(recall.sufficient, true);
assert.equal(recall.route, "conversation-recall");

const planningRequired = [
  "Does Scripture require believers to keep the seventh-day Sabbath? Examine the Torah and relevant New Testament passages.",
  "How does Jeremiah 31 connect to Hebrews 8?",
  "Explain the symbolism in Revelation 12.",
  "Romans 3:10 says none are righteous, yet Genesis 6:9 and Luke 1:6 describe righteous people. How do these passages agree?",
  'What Hebrew word is translated "set" in Genesis 1:1?',
  "Did commandments exist before Moses?",
  "Did clean and unclean animal distinctions exist before Sinai?",
  "Was Sabbath rest known before the Sinai covenant?",
  "Did sacrifices exist before the Levitical priesthood?",
  "Did Abraham keep Yahweh's commandments?",
  "Did this ordinance begin only after Sinai?",
  "Does Scripture say whether this unnamed ordinance existed before Sinai?",
  "Should Christians keep the Sabbath?",
  "Should Israelites keep Yahweh's commandments?",
  "Are modern Christians required to obey the commandments?",
  "Did Messiah abolish the commandments?",
  "Does Paul teach that the law was abolished?",
  "What do the commandment keepers in Revelation show about obedience?",
  "What does Ecclesiastes 12:13-14 teach about humanity's obligation?",
  "Which instructions apply specifically to priests rather than all believers?",
];
for (const question of planningRequired) {
  const assessment = assessEmetAiDeterministicSufficiency({ question });
  assert.equal(assessment.sufficient, false, question);
}

for (const question of [
  "Should Christians keep the Sabbath?",
  "Should believers obey Yahweh's commandments?",
  "Must Israelites observe this command?",
  "Should all believers keep commandments given specifically to priests?",
]) {
  const contract = buildEmetAiQuestionContract({ question });
  assert.equal(contract.intent, "obligation", question);
  assert.equal(contract.commandApplicability, true, question);
  assert.equal(contract.requiresSemanticPlanning, true, question);
  assert.equal(contract.responseDesign.depth, "standard", question);
  assert.ok(contract.responseDesign.maxScriptureCitations >= 8, question);
  assert.equal(
    assessEmetAiDeterministicSufficiency({ question, questionContract: contract }).sufficient,
    false,
    question,
  );
}

for (const question of [
  "Did commandments exist before Moses?",
  "Did clean and unclean animal distinctions exist before Sinai?",
  "Was Sabbath rest known before the Sinai covenant?",
  "Did sacrifices exist before the Levitical priesthood?",
  "Did this ordinance begin only after Sinai?",
]) {
  const contract = buildEmetAiQuestionContract({ question });
  assert.equal(contract.intent, "historical", question);
  assert.equal(contract.temporalRelationship, true, question);
  assert.equal(contract.requiresSemanticPlanning, true, question);
  const initial = buildEmetAiInitialScriptureEvidence({ question });
  assert.equal(initial.status, "finding", question);
  assert.deepEqual(initial.items, [], question);
}

const failedConversation = buildEmetConversationContext([{
  question: "Did the commandments exist before they were given to Moses by God?",
  answer: "I couldn't assemble enough directly relevant Scripture.",
  references: ["Numbers 3:38", "Numbers 3:39", "Numbers 3:40", "Numbers 3:41"],
  outcome: "failed",
}]);
const authoritativeFailedConversation = withAuthoritativeEmetClaims(failedConversation, []);
assert.deepEqual(
  authoritativeFailedConversation.recentExchanges[0].references,
  [],
  "Failed-turn references must not contaminate follow-up retrieval.",
);
const correctiveFollowUp = "What about Noah, clean and unclean animals, Cain and Abel's offerings, and laws before Sinai?";
const followUpContract = buildEmetAiQuestionContract({
  question: correctiveFollowUp,
  conversation: authoritativeFailedConversation,
});
assert.equal(followUpContract.requiresSemanticPlanning, true);
assert.ok(followUpContract.biblicalEntities.includes("Noah"));
assert.ok(followUpContract.biblicalEntities.includes("Cain"));
assert.ok(followUpContract.biblicalEntities.includes("Abel"));
assert.ok(followUpContract.biblicalEntities.includes("Sinai"));
assert.ok(followUpContract.biblicalEntities.includes("sacrifice"));

assert.equal(
  assessEmetAiDeterministicSufficiency({
    question: "When are they raised?",
    conversation,
  }).sufficient,
  false,
  "A substantive conversation follow-up must retain semantic planning.",
);

// Measure only local deterministic work. This does not claim model/network
// savings; it makes the added sufficiency-gate overhead reproducible.
const samples = [];
for (let iteration = 0; iteration < 100; iteration += 1) {
  for (const test of bypass) {
    const startedAt = performance.now();
    assessEmetAiDeterministicSufficiency({ question: test.question });
    samples.push(performance.now() - startedAt);
  }
}
samples.sort((left, right) => left - right);
coldGateSamples.sort((left, right) => left - right);
const percentile = (ratio) => samples[Math.min(samples.length - 1, Math.floor(samples.length * ratio))];

console.log("EMET Performance P1 deterministic sufficiency verification passed.");
console.log(`- Planning calls eliminated in fixture: ${bypass.length + 1}`);
console.log(`- Planning calls retained in fixture: ${planningRequired.length + 1}`);
console.log(`- Local first-pass gate median: ${coldGateSamples[Math.floor(coldGateSamples.length / 2)].toFixed(3)} ms`);
console.log(`- Local first-pass gate max: ${coldGateSamples.at(-1).toFixed(3)} ms`);
console.log(`- Local gate median: ${percentile(0.5).toFixed(3)} ms`);
console.log(`- Local gate p95: ${percentile(0.95).toFixed(3)} ms`);
console.log("- No model or network calls were made.");
