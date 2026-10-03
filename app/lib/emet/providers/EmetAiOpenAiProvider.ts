import "server-only";

import OpenAI from "openai";

import { EMET_AI_ANSWER_SCHEMA } from "../EmetAiContract";
import { buildEmetAiSystemInstruction } from "../EmetAiConstitution";
import type { EmetAiProvider } from "../EmetAiService";

function answerSchema(evidenceIds: string[]) {
  return {
  type: "object",
  properties: {
    schemaVersion: {
      type: "string",
      enum: [EMET_AI_ANSWER_SCHEMA],
    },
    status: {
      type: "string",
      enum: ["complete", "insufficient-evidence"],
    },
    answer: { type: "string" },
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          support: {
            type: "string",
            enum: ["direct", "scriptural-synthesis"],
          },
          evidenceIds: {
            type: "array",
            items: { type: "string", enum: evidenceIds },
          },
        },
        required: ["text", "support", "evidenceIds"],
        additionalProperties: false,
      },
    },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          evidenceId: { type: "string", enum: evidenceIds },
          reference: { type: "string" },
        },
        required: ["evidenceId", "reference"],
        additionalProperties: false,
      },
    },
    limitations: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "schemaVersion",
    "status",
    "answer",
    "claims",
    "citations",
    "limitations",
  ],
  additionalProperties: false,
  } as const;
}

export function createEmetAiOpenAiProvider(): EmetAiProvider | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.EMET_AI_MODEL?.trim();
  if (!apiKey || !model) return null;

  const client = new OpenAI({ apiKey });

  return {
    model,
    async generate(packet) {
      const response = await client.responses.create({
        model,
        store: false,
        input: [
          {
            role: "system",
            content: buildEmetAiSystemInstruction(),
          },
          {
            role: "user",
            content: JSON.stringify({
              task:
                "Give the reader a direct, natural Scripture-grounded explanation. Use only the evidence in packet. Keep evidence bookkeeping in claims and citations, not in the reader-facing answer.",
              packet,
            }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "emet_ai_answer",
            strict: true,
            schema: answerSchema(packet.evidence.map((item) => item.id)),
          },
        },
      });

      if (response.status !== "completed" || !response.output_text) {
        return null;
      }

      try {
        return JSON.parse(response.output_text) as unknown;
      } catch {
        return null;
      }
    },
  };
}
