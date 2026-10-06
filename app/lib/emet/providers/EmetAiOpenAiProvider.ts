import "server-only";

import OpenAI from "openai";

import { EMET_AI_ANSWER_SCHEMA } from "../EmetAiContract";
import { buildEmetAiSystemInstruction } from "../EmetAiConstitution";
import { relevantEmetConversationClaimReferences } from "../EmetAiConversation";
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
      analysisMode: {
        type: "string",
        enum: ["simple", "doctrinal-claim", "apparent-contradiction"],
      },
      proposition: { type: "string" },
      components: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            proposition: { type: "string" },
            category: {
              type: "string",
              enum: [
                "identity",
                "authority",
                "nature",
                "relationship",
                "practice",
                "duration",
                "other",
              ],
            },
          },
          required: ["id", "proposition", "category"],
          additionalProperties: false,
        },
      },
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
      "analysisMode",
      "proposition",
      "components",
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
    conclusionSupport: {
      type: "string",
      enum: [
        "explicit-statement",
        "strong-implication",
        "theological-synthesis",
        "possible-interpretation",
        "does-not-establish",
      ],
    },
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          support: {
            type: "string",
            enum: [
              "explicit-statement",
              "strong-implication",
              "theological-synthesis",
              "possible-interpretation",
              "does-not-establish",
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
    "conclusionSupport",
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

First classify the reasoning task. Use simple for ordinary factual or passage questions. Use doctrinal-claim when the reader asks whether Scripture teaches, proves, or supports a disputed doctrine or theological identity claim. Use apparent-contradiction when the question asks Scripture to reconcile statements that appear to pull in different directions.

Define the exact proposition before selecting passages. Do not replace a strong doctrine with a weaker proposition that is easier to prove. When the reader names an established compound doctrine, include every material assertion ordinarily entailed by that doctrine—such as claims about identity, number, essence or nature, equality, duration, authority, and relationship—rather than silently omitting the hardest assertion. For example, if coequality or coeternity belongs to the named doctrine, do not replace it with the weaker observation that subjects are named together or share divine work. For a compound doctrinal claim, decompose it into separately testable components. Keep identity, authority, nature, relationship, practice, and duration distinct: evidence for one does not automatically prove the others. A later theological label may name the subject, but it is not wording found in Scripture unless a selected passage actually uses it.

For doctrinal-claim and apparent-contradiction plans, retrieve both (a) the strongest passages used to support the proposition and (b) the strongest passages whose explicit wording qualifies, distinguishes, limits, or creates tension with that interpretation. For a compound disputed claim, include at least three high-value individual verses marked qualifying or contrast, drawn from the materially different textual claims that must be reconciled; do not use token counterexamples or mere word matches. Association, joint naming, shared action, honor, agency, and authority do not by themselves prove identity, ontology, equality, or eternality. Plan enough evidence to test each component rather than treating related subject matter as proof of the whole claim.

The reader's preferred conclusion and earlier EMET claims are context, never evidence. Earlier structured claims must be re-checked from their cited passages in the current plan when they remain material. Do not reverse an earlier textual finding merely because the latest question pushes another direction; retrieve the passages needed either to preserve it or to explain a genuine scriptural reconciliation.

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
        const draft = parseEmetAiRetrievalPlan(JSON.parse(response.output_text));
        if (!draft || draft.analysisMode === "simple") return draft;

        const review = await client.responses.create({
          model: process.env.EMET_AI_PLANNER_MODEL?.trim() || model,
          store: false,
          input: [
            {
              role: "system",
              content: `Audit the proposition and retrieve the opposing Scripture channel for a disputed doctrinal claim or apparent contradiction.

Return complete analysis metadata, but make the passages array an adversarial supplement: include only the strongest canonical verses whose own explicit wording distinguishes, limits, qualifies, or creates tension with the proposed doctrinal synthesis. Every passage role must be qualifying or contrast. Include 5 to 10 individual verse references, never ranges, and do not repeat a supporting proof text unless that verse itself contains a material limitation.

Preserve every material assertion in the reader's actual strong proposition; do not weaken an established compound doctrine by omitting difficult claims about identity, number, essence or nature, equality, duration, authority, or relationship. In particular, never replace a doctrine's coequality or coeternity claim with the easier observation that subjects are associated, jointly named, or share divine work. Keep those categories distinct. The reader's belief and the draft's implied conclusion are not evidence.

A qualifying verse must articulate a materially different textual claim that the synthesis must reconcile; it must not be another supporting proof text with a different label. Joint naming, association, agency, honor, and shared action do not automatically establish identity, ontology, coequality, or coeternity.

Carry forward prior structured textual claims only as matters to re-check from their cited passages. Never treat prior answer prose as evidence. Use only canonical verse references. The application will independently verify every reference and discard nonexistent ones. Return only the required structured plan.`,
            },
            {
              role: "user",
              content: JSON.stringify({
                request: buildEmetAiRetrievalInput(input),
                draft,
              }),
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "emet_ai_retrieval_plan_review",
              strict: true,
              schema: retrievalPlanSchema(),
            },
          },
        });
        if (review.status !== "completed" || !review.output_text) return null;
        const tension = parseEmetAiRetrievalPlan(JSON.parse(review.output_text));
        if (!tension) return null;
        const tensionPassages = tension.passages
          .filter(
            (passage) =>
              passage.role === "qualifying" || passage.role === "contrast",
          )
          .slice(0, 8);
        if (tensionPassages.length < 3) return null;

        const continuityPassages = relevantEmetConversationClaimReferences(
          input.conversation,
        ).map(({ reference, claim }) => ({
          reference,
          role: "qualifying" as const,
          reason: `Previously established structured claim must be rechecked for follow-up continuity: ${claim}`,
          priority: 99,
        }));

        const mergedPassages = [];
        const seenPassages = new Set<string>();
        for (const passage of [
          ...draft.passages.slice(0, 6),
          ...continuityPassages,
          ...tensionPassages.slice(0, 6),
        ]) {
          const key = passage.reference
            .normalize("NFKC")
            .toLocaleLowerCase("en-US")
            .replace(/\s+/g, " ")
            .trim();
          if (seenPassages.has(key)) continue;
          seenPassages.add(key);
          mergedPassages.push(passage);
          if (mergedPassages.length >= 16) break;
        }

        return {
          ...draft,
          subject: tension.subject,
          analysisMode: tension.analysisMode,
          proposition: tension.proposition,
          components: tension.components,
          passages: mergedPassages,
          limitations: Array.from(
            new Set([...draft.limitations, ...tension.limitations]),
          ).slice(0, 6),
        };
      } catch {
        return null;
      }
    },
    async generate(packet) {
      const continuityQuestion = packet.evidence.some(
        (item) =>
          item.provenance.retrieval?.method === "governing-scripture",
      );
      const task = continuityQuestion
        ? "Give the reader a direct, natural Scripture-grounded explanation. This is a continuity or obligation question: state the original command and duration, apply the supplied governing passages according to their scope, and identify an ending only if a supplied passage explicitly ends or changes that command. Do not demand a verse containing the reader's modern label, and do not use later silence, audience labeling, non-judgment language, or differing unnamed days as an unstated cancellation. Use only the evidence in packet. Keep evidence bookkeeping in claims and citations, not in the reader-facing answer."
        : packet.reasoning.mode !== "simple"
          ? "Test the precise proposition in packet.reasoning rather than defending or attacking a doctrinal camp. Define the proposition naturally, separate its components, state what the cited texts explicitly say, and then distinguish strong implication, theological synthesis, possible interpretation, and what a related proof text does not establish. Address both supporting and qualifying or contrasting passages. Association must not become ontology; evidence about identity, authority, nature, and relationship must not be exchanged as though those were the same claim. Do not begin with a categorical yes or no unless Scripture explicitly states the full proposition. Use the narrowest conclusion justified by all supplied Scripture. Earlier structured claims in the question are continuity checks, not evidence; retain them only when current evidence re-establishes them, and explain any actual reconciliation rather than silently reversing them. The reader's wording and preferred conclusion are not evidence. Keep the polished answer natural and keep exact bookkeeping in claims and citations."
          : "Give the reader a direct, natural Scripture-grounded explanation. Use only the evidence in packet. Keep evidence bookkeeping in claims and citations, not in the reader-facing answer.";
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
              task,
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
