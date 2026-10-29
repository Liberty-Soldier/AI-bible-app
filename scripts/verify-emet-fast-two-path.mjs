import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  EMET_AI_FAST_DISCOVERY_INSTRUCTION,
  EMET_AI_FAST_DISCOVERY_SCHEMA,
  parseEmetAiFastDiscoveryDraft,
} from "../app/lib/emet/simple/EmetAiFastDiscovery.ts";
import {
  EMET_AI_SIMPLE_ANSWER_SCHEMA,
  EMET_AI_SIMPLE_GENERATION_SCHEMA,
  composeIdentityContractAnswer,
  hydrateEmetAiSimpleGenerationDraft,
  normalizeEmetAiSimpleReferences,
  parseEmetAiSimpleGenerationDraft,
  validateEmetAiSimpleAnswer,
  usesOmissionAsNonApplicability,
} from "../app/lib/emet/simple/EmetAiSimpleContract.ts";
import { answerWithFastTwoPathEmet } from "../app/lib/emet/simple/EmetAiFastTwoPathService.ts";
import { expandPlannedReferences } from "../app/lib/emet/EmetAiTopicEvidence.ts";
import {
  verifiedSourcePhraseAtReference,
  verifiedSourceTermSequenceAtReference,
  verifiedSourceTermsAtReference,
} from "../app/lib/emet/EmetAiSourcePhrase.ts";
import { retrieveLockedScriptureReferences } from "../app/lib/emet/simple/EmetAiFastScriptureRetrieval.ts";
import { retrieveFastScriptureEvidence } from "../app/lib/emet/simple/EmetAiFastScriptureRetrieval.ts";
import { assembleFastTwoPathEvidence } from "../app/lib/emet/simple/EmetAiFastEvidenceAssembler.ts";
import { buildEmetAiQuestionContract } from "../app/lib/emet/EmetAiQuestionContract.ts";
import {
  compactEvidenceForSimpleAnswer,
  EMET_AI_SIMPLE_SYSTEM_INSTRUCTION,
} from "../app/lib/emet/simple/EmetAiSimpleProvider.ts";
import { adaptFastEmetAnswer } from "../app/lib/emet/simple/EmetAiFastAnswerAdapter.ts";
import { validateEmetAiAnswer } from "../app/lib/emet/EmetAiContract.ts";
import { expectedEmetAiDirectAnswerPolarity } from "../app/lib/emet/EmetAiAnswerNormalization.ts";

// Ordinary questions receive positive Scripture-first reasoning rather than a
// mandatory controversy, repeal, or uncertainty hunt. These are prompt-policy
// checks only; live synthesis quality still requires a separately approved run.
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /Begin with what the supplied Scripture positively establishes/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /connected testimony rather than opposing theological systems/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /Do not independently introduce a contradiction, exception, or controversy/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /lack of a repeated New Testament command proves neither continuity nor repeal/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /Leave limitations empty unless a concrete, material limitation/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /support type records how the conclusion follows and does not itself make the answer qualified/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /broad identity questions, make the first independent clause state the direct textual identification/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /Keep relational statements distinct.*Father.*Son/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /Preserve the exact pair named in an identity comparison/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /personal identity.*name or title.*divine identity or nature.*relational roles/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /evidence that A is distinct from B does not establish.*C/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /preserve the grammatical target of every predicate/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /completed action, present transition, and future result must not be flattened/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /actual subject.*speaker.*audience.*action.*proposition/is);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /not contrary or qualifying evidence merely because it shares a topic word/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /counterpoint only when its own text materially bears on the same proposition/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /not faultless.*must not be silently rewritten as.*faulty/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /Every essential reasoning premise must correspond to a clause actually displayed/i);
assert.match(EMET_AI_FAST_DISCOVERY_INSTRUCTION, /Start with passages that positively and directly establish the subject/i);
assert.match(EMET_AI_FAST_DISCOVERY_INSTRUCTION, /Do not routinely search for counterexamples, repeal, exemptions, contradictions, or opposing positions/i);
assert.match(EMET_AI_FAST_DISCOVERY_INSTRUCTION, /do not characterize an omission as an exemption/i);
assert.match(EMET_AI_FAST_DISCOVERY_INSTRUCTION, /absence of one universal proof-text.*is not itself a limitation/i);
assert.match(EMET_AI_FAST_DISCOVERY_INSTRUCTION, /model-produced labels do not certify evidence completeness/i);
assert.match(EMET_AI_FAST_DISCOVERY_INSTRUCTION, /Use mode "verse-sequence"/i);
assert.doesNotMatch(EMET_AI_FAST_DISCOVERY_INSTRUCTION, /Use limitations for ordinary interpretive qualifications/i);

assert.equal(expectedEmetAiDirectAnswerPolarity(
  "Should Christians keep the Sabbath?",
  { claims: [
    { text: "Christians should keep the Sabbath." },
    { text: "No one should judge believers with respect to a Sabbath day." },
  ] },
), "yes", "a no-judgment predicate must not reverse the separate keep/observe predicate");
assert.equal(expectedEmetAiDirectAnswerPolarity(
  "Must someone who is not a priest perform priestly duties assigned to Aaron and his sons?",
  { claims: [{ text: "A non-priest should not perform the assigned priestly duties." }] },
), "no", "a genuine role restriction must still determine the asked perform predicate");

const broadIdentityRetrieval = retrieveFastScriptureEvidence({
  question: "What does Scripture establish about who the Messiah is?",
});
assert.ok(!broadIdentityRetrieval.diagnostics.queryTerms.includes("scripture"),
  "question-framing words must not contaminate Scripture retrieval");
assert.ok(broadIdentityRetrieval.passages.some((passage) => passage.reference === "Matthew 16:16"),
  "broad identity retrieval must retain a direct identification statement before descriptive breadth");

const phase2bIdentityQuestion = "Who is Yahweh, and is Yahshua the same person as Yahweh?";
const phase2bIdentityContract = buildEmetAiQuestionContract({ question: phase2bIdentityQuestion });
assert.deepEqual(phase2bIdentityContract.subquestions, [
  "Who is Yahweh",
  "is Yahshua the same person as Yahweh",
], "natural coordinated questions must preserve both requested propositions");
assert.ok(phase2bIdentityContract.biblicalEntities.includes("Yahweh"));
assert.ok(phase2bIdentityContract.biblicalEntities.includes("Messiah"),
  "Yahshua must resolve to the same question entity as Jesus and Yeshua");
const phase2bInitialIdentity = retrieveFastScriptureEvidence({ question: phase2bIdentityQuestion });
assert.ok(phase2bInitialIdentity.diagnostics.expandedTerms.includes("jesus"),
  "Yahshua must expand to the locked English corpus wording");
assert.ok(phase2bInitialIdentity.passages.some((passage) => passage.reference === "John 1:41"),
  "the initial candidates must no longer contain only Yahweh-side identity evidence");
assert.ok(phase2bInitialIdentity.passages.some((passage) => /^Exodus|^Nehemiah|^Psalms|^Genesis/.test(passage.reference)),
  "the earlier Yahweh foundation must remain present");
for (const [question, entity] of [
  ["Who is Yeshua?", "Messiah"],
  ["Who is Jesus?", "Messiah"],
  ["Who is YHWH?", "Yahweh"],
  ["Who is Elohim?", "God"],
  ["Who is Ruach HaKodesh?", "Holy Spirit"],
]) {
  assert.ok(buildEmetAiQuestionContract({ question }).biblicalEntities.includes(entity),
    `${question} must resolve the ${entity} alias family`);
}
assert.ok(!retrieveFastScriptureEvidence({ question: "Who is the Son of God?" }).diagnostics.expandedTerms.includes("father"),
  "a title occurrence of God must not be rewritten as Father");

const weeklySabbathRetrieval = retrieveFastScriptureEvidence({ question: "Should Christians keep the Sabbath?" });
assert.ok(!weeklySabbathRetrieval.passages.some((passage) =>
  ["Leviticus 23:32", "Leviticus 25:2", "Leviticus 25:4"].includes(passage.reference)
), "annual holy-day and land-year rests must not govern an unqualified weekly Sabbath question");
const annualRestRetrieval = retrieveFastScriptureEvidence({
  question: "What does Leviticus 23:32 command for the Day of Atonement?",
});
assert.ok(annualRestRetrieval.passages.some((passage) => passage.reference === "Leviticus 23:32"),
  "an explicitly requested annual observance must remain retrievable");
const landRestRetrieval = retrieveFastScriptureEvidence({
  question: "What is commanded for the land in the seventh year?",
});
assert.ok(landRestRetrieval.passages.some((passage) => passage.reference === "Leviticus 25:4"),
  "a land-year question must retain the command whose subject is the land");
assert.ok(!landRestRetrieval.passages.some((passage) =>
  ["Leviticus 23:3", "Exodus 31:15", "Exodus 35:2"].includes(passage.reference)
), "weekly seventh-day commands must not substitute for seventh-year land rest");


