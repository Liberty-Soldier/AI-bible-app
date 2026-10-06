import assert from "node:assert/strict";

import {
  buildEmetConversationContext,
  buildEmetConversationQuestion,
  parseEmetConversationContext,
  relevantEmetConversation,
} from "../app/lib/emet/EmetAiConversation.ts";
import {
  EMET_AI_RETRIEVAL_PLAN_SCHEMA,
  parseEmetAiRetrievalPlan,
} from "../app/lib/emet/EmetAiRetrievalPlan.ts";
import { buildEmetAiTopicEvidence } from "../app/lib/emet/EmetAiTopicEvidence.ts";

function plan({
  subject,
  intent = "other",
  passages,
  sourcePhrases = [],
}) {
  return {
    schemaVersion: EMET_AI_RETRIEVAL_PLAN_SCHEMA,
    subject,
    intent,
    passages: passages.map((item, index) => ({
      reference: item.reference,
      role: item.role || (index === 0 ? "direct" : "later-witness"),
      reason: item.reason || `Relevant to ${subject}.`,
      priority: item.priority || Math.max(50, 100 - index * 4),
    })),
    sourcePhrases,
    limitations: [],
  };
}

function references(result) {
  return result.status === "ready" ? result.packet.scope.references : [];
}

function requireReferences(result, expected) {
  assert.equal(result.status, "ready");
  const actual = references(result);
  for (const reference of expected) {
    assert.ok(actual.includes(reference), `Missing required reference ${reference}`);
  }
}

const watchersPlan = plan({
  subject: "the Genesis 6 sons of God and the later angelic rebellion witness",
  intent: "identity",
  passages: [
    { reference: "Genesis 6:1", role: "context" },
    { reference: "Genesis 6:2", role: "direct" },
    { reference: "Genesis 6:4", role: "direct" },
    { reference: "Job 1:6", role: "foundation" },
    { reference: "Job 2:1", role: "foundation" },
    { reference: "Job 38:7", role: "foundation" },
    { reference: "2 Peter 2:4", role: "later-witness" },
    { reference: "2 Peter 2:5", role: "later-witness" },
    { reference: "Jude 1:6", role: "later-witness" },
    { reference: "Jude 1:7", role: "qualifying" },
  ],
  sourcePhrases: [
    {
      corpus: "hebrew",
      label: "sons of God",
      lexicalIds: ["H1121", "H430"],
      lemmas: [],
      reason: "Compare the recurring Hebrew source phrase before assessing identity.",
    },
  ],
});

const watchers = buildEmetAiTopicEvidence({
  question: "Tell me about the watchers in Genesis.",
  context: { book: "Genesis", chapter: 6, translation: "web" },
  retrievalPlan: watchersPlan,
  requireSemanticPlan: true,
  builtAt: "2026-01-01T00:00:00.000Z",
});
requireReferences(watchers, [
  "Genesis 6:2",
  "Genesis 6:4",
  "Job 1:6",
  "Job 2:1",
  "Job 38:7",
  "2 Peter 2:4",
  "Jude 1:6",
]);
assert.ok(!references(watchers).includes("Genesis 12:18"));
assert.ok(!references(watchers).includes("Jeremiah 4:16"));
if (watchers.status === "ready") {
  const phraseEvidence = watchers.packet.evidence.filter(
    (item) => item.provenance.retrieval?.method === "exact-source-phrase",
  );
  assert.ok(phraseEvidence.length >= 5);
  assert.ok(
    phraseEvidence.every((item) =>
      item.provenance.retrieval?.reason.includes("same hebrew source sequence"),
    ),
  );
  assert.ok(watchers.packet.scope.references.length <= 10);
}

const angelsSinning = buildEmetAiTopicEvidence({
  question: "Where does Scripture describe angels sinning?",
  retrievalPlan: plan({
    subject: "angels who sinned and were held for judgment",
    intent: "event",
    passages: [
      { reference: "2 Peter 2:4", role: "direct" },
      { reference: "Jude 1:6", role: "direct" },
      { reference: "Genesis 6:1", role: "foundation" },
      { reference: "Genesis 6:2", role: "foundation" },
      { reference: "Genesis 6:4", role: "foundation" },
      { reference: "2 Peter 2:5", role: "context" },
      { reference: "Jude 1:7", role: "qualifying" },
    ],
  }),
  requireSemanticPlan: true,
});
requireReferences(angelsSinning, ["2 Peter 2:4", "Jude 1:6"]);

const judeGenesis = buildEmetAiTopicEvidence({
  question: "Does Jude refer to Genesis 6?",
  retrievalPlan: plan({
    subject: "whether Jude 6-7 recalls the Genesis 6 rebellion",
    intent: "comparison",
    passages: [
      { reference: "Genesis 6:1", role: "foundation" },
      { reference: "Genesis 6:2", role: "foundation" },
      { reference: "Genesis 6:4", role: "foundation" },
      { reference: "Jude 1:6", role: "direct" },
      { reference: "Jude 1:7", role: "qualifying" },
      { reference: "2 Peter 2:4", role: "later-witness" },
      { reference: "2 Peter 2:5", role: "later-witness" },
    ],
  }),
  requireSemanticPlan: true,
});
requireReferences(judeGenesis, ["Genesis 6:2", "Jude 1:6", "2 Peter 2:4"]);
assert.ok(!references(judeGenesis).includes("Jude 1:1"));

