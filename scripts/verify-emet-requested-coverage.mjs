import assert from "node:assert/strict";

import {
  EMET_AI_ANSWER_SCHEMA,
  validateEmetAiAnswer,
} from "../app/lib/emet/EmetAiContract.ts";
import {
  EMET_AI_RETRIEVAL_PLAN_SCHEMA,
} from "../app/lib/emet/EmetAiRetrievalPlan.ts";
import { buildEmetAiTopicEvidence } from "../app/lib/emet/EmetAiTopicEvidence.ts";

const question = "Compare Romans 3:10, Genesis 6:9, Luke 1:6, Ezekiel 18:5–9, and Psalm 14. What do the Hebrew and Greek righteousness terms mean in context?";
const passages = [
  "Romans 3:10",
  "Genesis 6:9",
  "Luke 1:6",
  "Ezekiel 18:5-9",
  "Psalms 14:1",
  "Psalms 14:2",
  "Psalms 14:3",
];
const retrievalPlan = {
  schemaVersion: EMET_AI_RETRIEVAL_PLAN_SCHEMA,
  subject: "righteousness across the requested passages",
  analysisMode: "simple",
  proposition: question,
  requiresScopeAnalysis: false,
  requiresTimeline: false,
  components: [],
  intent: "comparison",
  passages: passages.map((reference, index) => ({
    reference,
    role: "direct",
    reason: "The reader explicitly requested this passage.",
    priority: 100 - index,
  })),
  sourcePhrases: [
    {
      corpus: "hebrew",
      label: "Hebrew righteous terminology",
      lexicalIds: ["H6662"],
      lemmas: [],
      reason: "Identify the verified Hebrew source word in context.",
    },
    {
      corpus: "greek-nt",
      label: "Greek righteous terminology",
      lexicalIds: ["G1342"],
      lemmas: [],
      reason: "Identify the verified Greek source word in context.",
    },
  ],
  limitations: [],
};

const result = buildEmetAiTopicEvidence({
  question,
  retrievalPlan,
  requireSemanticPlan: true,
  builtAt: "2026-10-08T00:00:00.000Z",
});
assert.equal(result.status, "ready");
const packet = result.packet;
for (const reference of [
  "Romans 3:10", "Genesis 6:9", "Luke 1:6",
  "Ezekiel 18:5", "Ezekiel 18:6", "Ezekiel 18:7", "Ezekiel 18:8", "Ezekiel 18:9",
  "Psalms 14:1", "Psalms 14:2", "Psalms 14:3",
]) {
  assert.ok(packet.scope.references.includes(reference), `Missing ${reference}`);
}
assert.ok(packet.evidence.some((item) => item.kind === "lexical" && item.corpus === "hebrew" && item.lexicalId === "H6662"));
assert.ok(packet.evidence.some((item) => item.kind === "lexical" && item.corpus === "greek-nt" && item.lexicalId === "G1342"));

const citations = packet.evidence.map((item) => ({
  evidenceId: item.id,
  ...(item.reference ? { reference: item.reference } : {}),
}));
const visibleTerms = packet.requestedCoverage.language
  .flatMap((requirement) => requirement.terms)
  .map((term) => `${term.lemma} (${term.transliteration}) means ${term.meaning}`)
  .join("; ");
const answer = {
  schemaVersion: EMET_AI_ANSWER_SCHEMA,
  status: "complete",
  answer: `The requested passages use related Hebrew and Greek righteousness language in contexts that must be read together: ${visibleTerms}.`,
  conclusionSupport: "theological-synthesis",
  componentChecks: packet.reasoning.components.map((component) => ({
    componentId: component.id,
    support: "theological-synthesis",
    explanation: `The answer meaningfully addresses ${component.proposition}`,
    evidenceIds: component.id === "requested-language-1"
      ? packet.evidence.filter((item) => item.kind === "lexical").map((item) => item.id)
      : packet.evidence
          .filter((item) => item.kind === "scripture" && packet.requestedCoverage.passages
            .find((requirement) => requirement.id === component.id)?.references.includes(item.reference))
          .map((item) => item.id),
  })),
  claims: [{
    id: "requested-comparison",
    text: "The requested texts require a contextual comparison.",
    support: "theological-synthesis",
    category: "other",
    polarity: "affirms",
    scope: "requested passages",
    timing: "not-applicable",
    evidenceIds: packet.evidence.map((item) => item.id),
  }],
  continuityChecks: [],
  citations,
  limitations: [],
};
assert.equal(validateEmetAiAnswer(packet, answer).ok, true);

