import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  EMET_AI_ANSWER_SCHEMA,
  EMET_AI_EVIDENCE_SCHEMA,
  insufficientEmetAiAnswer,
  validateEmetAiAnswer,
  validateEmetAiEvidencePacket,
} from "../app/lib/emet/EmetAiContract.ts";
import { buildEmetAiWordEvidence } from "../app/lib/emet/EmetAiEvidenceBuilder.ts";
import {
  createMemoryEmetAiAnswerStore,
  getEmetAiCacheKey,
  getEmetAiRequestCacheKey,
} from "../app/lib/emet/EmetAiCache.ts";
import { buildEmetConversationContext } from "../app/lib/emet/EmetAiConversation.ts";
import { answerFromEmetAiEvidence } from "../app/lib/emet/EmetAiService.ts";

const packet = {
  schemaVersion: EMET_AI_EVIDENCE_SCHEMA,
  question: "What does this word mean?",
  reasoning: {
    mode: "simple",
    proposition: "What does this word mean?",
    requiresScopeAnalysis: false,
    requiresTimeline: false,
    components: [],
    establishedPropositions: [],
  },
  scope: {
    type: "word",
    references: ["Genesis 1:8"],
    entityIds: ["word:hebrew:H7549"],
  },
  identity: {
    gate: "verified",
    canonicalEntityId: "word:hebrew:H7549",
    corpus: "hebrew",
    lexicalId: "H7549",
    lemma: "רָקִיעַ",
  },
  evidence: [
    {
      id: "lexical:word:hebrew:H7549",
      kind: "lexical",
      corpus: "hebrew",
      text: "An expanse or visible sky.",
      entityId: "word:hebrew:H7549",
      lexicalId: "H7549",
      provenance: {
        authority: "canonical-word-study-runtime",
      },
    },
    {
      id: "scripture:Genesis.1.8",
      kind: "scripture",
      corpus: "translation",
      text: "God called the expanse sky.",
      reference: "Genesis 1:8",
      provenance: {
        authority: "locked-scripture-runtime",
        sourceId: "Genesis.1.8",
      },
    },
  ],
  provenance: {
    evidenceVersion: "test",
    builtAt: "2026-10-01T00:00:00.000Z",
  },
};

const validAnswer = {
  schemaVersion: EMET_AI_ANSWER_SCHEMA,
  status: "complete",
  answer: "The word describes an expanse, identified here with the sky.",
  conclusionSupport: "explicit-statement",
  componentChecks: [],
  claims: [
    {
      id: "word-means-expanse",
      text: "The word describes an expanse.",
      support: "explicit-statement",
      category: "other",
      polarity: "affirms",
      scope: "the selected Hebrew lexical entity",
      timing: "not-applicable",
      evidenceIds: ["lexical:word:hebrew:H7549"],
    },
    {
      id: "expanse-called-sky",
      text: "Genesis 1:8 identifies the expanse with the sky.",
      support: "explicit-statement",
      category: "event",
      polarity: "affirms",
      scope: "Genesis 1:8",
      timing: "not-applicable",
      evidenceIds: ["scripture:Genesis.1.8"],
    },
  ],
  continuityChecks: [],
  citations: [
    { evidenceId: "lexical:word:hebrew:H7549" },
    {
      evidenceId: "scripture:Genesis.1.8",
      reference: "Genesis 1:8",
    },
  ],
  limitations: [],
};

assert.equal(validateEmetAiEvidencePacket(packet).ok, true);
assert.equal(validateEmetAiAnswer(packet, validAnswer).ok, true);

const fabricatedCitation = structuredClone(validAnswer);
fabricatedCitation.citations.push({
  evidenceId: "scripture:Revelation.22.21",
  reference: "Revelation 22:21",
});
assert.equal(validateEmetAiAnswer(packet, fabricatedCitation).ok, false);

const unsupportedClaim = structuredClone(validAnswer);
unsupportedClaim.claims[0].evidenceIds = [];
assert.equal(validateEmetAiAnswer(packet, unsupportedClaim).ok, false);

const ambiguousPacket = structuredClone(packet);
ambiguousPacket.identity.gate = "ambiguous";
assert.equal(validateEmetAiEvidencePacket(ambiguousPacket).ok, false);
assert.equal(validateEmetAiAnswer(ambiguousPacket, validAnswer).ok, false);

