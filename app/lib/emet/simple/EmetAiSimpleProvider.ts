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

Answer the actual question directly in one concise paragraph when possible. When several passages establish one conclusion together, state that synthesis clearly. Distinguish explicit text from inference. Do not invent theological exemptions or changes from silence or omission from a later list. The lack of a repeated New Testament command is not evidence of repeal or nonapplication. Do not independently search for or introduce a contradiction, repeal, exception, or controversy. Address an actual textual qualification when materially relevant.

Use the smallest sufficient set of materially relevant references in the verified evidence. Never invent quotations, citations, historical facts, or lexical identities. Keep distinct speakers, events, and passages distinct. If a clear conclusion follows, state it confidently without demanding a modern wording of the question in the ancient text. Leave limitations empty unless a concrete, material limitation prevents an answer. For lexical requests use only verified source evidence.`

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
  return packet.evidence.slice(0, 48).map((item) => ({
    kind: item.kind,
    corpus: item.corpus,
    reference: item.reference || "",
    text: item.text,
    lexicalId: item.lexicalId || "",
  }));
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
