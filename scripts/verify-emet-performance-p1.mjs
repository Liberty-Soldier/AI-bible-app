import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { buildEmetConversationContext } from "../app/lib/emet/EmetAiConversation.ts";
import {
  assessEmetAiDeterministicSufficiency,
  buildEmetAiTopicEvidence,
} from "../app/lib/emet/EmetAiTopicEvidence.ts";

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

for (const question of [
  "Does Scripture require believers to keep the seventh-day Sabbath? Examine the Torah and relevant New Testament passages.",
  "How does Jeremiah 31 connect to Hebrews 8?",
  "Explain the symbolism in Revelation 12.",
  "Romans 3:10 says none are righteous, yet Genesis 6:9 and Luke 1:6 describe righteous people. How do these passages agree?",
  'What Hebrew word is translated "set" in Genesis 1:1?',
]) {
  const assessment = assessEmetAiDeterministicSufficiency({ question });
  assert.equal(assessment.sufficient, false, question);
}

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
console.log("- Planning calls retained in fixture: 6");
console.log(`- Local first-pass gate median: ${coldGateSamples[Math.floor(coldGateSamples.length / 2)].toFixed(3)} ms`);
console.log(`- Local first-pass gate max: ${coldGateSamples.at(-1).toFixed(3)} ms`);
console.log(`- Local gate median: ${percentile(0.5).toFixed(3)} ms`);
console.log(`- Local gate p95: ${percentile(0.95).toFixed(3)} ms`);
console.log("- No model or network calls were made.");
