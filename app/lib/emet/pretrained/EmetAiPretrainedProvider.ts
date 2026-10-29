import "server-only";

import OpenAI from "openai";

import type { EmetConversationContext } from "../EmetAiConversation";
import type { EmetAiReaderContext } from "../EmetAiTopicEvidence";
import {
  EMET_AI_PRETRAINED_MODEL,
  EMET_AI_PRETRAINED_REASONING_EFFORT,
  EMET_AI_PRETRAINED_RESPONSE_JSON_SCHEMA,
  parseEmetAiPretrainedDraft,
  type EmetAiPretrainedDraft,
  type EmetAiPretrainedUsage,
} from "./EmetAiPretrainedContract";

export const EMET_AI_PRETRAINED_SYSTEM_INSTRUCTION = [
  "You are EMET, a Scripture-first biblical research assistant.",
  "Answer the user's actual question directly and proportionately.",
  "Use your existing knowledge of Scripture to identify the passages most relevant to the question.",
  "Begin with the Torah and Prophets when they establish the governing instruction, definition, historical foundation, or promise. Read later Scripture in its own context and in relationship to those earlier passages.",
  "Treat Scripture as a coherent collection of writings. Do not invent contradictions, repeals, permissions, or theological distinctions that the cited passages do not establish.",
  "Do not assume that a popular theological interpretation is an explicit biblical statement.",
  "Distinguish what Scripture explicitly states from conclusions reached through interpretation.",
  "Consider the speaker, audience, subject, circumstances, and immediate context of each passage.",
  "For lexical questions, identify the relevant original-language term and its context-dependent meanings.",
  "Answer simple questions simply. Give longer explanations only when the question requires them.",
  "Supply the most directly relevant references. Do not invent quotations or citations.",
  "If the available evidence does not establish a conclusion, state that limitation clearly.",
].join("\n\n");

export type EmetAiPretrainedGeneration = {
  draft: EmetAiPretrainedDraft | null;
  rawOutput: string;
  latencyMs: number;
  usage: EmetAiPretrainedUsage;
  estimatedCostUsd: number;
  failureReason: string | null;
};

export type EmetAiPretrainedProvider = {
  model: string;
  generate(input: {
    question: string;
    conversation: EmetConversationContext | null;
    context: EmetAiReaderContext | null;
  }): Promise<EmetAiPretrainedGeneration>;
};

const ESTIMATED_BLENDED_USD_PER_TOKEN = 0.0176 / 11_977;

function compactConversation(conversation: EmetConversationContext | null) {
  if (!conversation) return null;
  return {
    summary: conversation.summary,
    recentExchanges: conversation.recentExchanges.map((exchange) => ({
      question: exchange.question,
      answer: exchange.answer,
      references: exchange.references,
      outcome: exchange.outcome,
    })),
  };
}

function emptyUsage(): EmetAiPretrainedUsage {
  return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 };
}

export function createEmetAiPretrainedProvider({
  model = EMET_AI_PRETRAINED_MODEL,
}: { model?: string } = {}): EmetAiPretrainedProvider | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey });
  return {
    model,
    async generate({ question, conversation, context }) {
      const startedAt = performance.now();
      const response = await client.responses.create({
        model,
        store: false,
        reasoning: { effort: EMET_AI_PRETRAINED_REASONING_EFFORT },
        max_output_tokens: 1_800,
        input: [
          { role: "system", content: EMET_AI_PRETRAINED_SYSTEM_INSTRUCTION },
          {
            role: "user",
            content: JSON.stringify({
              question,
              conversation: compactConversation(conversation),
              readerContext: context,
              outputRequirement: "Return the required structured fields. Claims are concise auditable explanations, not private chain-of-thought. Use exact Book chapter:verse references.",
            }),
          },
        ],
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "emet_pretrained_stage_a",
            strict: true,
            schema: EMET_AI_PRETRAINED_RESPONSE_JSON_SCHEMA,
          },
        },
      });
      const rawOutput = response.output_text || "";
      let parsed: unknown = null;
      try {
        parsed = rawOutput ? JSON.parse(rawOutput) : null;
      } catch {
        parsed = null;
      }
      const usage: EmetAiPretrainedUsage = response.usage ? {
        inputTokens: response.usage.input_tokens || 0,
        cachedInputTokens: response.usage.input_tokens_details?.cached_tokens || 0,
        outputTokens: response.usage.output_tokens || 0,
        reasoningTokens: response.usage.output_tokens_details?.reasoning_tokens || 0,
        totalTokens: response.usage.total_tokens || 0,
      } : emptyUsage();
      const draft = response.status === "completed" ? parseEmetAiPretrainedDraft(parsed) : null;
      return {
        draft,
        rawOutput,
        latencyMs: performance.now() - startedAt,
        usage,
        estimatedCostUsd: usage.totalTokens * ESTIMATED_BLENDED_USD_PER_TOKEN,
        failureReason: draft ? null : response.status === "completed" ? "malformed-model-output" : `provider-${response.status}`,
      };
    },
  };
}
