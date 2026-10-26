import "server-only";

import OpenAI from "openai";

import type { EmetConversationContext } from "../EmetAiConversation";
import type { EmetAiEvidencePacket } from "../EmetAiContract";
import {
  EMET_AI_SIMPLE_ANSWER_SCHEMA,
  parseEmetAiSimpleDraft,
  type EmetAiSimpleDraft,
} from "./EmetAiSimpleContract";

export type EmetAiSimpleUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export interface EmetAiSimpleProvider {
  model: string;
  generate(input: {
    question: string;
    candidatePacket: EmetAiEvidencePacket | null;
    conversation: EmetConversationContext | null;
  }): Promise<{ draft: EmetAiSimpleDraft | null; usage: EmetAiSimpleUsage; latencyMs: number; rawOutput: string }>;
}

export const EMET_AI_SIMPLE_SYSTEM_INSTRUCTION = `You are Ask EMET. Scripture is the authority for biblical claims.

Read Scripture as one continuous book from Genesis through Revelation. Begin with what the supplied Scripture positively establishes. Understand the Torah, Prophets, and Writings as the foundation for Messiah and the apostles; treat the passages as connected testimony rather than opposing theological systems. Reason cumulatively from the actual words and context, respecting who is speaking and what is being said.

Answer the actual question directly in one concise paragraph when possible. When several passages establish one conclusion together, state that synthesis clearly. Distinguish explicit text from inference. Do not invent theological exemptions or changes from silence or omission from a later list. The lack of a repeated New Testament command is not evidence of repeal or nonapplication. Likewise, do not use or mention the absence of an explicit repeal or exemption; derive the answer entirely from the positive governing and membership evidence. Never conclude that an instruction is nonbinding merely because the supplied texts do not explicitly command a modern Christian to follow it. For command-applicability questions, reason from the earliest foundation, the governing command, its original recipients, conditions and duration, Scripture's rules for joining or being included in the covenant people and promises, Messiah's relevant teaching, and the Bible's concluding testimony when those are supplied. A stated audience is not proof of exclusive scope. Distinguish a person becoming part of the covenant people from a command changing scope. Do not exclude people whom Scripture joins to the covenant people and promises, and do not call such incorporation a change in the command. When the verified evidence establishes both that a command governs the covenant people and that the people asked about are joined to or made fellow participants in that people and its promises, conclude that the command applies to them unless supplied Scripture explicitly establishes a relevant change. State that conclusion directly as yes or no; do not retreat to the absence of modern institutional wording. Cite and use the supplied incorporation evidence, Messiah's materially relevant command teaching, and final canonical testimony rather than silently dropping those premises. When the earliest-foundation group contains Genesis, begin the Scriptural chain with and cite that Genesis passage. When the required Messiah-command group is nonempty, explicitly state in the prose what Messiah said about commandments and life and cite that supplied passage. Do not independently search for or introduce a contradiction, repeal, exception, or controversy. Address an actual textual qualification when materially relevant.

Use the smallest sufficient set of materially relevant references in the verified evidence. Never invent quotations, citations, historical facts, or lexical identities. Do not put quotation marks around a paraphrase, compressed wording, or wording joined with an ellipsis. Keep distinct speakers, events, and passages distinct. If a clear conclusion follows, state it confidently without demanding a modern wording of the question in the ancient text. Leave limitations empty unless a concrete, material limitation prevents an answer. For lexical requests use only verified source evidence.`;

const VERIFIED_EVIDENCE_ONLY_SUFFIX = `

The supplied verified evidence is the finalized evidence set for this answer. Use only references and source-language identities present in it for material Scripture claims. Do not introduce another biblical reference from memory. If that evidence is insufficient, return insufficient-evidence and state the limitation.`;

function responseSchema() {
  return {
    type: "object",
    properties: {
      schemaVersion: { type: "string", const: EMET_AI_SIMPLE_ANSWER_SCHEMA },
      status: { type: "string", enum: ["complete", "insufficient-evidence"] },
      conclusion: { type: "string", enum: ["yes", "no", "qualified", "not-applicable"] },
      answer: { type: "string" },
      references: { type: "array", items: { type: "string" }, maxItems: 24 },
      lexicalAnalyses: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          properties: {
            reference: { type: "string" },
            corpus: { type: "string", enum: ["hebrew", "greek-nt", "lxx"] },
            lexicalId: { type: "string" },
            lemma: { type: "string" },
            transliteration: { type: "string" },
            meaning: { type: "string" },
          },
          required: ["reference", "corpus", "lexicalId", "lemma", "transliteration", "meaning"],
          additionalProperties: false,
        },
      },
      limitations: { type: "array", items: { type: "string" }, maxItems: 8 },
    },
    required: ["schemaVersion", "status", "conclusion", "answer", "references", "lexicalAnalyses", "limitations"],
    additionalProperties: false,
  } as const;
}

function compactConversation(conversation: EmetConversationContext | null) {
  if (!conversation) return null;
  return {
    recentExchanges: conversation.recentExchanges.slice(-4).map((exchange) => ({
      question: exchange.question,
      answer: exchange.answer.slice(0, 1_200),
      references: exchange.references.slice(0, 8),
      outcome: exchange.outcome,
    })),
    corrections: conversation.summary.corrections.slice(-3),
    establishedClaims: conversation.summary.establishedClaims.slice(-8).map((claim) => ({
      text: claim.text,
      scope: claim.scope,
      references: claim.references.slice(0, 6),
    })),
  };
}