const scenarios = [
  {
    id: "creation", question: "Who created the heavens and the earth?", conclusion: "qualified",
    discovery: [], answerRefs: ["Genesis 1:1", "Isaiah 42:5"],
    answer: "Yahweh created the heavens and the earth; Scripture presents creation as his work.",
  },
  {
    id: "nt-direct", question: "According to 1 Corinthians 15:52, what happens at the last trumpet?", conclusion: "qualified",
    discovery: [], answerRefs: ["1 Corinthians 15:52"],
    answer: "At the last trumpet, the trumpet sounds, the dead are raised incorruptible, and the living are changed.",
  },
  {
    id: "ten-commandments", question: "What are the Ten Commandments?", conclusion: "qualified",
    discovery: [], answerRefs: ["Deuteronomy 5:6", "Deuteronomy 5:7", "Deuteronomy 5:11", "Deuteronomy 5:12", "Deuteronomy 5:16", "Deuteronomy 5:17", "Deuteronomy 5:18", "Deuteronomy 5:19", "Deuteronomy 5:20", "Deuteronomy 5:21"],
    answer: "The Ten Commandments are: 1. Have no other gods. 2. Do not make or worship idols. 3. Do not misuse Yahweh's name. 4. Keep the Sabbath. 5. Honor father and mother. 6. Do not murder. 7. Do not commit adultery. 8. Do not steal. 9. Do not bear false witness. 10. Do not covet.",
  },
  {
    id: "sabbath", question: "Should followers of Messiah keep the seventh-day Sabbath?", conclusion: "yes",
    discovery: [],
    answerRefs: ["Genesis 2:3", "Deuteronomy 5:12", "Romans 11:17", "Galatians 3:29", "Ephesians 2:12", "Matthew 19:17", "Hebrews 4:4", "Revelation 12:17", "Revelation 14:12", "Revelation 22:14"],
    answer: "Yes. Followers of Messiah should keep the seventh-day Sabbath: they are grafted in as fellow partakers; Messiah connects entering life with keeping the commandments, and Revelation describes the saints and those entering the city as commandment keepers.",  },
  {
    id: "pre-sinai", question: "Did Yahweh's commandments exist before the Sinai covenant?", conclusion: "yes",
    discovery: ["Genesis 4:3-7", "Genesis 7:2", "Genesis 26:5", "Exodus 16:23-29", "Exodus 19:5"],
    answerRefs: ["Genesis 4:7", "Genesis 7:2", "Genesis 26:5", "Exodus 16:23", "Exodus 19:5"],
    answer: "Yes. Before the Sinai covenant, Scripture records sin and acceptable offerings, clean and unclean animals, Abraham keeping Yahweh's commandments, and Sabbath instructions. Sinai then formally covenanted a body of instruction with Israel.",
  },
  {
    id: "ecclesiastes", question: "What does Ecclesiastes 12:13-14 teach about humanity's responsibility to keep Yahweh's commandments?", conclusion: "qualified",
    discovery: [], answerRefs: ["Ecclesiastes 12:13", "Ecclesiastes 12:14"],
    answer: "Ecclesiastes concludes that humanity is to fear God and keep his commandments because every work will come into judgment. The familiar English rendering “duty” is supplied translation language; the Hebrew wording itself describes this as the whole of humanity.",
  },
  {
    id: "priestly-duties", question: "Must someone who is not a priest perform priestly duties assigned to Aaron and his sons?", conclusion: "no",
    discovery: ["Exodus 28:1", "Numbers 3:10", "Numbers 18:7"],
    answerRefs: ["Exodus 28:1", "Numbers 3:10", "Numbers 18:7"],
    answer: "No. Scripture assigns those priestly duties to Aaron and his sons and forbids an unauthorized outsider from approaching. The commands remain authoritative without assigning priestly work to every person.",
  },
  {
    id: "genesis-6", question: "Who are the sons of God in Genesis 6?", conclusion: "qualified",
    discovery: ["Genesis 6:1-4", "Job 1:6", "Job 2:1", "Job 38:7"],
    answerRefs: ["Genesis 6:2", "Genesis 6:4", "Job 1:6", "Job 38:7"],
    answer: "Genesis calls them the sons of God but does not define the expression in that chapter. Job uses the same expression for heavenly beings, which supports that interpretation, though Genesis 6 should not be made to state more explicitly than its wording does.",
  },
  {
    id: "hebrew-one", question: "What Hebrew word is translated one in Deuteronomy 6:4, and what does it mean?", conclusion: "qualified",
    discovery: [], answerRefs: ["Deuteronomy 6:4"],
    answer: "The Hebrew word is אֶחָד (ʼechâd), the ordinary numeral one; in Deuteronomy 6:4 it declares that Yahweh is one.",
    lexicalAnalyses: [{ reference: "Deuteronomy 6:4", corpus: "hebrew", lexicalId: "H259", lemma: "אֶחָד", transliteration: "ʼechad", meaning: "one; united" }],
  },
  {
    id: "righteousness", question: "Romans 3:10 says none are righteous, yet Genesis 6:9 and Luke 1:6 describe righteous people. How do these passages agree?", conclusion: "qualified",
    discovery: ["Romans 3:9-12", "Romans 3:23-24", "Psalms 14:1-3", "Genesis 6:9", "Luke 1:6"],
    answerRefs: ["Romans 3:10", "Romans 3:23", "Psalms 14:3", "Genesis 6:9", "Luke 1:6"],
    answer: "The passages address different claims. Genesis and Luke describe faithful conduct as righteous, while Romans uses Psalm 14 in an argument that every class of humanity is under sin and needs God's justification. It is not claiming that Scripture can never describe a person's conduct as righteous.",
  },
  {
    id: "death", question: "What happens when we die?", conclusion: "qualified",
    discovery: ["Genesis 3:19", "Ecclesiastes 9:5-10", "Ecclesiastes 12:7", "Daniel 12:2", "1 Corinthians 15:51-52", "1 Thessalonians 4:15-17"],
    answerRefs: ["Genesis 3:19", "Ecclesiastes 9:5", "Ecclesiastes 12:7", "Daniel 12:2", "1 Corinthians 15:52"],
    answer: "Scripture describes the body returning to dust, the dead as no longer participating in life under the sun, and the dead awaiting resurrection. It places the resurrection of Messiah's people at his coming and the trumpet, rather than treating death itself as the completed hope.",
  },
  {
    id: "resurrection-follow-up", question: "When are they raised?", conclusion: "qualified",
    conversation: {
      recentExchanges: [{ question: "What happens when we die?", answer: "The dead await resurrection.", references: ["Daniel 12:2"], claims: [], outcome: "answered" }],
      summary: { topics: ["death", "resurrection"], passages: ["Daniel 12:2"], corrections: [], earlierQuestions: ["What happens when we die?"], establishedClaims: [] },
    },
    discovery: ["John 5:28–29", "John 6:39-40", "1 Corinthians 15:20-23", "1 Corinthians 15:51-52", "1 Thessalonians 4:15-17"],
    answerRefs: ["John 5:28-29", "John 6:40", "1 Corinthians 15:23", "1 Corinthians 15:52", "1 Thessalonians 4:16"],
    answer: "They are raised at the last day and at Messiah's coming, when the trumpet sounds and the dead are raised incorruptible.",
  },
  {
    id: "jeremiah-hebrews", question: "How does Jeremiah 31 connect to Hebrews 8?", conclusion: "qualified",
    discovery: [], answerRefs: ["Jeremiah 31:31", "Jeremiah 31:33", "Hebrews 8:7", "Hebrews 8:8", "Hebrews 8:10", "Hebrews 8:13"],
    answer: "Hebrews 8 quotes Jeremiah 31's promised new covenant with Israel and Judah, including Yahweh writing his laws on their hearts. Hebrews 8:7 says the first covenant was not faultless, Hebrews 8:8 introduces the promise while finding fault with the people, and Hebrews 8:13 says the former covenant has been made old and is becoming obsolete and near vanishing.",
  },
];

const byQuestion = new Map(scenarios.map((scenario) => [scenario.question, scenario]));
const calls = { discovery: 0, answer: 0 };

function withVerification(draft, packet) {
  const evidenceByReference = new Map(packet.evidence.filter((item) => item.kind === "scripture" && item.reference).map((item) => [item.reference, item]));
  const claimReferences = Array.from(new Set(draft.references.flatMap(expandPlannedReferences)));
  const publicCitationLimit = packet.responseDesign?.maxScriptureCitations || 8;
  const references = claimReferences.slice(0, publicCitationLimit);
  const support = draft.conclusion === "qualified" || draft.conclusion === "not-applicable"
    ? "theological-synthesis"
    : "strong-implication";
  const identityContract = packet.foundationalIdentityContract;
  const identityAuthorities = identityContract
    ? [
        ...identityContract.propositions,
        ...identityContract.interpretations.map((item) => ({ ...item, support: "theological-synthesis" })),
      ]
    : [];
  const requiredAuthorityIds = identityContract?.answerRequirements?.length
    ? identityContract.answerRequirements.map((item) => item.authorityId)
    : identityContract?.propositions
        .filter((item) => item.evidenceIds.some((id) => {
          const reference = packet.evidence.find((evidence) => evidence.id === id)?.reference;
          return reference ? claimReferences.includes(reference) : false;
        }))
        .map((item) => item.id) || [];
  const identityClaims = requiredAuthorityIds.flatMap((authorityId) => {
    const authority = identityAuthorities.find((item) => item.id === authorityId);
    if (!authority) return [];
    const authorityReferences = authority.evidenceIds.flatMap((id) => {
      const reference = packet.evidence.find((item) => item.id === id)?.reference;
      return reference ? [reference] : [];
    });
    return [{
      text: authority.text,
      support: authority.support,
      answerBearing: true,
      evidenceLevel: authority.evidenceLevel,
      contractInterpretationId: authority.id,
      references: authorityReferences,
      excerpts: authorityReferences.map((reference) => {
        const item = evidenceByReference.get(reference);
        return { reference, text: item.text, evidenceKind: "scripture", verbatim: true };
      }),
    }];
  });
  const fixtureClaims = identityContract ? identityClaims : [{
    text: draft.answer,
    support,
    answerBearing: true,
    evidenceLevel: "direct-scripture",
    contractInterpretationId: "none",
    references: claimReferences,
    excerpts: claimReferences.flatMap((reference) => {
      const item = evidenceByReference.get(reference);
      return item ? [{ reference, text: item.text, evidenceKind: "scripture", verbatim: true }] : [];
    }).concat((draft.lexicalAnalyses || []).flatMap((analysis) => {
      const item = packet.evidence.find((evidence) =>
        evidence.kind === "lexical" && evidence.reference === analysis.reference && evidence.corpus === analysis.corpus
      );
      return item ? [{ reference: analysis.reference, text: item.text, evidenceKind: "lexical", verbatim: true }] : [];
    })),
  }];
  const fixtureReferences = identityContract
    ? Array.from(new Set(identityClaims.flatMap((claim) => claim.references)))
    : references;
  const fixtureAnswer = identityContract
    ? composeIdentityContractAnswer({ status: draft.status, conclusion: draft.conclusion, claims: identityClaims })
    : draft.answer;
  return {
    ...draft,
    conclusionSupport: support,
    answer: fixtureAnswer,
    references: fixtureReferences,
    claims: fixtureClaims,
    componentChecks: packet.reasoning.components.map((component) => {
      const evidenceIds = packet.governingCoverage?.find((coverage) => coverage.componentId === component.id)?.evidenceIds || [];
      const componentReferences = evidenceIds.flatMap((id) => {
        const reference = packet.evidence.find((item) => item.id === id)?.reference;
        return reference ? [reference] : [];
      }).slice(0, 1);
      return {
        componentId: component.id,
        support: "strong-implication",
        explanation: `Fixture assessment for ${component.id}.`,
        references: componentReferences,
      };
    }),
  };
}

