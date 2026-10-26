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
  normalizeEmetAiSimpleReferences,
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
import {
  compactEvidenceForSimpleAnswer,
  EMET_AI_SIMPLE_SYSTEM_INSTRUCTION,
} from "../app/lib/emet/simple/EmetAiSimpleProvider.ts";
import { adaptFastEmetAnswer } from "../app/lib/emet/simple/EmetAiFastAnswerAdapter.ts";
import { validateEmetAiAnswer } from "../app/lib/emet/EmetAiContract.ts";

// Ordinary questions receive positive Scripture-first reasoning rather than a
// mandatory controversy, repeal, or uncertainty hunt. These are prompt-policy
// checks only; live synthesis quality still requires a separately approved run.
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /Begin with what the supplied Scripture positively establishes/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /connected testimony rather than opposing theological systems/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /Do not independently search for or introduce a contradiction, repeal, exception/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /lack of a repeated New Testament command is not evidence of repeal or nonapplication/i);
assert.match(EMET_AI_SIMPLE_SYSTEM_INSTRUCTION, /Leave limitations empty unless a concrete, material limitation/i);
assert.match(EMET_AI_FAST_DISCOVERY_INSTRUCTION, /Start with passages that positively and directly establish the subject/i);
assert.match(EMET_AI_FAST_DISCOVERY_INSTRUCTION, /Do not routinely search for counterexamples, repeal, exemptions, contradictions, or opposing positions/i);
assert.match(EMET_AI_FAST_DISCOVERY_INSTRUCTION, /do not characterize an omission as an exemption/i);
assert.match(EMET_AI_FAST_DISCOVERY_INSTRUCTION, /absence of one universal proof-text.*is not itself a limitation/i);
assert.match(EMET_AI_FAST_DISCOVERY_INSTRUCTION, /model-produced labels do not certify evidence completeness/i);
assert.match(EMET_AI_FAST_DISCOVERY_INSTRUCTION, /Use mode "verse-sequence"/i);
assert.doesNotMatch(EMET_AI_FAST_DISCOVERY_INSTRUCTION, /Use limitations for ordinary interpretive qualifications/i);

const scenarios = [
  {
    id: "creation", question: "Who created the heavens and the earth?", conclusion: "qualified",
    discovery: [], answerRefs: ["Genesis 1:1", "Isaiah 42:5"],
    answer: "Yahweh created the heavens and the earth; Scripture presents creation as his work.",
  },
  {
    id: "ten-commandments", question: "What are the Ten Commandments?", conclusion: "qualified",
    discovery: [], answerRefs: ["Deuteronomy 5:6", "Deuteronomy 5:7", "Deuteronomy 5:11", "Deuteronomy 5:12", "Deuteronomy 5:16", "Deuteronomy 5:17", "Deuteronomy 5:18", "Deuteronomy 5:19", "Deuteronomy 5:20", "Deuteronomy 5:21"],
    answer: "The Ten Commandments are: 1. Have no other gods. 2. Do not make or worship idols. 3. Do not misuse Yahweh's name. 4. Keep the Sabbath. 5. Honor father and mother. 6. Do not murder. 7. Do not commit adultery. 8. Do not steal. 9. Do not bear false witness. 10. Do not covet.",
  },
  {
    id: "sabbath", question: "Should followers of Messiah keep the seventh-day Sabbath?", conclusion: "qualified",
    discovery: ["Genesis 2:2-3", "Exodus 20:8-11", "Isaiah 56:6-7", "Matthew 5:17-19", "Mark 2:27-28", "Colossians 2:16-17"],
    answerRefs: ["Genesis 2:3", "Exodus 20:8", "Isaiah 56:6", "Matthew 5:17", "Mark 2:27", "Colossians 2:16"],
    answer: "Scripture establishes the seventh day as Yahweh's Sabbath and includes joined foreigners among those who keep it. Messiah did not present himself as abolishing the Law, while Colossians warns against human judgment concerning Sabbaths; the latter text must be interpreted in that Torah and Messianic context rather than treated as an unstated repeal.",
  },
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
    lexicalAnalyses: [{ reference: "Deuteronomy 6:4", corpus: "hebrew", lexicalId: "H259", lemma: "אֶחָד", transliteration: "ʼechâd", meaning: "properly, united, i.e. one; or (as an ordinal) first" }],
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
    discovery: [], answerRefs: ["Jeremiah 31:31", "Jeremiah 31:33", "Hebrews 8:8", "Hebrews 8:10"],
    answer: "Hebrews 8 quotes Jeremiah 31's promised new covenant with Israel and Judah, including Yahweh writing his laws on their hearts. Hebrews applies Jeremiah's promise to Messiah's covenant ministry rather than inventing an unrelated covenant promise.",
  },
];

const byQuestion = new Map(scenarios.map((scenario) => [scenario.question, scenario]));
const calls = { discovery: 0, answer: 0 };

