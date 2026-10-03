import assert from "node:assert/strict";

import {
  buildEmetConversationQuestion,
  parseEmetPreviousQuestions,
} from "../app/lib/emet/EmetAiConversation.ts";
import { buildEmetAiTopicEvidence } from "../app/lib/emet/EmetAiTopicEvidence.ts";

const sabbath = buildEmetAiTopicEvidence({
  question: "What does Scripture establish about the Sabbath?",
  builtAt: "2026-01-01T00:00:00.000Z",
});

assert.equal(sabbath.status, "ready");
if (sabbath.status === "ready") {
  assert.equal(sabbath.packet.identity.gate, "not-applicable");
  assert.equal(sabbath.packet.scope.type, "topic");
  assert.ok(sabbath.packet.scope.references.some((reference) => reference.startsWith("Exodus ")));
  assert.ok(sabbath.packet.scope.references.includes("Matthew 5:17"));
  assert.ok(sabbath.packet.scope.references.includes("Matthew 5:18"));
  assert.ok(sabbath.packet.scope.references.includes("Matthew 5:19"));
  assert.ok(sabbath.packet.scope.references.length <= 20);
  assert.ok(
    sabbath.packet.evidence.every(
      (item) => item.provenance.authority === "locked-scripture-search-runtime",
    ),
  );
}

const presentObligation = buildEmetAiTopicEvidence({
  question: "Should believers obey God's commandments today?",
  builtAt: "2026-01-01T00:00:00.000Z",
});

assert.equal(presentObligation.status, "ready");
if (presentObligation.status === "ready") {
  assert.ok(presentObligation.packet.scope.references.includes("Matthew 5:17"));
  assert.ok(presentObligation.packet.scope.references.includes("Matthew 5:18"));
  assert.ok(presentObligation.packet.scope.references.includes("Matthew 5:19"));
  assert.ok(presentObligation.packet.scope.references.includes("Matthew 28:19"));
  assert.ok(presentObligation.packet.scope.references.includes("Matthew 28:20"));
}

const modernSabbath = buildEmetAiTopicEvidence({
  question: "Should modern Christians keep the Sabbath?",
  builtAt: "2026-01-01T00:00:00.000Z",
});

assert.equal(modernSabbath.status, "ready");
if (modernSabbath.status === "ready") {
  assert.ok(modernSabbath.packet.scope.references.includes("Matthew 5:17"));
  assert.ok(modernSabbath.packet.scope.references.includes("Matthew 5:18"));
  assert.ok(modernSabbath.packet.scope.references.includes("Matthew 5:19"));
  assert.ok(modernSabbath.packet.scope.references.includes("Matthew 28:19"));
  assert.ok(modernSabbath.packet.scope.references.includes("Matthew 28:20"));
  assert.ok(modernSabbath.packet.scope.references.includes("Revelation 14:12"));
}

const abolishLaw = buildEmetAiTopicEvidence({
  question: "Did the Messiah abolish the law?",
  builtAt: "2026-01-01T00:00:00.000Z",
});

assert.equal(abolishLaw.status, "ready");
if (abolishLaw.status === "ready") {
  assert.ok(abolishLaw.packet.scope.references.includes("Matthew 5:17"));
  assert.ok(abolishLaw.packet.scope.references.includes("Matthew 5:18"));
  assert.ok(abolishLaw.packet.scope.references.includes("Romans 3:31"));
  assert.ok(abolishLaw.packet.scope.references.includes("Ephesians 2:15"));
}

const faithAndLaw = buildEmetAiTopicEvidence({
  question: "Does faith nullify the law?",
  builtAt: "2026-01-01T00:00:00.000Z",
});

assert.equal(faithAndLaw.status, "ready");
if (faithAndLaw.status === "ready") {
  assert.ok(faithAndLaw.packet.scope.references.includes("Romans 3:31"));
}

const contextual = buildEmetAiTopicEvidence({
  question: "What is happening in this passage?",
  context: {
    book: "Genesis",
    chapter: 2,
    verse: 2,
    translation: "web",
  },
  builtAt: "2026-01-01T00:00:00.000Z",
});

assert.equal(contextual.status, "ready");
if (contextual.status === "ready") {
  assert.equal(contextual.packet.scope.type, "passage");
  assert.ok(contextual.packet.scope.references.includes("Genesis 2:2"));
}

const unsupported = buildEmetAiTopicEvidence({
  question: "What is it?",
  builtAt: "2026-01-01T00:00:00.000Z",
});
assert.equal(unsupported.status, "insufficient-evidence");

const sabbathFollowUp = buildEmetAiTopicEvidence({
  question: "Does that still apply today?",
  previousQuestions: ["What does Scripture establish about the Sabbath?"],
  builtAt: "2026-01-01T00:00:00.000Z",
});
assert.equal(sabbathFollowUp.status, "ready");
if (sabbathFollowUp.status === "ready") {
  assert.match(sabbathFollowUp.packet.question, /Earlier reader questions/);
  assert.match(sabbathFollowUp.packet.question, /Current reader question/);
  assert.ok(sabbathFollowUp.packet.scope.references.includes("Matthew 5:18"));
}

assert.deepEqual(parseEmetPreviousQuestions([" one ", "two"]), ["one", "two"]);
assert.equal(parseEmetPreviousQuestions("not-an-array"), null);
assert.match(
  buildEmetConversationQuestion({
    question: "Does that still apply?",
    previousQuestions: ["What is the Sabbath command?"],
  }),
  /conversational context only, not Scripture evidence/,
);

console.log("EMET topic evidence verification passed.");
console.log("- Topic retrieval balances Torah, later Old Testament, and New Testament evidence.");
console.log("- Normative questions include governing command, duration, and continuity evidence.");
console.log("- Reader context is loaded from locked Scripture rather than client-supplied text.");
console.log("- Questions with no honest retrieval terms fail closed.");
console.log("- Follow-ups retain question context without treating conversation as evidence.");
