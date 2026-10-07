import "server-only";

import OpenAI from "openai";

import {
  EMET_AI_ANSWER_SCHEMA,
  parseEmetAiAnswer,
  validateEmetAiAnswer,
} from "../EmetAiContract";
import { buildEmetAiSystemInstruction } from "../EmetAiConstitution";
import { relevantEmetConversationClaimReferences } from "../EmetAiConversation";
import {
  buildEmetAiRetrievalInput,
  EMET_AI_RETRIEVAL_PLAN_SCHEMA,
  parseEmetAiRetrievalPlan,
} from "../EmetAiRetrievalPlan";
import type { EmetAiProvider } from "../EmetAiService";

const reasoningCategoryValues = [
  "identity", "authority", "nature", "relationship", "practice", "duration",
  "command", "covenant", "covenant-participants", "priesthood", "mediator",
  "sanctuary", "sacrifice", "promise", "timing", "prophecy", "chronology",
  "event", "application", "other",
] as const;
const claimSupportValues = [
  "explicit-statement", "strong-implication", "theological-synthesis",
  "possible-interpretation", "does-not-establish",
] as const;
const timingValues = [
  "not-applicable", "promised", "inaugurated", "presently-operating",
  "transitioning", "fulfilled", "awaiting-full-realization", "uncertain",
] as const;

const unsolicitedContinuityQualifierReferences = [
  { reference: "Acts 15:19", names: ["acts 15"] },
  { reference: "Acts 15:28", names: ["acts 15"] },
  { reference: "Acts 15:29", names: ["acts 15"] },
  { reference: "Romans 6:14", names: ["romans 6", "rom 6"] },
  { reference: "Romans 7:4", names: ["romans 7", "rom 7"] },
  { reference: "Romans 7:6", names: ["romans 7", "rom 7"] },
  { reference: "Romans 14:5", names: ["romans 14", "rom 14"] },
  { reference: "1 Corinthians 9:20", names: ["1 corinthians 9", "1 cor 9"] },
  { reference: "2 Corinthians 3:7", names: ["2 corinthians 3", "2 cor 3"] },
  { reference: "Galatians 3:19", names: ["galatians 3", "gal 3"] },
  { reference: "Galatians 3:24", names: ["galatians 3", "gal 3"] },
  { reference: "Galatians 3:25", names: ["galatians 3", "gal 3"] },
  { reference: "Galatians 4:10", names: ["galatians 4", "gal 4"] },
  { reference: "Colossians 2:16", names: ["colossians 2", "col 2"] },
] as const;

function isUnsolicitedContinuityQualifier(
  question: string,
  reference: string,
) {
  const normalizedQuestion = question
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const match = unsolicitedContinuityQualifierReferences.find(
    (item) => item.reference === reference,
  );
  return Boolean(
    match &&
      !match.names.some((name) => normalizedQuestion.includes(name)),
  );
}

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
      requiresScopeAnalysis: { type: "boolean" },
      requiresTimeline: { type: "boolean" },
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
              enum: reasoningCategoryValues,
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
      "requiresScopeAnalysis",
      "requiresTimeline",
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
      enum: claimSupportValues,
    },
    componentChecks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          componentId: { type: "string" },
          support: { type: "string", enum: claimSupportValues },
          explanation: { type: "string" },
          evidenceIds: {
            type: "array",
            items: { type: "string", enum: evidenceIds },
          },
        },
        required: ["componentId", "support", "explanation", "evidenceIds"],
        additionalProperties: false,
      },
    },
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          support: {
            type: "string",
            enum: claimSupportValues,
          },
          category: { type: "string", enum: reasoningCategoryValues },
          polarity: {
            type: "string",
            enum: ["affirms", "denies", "qualifies"],
          },
          scope: { type: "string" },
          timing: { type: "string", enum: timingValues },
          evidenceIds: {
            type: "array",
            items: { type: "string", enum: evidenceIds },
          },
        },
        required: [
          "id", "text", "support", "category", "polarity", "scope",
          "timing", "evidenceIds",
        ],
        additionalProperties: false,
      },
    },
    continuityChecks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          propositionId: { type: "string" },
          verdict: {
            type: "string",
            enum: ["preserved", "narrowed", "reconciled", "unresolved-conflict"],
          },
          explanation: { type: "string" },
          evidenceIds: {
            type: "array",
            items: { type: "string", enum: evidenceIds },
          },
        },
        required: ["propositionId", "verdict", "explanation", "evidenceIds"],
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
    "componentChecks",
    "claims",
    "continuityChecks",
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