const closedAnswer = insufficientEmetAiAnswer(
  "Gloss unavailable.",
  ["The source occurrence has no unique verified lexical identity."],
);
assert.equal(closedAnswer.status, "insufficient-evidence");

function wordStudyFixture({
  corpus = "hebrew",
  lexicalId = "H7549",
  entityId = `word:${corpus}:${lexicalId}`,
} = {}) {
  return {
    resolved: true,
    resolutionType: "verse-context",
    preferredSource: corpus,
    query: "selected word",
    entity: {
      id: entityId,
      type: "word",
      title: "selected word",
      alignment: {
        source: corpus,
        entityId,
        lexicalId,
        lemma: "רָקִיעַ",
        morph: "HNcmsa",
        lexicalResolution: {
          status: "resolved",
          sourceOccurrenceId: "wlc:Gen:1:8:3",
          authority: "canonical-source-occurrence-index",
          method: "exact-lexical-occurrence",
          corpus,
          lexicalId,
          entityId,
        },
      },
      emet: {
        status: "complete",
        explanation: "This word describes the expanse named sky in the passage.",
        citations: ["Genesis 1:8"],
        explanationChecksum: "explanation-checksum",
        packetChecksum: "packet-checksum",
      },
      see: {
        evidenceId: `p03:${entityId}`,
        countId: `${corpus}:${lexicalId}`,
        occurrenceCount: 15,
        relationshipCount: 0,
        eventCount: 0,
        themeCount: 1,
      },
      seeKnowledge: {
        available: true,
        relationshipCount: 0,
        eventCount: 0,
        themeCount: 1,
        totalReferenceCount: 1,
        relationships: [],
        events: [],
        themes: [
          {
            reference: {
              reference: "Genesis 1:8",
              book: "Genesis",
              chapter: 1,
              verse: 8,
              source: corpus,
              routeTranslation: corpus === "lxx" ? "brenton" : "web",
            },
            label: "The expanse is named sky",
            details: "The passage supplies the association.",
          },
        ],
      },
      entityEvidence: {
        lexical: {
          lemma: "רָקִיעַ",
          lexicalId,
          transliteration: "raqia",
          partsOfSpeech: ["noun"],
          glosses: ["expanse"],
          shortDefinitions: ["an expanse"],
        },
        renderings: {
          mostCommon: [
            { text: "expanse", count: 9, translation: "web" },
          ],
        },
        chronology: {},
        representativeReferences: [
          {
            reference: "Genesis 1:8",
            book: "Genesis",
            chapter: 1,
            verse: 8,
            source: corpus,
            routeTranslation: corpus === "lxx" ? "brenton" : "web",
          },
        ],
      },
      keyReferences: [],
      simple: {
        inThisVerse: "",
        whyItMatters: "",
        summary: "",
      },
      evidence: {
        keyReferences: [],
        related: { people: [], places: [], concepts: [], events: [] },
        occurrences: [],
      },
    },
  };
}

const builtWordEvidence = await buildEmetAiWordEvidence({
  question: "What does this word mean in Scripture?",
  wordStudy: wordStudyFixture(),
  loadVerse: async (reference) => ({
    reference: reference.reference,
    text: "God called the expanse sky.",
    translation: reference.routeTranslation,
    sourceId: "genesis-1-8",
  }),
  builtAt: "2026-10-01T00:00:00.000Z",
});

assert.equal(builtWordEvidence.status, "ready");
assert.equal(builtWordEvidence.packet.identity.canonicalEntityId, "word:hebrew:H7549");
assert.ok(
  builtWordEvidence.packet.evidence.some((item) => item.kind === "scripture"),
);
assert.ok(
  builtWordEvidence.packet.evidence.some((item) => item.kind === "lexical"),
);

for (const fixture of [
  { corpus: "hebrew", lexicalId: "H7549" },
  { corpus: "lxx", lexicalId: "L709768" },
  { corpus: "greek-nt", lexicalId: "G3735" },
]) {
  const result = await buildEmetAiWordEvidence({
    question: "What does this word mean?",
    wordStudy: wordStudyFixture(fixture),
    loadVerse: async () => null,
    builtAt: "2026-10-01T00:00:00.000Z",
  });
  assert.equal(result.status, "ready");
  assert.equal(
    result.packet.identity.canonicalEntityId,
    `word:${fixture.corpus}:${fixture.lexicalId}`,
  );
}