export function compactEvidenceForSimpleAnswer(packet: EmetAiEvidencePacket | null) {
  if (!packet) return [];
  // Evidence packets are already bounded and verified. The former 16-item cap
  // silently hid decisive later verses in multi-passage ranges (for example,
  // the final timing verse of a sequence) while validation still saw them.
  return packet.evidence.slice(0, 72).map((item) => ({
    kind: item.kind,
    corpus: item.corpus,
    reference: item.reference || "",
    text: item.text,
    lexicalId: item.lexicalId || "",
  }));
}

function requiredApplicabilityEvidence(packet: EmetAiEvidencePacket | null) {
  if (!packet?.reasoning.commandApplicability) return null;
  const referencesMatching = (pattern: RegExp) => packet.evidence
    .flatMap((item) => (
      item.kind === "scripture" && typeof item.reference === "string" && pattern.test(item.text)
        ? [item.reference]
        : []
    ))
    .slice(0, 6);
  const sabbathQuestion = /\bsabbath\b/i.test(packet.question);
  const foundationReferences = sabbathQuestion
    ? referencesMatching(/\bseventh day\b.{0,140}\b(?:rested|blessed|sanctified)\b|\b(?:rested|blessed|sanctified)\b.{0,140}\bseventh day\b/i)
    : [];
  const genesisFoundation = foundationReferences.filter((reference) => reference.startsWith("Genesis "));
  return {
    earliestFoundation: genesisFoundation.length ? genesisFoundation.slice(0, 2) : foundationReferences.slice(0, 2),
    governingInstruction: sabbathQuestion
      ? referencesMatching(/\b(?:remember|observe|keep)\b.{0,100}\bSabbath\b|\bSabbath\b.{0,100}\b(?:holy|observe|keep)\b/i)
      : [],
    covenantMembership: referencesMatching(/\b(?:grafted|commonwealth of Israel|covenants? of (?:the )?promise|fellow citizens|heirs? according to promise|join themselves to Yahweh)\b/i),
    messiahCommandTeaching: referencesMatching(/\benter into life\b.{0,100}\bkeep the commandments\b/i),
    finalCanonicalTestimony: referencesMatching(/\b(?:tree of life|faith of Jesus|Jesus.? testimony)\b.{0,140}\bcommandments\b|\bcommandments\b.{0,140}\b(?:tree of life|faith of Jesus|Jesus.? testimony)\b/i),
  };
}
export function createEmetAiSimpleOpenAiProvider({
  model = process.env.EMET_AI_SIMPLE_MODEL?.trim() || "gpt-5.4-mini",
  reasoningEffort = process.env.EMET_AI_SIMPLE_REASONING_EFFORT?.trim() === "low" ? "low" : "none",
  verifiedEvidenceOnly = false,
}: {
  model?: string;
  reasoningEffort?: "none" | "low";
  verifiedEvidenceOnly?: boolean;
} = {}): EmetAiSimpleProvider | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey });
  return {
    model,
    async generate({ question, candidatePacket, conversation }) {
      const startedAt = performance.now();
      const response = await client.responses.create({
        model,
        store: false,
        reasoning: { effort: reasoningEffort },
        max_output_tokens: 1_800,
        input: [
          { role: "system", content: `${EMET_AI_SIMPLE_SYSTEM_INSTRUCTION}${verifiedEvidenceOnly ? VERIFIED_EVIDENCE_ONLY_SUFFIX : ""}` },
          {
            role: "user",
            content: JSON.stringify({
              question,
              conversation: compactConversation(conversation),
              verifiedCandidateEvidence: compactEvidenceForSimpleAnswer(candidatePacket),
              requiredApplicabilityEvidence: requiredApplicabilityEvidence(candidatePacket), // Every nonempty group is required.
              applicabilitySynthesisRequirement: candidatePacket?.reasoning.commandApplicability
                ? "A complete answer MUST cite and use at least one reference from every nonempty requiredApplicabilityEvidence group. Do not return complete while omitting any group."
                : "",
            }),
          },
        ],
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "emet_ai_simple_answer",
            strict: true,
            schema: responseSchema(),
          },
        },
      });
      const latencyMs = performance.now() - startedAt;
      const rawOutput = response.output_text || "";
      let parsed: unknown = null;
      try { parsed = rawOutput ? JSON.parse(rawOutput) : null; } catch { parsed = null; }
      const usage = response.usage;
      return {
        draft: response.status === "completed" ? parseEmetAiSimpleDraft(parsed) : null,
        rawOutput,
        latencyMs,
        usage: {
          inputTokens: usage?.input_tokens || 0,
          cachedInputTokens: usage?.input_tokens_details?.cached_tokens || 0,
          outputTokens: usage?.output_tokens || 0,
          reasoningTokens: usage?.output_tokens_details?.reasoning_tokens || 0,
          totalTokens: usage?.total_tokens || 0,
        },
      };
    },
  };
}
