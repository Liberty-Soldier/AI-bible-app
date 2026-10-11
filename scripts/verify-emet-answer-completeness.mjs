import assert from "node:assert/strict";

import {
  classifyEmetAiConcreteAnswerRequirement,
  validateEmetAiConcreteAnswer,
  validateEmetAiScriptureOnlyFraming,
} from "../app/lib/emet/EmetAiAnswerCompleteness.ts";

const evidence = [
  {
    kind: "scripture",
    text: "You shall not murder. You shall not commit adultery. You shall not steal. You shall not give false testimony.",
  },
];

assert.equal(
  classifyEmetAiConcreteAnswerRequirement("What commandments should I keep?"),
  "enumeration",
);
assert.equal(
  classifyEmetAiConcreteAnswerRequirement("How do I keep the Sabbath?"),
  "procedure",
);
assert.match(
  validateEmetAiConcreteAnswer({
    question: "What commandments should I keep?",
    answer: "Keep Yahweh's commandments and observe all the laws he gives.",
    evidence,
  }) || "",
  /concrete items or categories/,
);
assert.match(
  validateEmetAiScriptureOnlyFraming({
    question: "Does the Bible teach that the earth revolves around the sun?",
    answer: "The text merely uses phenomenological language from an earthbound perspective.",
  }) || "",
  /Scripture-only question/,
);
assert.match(
  validateEmetAiScriptureOnlyFraming({
    question: "What does Scripture teach? Do not introduce modern scientific claims.",
    answer: "The passages describe the world as it appears from human vantage.",
  }) || "",
  /Scripture-only question/,
);
assert.equal(
  validateEmetAiScriptureOnlyFraming({
    question: "Compare the biblical descriptions with modern astronomy.",
    answer: "Modern astronomy supplies an external mechanical model.",
  }),
  null,
);
assert.equal(
  validateEmetAiConcreteAnswer({
    question: "What commandments should I keep?",
    answer: "Do not murder, commit adultery, steal, or give false testimony.",
    evidence,
  }),
  null,
);
assert.match(
  validateEmetAiConcreteAnswer({
    question: "What are the Ten Commandments?",
    answer: "They are the covenant words written on stone, beginning with having no other gods.",
    evidence,
  }) || "",
  /named multi-item list|concrete items or categories/,
);

console.log("EMET answer-completeness verification passed.");
console.log("- Enumeration and procedure questions require concrete Scripture-derived information.");
console.log("- Circular restatements fail deterministic validation.");