const mismatchedIdentity = wordStudyFixture();
mismatchedIdentity.entity.alignment.entityId = "word:hebrew:H9999";
const mismatchedResult = await buildEmetAiWordEvidence({
  question: "What does this word mean?",
  wordStudy: mismatchedIdentity,
  loadVerse: async () => null,
});
assert.equal(mismatchedResult.status, "insufficient-evidence");
assert.equal(mismatchedResult.reason, "identity-mismatch");

const unverifiedOccurrence = wordStudyFixture();
delete unverifiedOccurrence.entity.alignment.lexicalResolution;
const unverifiedResult = await buildEmetAiWordEvidence({
  question: "What does this word mean?",
  wordStudy: unverifiedOccurrence,
  loadVerse: async () => null,
});
assert.equal(unverifiedResult.status, "insufficient-evidence");
assert.equal(unverifiedResult.reason, "unverified-occurrence");

const readyPacket = builtWordEvidence.packet;
const equivalentQuestionPacket = structuredClone(readyPacket);
equivalentQuestionPacket.question = "  WHAT does this word mean in Scripture?  ";
equivalentQuestionPacket.provenance.builtAt = "2099-01-01T00:00:00.000Z";
assert.equal(
  getEmetAiCacheKey(readyPacket),
  getEmetAiCacheKey(equivalentQuestionPacket),
);

const differentIdentityPacket = structuredClone(readyPacket);
differentIdentityPacket.identity.canonicalEntityId = "word:hebrew:H9999";
differentIdentityPacket.identity.lexicalId = "H9999";
differentIdentityPacket.scope.entityIds = ["word:hebrew:H9999"];
assert.notEqual(
  getEmetAiCacheKey(readyPacket),
  getEmetAiCacheKey(differentIdentityPacket),
);

const requestConversation = buildEmetConversationContext([
  {
    question: "Who are the sons of God in Genesis 6?",
    answer: "First answer wording.",
    references: ["Genesis 6:2", "Job 1:6"],
    claims: [
      {
        text: "Genesis and Job use the same source phrase.",
        support: "explicit-statement",
        references: ["Genesis 6:2", "Job 1:6"],
      },
    ],
  },
]);
const equivalentRequestConversation = buildEmetConversationContext([
  {
    question: "Who are the sons of God in Genesis 6?",
    answer: "Different answer wording must not change retrieval identity.",
    references: ["Genesis 6:2", "Job 1:6"],
    claims: [
      {
        text: "Genesis and Job use the same source phrase.",
        support: "explicit-statement",
        references: ["Genesis 6:2", "Job 1:6"],
      },
    ],
  },
]);
const failedRequestConversation = buildEmetConversationContext([
  {
    question: "Who are the sons of God in Genesis 6?",
    answer: "EMET temporarily couldn't complete a verified answer.",
    outcome: "failed",
    references: [],
    claims: [],
  },
]);
const requestKey = getEmetAiRequestCacheKey({
  question: "Were they angels?",
  conversation: requestConversation,
  context: null,
});
assert.equal(
  requestKey,
  getEmetAiRequestCacheKey({
    question: "  WERE they angels? ",
    conversation: equivalentRequestConversation,
    context: null,
  }),
);
assert.notEqual(
  requestKey,
  getEmetAiRequestCacheKey({
    question: "Were they angels?",
    conversation: failedRequestConversation,
    context: null,
  }),
);
assert.notEqual(
  requestKey,
  getEmetAiRequestCacheKey({
    question: "Were they angels?",
    conversation: requestConversation,
    context: {
      book: "Genesis",
      chapter: 6,
      verse: 2,
      translation: "web",
    },
  }),
);