const missingPassageCitation = structuredClone(answer);
missingPassageCitation.citations = missingPassageCitation.citations.filter(
  (citation) => citation.reference !== "Romans 3:10",
);
assert.equal(validateEmetAiAnswer(packet, missingPassageCitation).ok, false);

const missingLanguageDiscussion = structuredClone(answer);
missingLanguageDiscussion.claims[0].evidenceIds = missingLanguageDiscussion.claims[0].evidenceIds.filter(
  (evidenceId) => !evidenceId.startsWith("lexical:"),
);
assert.equal(validateEmetAiAnswer(packet, missingLanguageDiscussion).ok, false);

const hiddenLanguageTerms = structuredClone(answer);
hiddenLanguageTerms.answer = "The Hebrew and Greek terms are contextually related.";
assert.equal(validateEmetAiAnswer(packet, hiddenLanguageTerms).ok, false);

const sabbathQuestion = "Does Scripture require believers to keep the seventh-day Sabbath? Present the strongest biblical evidence for and against continued Sabbath observance, including the distinction between salvation and obedience.";
const sabbathPlan = {
  ...retrievalPlan,
  subject: "continued seventh-day Sabbath observance",
  analysisMode: "doctrinal-claim",
  proposition: "Whether Scripture requires believers to keep the seventh-day Sabbath",
  requiresScopeAnalysis: true,
  components: [
    { id: "observance", proposition: "The biblical case for continued observance", category: "command" },
    { id: "qualification", proposition: "The biblical case offered against continued observance", category: "application" },
  ],
  passages: [
    { reference: "Exodus 20:8", role: "foundation", reason: "The Sabbath command.", priority: 100 },
    { reference: "Matthew 5:17", role: "later-witness", reason: "Jesus addresses the Law.", priority: 99 },
    { reference: "Colossians 2:16", role: "contrast", reason: "Commonly cited regarding Sabbath judgment.", priority: 98 },
    { reference: "Romans 14:5", role: "contrast", reason: "Commonly cited regarding esteem of days.", priority: 97 },
    { reference: "Galatians 4:10", role: "contrast", reason: "Commonly cited regarding observed days.", priority: 96 },
  ],
  sourcePhrases: [],
};
const sabbathResult = buildEmetAiTopicEvidence({
  question: sabbathQuestion,
  retrievalPlan: sabbathPlan,
  requireSemanticPlan: true,
  builtAt: "2026-10-08T00:00:00.000Z",
});
assert.equal(sabbathResult.status, "ready");
for (const reference of [
  "Colossians 2:16", "Colossians 2:17", "Romans 14:5", "Romans 14:6",
  "Galatians 4:9", "Galatians 4:10", "Galatians 4:11",
]) {
  assert.ok(sabbathResult.packet.scope.references.includes(reference), `Missing comparison evidence ${reference}`);
}
assert.equal(sabbathResult.packet.requestedCoverage.competingInterpretations, true);

const genericComparisonQuestion = "Present the strongest biblical evidence for and against conscious existence between death and resurrection.";
const genericComparisonPlan = {
  ...sabbathPlan,
  subject: "conscious existence between death and resurrection",
  proposition: "Whether the dead are conscious between death and resurrection",
  passages: [
    { reference: "Ecclesiastes 9:5", role: "direct", reason: "Describes the dead as knowing nothing.", priority: 100 },
    { reference: "Luke 16:23", role: "contrast", reason: "Depicts a dead man as conscious in Hades.", priority: 99 },
  ],
};
const genericComparisonResult = buildEmetAiTopicEvidence({
  question: genericComparisonQuestion,
  retrievalPlan: genericComparisonPlan,
  requireSemanticPlan: true,
  builtAt: "2026-10-08T00:00:00.000Z",
});
assert.equal(genericComparisonResult.status, "ready");
assert.equal(genericComparisonResult.packet.requestedCoverage.competingInterpretations, true);

console.log("EMET requested-coverage verification passed.");