First classify the reasoning task. Use simple for ordinary factual or passage questions. Use doctrinal-claim when the reader asks whether Scripture teaches, proves, or supports a disputed doctrine, obligation, covenant claim, prophecy interpretation, or theological identity claim. Use apparent-contradiction when the question asks Scripture to reconcile statements that appear to pull in different directions. Set requiresScopeAnalysis whenever audience, role, covenant participants, conditions, location, institution, jurisdiction, or command applicability could change the answer. Set requiresTimeline whenever promise, inauguration, transition, fulfillment, resurrection, or future completion could change the answer.

Define the exact proposition before selecting passages. Do not replace a strong doctrine with a weaker proposition that is easier to prove. When the reader names an established compound doctrine, include every material assertion ordinarily entailed by that doctrine—such as claims about identity, number, essence or nature, equality, duration, authority, and relationship—rather than silently omitting the hardest assertion. For example, if coequality or coeternity belongs to the named doctrine, do not replace it with the weaker observation that subjects are named together or share divine work. For a compound doctrinal claim, decompose it into separately testable components. Keep identity, authority, nature, relationship, practice, and duration distinct: evidence for one does not automatically prove the others. A later theological label may name the subject, but it is not wording found in Scripture unless a selected passage actually uses it.

Keep the proposition exactly responsive to the reader's question. Do not add a hidden requirement such as "restated to modern Christians," "in the same covenant form as Israel," or "as a binding covenant code" unless the reader asked that distinct question. Resolve a modern audience label from Scripture's descriptions of covenant participants and believers; do not demand that the Bible contain the modern label verbatim.

This component discipline is universal, not limited to doctrine labels. Keep covenant, Torah or command, covenant participants, priesthood, mediator, sanctuary, sacrifice, promise, timing, prophecy, chronology, and application distinct. A change in one component does not change another unless Scripture connects them. Preserve the Bible's own earlier definitions when reading later passages. The whole biblical witness is coherent: later inference may qualify scope or administration when the text establishes that change, but may not silently negate an earlier explicit proposition.

For command and application questions, retrieve the instruction itself and evidence that identifies its audience, role, triggering condition, location, institutional requirements, duration, and any explicit later change. A command assigned to priests, judges, landowners, parents, men, women, Israel, resident foreigners, or another stated group must not be indiscriminately reassigned or abolished. Present inability or absence of a sanctuary, land, court, or office concerns performance conditions; it is not by itself textual repeal.

When the reader asks whether a command given to Israel applies to Gentile or new-covenant believers, retrieve Scripture that actually establishes covenant identity and participation: the treatment of resident foreigners, prophetic foreigners who join themselves to Yahweh, the new covenant's named parties, grafting into the covenant people, former alienation from Israel's commonwealth followed by fellow citizenship, and belonging to Messiah as Abraham's seed. Do not assume either separation from or inclusion in the covenant people without testing that audience bridge from the text.

For covenant questions, map each relevant component separately: parties, Torah or instruction, priesthood, high priest, mediator, sanctuary, sacrifices, forgiveness, promises, inheritance, and timing. Preserve both explicit continuity and explicit change. In particular, a statement about covenant obsolescence cannot simply be substituted for a statement about every divine instruction, and Torah continuity cannot erase real priestly, sacrificial, sanctuary, mediator, or administrative changes. Retrieve the defining prophetic promise and the later passage that uses it. Distinguish promised, inaugurated, presently operating, transitioning, fulfilled, awaiting full realization, and uncertain timing from the text rather than from a theological slogan.

When the reader asks about "the law of Moses," preserve Scripture's presentation of Moses as the mediator who transmits Yahweh's instruction; do not recast the phrase as a merely Mosaic authority or as a synonym for the whole old covenant. Retrieve passages that identify the law's divine source, the new covenant's stated action toward that law, and the immediate context of phrases such as "under law," "discharged from the law," or "justified by the law." Include nearby statements that identify whether the subject is obedience, justification, condemnation, sin's dominion, priesthood, sacrifice, or manner of service.

For every subject, earlier structured claims are propositions to re-check, not conclusions to repeat. Plan the current evidence needed to preserve, narrow, or explicitly reconcile them. An ambiguous or inferential proposition may not override a previously established explicit proposition.

For doctrinal-claim plans, retrieve the strongest passages that directly establish the proposition and its necessary canonical foundations. Include a qualifying or contrasting passage only when that passage's own wording materially addresses the same proposition, command, scope, duration, audience, or condition. Never manufacture an opposing channel, impose a quota of countertexts, or include a passage merely because it is commonly used against the proposition. For apparent-contradiction plans, retrieve both named sides of the apparent contradiction so their actual objects and contexts can be compared. Association, joint naming, shared action, honor, agency, and authority do not by themselves prove identity, ontology, equality, or eternality. Plan enough evidence to test each component rather than treating related subject matter as proof of the whole claim.