const validGeneratedAnswer = {
  schemaVersion: EMET_AI_ANSWER_SCHEMA,
  status: "complete",
  answer: "The source evidence identifies this word with an expanse.",
  conclusionSupport: "explicit-statement",
  componentChecks: [],
  claims: [
    {
      id: "lexical-expanse",
      text: "The lexical evidence identifies an expanse.",
      support: "explicit-statement",
      category: "other",
      polarity: "affirms",
      scope: "the selected Hebrew lexical entity",
      timing: "not-applicable",
      evidenceIds: ["lexical:word:hebrew:H7549"],
    },
  ],
  continuityChecks: [],
  citations: [{ evidenceId: "lexical:word:hebrew:H7549", reference: "" }],
  limitations: [],
};
const answerStore = createMemoryEmetAiAnswerStore();
let providerCalls = 0;
const provider = {
  model: "test-model",
  async generate() {
    providerCalls += 1;
    return validGeneratedAnswer;
  },
};
const firstGenerated = await answerFromEmetAiEvidence({
  packet: readyPacket,
  store: answerStore,
  provider,
  allowLive: true,
  generatedAt: "2026-10-01T00:00:00.000Z",
});
const reusedAnswer = await answerFromEmetAiEvidence({
  packet: equivalentQuestionPacket,
  store: answerStore,
  provider,
  allowLive: true,
});
assert.equal(firstGenerated.source, "model");
assert.equal(reusedAnswer.source, "cache");
assert.equal(providerCalls, 1);

const fabricatedProviderResult = await answerFromEmetAiEvidence({
  packet: readyPacket,
  store: createMemoryEmetAiAnswerStore(),
  provider: {
    model: "test-model",
    async generate() {
      const fabricated = structuredClone(validGeneratedAnswer);
      fabricated.claims[0].evidenceIds = ["scripture:invented"];
      fabricated.citations = [
        { evidenceId: "scripture:invented", reference: "Invented 1:1" },
      ];
      return fabricated;
    },
  },
  allowLive: true,
});
assert.equal(fabricatedProviderResult.source, "fail-closed");
assert.equal(fabricatedProviderResult.answer.status, "insufficient-evidence");

const doctrinalPacket = structuredClone(packet);
doctrinalPacket.scope.type = "topic";
doctrinalPacket.scope.entityIds = [];
doctrinalPacket.identity = { gate: "not-applicable" };
doctrinalPacket.reasoning = {
  mode: "doctrinal-claim",
  proposition: "A compound theological proposition",
  requiresScopeAnalysis: true,
  requiresTimeline: false,
  components: [
    { id: "identity", proposition: "The subjects are identical.", category: "identity" },
    { id: "nature", proposition: "The subjects share one nature.", category: "nature" },
  ],
  establishedPropositions: [],
};
doctrinalPacket.evidence = doctrinalPacket.evidence.map((item, index) => ({
  ...item,
  entityId: undefined,
  lexicalId: undefined,
  provenance: {
    ...item.provenance,
    retrieval: {
      method: "semantic-plan",
      role: index === 0 ? "direct" : "qualifying",
      reason: index === 0 ? "Proposed support." : "Material textual qualification.",
      score: 95,
    },
  },
}));
const calibratedDoctrinalAnswer = {
  schemaVersion: EMET_AI_ANSWER_SCHEMA,
  status: "complete",
  answer: "The passages are related, but that relationship does not by itself state the full compound proposition. The complete claim requires a theological synthesis.",
  conclusionSupport: "does-not-establish",
  componentChecks: [
    {
      componentId: "identity",
      support: "does-not-establish",
      explanation: "Related wording does not state that the subjects are identical.",
      evidenceIds: ["scripture:Genesis.1.8"],
    },
    {
      componentId: "nature",
      support: "theological-synthesis",
      explanation: "A shared nature would require synthesis beyond an individual text.",
      evidenceIds: ["lexical:word:hebrew:H7549", "scripture:Genesis.1.8"],
    },
  ],
  claims: [
    {
      id: "related-subjects",
      text: "The passages address related subjects.",
      support: "explicit-statement",
      category: "relationship",
      polarity: "affirms",
      scope: "the subjects named by the passages",
      timing: "not-applicable",
      evidenceIds: ["scripture:Genesis.1.8"],
    },
    {
      id: "relationship-not-compound-proof",
      text: "The related wording does not by itself establish the compound proposition.",
      support: "does-not-establish",
      category: "relationship",
      polarity: "qualifies",
      scope: "the full compound proposition",
      timing: "not-applicable",
      evidenceIds: ["scripture:Genesis.1.8"],
    },
    {
      id: "compound-needs-synthesis",
      text: "The complete proposition requires combining claims beyond an individual text.",
      support: "theological-synthesis",
      category: "nature",
      polarity: "qualifies",
      scope: "the full compound proposition",
      timing: "not-applicable",
      evidenceIds: ["lexical:word:hebrew:H7549", "scripture:Genesis.1.8"],
    },
  ],
  continuityChecks: [],
  citations: validAnswer.citations,
  limitations: [],
};
assert.equal(
  validateEmetAiAnswer(doctrinalPacket, calibratedDoctrinalAnswer).ok,
  true,
);
const overstatedDoctrinalAnswer = structuredClone(calibratedDoctrinalAnswer);
overstatedDoctrinalAnswer.answer = "Yes. These passages prove the full doctrine.";
overstatedDoctrinalAnswer.conclusionSupport = "theological-synthesis";
overstatedDoctrinalAnswer.claims = overstatedDoctrinalAnswer.claims.filter(
  (claim) => claim.support !== "explicit-statement",
);
assert.equal(
  validateEmetAiAnswer(doctrinalPacket, overstatedDoctrinalAnswer).ok,
  false,
);
const skippedComponent = structuredClone(calibratedDoctrinalAnswer);
skippedComponent.componentChecks.pop();
assert.equal(validateEmetAiAnswer(doctrinalPacket, skippedComponent).ok, false);
const overrankedCompound = structuredClone(calibratedDoctrinalAnswer);
overrankedCompound.conclusionSupport = "theological-synthesis";
assert.equal(validateEmetAiAnswer(doctrinalPacket, overrankedCompound).ok, false);
const leakedInternalProcess = structuredClone(calibratedDoctrinalAnswer);
leakedInternalProcess.answer = "The draft's conclusion needs to be narrowed.";
assert.equal(
  validateEmetAiAnswer(doctrinalPacket, leakedInternalProcess).ok,
  false,
);
const leakedEvidenceSelection = structuredClone(calibratedDoctrinalAnswer);
leakedEvidenceSelection.answer =
  "The supplied passages support part of the conclusion, but this Scripture set is incomplete.";