let phase2bCoveragePlan = null;
const phase2bRoutingResult = await answerWithFastTwoPathEmet({
  question: phase2bIdentityQuestion,
  discoveryProvider: {
    model: "fixture",
    async discover({ coveragePlan }) {
      phase2bCoveragePlan = coveragePlan;
      return {
        draft: null, rawOutput: "", latencyMs: 0, estimatedInputCharacters: 0,
        usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
      };
    },
  },
  answerProvider: {
    model: "unused",
    async generate() { throw new Error("Identity evidence discovery must run before generation."); },
  },
});
assert.equal(phase2bRoutingResult.path, "discovery");
assert.deepEqual(phase2bCoveragePlan, [
  "messiah-teaching",
  "apostolic-testimony",
  "prophetic-testimony",
], "the original multi-proposition identity question must require evidence for both subjects and their relationship");

const phase2bEvidenceResult = await answerWithFastTwoPathEmet({
  question: phase2bIdentityQuestion,
  discoveryProvider: {
    model: "fixture",
    async discover({ coveragePlan }) {
      return {
        draft: {
          schemaVersion: EMET_AI_FAST_DISCOVERY_SCHEMA,
          references: [
            { reference: "Isaiah 45:5", relevance: "Yahweh identifies himself and states his unique relation to God.", required: true, covers: ["prophetic-testimony"] },
            { reference: "John 8:58", relevance: "Jesus gives a direct identity-relevant statement.", required: true, covers: ["messiah-teaching"] },
            { reference: "John 20:28", relevance: "Thomas directly addresses Jesus with divine titles.", required: true, covers: ["apostolic-testimony"] },
          ],
          requiredCoverage: coveragePlan,
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
assert.ok(phase2bEvidenceResult.packet, phase2bEvidenceResult.validationErrors.join(" | "));
for (const reference of ["Isaiah 45:5", "John 8:58", "John 20:28"]) {
  assert.ok(phase2bEvidenceResult.packet.scope.references.includes(reference), `${reference} must reach identity generation`);
}
assert.match(
  phase2bEvidenceResult.packet.reasoning.components.find((item) => item.id === "prophetic-testimony").proposition,
  /Who is Yahweh/,
);
for (const id of ["messiah-teaching", "apostolic-testimony"]) {
  assert.match(
    phase2bEvidenceResult.packet.reasoning.components.find((item) => item.id === id).proposition,
    /is Yahshua the same person as Yahweh/,
  );
}

let jesusGodCoveragePlan = null;
await answerWithFastTwoPathEmet({
  question: "Is Jesus God?",
  discoveryProvider: {
    model: "fixture",
    async discover({ coveragePlan }) {
      jesusGodCoveragePlan = coveragePlan;
      return {
        draft: null, rawOutput: "", latencyMs: 0, estimatedInputCharacters: 0,
        usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
      };
    },
  },
  answerProvider: {
    model: "unused",
    async generate() { throw new Error("Identity evidence discovery must run before generation."); },
  },
});
assert.deepEqual(jesusGodCoveragePlan, [
  "apostolic-testimony",
  "prophetic-testimony",
], "Jesus/God must use direct identity evidence without mechanically requiring a separate self-identification category");

let jesusFatherCoveragePlan = null;
await answerWithFastTwoPathEmet({
  question: "Is Jesus the Father?",
  discoveryProvider: {
    model: "fixture",
    async discover({ coveragePlan }) {
      jesusFatherCoveragePlan = coveragePlan;
      return {
        draft: null, rawOutput: "", latencyMs: 0, estimatedInputCharacters: 0,
        usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
      };
    },
  },
  answerProvider: {
    model: "unused",
    async generate() { throw new Error("Identity evidence discovery must run before generation."); },
  },
});
assert.deepEqual(jesusFatherCoveragePlan, [
  "messiah-teaching",
  "apostolic-testimony",
], "Jesus/Father must stay focused on the stated relationship without manufacturing a broader identity survey");

let john173DiscoveryCalls = 0;
const john173Result = await answerWithFastTwoPathEmet({
  question: "Explain John 17:3",
  discoveryProvider: {
    model: "unused",
    async discover() { john173DiscoveryCalls += 1; throw new Error("Explicit passage explanation must remain focused."); },
  },
  answerProvider: {
    model: "fixture",
    async generate({ candidatePacket }) {
      return {
        draft: withVerification({
          schemaVersion: EMET_AI_SIMPLE_ANSWER_SCHEMA,
          status: "complete",
          conclusion: "qualified",
          answer: "Jesus says eternal life is knowing the Father as the only true God and knowing Jesus Christ as the one the Father sent.",
          references: ["John 17:3"], lexicalAnalyses: [], limitations: [],
        }, candidatePacket),
        rawOutput: "fixture", latencyMs: 0,
        usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
      };
    },
  },
});
assert.equal(john173DiscoveryCalls, 0);
assert.equal(john173Result.path, "direct");
assert.equal(john173Result.status, "complete", john173Result.validationErrors.join(" | "));

const discoveryProvider = {
  model: "fixture-gpt-5.4-mini",
  async discover({ question, conversation, candidates, coveragePlan = [] }) {
    calls.discovery += 1;
    const scenario = byQuestion.get(question);
    assert.ok(scenario, `Unknown fixture question: ${question}`);
    const requiredCoverage = scenario.id === "sabbath"
      ? ["foundation", "governing-instruction", "audience-scope", "messiah-teaching", "apostolic-testimony"]
      : scenario.id === "priestly-duties"
        ? ["governing-instruction", "audience-scope", "role-circumstance"]
        : [];
    const draft = {
      schemaVersion: EMET_AI_FAST_DISCOVERY_SCHEMA,
      references: scenario.discovery.map((reference) => ({
        reference,
        relevance: "Material governing Scripture for the requested issue.",
        required: true,
        covers: coveragePlan.length ? coveragePlan : requiredCoverage,
      })),
      requiredCoverage,
      lexicalLookups: [], limitations: scenario.discoveryLimitations || [], blockingIssues: [],
    };
    const inputCharacters = JSON.stringify({ question, conversation, candidates }).length + 1_150;
    const rawOutput = JSON.stringify(draft);
    const inputTokens = Math.ceil(inputCharacters / 4);
    const outputTokens = Math.ceil(rawOutput.length / 4);
    return {
      draft, rawOutput, latencyMs: 1, estimatedInputCharacters: inputCharacters,
      usage: { inputTokens, cachedInputTokens: 0, outputTokens, reasoningTokens: 0, totalTokens: inputTokens + outputTokens },
    };
  },
};

const answerProvider = {
  model: "fixture-gpt-5.4-mini",
  async generate({ question, candidatePacket }) {
    calls.answer += 1;
    const scenario = byQuestion.get(question);
    assert.ok(scenario && candidatePacket, `Missing answer fixture or packet for ${question}`);
    const available = new Set(candidatePacket.scope.references);
    const references = scenario.answerRefs.filter((reference) =>
      expandPlannedReferences(reference).every((part) => available.has(part))
    );
    assert.equal(references.length, scenario.answerRefs.length, `${scenario.id}: answer evidence was not completely retrieved`);
    const draft = withVerification({
      schemaVersion: EMET_AI_SIMPLE_ANSWER_SCHEMA, status: "complete",
      conclusion: scenario.conclusion, answer: scenario.answer, references,
      lexicalAnalyses: scenario.lexicalAnalyses || [], limitations: [],
    }, candidatePacket);
    const inputCharacters = JSON.stringify({ question, candidatePacket }).length + 2_100;
    const rawOutput = JSON.stringify(draft);
    const inputTokens = Math.ceil(inputCharacters / 4);
    const outputTokens = Math.ceil(rawOutput.length / 4);
    return {
      draft, rawOutput, latencyMs: 1,
      usage: { inputTokens, cachedInputTokens: 0, outputTokens, reasoningTokens: 0, totalTokens: inputTokens + outputTokens },
    };
  },
};

const results = [];
const fullResults = new Map();
for (const scenario of scenarios) {
  const result = await answerWithFastTwoPathEmet({
    question: scenario.question,
    conversation: scenario.conversation || null,
    answerProvider,
    discoveryProvider,
  });
  assert.equal(result.status, "complete", `${scenario.id}: ${result.validationErrors.join(" | ")}`);
  const expectedPath = scenario.discovery.length ? "discovery" : "direct";
  assert.equal(result.path, expectedPath, `${scenario.id}: unexpected route`);
  assert.equal(result.modelCalls, expectedPath === "direct" ? 1 : 2);
  assert.ok(result.answer && result.packet);
  assert.equal(
    validateEmetAiAnswer(
      result.packet,
      adaptFastEmetAnswer({ answer: result.answer, packet: result.packet }),
    ).ok,
    true,
    `${scenario.id}: fast answer did not satisfy the production answer contract`,
  );
  fullResults.set(scenario.id, result);
  results.push({
    id: scenario.id,
    question: scenario.question,
    path: result.path,
    modelCalls: result.modelCalls,
    evidenceReferences: result.packet?.scope.references || [],
    evidenceTokens: Math.ceil(JSON.stringify(result.packet?.evidence || []).length / 4),
    discoveryPromptCharacters: result.discovery?.promptCharacters || 0,
    discoveryOutputCharacters: result.discovery?.outputCharacters || 0,
    estimatedInputTokens: result.usage.inputTokens,
    estimatedOutputTokens: result.usage.outputTokens,
    estimatedTotalTokens: result.usage.totalTokens,
    localRetrievalMs: Math.round((result.stages.initialRetrievalMs + result.stages.lockedRetrievalMs) * 100) / 100,
    verificationPass: result.validationErrors.length === 0,
  });
}

assert.equal(calls.answer, scenarios.length);
assert.equal(calls.discovery, scenarios.filter((scenario) => scenario.discovery.length).length);

const adaptedCreation = fullResults.get("creation");
assert.ok(adaptedCreation?.answer && adaptedCreation.packet);
const adaptedCreationAnswer = adaptFastEmetAnswer({
  answer: adaptedCreation.answer,
  packet: adaptedCreation.packet,
});
assert.equal(validateEmetAiAnswer(adaptedCreation.packet, adaptedCreationAnswer).ok, true);

// Locked lexical occurrence-to-lemma linkage remains exact for inflected source
// occurrences in both testaments, while false identities remain unavailable.
const hebrewOne = verifiedSourceTermsAtReference({ corpus: "hebrew", reference: "Deuteronomy 6:4", lookup: "one" });
assert.ok(hebrewOne.some((term) => term.lexicalId === "H259" && term.lemma === "אֶחָד" && term.morphologySignature));
for (const lookup of ["echad", "ʼechâd", "ʾechad", "אֶחָד", "H259"]) {
  const matches = verifiedSourceTermsAtReference({ corpus: "hebrew", reference: "Deuteronomy 6:4", lookup });
  assert.deepEqual(Array.from(new Set(matches.map((term) => term.lexicalId))), ["H259"], `${lookup} must resolve only H259`);
}
const storedEchadLookup = retrieveLockedScriptureReferences({
  references: ["Deuteronomy 6:4"],
  lexicalLookups: [{ reference: "Deuteronomy 6:4", corpus: "hebrew", lookup: "echad", mode: "term" }],
  includeContext: false,
});
assert.deepEqual(storedEchadLookup.lexicalTerms.map((term) => term.lexicalId), ["H259"]);
assert.deepEqual(storedEchadLookup.unresolvedLexicalLookups, []);
const greekWord = verifiedSourceTermsAtReference({ corpus: "greek-nt", reference: "John 1:1", lookup: "word" });
assert.ok(greekWord.some((term) => term.lexicalId === "G3056" && term.morphologySignature));
assert.equal(verifiedSourceTermsAtReference({ corpus: "hebrew", reference: "Deuteronomy 6:4", lookup: "banana" }).length, 0);
assert.equal(verifiedSourceTermsAtReference({ corpus: "hebrew", reference: "Deuteronomy 6:4", lookup: "H260" }).length, 0);
assert.equal(verifiedSourceTermsAtReference({ corpus: "hebrew", reference: "Deuteronomy 6:4", lookup: "three" }).length, 0);
assert.equal(verifiedSourceTermsAtReference({ corpus: "hebrew", reference: "Deuteronomy 6:5", lookup: "echad" }).length, 0);
assert.equal(verifiedSourceTermsAtReference({ corpus: "hebrew", reference: "Deuteronomy 6:4", lookup: "אֶחָז" }).length, 0);
assert.equal(verifiedSourceTermsAtReference({ corpus: "hebrew", reference: "1 Chronicles 17:6", lookup: "dabar" }).length, 0,
  "a transliteration matching distinct verse-scoped lexical identities must fail closed");

// Verse-scoped lexical questions receive the complete ordered locked token
// sequence rather than an unverifiable natural-language lookup instruction.
const ecclesiastesSequence = verifiedSourceTermSequenceAtReference({
  corpus: "hebrew", reference: "Ecclesiastes 12:13",
});
assert.equal(ecclesiastesSequence.length, 14);
assert.ok(ecclesiastesSequence.some((term) => term.lexicalId === "H3605" && term.position >= 0));
assert.ok(ecclesiastesSequence.some((term) => term.surfaceForm === "הַ/כֹּ֣ל" && term.lemma === "כֹּל"));
assert.ok(!ecclesiastesSequence.some((term) => /duty/i.test(`${term.lemma} ${term.meaning}`)));
assert.deepEqual(ecclesiastesSequence.map((term) => term.position), ecclesiastesSequence.map((_, index) => index));
assert.equal(ecclesiastesSequence[0].lexicalId, "H5490");
assert.equal(ecclesiastesSequence.at(-1).lexicalId, "H120");
assert.equal(verifiedSourcePhraseAtReference({
  corpus: "hebrew", reference: "Ecclesiastes 12:13", phrase: "כָּל־הָאָדָם",
}), true);
assert.equal(verifiedSourcePhraseAtReference({
  corpus: "hebrew", reference: "Ecclesiastes 12:13", phrase: "כָּל־בָּנָנָה",
}), false);
const ecclesiastesLexical = retrieveLockedScriptureReferences({
  references: ["Ecclesiastes 12:13-14"],
  lexicalLookups: [{
    reference: "Ecclesiastes 12:13", corpus: "hebrew", lookup: "whole duty of man", mode: "verse-sequence",
  }],
});
assert.equal(ecclesiastesLexical.unresolvedLexicalLookups.length, 0);
assert.equal(ecclesiastesLexical.lexicalTerms.length, ecclesiastesSequence.length);
const invalidLexicalLookup = retrieveLockedScriptureReferences({
  references: ["Ecclesiastes 12:13"],
  lexicalLookups: [{ reference: "Ecclesiastes 12:13", corpus: "hebrew", lookup: "banana", mode: "term" }],
});
assert.equal(invalidLexicalLookup.lexicalTerms.length, 0);
assert.equal(invalidLexicalLookup.unresolvedLexicalLookups.length, 1);

const ecclesiastesQuestion = "What does the Hebrew wording of Ecclesiastes 12:13–14 teach about humanity's responsibility to keep Yahweh's commandments, and is “duty” a separate Hebrew word?";
let ecclesiastesDiscoveryCalls = 0;
const wholeTerm = ecclesiastesSequence.find((term) => term.lexicalId === "H3605");
const humanTerm = ecclesiastesSequence.find((term) => term.lexicalId === "H120");
assert.ok(wholeTerm && humanTerm);
const ecclesiastesResult = await answerWithFastTwoPathEmet({
  question: ecclesiastesQuestion,
  discoveryProvider: {
    model: "fixture",
    async discover() { ecclesiastesDiscoveryCalls += 1; throw new Error("Verse-scoped lexical inspection should be deterministic."); },
  },
  answerProvider: {
    model: "fixture",
    async generate({ candidatePacket }) {
      assert.ok(candidatePacket?.evidence.filter((item) => item.kind === "lexical").length >= 14);
      return {
        draft: withVerification({
          schemaVersion: EMET_AI_SIMPLE_ANSWER_SCHEMA, status: "complete", conclusion: "qualified",
          answer: "Ecclesiastes says to fear God and keep his commandments because every work comes into judgment. The contiguous phrase כָּל־הָאָדָם concerns the whole of humanity; there is no separate Hebrew noun corresponding to the supplied English word duty.",
          references: ["Ecclesiastes 12:13-14"],
          lexicalAnalyses: [
            { reference: "Ecclesiastes 12:13", corpus: "hebrew", lexicalId: wholeTerm.lexicalId, lemma: wholeTerm.lemma, transliteration: wholeTerm.transliteration, meaning: "whole" },
            { reference: "Ecclesiastes 12:13", corpus: "hebrew", lexicalId: humanTerm.lexicalId, lemma: humanTerm.lemma, transliteration: humanTerm.transliteration, meaning: "human being" },
          ], limitations: [],
        }, candidatePacket),
        rawOutput: "fixture", latencyMs: 1,
        usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningTokens: 0, totalTokens: 2 },
      };
    },
  },
});
assert.equal(ecclesiastesDiscoveryCalls, 0);
assert.equal(ecclesiastesResult.path, "direct");
assert.equal(ecclesiastesResult.status, "complete", ecclesiastesResult.validationErrors.join(" | "));

// Same-chapter comma lists canonicalize to independently verifiable reader
// citations; ambiguous and malformed strings remain untouched and fail closed.
assert.deepEqual(
  normalizeEmetAiSimpleReferences(["Romans 7:7, 12, 14, 22-23, 25"]),
  ["Romans 7:7", "Romans 7:12", "Romans 7:14", "Romans 7:22", "Romans 7:23", "Romans 7:25"],
);
assert.equal(normalizeEmetAiSimpleReferences(["Romans 7:1-14"]).length, 14);
assert.equal(normalizeEmetAiSimpleReferences(["Romans 7:99-120"]).length, 22);
assert.ok(normalizeEmetAiSimpleReferences(["Genesis 1:1-24", "Matthew 19:17", "Revelation 22:14"]).includes("Revelation 22:14"));
assert.deepEqual(normalizeEmetAiSimpleReferences(["Romans 7:7, 8:1"]), ["Romans 7:7, 8:1"]);
const malformedSeparator = String.fromCharCode(96) + "," + String.fromCharCode(96);
assert.deepEqual(
  normalizeEmetAiSimpleReferences(["Daniel 7:13" + malformedSeparator + "Acts 2:36"]),
  ["Daniel 7:13", "Acts 2:36"],
  "two complete canonical references separated by malformed punctuation must remain two references",
);
assert.deepEqual(normalizeEmetAiSimpleReferences(["Imaginary 1:1, 2"]), ["Imaginary 1:1", "Imaginary 1:2"]);

// Canonical ranges resolve every component; partial and invented ranges retain
// their invalid members instead of fabricating coverage.
const validRange = retrieveLockedScriptureReferences({ references: ["John 5:28–29"], includeContext: false });
assert.deepEqual(validRange.passages.map((passage) => passage.reference), ["John 5:28", "John 5:29"]);
assert.deepEqual(validRange.invalidReferences, []);
const partialRange = retrieveLockedScriptureReferences({ references: ["John 5:46-48"], includeContext: false });
assert.ok(partialRange.passages.some((passage) => passage.reference === "John 5:46"));
assert.ok(partialRange.passages.some((passage) => passage.reference === "John 5:47"));
assert.ok(partialRange.invalidReferences.includes("John 5:48"));

// A valid range citation is accepted only when every verse is present.
const resurrection = results.find((result) => result.id === "resurrection-follow-up");
assert.ok(resurrection?.evidenceReferences.includes("John 5:28") && resurrection.evidenceReferences.includes("John 5:29"));
const resurrectionPromptEvidence = compactEvidenceForSimpleAnswer(fullResults.get("resurrection-follow-up")?.packet)
  .map((item) => item.reference);
assert.ok(resurrectionPromptEvidence.includes("1 Corinthians 15:23"), "decisive timing evidence must reach generation");
const sabbathPromptEvidence = compactEvidenceForSimpleAnswer(fullResults.get("sabbath")?.packet)
  .map((item) => item.reference);
const sabbathResult = fullResults.get("sabbath");
assert.equal(
  fullResults.get("nt-direct")?.answer?.conclusion,
  fullResults.get("nt-direct")?.generatedDraft?.conclusion,
  "deterministic validation must preserve the model conclusion metadata",
);
assert.equal(sabbathResult?.answer?.conclusion, "yes",
  "a polar obligation question must retain its supported yes conclusion");
assert.equal(sabbathResult?.status, "complete", sabbathResult?.validationErrors.join(" | "));
const covenantResult = fullResults.get("jeremiah-hebrews");
assert.match(covenantResult?.answer?.answer || "", /first covenant was not faultless/i);
assert.match(covenantResult?.answer?.answer || "", /finding fault with the people/i);
assert.match(covenantResult?.answer?.answer || "", /made old.*becoming obsolete.*near vanishing/i);
assert.match(covenantResult?.answer?.answer || "", /laws on their hearts/i);
const lexicalResult = fullResults.get("hebrew-one");
const unsupportedContextualGlossDraft = structuredClone(lexicalResult.generatedDraft);
unsupportedContextualGlossDraft.answer = "The Hebrew word is אֶחָד (ʼechad). In Deuteronomy 6:4 it means “one,” in the sense of “united” or “single”; the lexical note separately gives the broader ordinal sense “first.”";
unsupportedContextualGlossDraft.claims[0].text = unsupportedContextualGlossDraft.answer;
const unsupportedContextualGlossValidation = validateEmetAiSimpleAnswer({
  packet: lexicalResult.packet,
  draft: unsupportedContextualGlossDraft,
});
assert.equal(unsupportedContextualGlossValidation.ok, false);
assert.ok(unsupportedContextualGlossValidation.errors.some((error) =>
  error.includes("contextual lexical gloss")
));


for (const reference of [
  "Genesis 2:3", "Deuteronomy 5:12", "Romans 11:17", "Matthew 19:17", "Hebrews 4:9", "Revelation 14:12", "Revelation 22:14",
]) {
  assert.ok(sabbathPromptEvidence.includes(reference), `${reference} must reach Sabbath answer generation`);
}
const sabbathScenarioReferences = scenarios.find((scenario) => scenario.id === "sabbath").answerRefs;
assert.ok(
  (sabbathResult?.answer?.references.length || 0) <= (sabbathResult?.packet?.responseDesign?.maxScriptureCitations || 8),
  "Public Sabbath citations must respect the response-design limit",
);
for (const reference of sabbathScenarioReferences) {
  assert.ok(
    sabbathResult?.answer?.claims.some((claim) => claim.references.includes(reference)),
    `${reference} must remain available in structured material evidence`,
  );
}
assert.ok(sabbathResult?.answer?.componentChecks.some((check) =>
  check.references.includes("Hebrews 4:9")
), "Hebrews 4:9 must still be considered by internal coverage assessment");
assert.match(sabbathResult?.answer?.answer || "", /seventh day|sabbath/i);
assert.match(sabbathResult?.answer?.answer || "", /foreigners?|grafted/i);
assert.match(sabbathResult?.answer?.answer || "", /messiah|law/i);
assert.match(sabbathResult?.answer?.answer || "", /revelation|commandment keepers/i);

const primarySabbathQuestion = "Should Christians keep the Sabbath?";
const primarySabbathProvider = {
  model: "fixture",
  async generate({ candidatePacket }) {
    return {
      draft: withVerification({
        schemaVersion: EMET_AI_SIMPLE_ANSWER_SCHEMA,
        status: "complete",
        conclusion: "yes",
        answer: "Yes. Christians should keep the Sabbath; the conclusion follows cumulatively from the biblical foundation, governing command, stated scope and duration, covenant membership, Messiah's teaching, apostolic testimony, and Revelation's testimony.",
        references: ["Genesis 2:2", "Deuteronomy 5:12", "Isaiah 56:6", "Romans 11:17", "Matthew 19:17", "Hebrews 4:9", "Revelation 14:12"],
        lexicalAnalyses: [],
        limitations: [],
      }, candidatePacket),
      rawOutput: "fixture", latencyMs: 1,
      usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningTokens: 0, totalTokens: 2 },
    };
  },
};
const primarySabbathResult = await answerWithFastTwoPathEmet({
  question: primarySabbathQuestion,
  answerProvider: primarySabbathProvider,
  discoveryProvider,
});
assert.equal(primarySabbathResult.status, "complete", primarySabbathResult.validationErrors.join(" | "));
assert.equal(primarySabbathResult.path, "direct");
assert.ok(primarySabbathResult.packet?.scope.references.includes("Hebrews 4:9"));
assert.ok(primarySabbathResult.answer?.references.includes("Hebrews 4:9"));

const compactGenerationDraft = parseEmetAiSimpleGenerationDraft({
  schemaVersion: EMET_AI_SIMPLE_GENERATION_SCHEMA,
  status: "complete",
  conclusion: "yes",
  conclusionSupport: "theological-synthesis",
  answer: "Yes. Christians should keep the Sabbath because believers in Messiah share in the covenant people governed by the command.",
  references: ["Deuteronomy 5:12", "Romans 11:17"],
  reasoning: [
    {
      text: "The Sabbath command governs the covenant people.",
      support: "explicit-statement",
      answerBearing: false,
      authorityId: "model-evidence-claim",
      references: ["Deuteronomy 5:12"],
    },
    {
      text: "Believers in Messiah share in that covenant people, so the command applies to them.",
      support: "theological-synthesis",
      answerBearing: true,
      authorityId: "model-evidence-claim",
      references: ["Romans 11:17"],
    },
  ],
  lexicalAnalyses: [],
  limitations: [],
});
assert.ok(compactGenerationDraft);
const hydratedGenerationDraft = hydrateEmetAiSimpleGenerationDraft({
  packet: primarySabbathResult.packet,
  draft: compactGenerationDraft,
});
assert.ok(hydratedGenerationDraft.claims.every((claim) =>
  claim.excerpts.length === claim.references.length &&
  claim.excerpts.every((excerpt) => excerpt.verbatim)
), "locked excerpts must be attached without model regeneration");
assert.equal(
  hydratedGenerationDraft.componentChecks.length,
  primarySabbathResult.packet.reasoning.components.length,
  "component evidence links must be constructed from the packet",
);

const weakenedModalProvider = {
  ...primarySabbathProvider,
  async generate(input) {
    const generated = await primarySabbathProvider.generate(input);
    generated.draft.conclusion = "qualified";
    generated.draft.answer = "Yes. Christians may keep the Sabbath as covenant obedience.";
    generated.draft.claims[0].text = generated.draft.answer;
    generated.draft.claims.push({
      text: "Christians who belong to Messiah share in the covenant people and its promises.",
      support: "strong-implication",
      references: ["Romans 11:17", "Galatians 3:29"],
      excerpts: generated.draft.claims[0].excerpts.filter((excerpt) =>
        ["Romans 11:17", "Galatians 3:29"].includes(excerpt.reference)
      ),
    });
    return generated;
  },
};
const weakenedModalResult = await answerWithFastTwoPathEmet({
  question: primarySabbathQuestion,
  answerProvider: weakenedModalProvider,
  discoveryProvider,
});
assert.equal(weakenedModalResult.status, "complete", weakenedModalResult.validationErrors.join(" | "));
assert.match(weakenedModalResult.answer?.answer || "", /Christians should keep the Sabbath/i);

const supposedQuestionDraft = await weakenedModalProvider.generate({
  candidatePacket: primarySabbathResult.packet,
});
const supposedQuestionValidation = validateEmetAiSimpleAnswer({
  packet: {
    ...primarySabbathResult.packet,
    question: "Is a modern Christian supposed to observe or keep the Sabbath?",
  },
  draft: structuredClone(supposedQuestionDraft.draft),
});
assert.equal(
  supposedQuestionValidation.ok,
  true,
  supposedQuestionValidation.ok ? "" : supposedQuestionValidation.errors.join(" | "),
);
if (supposedQuestionValidation.ok) {
  assert.match(
    supposedQuestionValidation.value.answer,
    /modern Christian should observe or keep the Sabbath/i,
    "supposed-to wording must preserve the asked normative action during deterministic presentation repair",
  );
}

const overCitedDraft = await primarySabbathProvider.generate({
  candidatePacket: primarySabbathResult.packet,
});
const conciseCitationValidation = validateEmetAiSimpleAnswer({
  packet: {
    ...primarySabbathResult.packet,
    responseDesign: {
      ...primarySabbathResult.packet.responseDesign,
      maxScriptureCitations: 4,
    },
  },
  draft: structuredClone(overCitedDraft.draft),
});
assert.equal(conciseCitationValidation.ok, false);
assert.ok(conciseCitationValidation.errors.some((error) =>
  error.includes("response design permits 4")
));

const hiddenMaterialClaimDraft = await primarySabbathProvider.generate({
  candidatePacket: primarySabbathResult.packet,
});
const hiddenColossians = primarySabbathResult.packet.evidence.find((item) => item.reference === "Colossians 2:16");
assert.ok(hiddenColossians);
hiddenMaterialClaimDraft.draft.claims.push({
  text: "Colossians says no one should judge believers with respect to a Sabbath day.",
  support: "explicit-statement",
  references: ["Colossians 2:16"],
  excerpts: [{ reference: "Colossians 2:16", text: hiddenColossians.text, evidenceKind: "scripture", verbatim: true }],
});
const hiddenMaterialClaimValidation = validateEmetAiSimpleAnswer({
  packet: primarySabbathResult.packet,
  draft: hiddenMaterialClaimDraft.draft,
});
assert.equal(hiddenMaterialClaimValidation.ok, true,
  hiddenMaterialClaimValidation.ok ? "" : hiddenMaterialClaimValidation.errors.join(" | "));
if (hiddenMaterialClaimValidation.ok) {
  assert.ok(!hiddenMaterialClaimValidation.value.references.includes("Colossians 2:16"));
}

const unsupportedQualificationProvider = {
  ...primarySabbathProvider,
  async generate(input) {
    const generated = await primarySabbathProvider.generate(input);
    generated.draft.conclusion = "qualified";
    generated.draft.conclusionSupport = "theological-synthesis";
    generated.draft.answer = "Qualified yes: Christians should keep the Sabbath; this follows by synthesis rather than one standalone modern command.";
    generated.draft.limitations = [];
    return generated;
  },
};
const unsupportedQualificationResult = await answerWithFastTwoPathEmet({
  question: primarySabbathQuestion,
  answerProvider: unsupportedQualificationProvider,
  discoveryProvider,
});
assert.equal(unsupportedQualificationResult.status, "insufficient-evidence");
assert.ok(unsupportedQualificationResult.validationErrors.some((error) =>
  error.includes("synthesis alone does not qualify")
));

const metadataOnlyQualificationProvider = {
  ...primarySabbathProvider,
  async generate(input) {
    const generated = await primarySabbathProvider.generate(input);
    generated.draft.conclusion = "qualified";
    generated.draft.conclusionSupport = "theological-synthesis";
    return generated;
  },
};
const metadataOnlyQualificationResult = await answerWithFastTwoPathEmet({
  question: primarySabbathQuestion,
  answerProvider: metadataOnlyQualificationProvider,
  discoveryProvider,
});
assert.equal(metadataOnlyQualificationResult.status, "complete", metadataOnlyQualificationResult.validationErrors.join(" | "));
assert.equal(metadataOnlyQualificationResult.answer?.conclusion, "qualified",
  "postprocessing must preserve model conclusion metadata");

const hiddenMembershipPremiseProvider = {
  ...primarySabbathProvider,
  async generate(input) {
    const generated = await primarySabbathProvider.generate(input);
    generated.draft.answer = "Christians should keep the Sabbath, though the Torah states the command directly to Israel.";
    generated.draft.claims[0].text = "Christians who belong to Messiah share in the covenant people and its promises.";
    generated.draft.claims[0].references = ["Romans 11:17", "Galatians 3:29"];
    generated.draft.claims[0].excerpts = generated.draft.claims[0].excerpts.filter((excerpt) =>
      ["Romans 11:17", "Galatians 3:29"].includes(excerpt.reference)
    );
    return generated;
  },
};
const hiddenMembershipPremiseResult = await answerWithFastTwoPathEmet({
  question: primarySabbathQuestion,
  answerProvider: hiddenMembershipPremiseProvider,
  discoveryProvider,
});
assert.equal(hiddenMembershipPremiseResult.status, "complete", hiddenMembershipPremiseResult.validationErrors.join(" | "));
assert.match(hiddenMembershipPremiseResult.answer?.answer || "", /share in the covenant people and its promises/i);
assert.ok(hiddenMembershipPremiseResult.answer?.references.includes("Romans 11:17"));

const unusedPublicCitationProvider = {
  ...primarySabbathProvider,
  async generate(input) {
    const generated = await primarySabbathProvider.generate(input);
    assert.ok(input.candidatePacket.evidence.some((item) => item.reference === "Colossians 2:16"));
    generated.draft.references = [...generated.draft.references, "Colossians 2:16"];
    return generated;
  },
};
const unusedPublicCitationResult = await answerWithFastTwoPathEmet({
  question: primarySabbathQuestion,
  answerProvider: unusedPublicCitationProvider,
  discoveryProvider,
});
assert.equal(unusedPublicCitationResult.status, "complete", unusedPublicCitationResult.validationErrors.join(" | "));
assert.ok(!unusedPublicCitationResult.answer?.references.includes("Colossians 2:16"));

const displayedPublicCitationProvider = {
  ...unusedPublicCitationProvider,
  async generate(input) {
    const generated = await unusedPublicCitationProvider.generate(input);
    const colossians = input.candidatePacket.evidence.find((item) => item.reference === "Colossians 2:16");
    assert.ok(colossians);
    generated.draft.claims.push({
      text: "Colossians says no one should judge believers with respect to a Sabbath day.",
      support: "explicit-statement",
      references: ["Colossians 2:16"],
      excerpts: [{ reference: "Colossians 2:16", text: colossians.text, evidenceKind: "scripture", verbatim: true }],
    });
    generated.draft.answer += " Colossians also says no one should judge believers with respect to a Sabbath day.";
    return generated;
  },
};
const displayedPublicCitationResult = await answerWithFastTwoPathEmet({
  question: primarySabbathQuestion,
  answerProvider: displayedPublicCitationProvider,
  discoveryProvider,
});
assert.equal(displayedPublicCitationResult.status, "insufficient-evidence");
assert.ok(displayedPublicCitationResult.validationErrors.some((error) =>
  error.includes("different modal action")
));

const mixedScriptProvider = {
  ...primarySabbathProvider,
  async generate(input) {
    const generated = await primarySabbathProvider.generate(input);
    generated.draft.answer += " This does not отменate the command.";
    return generated;
  },
};
const mixedScriptResult = await answerWithFastTwoPathEmet({
  question: primarySabbathQuestion,
  answerProvider: mixedScriptProvider,
  discoveryProvider,
});
assert.equal(mixedScriptResult.status, "insufficient-evidence");
assert.ok(mixedScriptResult.validationErrors.some((error) => error.includes("mixed-script")));

const unsupportedNegativeProvider = {
  ...primarySabbathProvider,
  async generate(input) {
    const generated = await primarySabbathProvider.generate(input);
    generated.draft = withVerification({
      ...generated.draft,
      conclusion: "no",
      answer: "No. Christians are not required to keep the Sabbath.",
    }, input.candidatePacket);
    return generated;
  },
};
const unsupportedNegativeResult = await answerWithFastTwoPathEmet({
  question: primarySabbathQuestion,
  answerProvider: unsupportedNegativeProvider,
  discoveryProvider,
});
assert.equal(unsupportedNegativeResult.status, "insufficient-evidence");
assert.ok(unsupportedNegativeResult.validationErrors.some((error) =>
  error.includes("nonapplicability conclusion lacks")
));
assert.equal(unsupportedNegativeResult.validationErrors.some((error) =>
  /reference|citation|excerpt.*not exact/i.test(error)
), false, "interpretive-support failure must remain distinct from citation and quotation validity");

const inaccurateExcerptProvider = {
  ...primarySabbathProvider,
  async generate(input) {
    const generated = await primarySabbathProvider.generate(input);
    generated.draft.claims[0].excerpts[0].text = "This wording is not in the cited verse.";
    generated.draft.answer += ' Scripture says, “This wording is not in the cited verse.”';
    return generated;
  },
};
const inaccurateExcerptResult = await answerWithFastTwoPathEmet({
  question: primarySabbathQuestion,
  answerProvider: inaccurateExcerptProvider,
  discoveryProvider,
});
assert.equal(inaccurateExcerptResult.status, "insufficient-evidence");
assert.ok(inaccurateExcerptResult.validationErrors.some((error) =>
  error.includes("Scripture quotation is not exact")
));

const paraphraseExcerptProvider = {
  ...primarySabbathProvider,
  async generate(input) {
    const generated = await primarySabbathProvider.generate(input);
    generated.draft.claims[0].excerpts[0] = {
      ...generated.draft.claims[0].excerpts[0],
      text: "The passage commands Sabbath observance.",
      verbatim: false,
    };
    return generated;
  },
};
const paraphraseExcerptResult = await answerWithFastTwoPathEmet({
  question: primarySabbathQuestion,
  answerProvider: paraphraseExcerptProvider,
  discoveryProvider,
});
assert.equal(paraphraseExcerptResult.status, "complete", paraphraseExcerptResult.validationErrors.join(" | "));

const optionalReferenceDiscovery = {
  model: "fixture",
  async discover() {
    return {
      draft: {
        schemaVersion: EMET_AI_FAST_DISCOVERY_SCHEMA,
        references: [
          { reference: "Exodus 20:8-11", relevance: "Governing Sabbath command.", required: true, covers: ["foundation", "governing-instruction", "audience-scope"] },
          { reference: "Mark 2:27-28", relevance: "Messiah's Sabbath teaching.", required: true, covers: ["messiah-teaching"] },
          { reference: "Hebrews 4:9-11", relevance: "Later apostolic testimony.", required: true, covers: ["apostolic-testimony"] },
          { reference: "Imaginary 1:1", relevance: "Optional supporting reference.", required: false, covers: [] },
        ],
        requiredCoverage: ["foundation", "governing-instruction", "audience-scope", "messiah-teaching", "apostolic-testimony"],
        lexicalLookups: [], limitations: ["The conclusion requires synthesis."], blockingIssues: [],
      },
      rawOutput: "fixture", latencyMs: 1, estimatedInputCharacters: 1,
      usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningTokens: 0, totalTokens: 2 },
    };
  },
};
const minimalAnswerProvider = {
  model: "fixture",
  async generate({ candidatePacket }) {
    return {
      draft: withVerification({
        schemaVersion: EMET_AI_SIMPLE_ANSWER_SCHEMA, status: "complete", conclusion: "yes",
        answer: "Yes. Followers of Messiah should keep the seventh-day Sabbath: the Torah commands Sabbath observance, joined people share in the covenant promises, Messiah connects commandments with life, and Revelation describes the saints as commandment keepers.",
        references: ["Genesis 2:3", "Deuteronomy 5:12", "Matthew 19:17", "Romans 11:17", "Revelation 14:12"], lexicalAnalyses: [], limitations: [],
      }, candidatePacket),
      rawOutput: "fixture", latencyMs: 1,
      usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningTokens: 0, totalTokens: 2 },
    };
  },
};
const optionalResult = await answerWithFastTwoPathEmet({
  question: "Should followers of Messiah keep the seventh-day Sabbath?",
  answerProvider: minimalAnswerProvider,
  discoveryProvider: optionalReferenceDiscovery,
});
assert.equal(optionalResult.status, "complete", optionalResult.validationErrors.join(" | "));
assert.equal(optionalResult.path, "direct");
assert.ok(!optionalResult.packet?.scope.references.includes("Imaginary 1:1"));

// Discovery labels do not certify or erase coverage. The verified deterministic
// foundation survives even when discovery omits it or assigns incorrect labels.
let incompleteCoverageGenerationCalls = 0;
const incompleteCoverageDiscovery = {
  ...optionalReferenceDiscovery,
  async discover() {
    const result = await optionalReferenceDiscovery.discover();
    result.draft.references = result.draft.references.filter((item) => !item.reference.startsWith("Exodus 20:"));
    result.draft.references.forEach((item) => { item.covers = ["governing-instruction", "audience-scope", "apostolic-testimony"]; });
    return result;
  },
};
const incompleteCoverageAnswerProvider = {
  ...minimalAnswerProvider,
  async generate(input) {
    incompleteCoverageGenerationCalls += 1;
    return minimalAnswerProvider.generate(input);
  },
};
const incompleteCoverageResult = await answerWithFastTwoPathEmet({
  question: "Should followers of Messiah keep the seventh-day Sabbath?",
  answerProvider: incompleteCoverageAnswerProvider,
  discoveryProvider: incompleteCoverageDiscovery,
});
assert.equal(incompleteCoverageResult.status, "complete");
assert.equal(incompleteCoverageResult.path, "direct");
assert.equal(incompleteCoverageGenerationCalls, 1);
assert.deepEqual(incompleteCoverageResult.validationErrors, []);
assert.ok(incompleteCoverageResult.evidenceManifest.some((entry) =>
  entry.origins.includes("deterministic") && entry.disposition === "retained"
));

assert.equal(usesOmissionAsNonApplicability(
  "Acts 15 does not place Sabbath-keeping among the listed requirements. So these passages do not directly command all believers to keep it.",
), true);
assert.equal(usesOmissionAsNonApplicability(
  "The apostles gave Gentile believers only the listed necessities in Acts 15 and not Sabbath-keeping as a requirement.",
), true);
assert.equal(usesOmissionAsNonApplicability(
  "Acts 15 lists several immediate instructions and verse 21 says Moses is read every Sabbath; the passage must be interpreted from what it states.",
), false);

const silenceAnswerProvider = {
  ...minimalAnswerProvider,
  async generate(input) {
    const result = await minimalAnswerProvider.generate(input);
    result.draft.answer = "Acts 15 does not place Sabbath-keeping among the listed requirements. So these passages do not directly command all followers to keep it.";
    return result;
  },
};
const silenceResult = await answerWithFastTwoPathEmet({
  question: "Should followers of Messiah keep the seventh-day Sabbath?",
  answerProvider: silenceAnswerProvider,
  discoveryProvider: optionalReferenceDiscovery,
});
assert.equal(silenceResult.status, "insufficient-evidence");
assert.ok(silenceResult.validationErrors.some((error) => error.includes("omission from a later list")));

assert.equal(usesOmissionAsNonApplicability(
  "A modern believer is not explicitly commanded to keep this instruction, so the matter is framed as Christ-centered rest rather than as a binding obligation.",
), true);
assert.equal(usesOmissionAsNonApplicability(
  "The evidence does not give a simple universal one-line command for every Christian; the specific obligation is not stated as universally binding on all Christians.",
), true);
assert.equal(usesOmissionAsNonApplicability(
  "The evidence supports covenant faithfulness, but it does not establish a simple universal rule that every Christian must keep it in the same way as Israel.",
), true);

const requiredReferenceDiscovery = {
  ...optionalReferenceDiscovery,
  async discover() {
    const result = await optionalReferenceDiscovery.discover();
    result.draft.references[3].required = true;
    return result;
  },
};
const requiredResult = await answerWithFastTwoPathEmet({
  question: "Should followers of Messiah keep the seventh-day Sabbath?",
  answerProvider: minimalAnswerProvider,
  discoveryProvider: requiredReferenceDiscovery,
});
assert.equal(requiredResult.status, "complete", requiredResult.validationErrors.join(" | "));
assert.equal(requiredResult.path, "direct");

// The complete Romans draft from the saved live failure now yields individual
// canonical citations, while every cited verse still has to exist in the packet.
const romansQuestion = "Does Paul teach that Yahweh's law was abolished under the new covenant? Explain Romans 7 in light of Jeremiah 31:31-34 and Matthew 5:17-19.";
const romansDiscoveryProvider = {
  model: "fixture",
  async discover() {
    return {
      draft: {
        schemaVersion: EMET_AI_FAST_DISCOVERY_SCHEMA,
        references: [
          { reference: "Jeremiah 31:31-34", relevance: "New-covenant foundation.", required: true, covers: ["audience-scope"] },
          { reference: "Matthew 5:17-19", relevance: "Messiah's teaching.", required: true, covers: ["governing-instruction"] },
          { reference: "Romans 7:4-7", relevance: "Immediate argument.", required: true, covers: ["governing-instruction"] },
          { reference: "Romans 7:12-14", relevance: "Paul's description of the law.", required: true, covers: [] },
          { reference: "Romans 7:22-25", relevance: "Paul's conclusion.", required: true, covers: [] },
        ],
        requiredCoverage: [], lexicalLookups: [], limitations: [], blockingIssues: [],
      },
      rawOutput: "fixture", latencyMs: 1, estimatedInputCharacters: 1,
      usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningTokens: 0, totalTokens: 2 },
    };
  },
};
const romansAnswerProvider = {
  model: "fixture",
  async generate({ candidatePacket }) {
    return {
      draft: withVerification({
        schemaVersion: EMET_AI_SIMPLE_ANSWER_SCHEMA, status: "complete", conclusion: "no",
        answer: "No. Jeremiah describes the law written on the heart, Messiah says he did not abolish the Law, and Paul calls the law holy and spiritual.",
        references: ["Jeremiah 31:31-34", "Matthew 5:17-19", "Romans 7:7, 12, 14, 22, 25"],
        lexicalAnalyses: [], limitations: [],
      }, candidatePacket),
      rawOutput: "fixture", latencyMs: 1,
      usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningTokens: 0, totalTokens: 2 },
    };
  },
};
const romansResult = await answerWithFastTwoPathEmet({
  question: romansQuestion, answerProvider: romansAnswerProvider, discoveryProvider: romansDiscoveryProvider,
});
assert.equal(romansResult.status, "complete", romansResult.validationErrors.join(" | "));
assert.deepEqual(romansResult.answer?.references.slice(-5), [
  "Romans 7:7", "Romans 7:12", "Romans 7:14", "Romans 7:22", "Romans 7:25",
]);
assert.ok(romansResult.evidenceManifest.some((entry) =>
  entry.reference === "Jeremiah 31:31" && entry.origins.includes("explicit") && entry.priority === 1
));

