import "server-only";

import OpenAI from "openai";

import { EMET_AI_ANSWER_SCHEMA } from "../EmetAiContract";
import { buildEmetAiSystemInstruction } from "../EmetAiConstitution";
import {
  buildEmetAiRetrievalInput,
  EMET_AI_RETRIEVAL_PLAN_SCHEMA,
  parseEmetAiRetrievalPlan,
} from "../EmetAiRetrievalPlan";
import type { EmetAiProvider } from "../EmetAiService";

function retrievalPlanSchema() {
  return {
    type: "object",
    properties: {
      schemaVersion: {
        type: "string",
        enum: [EMET_AI_RETRIEVAL_PLAN_SCHEMA],
      },
      subject: { type: "string" },
      intent: {
        type: "string",
        enum: [
          "identity",
          "meaning",
          "event",
          "relationship",
          "continuity",
          "comparison",
          "application",
          "passage",
          "other",
        ],
      },
      passages: {
        type: "array",
        maxItems: 16,
        items: {
          type: "object",
          properties: {
            reference: { type: "string" },
            role: {
              type: "string",
              enum: [
                "direct",
                "foundation",
                "later-witness",
                "qualifying",
                "contrast",
                "context",
              ],
            },
            reason: { type: "string" },
            priority: { type: "integer", minimum: 1, maximum: 100 },
          },
          required: ["reference", "role", "reason", "priority"],
          additionalProperties: false,
        },
      },
      sourcePhrases: {
        type: "array",
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            corpus: {
              type: "string",
              enum: ["hebrew", "lxx", "greek-nt"],
            },
            label: { type: "string" },
            lexicalIds: {
              type: "array",
              maxItems: 6,
              items: { type: "string" },
            },
            lemmas: {
              type: "array",
              maxItems: 6,
              items: { type: "string" },
            },
            reason: { type: "string" },
          },
          required: ["corpus", "label", "lexicalIds", "lemmas", "reason"],
          additionalProperties: false,
        },
      },
      limitations: {
        type: "array",
        maxItems: 6,
        items: { type: "string" },
      },
    },
    required: [
      "schemaVersion",
      "subject",
      "intent",
      "passages",
      "sourcePhrases",
      "limitations",
    ],
    additionalProperties: false,
  } as const;
}

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
            enum: [
              "direct",
              "scriptural-synthesis",
              "scriptural-inference",
            ],
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
    async plan(input) {
      const response = await client.responses.create({
        model: process.env.EMET_AI_PLANNER_MODEL?.trim() || model,
        store: false,
        input: [
          {
            role: "system",
            content: `You are the Scripture retrieval planner for EMETSEES.

Your output is a search plan, never an answer and never evidence. Identify the biblical subject and propose the smallest set of passages that can honestly answer the current question. Read Scripture canonically: include the necessary earlier foundation, the most direct passage, relevant later witness, and any passage that materially qualifies the conclusion. Do not select verses merely because they repeat a common English word.

Use reader location, a named book, and prior questions to resolve what the reader means, not to restrict retrieval to that chapter or book. A new subject overrides earlier context. Unless the reader explicitly asks for only one passage, search the whole canon for the necessary evidence. Return individual verse references in the form "Genesis 6:2", never ranges. Prefer 5 to 10 high-value verses and never pad the plan with weak matches. Priority 100 means most important and 1 means least important.

For identity, relationship, comparison, and event questions, deliberately check three channels: (1) the anchor passage in context, (2) other passages using the same source-language phrase or identifying description, and (3) later passages describing the same distinctive actors, actions, setting, and judgment even when they use different English vocabulary. Include a connection only when it materially helps answer the question, and mark a qualifying passage when Scripture does not explicitly name the connection.

Do not stop at identical labels. A later passage may recall an earlier event through a cluster such as actor class, transgression, punishment, chronology, named people, and surrounding judgment. When two or more distinctive features overlap, include the strongest retrospective passages as later-witness or qualifying evidence so the answer can distinguish an explicit identification from a supported canonical inference.

For obligation, law, covenant, or continuity questions, the plan must include: the original command or institution, its named audience, its stated duration or end condition, later governing statements about the law or commandments as a class, application passages, and the strongest texts commonly claimed to change or qualify it. Omission from a later list is not an explicit cancellation. A passage about judgment, justification, or differing practices must be marked qualifying unless its own wording explicitly ends the command being asked about.

When a repeated source-language phrase is materially relevant, add a source phrase hypothesis. Supply verified-looking Strong IDs when known (for example H1121), and/or normalized Hebrew or Greek lemmas. Leave an unknown array empty. Do not use an English gloss as if it proved a source identity. The application will independently validate every reference and source sequence and will discard anything that does not exist in its locked data.

Do not use denominational doctrine, consensus, or historical literature as proof. Do not put noncanonical references in passages. If the question asks about historical literature, record that limitation; EMETSEES handles such sources separately.

Give short retrieval reasons. Return only the required structured plan.`,
          },
          {
            role: "user",
            content: JSON.stringify(buildEmetAiRetrievalInput(input)),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "emet_ai_retrieval_plan",
            strict: true,
            schema: retrievalPlanSchema(),
          },
        },
      });

      if (response.status !== "completed" || !response.output_text) {
        return null;
      }

      try {
        return parseEmetAiRetrievalPlan(JSON.parse(response.output_text));
      } catch {
        return null;
      }
    },
    async generate(packet) {
      const continuityQuestion = packet.evidence.some(
        (item) =>
          item.provenance.retrieval?.method === "governing-scripture",
      );
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
              task: continuityQuestion
                ? "Give the reader a direct, natural Scripture-grounded explanation. This is a continuity or obligation question: state the original command and duration, apply the supplied governing passages according to their scope, and identify an ending only if a supplied passage explicitly ends or changes that command. Do not demand a verse containing the reader's modern label, and do not use later silence, audience labeling, non-judgment language, or differing unnamed days as an unstated cancellation. Use only the evidence in packet. Keep evidence bookkeeping in claims and citations, not in the reader-facing answer."
                : "Give the reader a direct, natural Scripture-grounded explanation. Use only the evidence in packet. Keep evidence bookkeeping in claims and citations, not in the reader-facing answer.",
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