assert.equal(
  validateEmetAiAnswer(doctrinalPacket, leakedEvidenceSelection).ok,
  false,
);
const omissionAsRepeal = structuredClone(calibratedDoctrinalAnswer);
omissionAsRepeal.answer =
  "The later passages do not directly establish that new covenant believers remain obligated to keep the law as a binding covenant code.";
const continuityDoctrinalPacket = structuredClone(doctrinalPacket);
continuityDoctrinalPacket.evidence[0].provenance.retrieval.method =
  "governing-scripture";
continuityDoctrinalPacket.reasoning.components[0].category = "command";
assert.equal(
  validateEmetAiAnswer(continuityDoctrinalPacket, omissionAsRepeal).ok,
  false,
);
const nonRestatementAsRepeal = structuredClone(calibratedDoctrinalAnswer);
nonRestatementAsRepeal.answer =
  "The New Testament does not directly state that all new covenant believers are obligated to keep the seventh-day Sabbath.";
assert.equal(
  validateEmetAiAnswer(continuityDoctrinalPacket, nonRestatementAsRepeal).ok,
  false,
);
const selectiveListAsRepeal = structuredClone(calibratedDoctrinalAnswer);
selectiveListAsRepeal.answer =
  "Acts 15 places no Sabbath burden on Gentile believers, so it is not binding.";
assert.equal(
  validateEmetAiAnswer(continuityDoctrinalPacket, selectiveListAsRepeal).ok,
  false,
);
const oneSidedDoctrinalPacket = structuredClone(doctrinalPacket);
for (const item of oneSidedDoctrinalPacket.evidence) {
  item.provenance.retrieval.role = "direct";
}
assert.equal(
  validateEmetAiAnswer(oneSidedDoctrinalPacket, calibratedDoctrinalAnswer).ok,
  true,
);

const consistencyPacket = structuredClone(doctrinalPacket);
consistencyPacket.reasoning.establishedPropositions = [
  {
    id: "explicit-baseline",
    text: "The explicit baseline remains established.",
    support: "explicit-statement",
    category: "covenant",
    polarity: "affirms",
    scope: "the same covenant proposition",
    timing: "presently-operating",
    evidenceIds: ["scripture:Genesis.1.8"],
  },
];
const preservedAnswer = structuredClone(calibratedDoctrinalAnswer);
preservedAnswer.continuityChecks = [
  {
    propositionId: "explicit-baseline",
    verdict: "preserved",
    explanation: "The current answer retains the explicit baseline.",
    evidenceIds: ["scripture:Genesis.1.8"],
  },
];
assert.equal(validateEmetAiAnswer(consistencyPacket, preservedAnswer).ok, true);