The reader's preferred conclusion and earlier EMET claims are context, never evidence. Earlier structured claims must be re-checked from their cited passages in the current plan when they remain material. Do not reverse an earlier textual finding merely because the latest question pushes another direction; retrieve the passages needed either to preserve it or to explain a genuine scriptural reconciliation.

Use reader location, a named book, and prior questions to resolve what the reader means, not to restrict retrieval to that chapter or book. A new subject overrides earlier context. Unless the reader explicitly asks for only one passage, search the whole canon for the necessary evidence. Return individual verse references in the form "Genesis 6:2", never ranges. Prefer 5 to 10 high-value verses and never pad the plan with weak matches. Priority 100 means most important and 1 means least important.

For identity, relationship, comparison, and event questions, deliberately check three channels: (1) the anchor passage in context, (2) other passages using the same source-language phrase or identifying description, and (3) later passages describing the same distinctive actors, actions, setting, and judgment even when they use different English vocabulary. Include a connection only when it materially helps answer the question, and mark a qualifying passage when Scripture does not explicitly name the connection.

Do not stop at identical labels. A later passage may recall an earlier event through a cluster such as actor class, transgression, punishment, chronology, named people, and surrounding judgment. When two or more distinctive features overlap, include the strongest retrospective passages as later-witness or qualifying evidence so the answer can distinguish an explicit identification from a supported canonical inference.

For obligation, law, covenant, or continuity questions, the plan must include the original command or institution, its named audience, its stated duration or end condition, later governing statements about the law or commandments as a class, and directly relevant application passages. Include a proposed change or qualification only when the passage itself identifies the same command or governing class and explicitly changes its scope, duration, audience, condition, or required practice. A passage about justification, condemnation, priesthood, sacrifice, covenant administration, or an unnamed practice is not automatically evidence that a different command ended. Omission from a later list is not cancellation.

