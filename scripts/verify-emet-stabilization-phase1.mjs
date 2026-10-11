import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildEmetAiQuestionContract } from "../app/lib/emet/EmetAiQuestionContract.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const contract = (question, conversation = null) =>
  buildEmetAiQuestionContract({ question, conversation, context: null });

const morningStar = contract("What is the morning star in Revelation 2:28?");
assert.equal(morningStar.intent, "symbolic");
assert.deepEqual(morningStar.topicDomains, []);
assert.deepEqual(morningStar.explicitReferences, ["Revelation 2:28"]);

const jezebel = contract("Who is Jezebel in Revelation 2, and what does she symbolize?");
assert.equal(jezebel.intent, "symbolic");
assert.deepEqual(jezebel.topicDomains, []);

const death = contract("What happens when we die and when are the dead raised?");
assert.equal(death.intent, "multi-part");
assert.equal(death.requiresSemanticPlanning, true);

const paul = contract("Does Paul teach that the commandments were abolished?");
assert.equal(paul.intent, "doctrinal");
assert.equal(paul.requiresSemanticPlanning, true);
assert.ok(paul.biblicalEntities.includes("Paul"));
assert.ok(paul.biblicalEntities.includes("commandments"));

const law = contract("Are believers under the law of Moses?");
assert.equal(law.intent, "doctrinal");
assert.equal(law.requiresSemanticPlanning, true);
assert.ok(law.biblicalEntities.includes("Torah"));

const revelation = contract("Explain Revelation 12 and its symbolic imagery.");
assert.equal(revelation.intent, "symbolic");
assert.deepEqual(revelation.topicDomains, []);

const cosmology = contract("Does Scripture say the earth spins around the sun?");
assert.deepEqual(cosmology.topicDomains, ["cosmology"]);

const lexical = contract(
  "What Hebrew and Greek terms are translated righteousness in Genesis 6:9 and Luke 1:6?",
);
assert.equal(lexical.intent, "lexical");
assert.deepEqual(lexical.requestedLanguages.sort(), ["greek-nt", "hebrew"]);
assert.deepEqual(lexical.explicitReferences, ["Genesis 6:9", "Luke 1:6"]);

const followUpConversation = {
  recentExchanges: [{
    question: "Does Scripture require believers to keep the seventh-day Sabbath?",
    answer: "Prior answer",
    references: ["Exodus 20:8"],
    claims: [],
    outcome: "answered",
  }],
  summary: {
    topics: ["sabbath"],
    passages: ["Exodus 20:8"],
    corrections: [],
    earlierQuestions: [],
    establishedClaims: [],
  },
};
const followUp = contract("What passages are strongest against that conclusion?", followUpConversation);
assert.equal(followUp.conversation.relevant, true);
assert.equal(followUp.requiresSemanticPlanning, true);

for (const item of [morningStar, jezebel, death, paul, law, revelation, cosmology, lexical, followUp]) {
  assert.deepEqual(item.authority, {
    scriptureGovernsBiblicalClaims: true,
    interpretScriptureThroughScripture: true,
    preserveGenreAndOrdinaryContext: true,
    externalModelsAreNotGoverningAuthority: true,
    distinguishTextFromInference: true,
    verifiedSourceLanguagesOnly: true,
    failClosed: true,
  });
}

const constitution = fs.readFileSync(
  path.join(root, "app", "lib", "emet", "EmetAiConstitution.ts"),
  "utf8",
);
assert.match(constitution, /Scripture is the authority for the answer/);
assert.match(constitution, /Scripture interprets Scripture/);
assert.match(constitution, /genre may qualify a claim/);
assert.match(constitution, /modern scientific, historical, institutional, or denominational model/);
assert.match(constitution, /Never invent or alter a quotation, reference, source word/);
assert.match(constitution, /return insufficient-evidence/);

const provider = fs.readFileSync(
  path.join(root, "app", "lib", "emet", "providers", "EmetAiOpenAiProvider.ts"),
  "utf8",
);
assert.match(provider, /selecting an evidence strategy, not writing a reader-facing answer/);
assert.match(provider, /emet_ai_retrieval_plan/);
assert.doesNotMatch(provider, /pendingTopicAnswer/);
assert.doesNotMatch(provider, /emet_ai_plan_and_answer/);

console.log("EMET stabilization Phase 1 deterministic verification passed.");