const silentContradiction = structuredClone(preservedAnswer);
silentContradiction.claims.push({
  id: "opposite-inference",
  text: "An inference negates the explicit baseline.",
  support: "theological-synthesis",
  category: "covenant",
  polarity: "denies",
  scope: "the same covenant proposition",
  timing: "presently-operating",
  evidenceIds: ["scripture:Genesis.1.8"],
});
assert.equal(
  validateEmetAiAnswer(consistencyPacket, silentContradiction).ok,
  false,
);

const unresolvedConflict = structuredClone(preservedAnswer);
unresolvedConflict.continuityChecks[0].verdict = "unresolved-conflict";
assert.equal(
  validateEmetAiAnswer(consistencyPacket, unresolvedConflict).ok,
  false,
);

const instruction = fs.readFileSync(
  path.join(process.cwd(), "app", "lib", "emet", "EmetAiConstitution.ts"),
  "utf8",
);
for (const required of [
  "Scripture is the authority",
  "The Law and the Prophets establish the foundational scriptural context",
  "Read disputes, speeches, and sustained arguments as discourse",
  "do not manufacture contradictions",
  "Preserve explicit continuity and explicit change",
  "Hebrew, LXX Greek, and Greek New Testament identities remain distinct",
  "Conversation history and reader location clarify meaning but are never Scripture evidence",
  "Distinguish explicit statements, strong implications, theological synthesis",
  "Do not preemptively introduce objections",
  "return insufficient-evidence and state the limitation naturally",
  "Direct question:",
  "Original-language question:",
  "Comparative question:",
  "Substantive follow-up challenge:",
  "Complex investigation:",
]) {
  assert.ok(instruction.includes(required), `Missing instruction: ${required}`);
}

const providerSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "app",
    "lib",
    "emet",
    "providers",
    "EmetAiOpenAiProvider.ts",
  ),
  "utf8",
);
assert.doesNotMatch(providerSource, /adversarial supplement/i);
assert.doesNotMatch(providerSource, /minimumUniqueQualifyingReferences/);
assert.doesNotMatch(providerSource, /at least three high-value individual verses marked qualifying/i);
assert.match(providerSource, /Never manufacture an opposing channel/);
assert.match(providerSource, /only when the passage itself identifies the same command/);
assert.match(providerSource, /An explicit command with a stated duration/);
assert.match(
  providerSource,
  /Do not make the proposition harder than the reader's actual question/,
);
assert.doesNotMatch(providerSource, /isUnsolicitedContinuityQualifier/);
assert.match(providerSource, /Mandatory canonical continuity method/);
assert.match(providerSource, /initiating question or accusation/);
assert.match(providerSource, /gpt-5\.4-2026-03-05/);
assert.match(providerSource, /emet_ai_plan_and_answer/);
assert.match(providerSource, /pendingTopicAnswer/);
assert.match(providerSource, /Build a fresh answer using only the verified evidence packet/);
assert.match(providerSource, /Remove or qualify an unsupported secondary claim/);
assert.match(providerSource, /getLastFailure/);
assert.match(providerSource, /Conversation turn outcomes are product context/);
assert.doesNotMatch(providerSource, /independent final consistency auditor/);
assert.doesNotMatch(providerSource, /Complete the local discourse context/);

console.log("EMET AI foundation verification passed.");
console.log("- Scripture-first constitution is versioned.");
console.log("- Word questions require a verified canonical lexical identity.");
console.log("- Fabricated citations and unsupported claims fail validation.");
console.log("- Ambiguous source identities fail closed.");
console.log("- Reader and EMET evidence require the same occurrence-owned identity.");
console.log("- Hebrew, LXX, and Greek NT identities stay corpus-scoped.");
console.log("- Equivalent questions reuse only identity-and-evidence-bound answers.");
console.log("- Repeated conversational requests reuse a stable cache without trusting prior answer prose.");
console.log("- Invalid model citations fail closed before caching.");
console.log("- Doctrinal answers accept direct Scripture without manufactured countertext quotas.");
console.log("- Command continuity does not depend on modern-label restatement or selective-list omission.");
console.log("- Internal draft and packet language is rejected from reader-facing answers.");
console.log("- Categorical proof language fails closed when the full proposition is not explicit.");
console.log("- Structured prior claims affect continuity without trusting prior answer prose.");
console.log("- Reader-facing answers use natural prose without internal evidence jargon.");
