import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { buildEmetAiInitialScriptureEvidence } from "../app/lib/emet/EmetAiTopicEvidence.ts";

const readyCases = [
  ["Who created the heavens and the earth?", "Genesis 1:1"],
  ["What does John 3:16 say?", "John 3:16"],
  ['What Hebrew word is translated "one" in Deuteronomy 6:4, and what does it mean?', "Deuteronomy 6:4"],
  ["What are the Ten Commandments?", "Exodus 20:2"],
  ["Romans 3:10 says none are righteous, yet Genesis 6:9 describes Noah as righteous. How do these passages agree?", "Romans 3:10"],
];

const firstPassTimes = [];
for (const [question, expectedReference] of readyCases) {
  const startedAt = performance.now();
  const result = buildEmetAiInitialScriptureEvidence({ question });
  firstPassTimes.push(performance.now() - startedAt);
  assert.equal(result.status, "ready", question);
  assert.ok(result.items.length >= 1 && result.items.length <= 5, question);
  assert.ok(result.items.some((item) => item.reference === expectedReference), question);
  assert.ok(result.items.every((item) => item.id.startsWith("scripture:")), question);
  assert.ok(result.items.every((item) => item.text.length > 0), question);
}

for (const question of [
  "Does Scripture require believers to keep the seventh-day Sabbath? Examine the Torah and relevant New Testament passages.",
  "How does Jeremiah 31 connect to Hebrews 8?",
  "Explain the symbolism in Revelation 12.",
]) {
  const result = buildEmetAiInitialScriptureEvidence({ question });
  assert.equal(result.status, "finding", question);
  assert.deepEqual(result.items, [], question);
}

const unresolvedLexical = buildEmetAiInitialScriptureEvidence({
  question: 'What Hebrew word is translated "set" in Genesis 1:1?',
});
assert.equal(unresolvedLexical.status, "ready");
assert.equal(unresolvedLexical.route, "explicit-reference");
assert.deepEqual(unresolvedLexical.items.map((item) => item.reference), ["Genesis 1:1"]);

const readerContext = buildEmetAiInitialScriptureEvidence({
  question: "What does this verse mean?",
  context: { book: "Psalms", chapter: 19, verse: 1, translation: "kjv" },
});
assert.equal(readerContext.status, "ready");
assert.equal(readerContext.route, "reader-context");
assert.ok(readerContext.items.some((item) => item.reference === "Psalms 19:1"));
assert.ok(readerContext.items.every((item) => item.translation === "kjv"));

firstPassTimes.sort((left, right) => left - right);
console.log("EMET progressive Scripture evidence verification passed.");
console.log(`- Ready fixtures: ${readyCases.length}`);
console.log("- Complex fixtures without immediately decisive passages remained in finding state: 3");
console.log("- An unresolved lexical mapping exposed only its explicit verse, not an invented lexical identity.");
console.log(`- Local first-pass median: ${firstPassTimes[Math.floor(firstPassTimes.length / 2)].toFixed(3)} ms`);
console.log(`- Local first-pass max: ${firstPassTimes.at(-1).toFixed(3)} ms`);
console.log("- Preliminary evidence is capped at five locked-corpus Scripture items.");
console.log("- No model or network calls were made.");
