import assert from "node:assert/strict";

import {
  classifyEmetAiResponseDesign,
  EMET_AI_CONCISE_STYLE_VERSION,
} from "../app/lib/emet/EmetAiResponseDesign.ts";
import { getEmetAiRequestCacheKey } from "../app/lib/emet/EmetAiCache.ts";

const directQuestions = [
  "Did Messiah abolish the commandments?",
  "Should Christians keep the commandments?",
  "Which day is the biblical Sabbath?",
];

for (const question of directQuestions) {
  const design = classifyEmetAiResponseDesign({ question });
  assert.equal(design.depth, "concise", question);
  assert.equal(design.targetMinWords, 30);
  assert.equal(design.targetMaxWords, 65);
  assert.equal(design.maxScriptureCitations, 4);
}

const legacyDirectQuestionKey =
  "emet-ai-request:f891a8782eff484cbd650384bdc696fbbed28b6775c9320cb397a9b6ee593e64";
const conciseStyleKey = getEmetAiRequestCacheKey({
  question: "Did jesus abolish the commandments?",
  conversation: null,
  context: null,
});
assert.notEqual(conciseStyleKey, legacyDirectQuestionKey);
assert.equal(EMET_AI_CONCISE_STYLE_VERSION, "answer-first-concise@1");

assert.equal(
  classifyEmetAiResponseDesign({
    question: "Why did Paul write Colossians 2:16?",
  }).depth,
  "standard",
);

assert.equal(
  classifyEmetAiResponseDesign({
    question: "Compare the Sabbath passages in Exodus, Isaiah, the Gospels, and Hebrews.",
  }).depth,
  "deep",
);

const conversation = {
  recentExchanges: [{
    question: "Did Messiah abolish the commandments?",
    answer: "No.",
    references: ["Matthew 5:17"],
    claims: [],
    outcome: "answered",
  }],
  summary: {
    topics: ["commandments"],
    passages: ["Matthew 5:17"],
    corrections: [],
    earlierQuestions: [],
    establishedClaims: [],
  },
};
const followUp = classifyEmetAiResponseDesign({
  question: "But what about Paul's statement in Colossians?",
  conversation,
});
assert.equal(followUp.depth, "standard");
assert.equal(followUp.progressiveFollowUp, true);

console.log("EMET response-design verification passed.");
console.log("- Direct questions use concise 30–65 word answers and 2–4 strongest witnesses.");
console.log("- Why questions receive standard explanatory depth.");
console.log("- Comparisons and deep studies retain comprehensive treatment.");
console.log("- Follow-up objections deepen the existing conversation instead of restarting it.");
console.log("- Legacy long-form request caches cannot satisfy concise answer-first requests.");