// Replay the actual rejected model discovery outputs, not idealized fixtures.
// Deterministic candidates remain authoritative and comma-list references are
// expanded before locked-corpus resolution.
const controlledLive = JSON.parse(await fs.readFile(
  path.join(process.cwd(), ".private", "emet-fast-retrieval-audits", "controlled-live-2026-10-15T11-35-50-632Z.json"),
  "utf8",
));
const liveSabbathArtifact = controlledLive.results.find((item) => item.id === "sabbath");
const liveRomansArtifact = controlledLive.results.find((item) => item.id === "romans-7");
assert.ok(liveSabbathArtifact?.discovery?.rawOutput && liveRomansArtifact?.discovery?.rawOutput);
const rawDiscoveryProvider = (rawOutput) => ({
  model: "saved-live-artifact",
  async discover() {
    return {
      draft: parseEmetAiFastDiscoveryDraft(JSON.parse(rawOutput)), rawOutput,
      latencyMs: 0, estimatedInputCharacters: 0,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    };
  },
});
const savedSabbathResult = await answerWithFastTwoPathEmet({
  question: liveSabbathArtifact.question,
  discoveryProvider: rawDiscoveryProvider(liveSabbathArtifact.discovery.rawOutput),
  answerProvider: {
    model: "fixture",
    async generate({ candidatePacket }) {
      return {
        draft: withVerification({
          schemaVersion: EMET_AI_SIMPLE_ANSWER_SCHEMA, status: "complete", conclusion: "yes",
          answer: "Yes. Followers of Messiah should keep the seventh-day Sabbath: the Torah identifies it as Sabbath, followers of Messiah are grafted in, Messiah connects commandments with life, and Revelation describes the saints as commandment keepers.",
          references: ["Genesis 2:3", "Deuteronomy 5:12", "Hebrews 4:4", "Romans 11:17", "Matthew 19:17", "Revelation 14:12"], lexicalAnalyses: [], limitations: [],
        }, candidatePacket),
        rawOutput: "fixture", latencyMs: 0,
        usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
      };
    },
  },
});
assert.equal(savedSabbathResult.status, "complete", savedSabbathResult.validationErrors.join(" | "));
assert.ok(savedSabbathResult.evidenceManifest.some((entry) =>
  entry.reference === "Hebrews 4:4" && entry.origins.includes("deterministic") && entry.disposition === "retained"
));
const liveRomansDraft = parseEmetAiFastDiscoveryDraft(JSON.parse(liveRomansArtifact.discovery.rawOutput));
assert.ok(liveRomansDraft);
assert.ok(liveRomansDraft.references.some((item) => item.reference.includes(",")));
const savedRomansResult = await answerWithFastTwoPathEmet({
  question: liveRomansArtifact.question,
  discoveryProvider: rawDiscoveryProvider(liveRomansArtifact.discovery.rawOutput),
  answerProvider: {
    ...romansAnswerProvider,
    async generate(input) {
      const generated = await romansAnswerProvider.generate(input);
      generated.draft = withVerification({
        ...generated.draft,
        references: ["Jeremiah 31:31-34", "Matthew 5:17-19", "Romans 7:7, 12, 14, 22-23"],
      }, input.candidatePacket);
      return generated;
    },
  },
});
assert.equal(savedRomansResult.status, "complete", savedRomansResult.validationErrors.join(" | "));
assert.ok(savedRomansResult.packet?.scope.references.includes("Romans 7:22"));
assert.ok(savedRomansResult.packet?.scope.references.includes("Romans 7:23"));

