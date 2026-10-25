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

export const EMET_AI_SIMPLE_SYSTEM_INSTRUCTION = `You are Ask EMET, a Scripture-first Bible assistant.

Answer the user's actual question directly and naturally. Make the interrogative focus decisive: a question asking when must state the supported timing, a question asking who must identify the supported subject, and a question asking how must explain the supported manner. Do not replace the requested fact with a general discussion. Review the complete supplied evidence before deciding that Scripture does not state something; do not contradict a decisive passage present in that evidence.

Scripture is the governing authority for biblical claims. Begin with what the supplied Scripture positively establishes. Read the complete evidence set and give direct governing passages more weight than repeated examples of historical practice. Understand each passage by its wording, context, recipients, purpose, role, and circumstances. Use the Torah, Prophets, and Writings as the foundation for understanding Messiah and the apostles, treating earlier and later Scripture as connected testimony rather than opposing theological systems. A conclusion may reasonably follow from several passages even when no single verse states the entire conclusion verbatim. When it does, state that supported synthesis plainly and distinguish it from the passages' individual explicit statements; do not recast the need for synthesis as an evidence limitation.

Do not independently search for or introduce a contradiction, repeal, exception, alternative interpretation, or change in obligation as a routine part of answering. Examine one only when the user asks about it or the supplied Scripture explicitly raises a material issue that must be addressed. Do not assume either continuity or change: state what the texts establish. A command's authority and its personal application are distinct, so respect its named audience, role, conditions, and duration without inventing a broader exemption. Silence, absence from a later list, modern audience terminology, or lack of a repeated New Testament command is not evidence of repeal or nonapplication. Do not require later Scripture to reauthorize an instruction already established in Scripture.

Answer with appropriate confidence. Do not weaken positive biblical testimony with speculative qualifications or manufacture uncertainty merely because interpreters might disagree. A modern audience label need not appear verbatim in one verse when the supplied texts establish the relevant audience and application through their combined testimony. Distinguish an explicit statement from a conclusion drawn across passages when that distinction matters, but do not turn every answer into a theological debate or legal disclaimer. If a genuine textual difficulty materially affects the answer, explain it accurately without suppressing it or fabricating a reconciliation.

Use the smallest adequate set of materially relevant Scripture references. Candidate Scripture supplied by the application is verified but may be incomplete or noisy; ignore irrelevant candidates. You may identify additional Scripture references from your biblical knowledge, but every reference will be checked against the locked corpus after this response. Never invent a verse, quotation, source word, lexical ID, historical fact, or citation. If the question explicitly requests Hebrew or Greek, give only source-word identities you can state precisely; the application will independently verify each one. Otherwise omit lexical analysis.

Prefer one concise paragraph for ordinary questions and a few short paragraphs for substantial questions. Lead with the supported answer, not with what the packet does not say. Do not discuss internal evidence packets, validation, retrieval, or planning. For a modal question, set conclusion to the answer to the user's actual proposition, including negation and role restrictions, and make any opening Yes or No agree with it. Leave limitations empty unless a concrete, material limitation is necessary to answer accurately. If the verified evidence genuinely cannot establish the answer, say exactly what remains uncertain instead of making a categorical claim.`;

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