const lawlessOne = buildEmetAiTopicEvidence({
  question: "Is the lawless one the antichrist?",
  retrievalPlan: plan({
    subject: "the man of lawlessness and the antichrist designation",
    intent: "comparison",
    passages: [
      { reference: "2 Thessalonians 2:3", role: "direct" },
      { reference: "2 Thessalonians 2:8", role: "direct" },
      { reference: "1 John 2:18", role: "direct" },
      { reference: "1 John 2:22", role: "qualifying" },
    ],
  }),
  requireSemanticPlan: true,
});
requireReferences(lawlessOne, ["2 Thessalonians 2:8", "1 John 2:18"]);
assert.ok(!references(lawlessOne).some((reference) => reference.startsWith("Genesis ")));

const serpent = buildEmetAiTopicEvidence({
  question: "Is the serpent identified as Satan elsewhere?",
  retrievalPlan: plan({
    subject: "the Genesis serpent and the later Satan identification",
    intent: "identity",
    passages: [
      { reference: "Genesis 3:1", role: "foundation" },
      { reference: "Genesis 3:14", role: "foundation" },
      { reference: "Genesis 3:15", role: "foundation" },
      { reference: "2 Corinthians 11:3", role: "later-witness" },
      { reference: "Revelation 12:9", role: "direct" },
      { reference: "Revelation 20:2", role: "direct" },
    ],
  }),
  requireSemanticPlan: true,
});
requireReferences(serpent, ["Genesis 3:1", "Revelation 12:9", "Revelation 20:2"]);

const abolishLaw = buildEmetAiTopicEvidence({
  question: "Did the Messiah abolish the law?",
  retrievalPlan: plan({
    subject: "the Messiah's relation to the law",
    intent: "continuity",
    passages: [
      { reference: "Matthew 5:17", role: "direct" },
      { reference: "Matthew 5:18", role: "direct" },
      { reference: "Matthew 5:19", role: "direct" },
      { reference: "Romans 3:31", role: "later-witness" },
      { reference: "Ephesians 2:15", role: "qualifying" },
    ],
  }),
  requireSemanticPlan: true,
});
requireReferences(abolishLaw, [
  "Matthew 5:17",
  "Matthew 5:18",
  "Romans 3:31",
  "Ephesians 2:15",
]);

const contextual = buildEmetAiTopicEvidence({
  question: "What is happening in this passage?",
  context: {
    book: "Genesis",
    chapter: 2,
    verse: 2,
    translation: "web",
  },
  requireSemanticPlan: true,
});
assert.equal(contextual.status, "ready");
assert.ok(references(contextual).includes("Genesis 2:2"));
if (contextual.status === "ready") {
  assert.equal(contextual.packet.scope.type, "passage");
  assert.ok(
    contextual.packet.evidence.every(
      (item) => item.provenance.retrieval?.method === "reader-context",
    ),
  );
}

const noSemanticPlan = buildEmetAiTopicEvidence({
  question: "Tell me about the watchers in Genesis.",
  context: { book: "Genesis", chapter: 6, translation: "web" },
  requireSemanticPlan: true,
});
assert.equal(noSemanticPlan.status, "insufficient-evidence");

const badPlan = parseEmetAiRetrievalPlan({
  schemaVersion: EMET_AI_RETRIEVAL_PLAN_SCHEMA,
  subject: "invalid",
  intent: "identity",
  passages: [
    { reference: "Imaginary 99:99", role: "direct", reason: "Invented", priority: 100 },
  ],
  sourcePhrases: [],
  limitations: [],
});
assert.ok(badPlan);
const unresolved = buildEmetAiTopicEvidence({
  question: "What is qzxvplm?",
  retrievalPlan: badPlan,
  requireSemanticPlan: true,
});
assert.equal(unresolved.status, "insufficient-evidence");

const conversation = buildEmetConversationContext([
  {
    question: "Who are the sons of God in Genesis 6?",
    answer: "Prior answer prose must not become evidence.",
    references: ["Genesis 6:2", "Genesis 6:4", "Job 1:6"],
  },
]);
const followUp = buildEmetAiTopicEvidence({
  question: "Were they angels?",
  conversation,
  retrievalPlan: watchersPlan,
  requireSemanticPlan: true,
});
assert.equal(followUp.status, "ready");
if (followUp.status === "ready") {
  assert.match(followUp.packet.question, /Earlier reader question/);
  assert.match(followUp.packet.question, /Verified passages cited/);
  assert.doesNotMatch(followUp.packet.question, /Prior answer prose/);
}

const longStudy = buildEmetConversationContext(
  Array.from({ length: 12 }, (_, index) => ({
    question: index === 0 ? "What is Sukkot?" : `Sukkot study follow-up ${index + 1}`,
    answer: `Supported answer ${index + 1}`,
    references: index === 0 ? ["Leviticus 23:34"] : [],
  })),
);
assert.equal(longStudy.recentExchanges.length, 8);
assert.ok(longStudy.summary.topics.includes("sukkot"));
assert.ok(longStudy.summary.passages.includes("Leviticus 23:34"));
assert.equal(parseEmetConversationContext("not-an-object"), null);
assert.match(
  buildEmetConversationQuestion({
    question: "Does that still apply?",
    conversation,
  }),
  /not Scripture evidence/,
);
assert.equal(
  relevantEmetConversation({
    question: "What does Scripture teach about resurrection?",
    conversation: longStudy,
  }),
  null,
);

console.log("EMET semantic topic evidence verification passed.");
console.log("- Model-planned references are validated against locked Scripture.");
console.log("- Exact Hebrew source sequences connect Genesis 6 with the matching Job passages.");
console.log("- Event and canonical-witness questions retain Jude and 2 Peter instead of word noise.");
console.log("- Known false-positive passages are explicitly excluded.");
console.log("- Reader context disambiguates passage questions without contaminating independent topics.");
console.log("- Conversation retains questions and verified references, never earlier answer prose as evidence.");
console.log("- Unresolved plans and unsupported topics fail closed.");