// A required discovered range keeps both semantic boundaries under the packet
// budget. The October 27 replay previously retained Acts 2:22-28 but dropped
// verse 36 even though the discovery summary depended on it.
const october27Live = JSON.parse(await fs.readFile(
  path.join(process.cwd(), ".private", "emet-fast-retrieval-audits", "two-path-live-2026-10-27T18-21-46-520Z.json"),
  "utf8",
));
const october27Messiah = october27Live.results.find((item) => item.id === "messiah-identity");
const october27MessiahDiscovery = parseEmetAiFastDiscoveryDraft(JSON.parse(october27Messiah.discovery.rawOutput));
const october27MessiahInitial = retrieveFastScriptureEvidence({ question: october27Messiah.question, conversation: null });
const october27MessiahAssembly = assembleFastTwoPathEvidence({
  contract: buildEmetAiQuestionContract({ question: october27Messiah.question, conversation: null }),
  initialPassages: october27MessiahInitial.passages,
  initialLexicalTerms: october27MessiahInitial.lexicalTerms,
  discovery: october27MessiahDiscovery,
});
assert.ok(october27MessiahAssembly.passages.some((passage) => passage.reference === "Acts 2:36"));
assert.ok(october27MessiahAssembly.manifest.some((entry) =>
  entry.reference === "Acts 2:36" && entry.priority === 2 && entry.disposition === "retained"
));

