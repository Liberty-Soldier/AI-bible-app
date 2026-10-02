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
} from "../app/lib/emet/EmetAiCache.ts";
import { answerFromEmetAiEvidence } from "../app/lib/emet/EmetAiService.ts";

const packet = {
  schemaVersion: EMET_AI_EVIDENCE_SCHEMA,
  question: "What does this word mean?",
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
  claims: [
    {
      text: "The word describes an expanse.",
      support: "direct",
      evidenceIds: ["lexical:word:hebrew:H7549"],
    },
    {
      text: "Genesis 1:8 identifies the expanse with the sky.",
      support: "direct",
      evidenceIds: ["scripture:Genesis.1.8"],
    },
  ],
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

const validGeneratedAnswer = {
  schemaVersion: EMET_AI_ANSWER_SCHEMA,
  status: "complete",
  answer: "The source evidence identifies this word with an expanse.",
  claims: [
    {
      text: "The lexical evidence identifies an expanse.",
      support: "direct",
      evidenceIds: ["lexical:word:hebrew:H7549"],
    },
  ],
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

const instruction = fs.readFileSync(
  path.join(process.cwd(), "app", "lib", "emet", "EmetAiConstitution.ts"),
  "utf8",
);
for (const required of [
  "Scripture is the sole authority",
  "The Old Testament supplies the scriptural foundation",
  "whole scriptural witness as coherent",
  "Hebrew, LXX Greek, and Greek New Testament identities remain distinct",
  "Every substantive claim must cite",
  "insufficient-evidence rather than guessing",
]) {
  assert.ok(instruction.includes(required), `Missing instruction: ${required}`);
}

console.log("EMET AI foundation verification passed.");
console.log("- Scripture-first constitution is versioned.");
console.log("- Word questions require a verified canonical lexical identity.");
console.log("- Fabricated citations and unsupported claims fail validation.");
console.log("- Ambiguous source identities fail closed.");
console.log("- Reader and EMET evidence require the same occurrence-owned identity.");
console.log("- Hebrew, LXX, and Greek NT identities stay corpus-scoped.");
console.log("- Equivalent questions reuse only identity-and-evidence-bound answers.");
console.log("- Invalid model citations fail closed before caching.");
