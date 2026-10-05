import assert from "node:assert/strict";

import {
  buildEmetConversationContext,
  buildEmetConversationQuestion,
  parseEmetConversationContext,
  relevantEmetConversation,
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

const sabbathConversation = buildEmetConversationContext([
  {
    question: "What does Scripture establish about the Sabbath?",
    answer: "Unsupported prior prose mentions Sukkot and Leviticus 23:34.",
    references: ["Exodus 20:8", "Exodus 20:10"],
  },
]);
const sabbathFollowUp = buildEmetAiTopicEvidence({
  question: "Does that still apply today?",
  conversation: sabbathConversation,
  builtAt: "2026-01-01T00:00:00.000Z",
});
assert.equal(sabbathFollowUp.status, "ready");
if (sabbathFollowUp.status === "ready") {
  assert.match(sabbathFollowUp.packet.question, /Conversation context/);
  assert.match(sabbathFollowUp.packet.question, /Current reader question/);
  assert.ok(sabbathFollowUp.packet.scope.references.includes("Matthew 5:18"));
  assert.ok(!sabbathFollowUp.packet.scope.references.includes("Leviticus 23:34"));
}

const longStudy = buildEmetConversationContext(
  Array.from({ length: 12 }, (_, index) => ({
    question:
      index === 0
        ? "What is Sukkot?"
        : `Sukkot study follow-up ${index + 1}`,
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
    conversation: sabbathConversation,
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

function references(result) {
  return result.status === "ready" ? result.packet.scope.references : [];
}

const jeremiahSukkot = buildEmetAiTopicEvidence({
  question: "What is the Feast of Tabernacles?",
  context: { book: "Jeremiah", chapter: 7, translation: "web" },
});
assert.equal(jeremiahSukkot.status, "ready");
assert.ok(!references(jeremiahSukkot).some((item) => item.startsWith("Jeremiah 7:")));
assert.ok(references(jeremiahSukkot).includes("Leviticus 23:34"));

const jeremiahVerseFive = buildEmetAiTopicEvidence({
  question: "What does verse 5 mean?",
  context: { book: "Jeremiah", chapter: 7, translation: "web" },
});
assert.ok(references(jeremiahVerseFive).includes("Jeremiah 7:5"));

const jeremiahTemple = buildEmetAiTopicEvidence({
  question: "What did Jeremiah teach about the temple?",
  context: { book: "Jeremiah", chapter: 7, translation: "web" },
});
assert.ok(references(jeremiahTemple).some((item) => item.startsWith("Jeremiah 7:")));

const genesisAtonement = buildEmetAiTopicEvidence({
  question: "What is the Day of Atonement?",
  context: { book: "Genesis", chapter: 1, translation: "web" },
});
assert.ok(!references(genesisAtonement).some((item) => item.startsWith("Genesis 1:")));
assert.ok(references(genesisAtonement).includes("Leviticus 23:27"));

const leviticusSukkot = buildEmetAiTopicEvidence({
  question: "What is the Feast of Tabernacles?",
  context: { book: "Leviticus", chapter: 23, translation: "web" },
});
assert.ok(references(leviticusSukkot).includes("Leviticus 23:34"));

const topicSwitch = buildEmetAiTopicEvidence({
  question: "What does Scripture teach about resurrection?",
  conversation: longStudy,
});
assert.ok(references(topicSwitch).includes("John 11:25"));
assert.ok(!references(topicSwitch).includes("Leviticus 23:34"));

console.log("EMET topic evidence verification passed.");
console.log("- Topic retrieval balances Torah, later Old Testament, and New Testament evidence.");
console.log("- Normative questions include governing command, duration, and continuity evidence.");
console.log("- Reader context is loaded from locked Scripture rather than client-supplied text.");
console.log("- Questions with no honest retrieval terms fail closed.");
console.log("- Follow-ups retain question context without treating conversation as evidence.");
console.log("- Independent questions exclude incidental Reader and prior-chat context.");
console.log("- Eight recent exchanges plus an older structured summary preserve study continuity.");