// Replay the two @51 rejected model drafts as targeted validator regressions.
// The Messiah draft is rejected for omitting public support for its direct
// identification and exceeding the citation budget; the covenant draft remains
// rejected for dropping a material compound distinction. A legitimate causal
// construction in cited Scripture must not create an additional false failure.
const latestRepairLive = JSON.parse(await fs.readFile(
  path.join(process.cwd(), ".private", "emet-fast-retrieval-audits", "two-path-live-2026-10-27T20-24-20-178Z.json"),
  "utf8",
));
const rejectedMessiah = latestRepairLive.results.find((item) => item.id === "messiah-identity");
const rejectedMessiahDraft = structuredClone(rejectedMessiah.generatedDraft);
const directMessiahClaim = rejectedMessiahDraft.claims.find((claim) => claim.references.includes("Matthew 16:16"));
assert.ok(directMessiahClaim, "the raw model retained the direct identity evidence internally");
assert.ok(!normalizeEmetAiSimpleReferences(rejectedMessiahDraft.references).includes("Matthew 16:16"),
  "the raw model omitted the direct identity evidence from public citations");
const rejectedMessiahValidation = validateEmetAiSimpleAnswer({
  packet: rejectedMessiah.packet, draft: rejectedMessiahDraft,
});
assert.equal(rejectedMessiahValidation.ok, false);
assert.ok(rejectedMessiahValidation.errors.some((error) => error.includes("no selected public citation")));
assert.ok(rejectedMessiahValidation.errors.some((error) => error.includes("permits 4")));