Do not demand that an earlier command be repeated using a modern audience label before it can remain applicable. A continuity conclusion may follow strongly from the command's stated duration together with later governing statements that Torah is not abolished and is written within the new-covenant people. Distinguish the command's continuing authority from its person-, role-, place-, and condition-specific application.

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

        const referenceKey = (reference: string) => reference
          .normalize("NFKC")
          .toLocaleLowerCase("en-US")
          .replace(/\s+/g, " ")
          .trim();

        const continuityPassages = relevantEmetConversationClaimReferences(
          input.conversation,
          input.question,
          draft.components.map((component) => component.category),
        ).map(({ reference, claim }) => ({
          reference,
          role: "context" as const,
          reason: `Previously established structured claim must be rechecked for follow-up continuity: ${claim}`,
          priority: 99,
        }));

        const plannedPassages =
          draft.analysisMode === "doctrinal-claim" &&
          (draft.intent === "continuity" || draft.intent === "application")
            ? draft.passages.filter(
                (passage) =>
                  passage.role !== "qualifying" &&
                  passage.role !== "contrast" &&
                  !isUnsolicitedContinuityQualifier(
                    input.question,
                    passage.reference,
                  ),
              )
            : draft.passages;

        const mergedPassages = [];
        const seenPassages = new Set<string>();
        for (const passage of [
          ...plannedPassages,
          ...continuityPassages,
        ]) {
          const key = referenceKey(passage.reference);
          if (seenPassages.has(key)) continue;
          seenPassages.add(key);
          mergedPassages.push(passage);
          if (mergedPassages.length >= 16) break;
        }

        return {
          ...draft,
          passages: mergedPassages,
        };
      } catch {
        return null;
      }
    },
    async generate(packet) {
      const hasGoverningContinuityEvidence = packet.evidence.some(
        (item) => item.provenance.retrieval?.method === "governing-scripture",
      );
      const hasCommandContinuityComponent = packet.reasoning.components.some(
        (component) =>
          component.category === "command" ||
          component.category === "duration" ||
          component.category === "application",
      );
      const canonicalContinuityDirective =
        hasGoverningContinuityEvidence && hasCommandContinuityComponent
          ? `\n\nMandatory canonical continuity finding: the application has supplied the original instruction together with verified governing Scripture for non-abolition, new-covenant internalization of Yahweh's law, faith establishing the law, and covenant-participant continuity. Synthesize those passages. Conclude that new-covenant believers are to obey Yahweh's instructions that apply to them, including the particular command asked about unless supplied Scripture explicitly changes or ends that same command. Do not reopen this as a demand for a second one-line issuance to a modern audience. Narrow application only from the instruction's own stated audience, role, land, sanctuary, priesthood, judicial, or other performance conditions.`
          : "";
      const task = packet.reasoning.mode === "simple"
        ? "Give the reader a direct, concise Scripture-grounded explanation. Use only the evidence in packet. Keep evidence bookkeeping in componentChecks, claims, and citations, not in the reader-facing answer. Return exactly one componentCheck for every reasoning component and an empty continuityChecks array when no established propositions are supplied."
        : `Test the exact proposition in packet.reasoning from the complete supplied Scripture evidence. This is universal biblical reasoning, not advocacy for a theological camp.

Separate every material component. Do not exchange identity for authority, covenant for Torah, priesthood for every command, sacrifice for morality, association for ontology, present participation for final consummation, or change in one administration for abolition of unrelated instruction.

When requiresScopeAnalysis is true, state the relevant audience, role, conditions, location, institution, and jurisdiction before applying the text. A command assigned to another office or activated only under stated conditions is not thereby abolished. When requiresTimeline is true, distinguish promised, inaugurated, presently operating, transitioning, fulfilled, awaiting full realization, and uncertain claims. Do not collapse an unfolding scriptural sequence into one instant.

For obligation and continuity questions, reason from the whole canonical sequence. An explicit command with a stated duration or unsatisfied end condition continues to govern unless supplied Scripture explicitly changes that same command. Do not demand a later restatement addressed in the reader's modern terminology. A selective apostolic list, silence, a passage about justification or condemnation, non-judgment language, an unnamed disputed day, or a change in priesthood or sacrifice is not repeal of another command. If such a passage is supplied, explain its actual object without allowing it to negate the earlier command. Distinguish continuing authority from the command's stated personal, role, place, and institutional conditions.

For law-of-Moses and new-covenant questions, do not use "old covenant administration," "binding covenant code," "same covenant form," "Mosaic administrative features," or similar theological shorthand as the conclusion. Trace Scripture's own objects: Yahweh gives the instruction through Moses; the new-covenant promise writes Yahweh's law within the people; Messiah denies abolishing the Law and the Prophets; faith establishes the law. Read "under law," discharge, and justification passages within that established frame and their immediate subject. A covenant change may alter mediator, priesthood, sacrifice, sanctuary, or administration without turning Torah into an expired authority. State that applicable instructions remain instructions, while each instruction's own audience, role, land, sanctuary, priesthood, judicial, and other stated conditions determine who can perform it and how. Do not imply that inward, Spirit-led obedience replaces outward obedience; Ezekiel's promise joins the Spirit's inward work to walking in Yahweh's statutes and doing His ordinances.

Use packet.reasoning.establishedPropositions as mandatory consistency constraints. They are included only when their Scripture references were independently reverified in this packet. Return exactly one continuityCheck for each. Preserve or narrow an established proposition; use reconciled only when current Scripture explicitly explains how both statements stand. Never allow lower-level inference or synthesis to negate an explicit statement. If a conflict remains unresolved, return insufficient-evidence rather than prose that contradicts the ledger.

Return exactly one componentCheck for every component in packet.reasoning.components. Grade the actual component proposition, not a weaker substitute. The full conclusionSupport may not be stronger than the weakest material component. If one required assertion is only possible or is not established, do not say the named compound proposition is established; explain naturally which parts Scripture states and which part it does not establish.

For each answer claim, provide a stable ID, evidence level, category, polarity, exact scope, and timing. The reader-facing answer must remain natural, direct, and concise. Begin with the answer, never with commentary about a draft, packet, model, method, or proposition. State the conclusion the supplied Scripture establishes; do not weaken an explicit command, duration, or governing statement merely because the reader used modern wording. Use a qualification only when its cited passage materially addresses the exact proposition. Do not introduce labels such as "Sinai administration" or "covenant setting" unless the cited text itself makes that distinction relevant to the answer. Give the precise conclusion justified by all materially relevant supplied Scripture.${canonicalContinuityDirective}`;
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
        const draft = JSON.parse(response.output_text) as unknown;
        const requiresIndependentAudit =
          packet.reasoning.mode !== "simple" ||
          packet.reasoning.requiresScopeAnalysis ||
          packet.reasoning.requiresTimeline ||
          packet.reasoning.establishedPropositions.length > 0;
        if (!requiresIndependentAudit) return draft;

        const allowedContinuityIds = new Set(
          packet.reasoning.establishedPropositions.map((item) => item.id),
        );
        const normalizeAudit = (value: unknown) => {
          if (!value || typeof value !== "object") return value;
          const audited = value as Record<string, unknown>;
          if (Array.isArray(audited.continuityChecks)) {
            audited.continuityChecks = audited.continuityChecks.filter(
              (item) =>
                Boolean(item) &&
                typeof item === "object" &&
                allowedContinuityIds.has(
                  String((item as Record<string, unknown>).propositionId || ""),
              ),
            );
          }
          if (
            Array.isArray(audited.componentChecks) &&
            typeof audited.conclusionSupport === "string"
          ) {
            const rank = new Map<string, number>([
              ["does-not-establish", 0],
              ["possible-interpretation", 1],
              ["theological-synthesis", 2],
              ["strong-implication", 3],
              ["explicit-statement", 4],
            ]);
            const supports = audited.componentChecks.flatMap((item) => {
              if (!item || typeof item !== "object") return [];
              const support = (item as Record<string, unknown>).support;
              return typeof support === "string" && rank.has(support)
                ? [support]
                : [];
            });
            if (supports.length === audited.componentChecks.length) {
              const weakest = supports.reduce((left, right) =>
                (rank.get(left) || 0) <= (rank.get(right) || 0) ? left : right,
              );
              if (
                (rank.get(audited.conclusionSupport) ?? -1) >
                (rank.get(weakest) ?? -1)
              ) {
                audited.conclusionSupport = weakest;
              }
            }
          }
          return audited;
        };
        let auditDraft = draft;
        let validationErrors: string[] = [];

        for (let attempt = 0; attempt < 2; attempt += 1) {
          const review = await client.responses.create({
            model: process.env.EMET_AI_PLANNER_MODEL?.trim() || model,
            store: false,
            input: [
              {
                role: "system",
                content: `${buildEmetAiSystemInstruction()}\n\nYou are the independent final consistency auditor. Return a corrected complete answer object, not commentary about the draft. The answer field must speak directly to the reader and must never mention a draft, packet, prompt, model, method, or proposition. Check every substantive sentence against the packet. Enforce exact component boundaries, audience and conditions, temporal sequence, evidence-level language, and every established proposition. A lower evidence level may not negate a higher one. Specific change may not become unlimited abolition; continuity may not erase an explicit change. For command-continuity questions, an explicit command with an unsatisfied duration or end condition remains governing unless supplied Scripture explicitly changes that same command; a later restatement using a modern audience label is not required. Silence, omission from a selective list, non-judgment language, an unnamed disputed day, or a passage about justification, condemnation, priesthood, or sacrifice cannot become repeal of another command. Do not treat "law of Moses," Torah, first covenant, Levitical priesthood, sacrifice, sanctuary, justification, condemnation, and sin's dominion as interchangeable. The new-covenant promise's stated action toward Yahweh's law is to put it within the people and write it on their hearts. Read "under law" or discharge language in its immediate subject and alongside the explicit statements that faith establishes the law and the law is holy, righteous, and good. If Scripture does not resolve a conflict, return insufficient-evidence. Ensure componentChecks contain exactly one entry for every reasoning component, grade the exact component rather than a weaker substitute, and never give the whole proposition stronger support than its weakest material component. Ensure claims fully account for the reader-facing prose and continuityChecks contain exactly one entry per established proposition, or none when the packet supplies none.${canonicalContinuityDirective}${attempt ? " The prior audit failed deterministic validation. Correct every supplied validation error without weakening or replacing the reader's proposition." : ""}`,
              },
              {
                role: "user",
                content: JSON.stringify({
                  packet,
                  draft: auditDraft,
                  ...(validationErrors.length ? { validationErrors } : {}),
                }),
              },
            ],
            text: {
              format: {
                type: "json_schema",
                name: "emet_ai_consistency_audit",
                strict: true,
                schema: answerSchema(packet.evidence.map((item) => item.id)),
              },
            },
          });
          if (review.status !== "completed" || !review.output_text) continue;
          const audited = normalizeAudit(JSON.parse(review.output_text));
          const parsed = parseEmetAiAnswer(audited);
          if (!parsed) {
            validationErrors = ["The answer did not satisfy the required answer schema."];
            auditDraft = audited;
            continue;
          }
          const validation = validateEmetAiAnswer(packet, parsed);
          if (validation.ok) return validation.value;
          validationErrors = validation.errors;
          auditDraft = parsed;
        }
        if (process.env.EMET_AI_DEBUG === "1") {
          console.error("EMET consistency audit failed validation.", {
            validationErrors,
            auditDraft,
          });
        }
        return null;
      } catch {
        return null;
      }
    },
  };
}