const discoveryProvider = {
  model: "fixture-gpt-5.4-mini",
  async discover({ question, conversation, candidates }) {
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
        covers: requiredCoverage,
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
    const draft = {
      schemaVersion: EMET_AI_SIMPLE_ANSWER_SCHEMA, status: "complete",
      conclusion: scenario.conclusion, answer: scenario.answer, references,
      lexicalAnalyses: scenario.lexicalAnalyses || [], limitations: [],
    };
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

assert.equal(calls.answer, 12);
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
const greekWord = verifiedSourceTermsAtReference({ corpus: "greek-nt", reference: "John 1:1", lookup: "word" });
assert.ok(greekWord.some((term) => term.lexicalId === "G3056" && term.morphologySignature));
assert.equal(verifiedSourceTermsAtReference({ corpus: "hebrew", reference: "Deuteronomy 6:4", lookup: "banana" }).length, 0);

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
        draft: {
          schemaVersion: EMET_AI_SIMPLE_ANSWER_SCHEMA, status: "complete", conclusion: "qualified",
          answer: "Ecclesiastes says to fear God and keep his commandments because every work comes into judgment. The contiguous phrase כָּל־הָאָדָם concerns the whole of humanity; there is no separate Hebrew noun corresponding to the supplied English word duty.",
          references: ["Ecclesiastes 12:13-14"],
          lexicalAnalyses: [
            { reference: "Ecclesiastes 12:13", corpus: "hebrew", lexicalId: wholeTerm.lexicalId, lemma: wholeTerm.lemma, transliteration: wholeTerm.transliteration, meaning: "whole" },
            { reference: "Ecclesiastes 12:13", corpus: "hebrew", lexicalId: humanTerm.lexicalId, lemma: humanTerm.lemma, transliteration: humanTerm.transliteration, meaning: "human being" },
          ], limitations: [],
        },
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
assert.deepEqual(normalizeEmetAiSimpleReferences(["Romans 7:7, 8:1"]), ["Romans 7:7, 8:1"]);
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
assert.equal(sabbathResult?.status, "complete", sabbathResult?.validationErrors.join(" | "));
for (const reference of [
  "Genesis 2:3", "Exodus 20:8", "Isaiah 56:6", "Matthew 5:17", "Mark 2:27", "Colossians 2:16",
]) {
  assert.ok(sabbathPromptEvidence.includes(reference), `${reference} must reach Sabbath answer generation`);
  assert.ok(sabbathResult?.answer?.references.includes(reference), `${reference} must remain visible in the verified Sabbath answer`);
}
assert.match(sabbathResult?.answer?.answer || "", /seventh day|sabbath/i);
assert.match(sabbathResult?.answer?.answer || "", /foreigners?/i);
assert.match(sabbathResult?.answer?.answer || "", /messiah|law/i);
assert.match(sabbathResult?.answer?.answer || "", /colossians|judgment concerning sabbaths/i);
assert.ok(sabbathPromptEvidence.includes("Matthew 5:17"));
assert.ok(sabbathPromptEvidence.includes("Colossians 2:16"));

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
  async generate() {
    return {
      draft: {
        schemaVersion: EMET_AI_SIMPLE_ANSWER_SCHEMA, status: "complete", conclusion: "qualified",
        answer: "The Torah commands Sabbath observance, and Messiah says the Sabbath was made for man.",
        references: ["Exodus 20:8", "Mark 2:27", "Hebrews 4:9"], lexicalAnalyses: [], limitations: [],
      },
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
assert.equal(optionalResult.status, "complete");
assert.deepEqual(optionalResult.discovery?.droppedOptionalReferences, ["Imaginary 1:1"]);
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
assert.equal(incompleteCoverageResult.status, "insufficient-evidence");
assert.equal(incompleteCoverageGenerationCalls, 1);
assert.ok(!incompleteCoverageResult.validationErrors.some((error) => error.includes("governing-instruction")));
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
  async generate() {
    const result = await minimalAnswerProvider.generate();
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
assert.ok(requiredResult.evidenceManifest.some((entry) =>
  entry.reference === "Imaginary 1:1" && entry.disposition === "rejected"
));

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
  async generate() {
    return {
      draft: {
        schemaVersion: EMET_AI_SIMPLE_ANSWER_SCHEMA, status: "complete", conclusion: "no",
        answer: "No. Jeremiah describes the law written on the heart, Messiah says he did not abolish the Law, and Paul calls the law holy and spiritual.",
        references: ["Jeremiah 31:31-34", "Matthew 5:17-19", "Romans 7:7, 12, 14, 22, 25"],
        lexicalAnalyses: [], limitations: [],
      },
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
    async generate() {
      return {
        draft: {
          schemaVersion: EMET_AI_SIMPLE_ANSWER_SCHEMA, status: "complete", conclusion: "qualified",
          answer: "The Torah identifies the seventh day as Sabbath, while Hebrews explicitly recalls God's seventh-day rest.",
          references: ["Exodus 20:8", "Hebrews 4:4"], lexicalAnalyses: [], limitations: [],
        },
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
      generated.draft.references = ["Jeremiah 31:31-34", "Matthew 5:17-19", "Romans 7:7, 12, 14, 22-23"];
      return generated;
    },
  },
});
assert.equal(savedRomansResult.status, "complete", savedRomansResult.validationErrors.join(" | "));
assert.ok(savedRomansResult.packet?.scope.references.includes("Romans 7:22"));
assert.ok(savedRomansResult.packet?.scope.references.includes("Romans 7:23"));

// Replay the exact October 16 rejected drafts at the service boundary.
const october16 = JSON.parse(await fs.readFile(
  path.join(process.cwd(), ".private", "emet-fast-retrieval-audits", "authoritative-assembler-live-2026-10-16T13-31-37-677Z.json"),
  "utf8",
));
const savedAnswerProvider = (saved) => ({
  model: "saved-october-16-answer",
  async generate() {
    return {
      draft: saved.generatedDraft,
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