const rejectedCovenant = latestRepairLive.results.find((item) => item.id === "prophecy");
const rejectedCovenantValidation = validateEmetAiSimpleAnswer({
  packet: rejectedCovenant.packet, draft: structuredClone(rejectedCovenant.generatedDraft),
});
assert.equal(rejectedCovenantValidation.ok, false);
assert.ok(rejectedCovenantValidation.errors.some((error) => error.includes("compound structured claim")));
assert.ok(!rejectedCovenantValidation.errors.some((error) => error.includes("causal relationship")),
  "causal wording grounded in a cited causal construction must not be rejected");

const fresh52Live = JSON.parse(await fs.readFile(
  path.join(process.cwd(), ".private", "emet-fast-retrieval-audits", "two-path-live-2026-10-28T02-21-06-186Z.json"),
  "utf8",
));
const fresh52Messiah = fresh52Live.results.find((item) => item.id === "messiah-identity");
const fresh52MessiahValidation = validateEmetAiSimpleAnswer({
  packet: fresh52Messiah.packet,
  draft: structuredClone(fresh52Messiah.generatedDraft),
});
assert.equal(fresh52MessiahValidation.ok, true,
  fresh52MessiahValidation.ok ? "" : fresh52MessiahValidation.errors.join(" | "));
const fresh52Role = fresh52Live.results.find((item) => item.id === "command-role");
const fresh52RoleValidation = validateEmetAiSimpleAnswer({
  packet: fresh52Role.packet,
  draft: structuredClone(fresh52Role.generatedDraft),
});
assert.equal(fresh52RoleValidation.ok, true,
  fresh52RoleValidation.ok ? "" : fresh52RoleValidation.errors.join(" | "));
