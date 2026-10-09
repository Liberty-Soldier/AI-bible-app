import assert from "node:assert/strict";

import {
  buildEmetConversationContext,
  buildEmetConversationQuestion,
  parseEmetConversationClaims,
  parseEmetConversationContext,
  relevantEmetConversation,
  relevantEmetConversationClaimReferences,
} from "../app/lib/emet/EmetAiConversation.ts";
import {
  EMET_AI_RETRIEVAL_PLAN_SCHEMA,
  parseEmetAiRetrievalPlan,
} from "../app/lib/emet/EmetAiRetrievalPlan.ts";
import {
  buildEmetAiTopicEvidence,
  isEmetAiDeterministicFastPathEligible,
} from "../app/lib/emet/EmetAiTopicEvidence.ts";

function plan({
  subject,
  intent = "other",
  analysisMode = "simple",
  proposition = subject,
  components = [],
  requiresScopeAnalysis = analysisMode !== "simple",
  requiresTimeline = false,
  passages,
  sourcePhrases = [],
}) {
  return {
    schemaVersion: EMET_AI_RETRIEVAL_PLAN_SCHEMA,
    subject,
    analysisMode,
    proposition,
    requiresScopeAnalysis,
    requiresTimeline,
    components,
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

const plannedRange = buildEmetAiTopicEvidence({
  question: "What does this short passage say?",
  retrievalPlan: plan({
    subject: "a short same-chapter passage",
    intent: "passage",
    passages: [{ reference: "Acts 5:3-4", role: "direct" }],
  }),
  requireSemanticPlan: true,
});
requireReferences(plannedRange, ["Acts 5:3", "Acts 5:4"]);

const referenceCollision = buildEmetAiTopicEvidence({
  question: "Compare these two distinct references.",
  retrievalPlan: plan({
    subject: "references whose punctuation-free forms would collide",
    intent: "comparison",
    passages: [
      { reference: "John 1:18", role: "direct" },
      { reference: "John 11:8", role: "contrast" },
    ],
  }),
  requireSemanticPlan: true,
});
requireReferences(referenceCollision, ["John 1:18", "John 11:8"]);
assert.notEqual(
  referenceCollision.status === "ready"
    ? referenceCollision.packet.evidence.find(
        (item) => item.reference === "John 1:18",
      )?.text
    : "",
  referenceCollision.status === "ready"
    ? referenceCollision.packet.evidence.find(
        (item) => item.reference === "John 11:8",
      )?.text
    : "",
);

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

const disputedDoctrinePlan = plan({
  subject: "whether a later compound doctrine is explicitly stated by Scripture",
  intent: "relationship",
  analysisMode: "doctrinal-claim",
  proposition:
    "The one God exists as three distinct, coequal, coeternal persons who share one essence.",
  components: [
    { id: "one-god", proposition: "Scripture teaches one God.", category: "nature" },
    { id: "three-subjects", proposition: "Father, Son, and Holy Spirit are each present and distinguishable.", category: "identity" },
    { id: "one-essence", proposition: "The three share one essence or being.", category: "nature" },
    { id: "coequality", proposition: "The three are coequal and coeternal.", category: "authority" },
  ],
  passages: [
    { reference: "Deuteronomy 6:4", role: "foundation" },
    { reference: "Matthew 28:19", role: "direct" },
    { reference: "John 1:1", role: "later-witness" },
    { reference: "John 17:3", role: "contrast" },
    { reference: "1 Timothy 2:5", role: "qualifying" },
    { reference: "Psalms 110:1", role: "qualifying" },
  ],
});
const disputedDoctrine = buildEmetAiTopicEvidence({
  question: "What evidence in the Bible proves this compound doctrine?",
  retrievalPlan: disputedDoctrinePlan,
  requireSemanticPlan: true,
});
requireReferences(disputedDoctrine, [
  "Deuteronomy 6:4",
  "Matthew 28:19",
  "John 1:1",
  "John 17:3",
  "1 Timothy 2:5",
]);
if (disputedDoctrine.status === "ready") {
  assert.equal(disputedDoctrine.packet.reasoning.mode, "doctrinal-claim");
  assert.equal(disputedDoctrine.packet.reasoning.components.length, 4);
  assert.ok(
    disputedDoctrine.packet.evidence.some(
      (item) => item.provenance.retrieval?.role === "contrast",
    ),
  );
}

const doctrineConversation = buildEmetConversationContext([
  {
    question: "What evidence in the Bible proves the doctrine?",
    answer: "Earlier polished prose must not become evidence.",
    references: ["Deuteronomy 6:4", "Matthew 28:19", "John 17:3"],
    claims: [
      {
        text: "The cited commission names Father, Son, and Holy Spirit together.",
        support: "explicit-statement",
        references: ["Matthew 28:19"],
      },
      {
        text: "Joint naming does not by itself state one essence or coequality.",
        support: "does-not-establish",
        references: ["Matthew 28:19"],
      },
    ],
  },
  {
    question: "How does appointment as high priest fit coequality?",
    answer: "This answer prose is also excluded.",
    references: ["Psalms 110:1", "Hebrews 4:14", "Hebrews 5:5"],
    claims: [
      {
        text: "Messiah is described as high priest and as appointed.",
        support: "explicit-statement",
        references: ["Hebrews 4:14", "Hebrews 5:5"],
      },
    ],
  },
]);
const doctrineFollowUpPlan = plan({
  subject: "the compound doctrine after the prior textual distinctions",
  intent: "relationship",
  analysisMode: "doctrinal-claim",
  proposition: disputedDoctrinePlan.proposition,
  components: disputedDoctrinePlan.components,
  passages: [
    { reference: "Matthew 28:19", role: "direct" },
    { reference: "John 1:1", role: "later-witness" },
    { reference: "John 17:3", role: "contrast" },
    { reference: "1 Timothy 2:5", role: "qualifying" },
    { reference: "Psalms 110:1", role: "qualifying" },
    { reference: "Hebrews 4:14", role: "qualifying" },
    { reference: "Hebrews 5:5", role: "qualifying" },
  ],
});
assert.deepEqual(
  relevantEmetConversationClaimReferences(doctrineConversation).map(
    (item) => item.reference,
  ),
  ["Hebrews 4:14", "Hebrews 5:5", "Matthew 28:19"],
);
const doctrineFollowUp = buildEmetAiTopicEvidence({
  question: "So is the doctrine biblical?",
  conversation: doctrineConversation,
  retrievalPlan: doctrineFollowUpPlan,
  requireSemanticPlan: true,
});
requireReferences(doctrineFollowUp, [
  "Matthew 28:19",
  "John 17:3",
  "1 Timothy 2:5",
  "Psalms 110:1",
  "Hebrews 4:14",
  "Hebrews 5:5",
]);
if (doctrineFollowUp.status === "ready") {
  assert.match(doctrineFollowUp.packet.question, /Earlier structured claim to re-check/);
  assert.match(doctrineFollowUp.packet.question, /high priest and as appointed/);
  assert.doesNotMatch(doctrineFollowUp.packet.question, /polished prose/);
}

const oneSidedDoctrinePlan = structuredClone(disputedDoctrinePlan);
oneSidedDoctrinePlan.passages = oneSidedDoctrinePlan.passages.filter(
  (passage) => !["qualifying", "contrast"].includes(passage.role),
);
const oneSidedDoctrine = buildEmetAiTopicEvidence({
  question: "Prove the doctrine.",
  retrievalPlan: oneSidedDoctrinePlan,
  requireSemanticPlan: true,
});
assert.equal(oneSidedDoctrine.status, "ready");
if (oneSidedDoctrine.status === "ready") {
  assert.ok(
    oneSidedDoctrine.packet.evidence.every(
      (item) => !["qualifying", "contrast"].includes(
        item.provenance.retrieval?.role || "",
      ),
    ),
  );
}

const discourseContextPlan = plan({
  subject: "the dispute and decision recorded in Acts 15",
  intent: "application",
  analysisMode: "doctrinal-claim",
  proposition:
    "Acts 15 must be read from the initiating salvation-and-circumcision claim through the council's reasoning and conclusion.",
  components: [
    {
      id: "dispute",
      proposition: "The dispute begins with a claim connecting circumcision to salvation.",
      category: "event",
    },
    {
      id: "decision",
      proposition: "The council answers that dispute in its stated decision.",
      category: "application",
    },
  ],
  passages: [
    { reference: "Acts 15:1", role: "context" },
    { reference: "Acts 15:5", role: "context" },
    { reference: "Acts 15:10", role: "context" },
    { reference: "Acts 15:19", role: "context" },
    { reference: "Acts 15:20", role: "context" },
    { reference: "Acts 15:21", role: "context" },
  ],
});
const discourseContext = buildEmetAiTopicEvidence({
  question: "What issue is the conversation in Acts 15 deciding?",
  retrievalPlan: discourseContextPlan,
  requireSemanticPlan: true,
});
requireReferences(discourseContext, [
  "Acts 15:1",
  "Acts 15:5",
  "Acts 15:10",
  "Acts 15:19",
  "Acts 15:20",
  "Acts 15:21",
]);

const covenantConversation = buildEmetConversationContext([
  {
    question: "Who is the new covenant made with?",
    answer: "Earlier answer prose is not evidence.",
    references: ["Jeremiah 31:31"],
    claims: [{
      id: "new-covenant-parties",
      text: "Jeremiah names the house of Israel and the house of Judah as the new-covenant parties.",
      support: "explicit-statement",
      category: "covenant-participants",
      polarity: "affirms",
      scope: "the parties named in Jeremiah's new-covenant promise",
      timing: "promised",
      references: ["Jeremiah 31:31"],
    }],
  },
  {
    question: "What does Yahweh write on their hearts?",
    answer: "This prose is also excluded.",
    references: ["Jeremiah 31:33", "Hebrews 8:10"],
    claims: [{
      id: "torah-written-within",
      text: "Yahweh puts His law within the new-covenant participants and writes it on their hearts.",
      support: "explicit-statement",
      category: "command",
      polarity: "affirms",
      scope: "Yahweh's law within the new-covenant participants",
      timing: "promised",
      references: ["Jeremiah 31:33", "Hebrews 8:10"],
    }],
  },
]);
const covenantPlan = plan({
  subject: "the relationship between first-covenant obsolescence and Yahweh's Torah",
  intent: "continuity",
  analysisMode: "apparent-contradiction",
  proposition: "Hebrews' statement that the first covenant becomes obsolete must be reconciled with the quoted promise that Yahweh writes His law within the new-covenant participants.",
  requiresScopeAnalysis: true,
  requiresTimeline: true,
  components: [
    { id: "covenant", proposition: "The first covenant becomes obsolete.", category: "covenant" },
    { id: "torah", proposition: "Yahweh writes His law within the new-covenant participants.", category: "command" },
    { id: "priesthood", proposition: "Hebrews describes a scoped priesthood-related legal change.", category: "priesthood" },
    { id: "timing", proposition: "Hebrews preserves becoming-old and near-disappearance timing.", category: "timing" },
  ],
  passages: [
    { reference: "Jeremiah 31:31", role: "foundation" },
    { reference: "Jeremiah 31:33", role: "direct" },
    { reference: "Hebrews 8:10", role: "later-witness" },
    { reference: "Hebrews 8:13", role: "qualifying" },
    { reference: "Hebrews 7:12", role: "qualifying" },
    { reference: "Hebrews 7:18", role: "qualifying" },
    { reference: "Hebrews 7:28", role: "context" },
    { reference: "Hebrews 9:15", role: "later-witness" },
    { reference: "Hebrews 10:10", role: "later-witness" },
  ],
});
const covenantEvidence = buildEmetAiTopicEvidence({
  question: "Does Hebrews say Yahweh's Torah is abolished?",
  conversation: covenantConversation,
  retrievalPlan: covenantPlan,
  requireSemanticPlan: true,
});
requireReferences(covenantEvidence, [
  "Jeremiah 31:31",
  "Jeremiah 31:33",
  "Hebrews 8:10",
  "Hebrews 8:13",
  "Hebrews 7:12",
]);
if (covenantEvidence.status === "ready") {
  assert.equal(covenantEvidence.packet.reasoning.requiresScopeAnalysis, true);
  assert.equal(covenantEvidence.packet.reasoning.requiresTimeline, true);
  assert.deepEqual(
    covenantEvidence.packet.reasoning.establishedPropositions.map(
      (item) => item.id,
    ).sort(),
    ["new-covenant-parties", "torah-written-within"],
  );
  assert.doesNotMatch(covenantEvidence.packet.question, /This prose is also excluded/);
}

const longCovenantStudy = buildEmetConversationContext(
  Array.from({ length: 13 }, (_, index) => ({
    question: `Covenant study turn ${index + 1}`,
    answer: `Untrusted prose ${index + 1}`,
    references: [index % 2 ? "Hebrews 8:10" : "Jeremiah 31:33"],
    claims: [{
      id: `covenant-proposition-${index + 1}`,
      text: `Established covenant proposition ${index + 1}`,
      support: "explicit-statement",
      category: index % 2 ? "covenant" : "command",
      polarity: "affirms",
      scope: `covenant component ${index + 1}`,
      timing: index % 2 ? "presently-operating" : "promised",
      references: [index % 2 ? "Hebrews 8:10" : "Jeremiah 31:33"],
    }],
  })),
);
assert.equal(longCovenantStudy.recentExchanges.length, 8);
assert.equal(longCovenantStudy.summary.establishedClaims.length, 5);
assert.equal(
  longCovenantStudy.summary.establishedClaims[0].id,
  "covenant-proposition-1",
);
const ledgerClaims = parseEmetConversationClaims(
  Array.from({ length: 40 }, (_, index) => ({
    id: `ledger-proposition-${index + 1}`,
    text: `Ledger proposition ${index + 1}`,
    support: "explicit-statement",
    category: "covenant",
    polarity: "affirms",
    scope: `ledger scope ${index + 1}`,
    timing: "presently-operating",
    references: ["Jeremiah 31:33"],
  })),
);
assert.equal(ledgerClaims?.length, 40);

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
  analysisMode: "simple",
  proposition: "An invalid reference resolves.",
  requiresScopeAnalysis: false,
  requiresTimeline: false,
  components: [],
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

const claimOnlyConversation = {
  recentExchanges: [],
  summary: {
    topics: [],
    passages: [],
    corrections: [],
    earlierQuestions: [],
    establishedClaims: [
      {
        text: "The Messiah remains high priest.",
        support: "explicit-statement",
        references: ["Hebrews 7:24"],
      },
    ],
  },
};
assert.equal(
  relevantEmetConversation({
    question: "How does the high priest claim affect that?",
    conversation: claimOnlyConversation,
  }),
  claimOnlyConversation,
);

for (const [question, expectedReferences] of [
  [
    "Did Messiah abolish the commandments?",
    ["Matthew 5:17", "Matthew 5:18", "Matthew 5:19"],
  ],
  [
    "Should believers keep Yahweh's commandments?",
    ["Revelation 14:12", "Matthew 19:17"],
  ],
]) {
  assert.equal(isEmetAiDeterministicFastPathEligible({ question }), true);
  const direct = buildEmetAiTopicEvidence({
    question,
    deterministicFastPath: true,
  });
  assert.equal(direct.status, "ready", question);
  requireReferences(direct, expectedReferences);
  if (direct.status === "ready") {
    assert.equal(direct.packet.reasoning.mode, "simple");
    assert.equal(direct.packet.responseDesign?.depth, "concise");
    assert.ok(direct.packet.evidence.length <= 4);
  }
}

for (const question of [
  "What does this passage mean?",
  "Is Messiah the same being as Yahweh?",
  "Compare the strongest evidence for and against seventh-day Sabbath observance.",
  "Examine the Hebrew and Greek words for righteousness.",
  "Romans 3:10 mentions righteousness; how does that relate to Genesis 6:9?",
]) {
  assert.equal(isEmetAiDeterministicFastPathEligible({ question }), false, question);
}

const ambiguousDefinition = buildEmetAiTopicEvidence({
  question: "What is sin?",
  deterministicFastPath: true,
});
assert.equal(ambiguousDefinition.status, "insufficient-evidence");

console.log("EMET semantic topic evidence verification passed.");
console.log("- Model-planned references are validated against locked Scripture.");
console.log("- Exact Hebrew source sequences connect Genesis 6 with the matching Job passages.");
console.log("- Event and canonical-witness questions retain Jude and 2 Peter instead of word noise.");
console.log("- Known false-positive passages are explicitly excluded.");
console.log("- Reader context disambiguates passage questions without contaminating independent topics.");
console.log("- Conversation retains questions and verified references, never earlier answer prose as evidence.");
console.log("- Disputed doctrines retain defined propositions and decomposed claims without forced countertexts.");
console.log("- Argumentative passages retain their verified dispute, reasoning, decision, and conclusion context.");
console.log("- Follow-ups retain structured textual findings without treating prior prose as evidence.");
console.log("- Unresolved plans and unsupported topics fail closed.");
console.log("- High-confidence direct questions use locked deterministic evidence; ambiguous and deep questions retain semantic planning.");