const fresh52Sabbath = fresh52Live.results.find((item) => item.id === "sabbath-exact");
const fresh52SabbathValidation = validateEmetAiSimpleAnswer({
  packet: fresh52Sabbath.packet,
  draft: structuredClone(fresh52Sabbath.generatedDraft),
});
assert.equal(fresh52SabbathValidation.ok, false);
assert.ok(fresh52SabbathValidation.errors.some((error) =>
  error.includes("covenant-membership premise")
), "the validator must still reject a genuinely missing applicability premise");

// Replay the exact Phase 2B final-live failure. Its ordinary descriptive
// attributes are supported and must no longer be misread as one long identity
// designation. The categorical Yahshua/Yahweh conclusion must still be rejected
// because its structured claims establish only the different Father/Son pair.
const phase2bFinalLive = JSON.parse(await fs.readFile(
  path.join(process.cwd(), ".private", "reliability-recovery-phase2b", "final-live-acceptance-2026-10-28T17-58-01-456Z.json"),
  "utf8",
));
const phase2bRawFailure = phase2bFinalLive.results.find((item) => item.id === "yahweh-yahshua");
const phase2bRawValidation = validateEmetAiSimpleAnswer({
  packet: phase2bRawFailure.result.packet,
  draft: structuredClone(phase2bRawFailure.result.generatedDraft),
});
assert.equal(phase2bRawValidation.ok, false);
assert.ok(phase2bRawValidation.errors.some((error) => error.includes("exact identity pair asked about")),
  "a categorical conclusion must have a structured claim about the same identity pair");
assert.ok(!phase2bRawValidation.errors.some((error) => error.includes("Claim designation")),
  "supported descriptive attributes must not be treated as one unsupported proper-name designation");

const subjectMismatchDraft = structuredClone(phase2bRawFailure.result.generatedDraft);
subjectMismatchDraft.claims[0].text = "The Torah and Prophets identify Judas as Yahweh.";
subjectMismatchDraft.answer = subjectMismatchDraft.answer.replace(
  /^Yahweh is[^.]+\./,
  "The Torah and Prophets identify Judas as Yahweh.",
);
const subjectMismatchValidation = validateEmetAiSimpleAnswer({
  packet: phase2bRawFailure.result.packet,
  draft: subjectMismatchDraft,
});
assert.equal(subjectMismatchValidation.ok, false);
assert.ok(subjectMismatchValidation.errors.some((error) => error.includes("Claim designation")),
  "a genuine subject/designation mismatch must remain rejected");
assert.equal(october27MessiahAssembly.passages.length, 24,
  "a concise Messiah identity packet must not send the former 64 verses to generation");
for (const reference of ["John 1:41", "Matthew 16:16", "Acts 2:36"]) {
  assert.ok(october27MessiahAssembly.passages.some((passage) => passage.reference === reference),
    `${reference} must survive concise identity evidence reduction`);
}


// Replay the exact October 16 rejected drafts at the service boundary.
const october16 = JSON.parse(await fs.readFile(
  path.join(process.cwd(), ".private", "emet-fast-retrieval-audits", "authoritative-assembler-live-2026-10-16T13-31-37-677Z.json"),
  "utf8",
));
const savedAnswerProvider = (saved) => ({
  model: "saved-october-16-answer",
  async generate({ candidatePacket }) {
    return {
      draft: withVerification(saved.generatedDraft, candidatePacket),
      rawOutput: saved.generatedRawOutput,
      latencyMs: 0,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    };
  },
});
const unusedDiscoveryProvider = {
  model: "unused",
  async discover() { throw new Error("Discovery was not expected for this replay."); },
};
const octoberEcclesiastes = october16.results.find((item) => item.id === "ecclesiastes");
const octoberEcclesiastesReplay = await answerWithFastTwoPathEmet({
  question: octoberEcclesiastes.question,
  answerProvider: savedAnswerProvider(octoberEcclesiastes),
  discoveryProvider: unusedDiscoveryProvider,
});
assert.equal(octoberEcclesiastesReplay.status, "complete", octoberEcclesiastesReplay.validationErrors.join(" | "));
assert.equal(octoberEcclesiastesReplay.answer?.lexicalAnalyses.length, 7);

const octoberRomans = october16.results.find((item) => item.id === "romans-7");
const octoberRomansReplay = await answerWithFastTwoPathEmet({
  question: octoberRomans.question,
  answerProvider: savedAnswerProvider(octoberRomans),
  discoveryProvider: rawDiscoveryProvider(octoberRomans.discovery.rawOutput),
});
assert.equal(octoberRomansReplay.status, "complete", octoberRomansReplay.validationErrors.join(" | "));
for (const reference of ["Romans 7:22", "Romans 7:23", "Romans 7:24", "Romans 7:25"]) {
  assert.ok(octoberRomansReplay.packet?.scope.references.includes(reference), `${reference} must reach generation`);
}

const falseLexicalAnswerProvider = {
  model: "fixture",
  async generate() {
    return {
      draft: {
        schemaVersion: EMET_AI_SIMPLE_ANSWER_SCHEMA, status: "complete", conclusion: "qualified",
        answer: "The Hebrew term is אֶחָד.", references: ["Deuteronomy 6:4"],
        lexicalAnalyses: [{
          reference: "Deuteronomy 6:4", corpus: "hebrew", lexicalId: "H999",
          lemma: "אֶחָד", transliteration: "ʼechâd", meaning: "one",
        }], limitations: [],
      },
      rawOutput: "fixture", latencyMs: 1,
      usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningTokens: 0, totalTokens: 2 },
    };
  },
};
const falseLexicalResult = await answerWithFastTwoPathEmet({
  question: "What Hebrew word is translated one in Deuteronomy 6:4, and what does it mean?",
  answerProvider: falseLexicalAnswerProvider,
  discoveryProvider,
});
assert.equal(falseLexicalResult.status, "insufficient-evidence");
assert.ok(falseLexicalResult.validationErrors.some((error) => error.includes("hebrew:H999")));

const falseMeaningAnswerProvider = {
  ...falseLexicalAnswerProvider,
  async generate() {
    const result = await falseLexicalAnswerProvider.generate();
    result.draft.lexicalAnalyses[0].lexicalId = "H259";
    result.draft.lexicalAnalyses[0].meaning = "one means three unrelated gods";
    return result;
  },
};
const falseMeaningResult = await answerWithFastTwoPathEmet({
  question: "What Hebrew word is translated one in Deuteronomy 6:4, and what does it mean?",
  answerProvider: falseMeaningAnswerProvider,
  discoveryProvider,
});
assert.equal(falseMeaningResult.status, "insufficient-evidence");
assert.ok(falseMeaningResult.validationErrors.some((error) => error.includes("hebrew:H259")));

const conflatedLexicalProvider = {
  ...answerProvider,
  async generate(input) {
    const generated = await answerProvider.generate(input);
    generated.draft.answer = "The Hebrew word is אֶחָד (ʼechâd), and in Deuteronomy 6:4 it means “one” or “united.”";
    return generated;
  },
};
const conflatedLexicalResult = await answerWithFastTwoPathEmet({
  question: "What Hebrew word is translated one in Deuteronomy 6:4, and what does it mean?",
  answerProvider: conflatedLexicalProvider,
  discoveryProvider,
});
assert.equal(conflatedLexicalResult.status, "insufficient-evidence");
assert.ok(conflatedLexicalResult.validationErrors.some((error) => error.includes("broader lexical range")));
const aggregateTokens = results.reduce((sum, result) => sum + result.estimatedTotalTokens, 0);
// Calibrated from the preserved 12-call gpt-5.4-mini benchmark: $0.0176 / 11,977 blended tokens.
const estimatedCostUsd = aggregateTokens * (0.0176 / 11_977);
const artifact = {
  schemaVersion: "emet-fast-two-path-deterministic-evaluation@1",
  createdAt: new Date().toISOString(),
  paidAiCalls: 0,
  fixtureCalls: calls,
  results,
  aggregate: {
    directQuestions: results.filter((result) => result.path === "direct").length,
    discoveryQuestions: results.filter((result) => result.path === "discovery").length,
    totalProjectedModelCalls: results.reduce((sum, result) => sum + result.modelCalls, 0),
    estimatedInputTokens: results.reduce((sum, result) => sum + result.estimatedInputTokens, 0),
    estimatedOutputTokens: results.reduce((sum, result) => sum + result.estimatedOutputTokens, 0),
    estimatedTotalTokens: aggregateTokens,
    estimatedCostUsd: Math.round(estimatedCostUsd * 10_000) / 10_000,
    verificationPasses: results.filter((result) => result.verificationPass).length,
  },
};

const outputDir = path.join(process.cwd(), ".private", "emet-fast-retrieval-audits");
await fs.mkdir(outputDir, { recursive: true });
const outputFile = path.join(outputDir, `two-path-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await fs.writeFile(outputFile, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify({ verdict: "EMET_FAST_TWO_PATH_DETERMINISTIC_PASS", outputFile, ...artifact.aggregate, results }, null, 2));
