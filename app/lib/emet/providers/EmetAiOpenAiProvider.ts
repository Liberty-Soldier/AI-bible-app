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
import type { EmetAiPerformanceObserver } from "../EmetAiPerformance";
import { classifyEmetAiInstructionProfile } from "../EmetAiResponseDesign";
import { buildEmetAiQuestionContract } from "../EmetAiQuestionContract";

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
        maxItems: 6,
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
        maxItems: 24,
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
      maxItems: 6,
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
      maxItems: 24,
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

function conciseAnswerSchema(evidenceIds: string[]) {
  const full = answerSchema(evidenceIds);
  const properties: Record<string, unknown> = { ...full.properties };
  delete properties.componentChecks;
  delete properties.continuityChecks;
  return {
    ...full,
    properties,
    required: full.required.filter(
      (field) => field !== "componentChecks" && field !== "continuityChecks",
    ),
  };
}

export function createEmetAiOpenAiProvider({
  performanceObserver,
}: {
  performanceObserver?: EmetAiPerformanceObserver;
} = {}): EmetAiProvider | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const answerModel =
    process.env.EMET_AI_ANSWER_MODEL?.trim() ||
    "gpt-5.4-2026-03-05";
  const configuredReasoningEffort =
    process.env.EMET_AI_REASONING_EFFORT?.trim().toLocaleLowerCase("en-US");
  const answerReasoningEffort: "none" | "low" | "medium" =
    configuredReasoningEffort === "medium"
      ? "medium"
      : configuredReasoningEffort === "low"
        ? "low"
        : "none";
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey });
  let lastFailure: string[] = [];

  const logUsage = (
    stage: "plan" | "answer" | "repair",
    response: {
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
        input_tokens_details?: { cached_tokens?: number } | null;
        output_tokens_details?: { reasoning_tokens?: number } | null;
      } | null;
    },
    modelName: string,
    elapsedMs: number,
  ) => {
    if (!response.usage) return;
    performanceObserver?.usage({
      stage,
      inputTokens: response.usage.input_tokens || 0,
      cachedInputTokens: response.usage.input_tokens_details?.cached_tokens || 0,
      outputTokens: response.usage.output_tokens || 0,
      reasoningTokens: response.usage.output_tokens_details?.reasoning_tokens || 0,
      totalTokens: response.usage.total_tokens || 0,
    });
    if (process.env.EMET_AI_USAGE_LOG !== "1") return;
    console.info("EMET AI usage", {
      stage,
      model: modelName,
      inputTokens: response.usage.input_tokens || 0,
      cachedInputTokens:
        response.usage.input_tokens_details?.cached_tokens || 0,
      outputTokens: response.usage.output_tokens || 0,
      reasoningTokens:
        response.usage.output_tokens_details?.reasoning_tokens || 0,
      totalTokens: response.usage.total_tokens || 0,
      elapsedMs: Math.round(elapsedMs),
    });
  };

  return {
    model: answerModel,
    getLastFailure() {
      return lastFailure;
    },
    async plan(input) {
      lastFailure = [];
      const questionContract = input.questionContract || buildEmetAiQuestionContract(input);
      const instructionProfile = questionContract.instructionProfile ||
        classifyEmetAiInstructionProfile(input);
      const subjectRetrievalDirective = questionContract.topicDomains.includes("cosmology")
        ? `\n\nFor broad questions about Scripture's descriptions of the earth, sun, moon, heavens, or expanse, examine all materially distinct textual categories: the earth's establishment or stability, the narrated movement or stillness of the sun and moon, the expanse, and the created lights and their functions. Relevant witnesses include Genesis 1:6–8, Genesis 1:14–17, Joshua 10:12–13, 1 Chronicles 16:30, Psalms 19:4–6, 93:1, and 104:5, Ecclesiastes 1:5, and Job 37:18. These are neutral retrieval anchors, not a predetermined cosmological conclusion; include other material passages and conclude only what their wording establishes. Do not volunteer a phenomenological, observational, poetic, or human-vantage explanation unless the reader explicitly asks for that comparison.`
        : "";
      const planStartedAt = performance.now();
      const response = await client.responses.create({
        model: answerModel,
        store: false,
        reasoning: { effort: answerReasoningEffort },
        input: [
          {
            role: "system",
            content: `${buildEmetAiSystemInstruction(instructionProfile)}

You are selecting an evidence strategy, not writing a reader-facing answer. Use trained biblical understanding to identify the smallest complete set of passages and verified-source hypotheses needed to answer the canonical question contract. Return only the retrieval plan. The application will resolve every planned reference against locked Scripture data before a separate answer-generation stage.

The input's responseDesign is mandatory. For concise questions, answer the question immediately in 1–3 sentences, normally 30–65 words, and select only 2–4 of the strongest direct Scripture witnesses. Do not preemptively introduce objections, denominational debates, historical background, or passages from Paul merely because someone might later raise them. For standard questions and follow-up objections, explain the requested reason or objection directly and build on the recorded conversation. For deep comparisons, multi-part questions, contradictions, and original-language studies, use the detail needed for complete coverage. Progressive depth means the first answer stays proportionate; later questions may deepen it without restarting the study.

Identify the biblical subject and select the smallest set of passages that can honestly support the answer. Read Scripture canonically: include the necessary earlier foundation, the most direct passage, relevant later witness, and any passage that materially qualifies the conclusion. Do not select verses merely because they repeat a common English word.

Answer-completeness rule: a question asking which or what items requires passages that state the actual items or meaningful categories; a question asking how to perform or observe something requires passages that state concrete actions, conditions, boundaries, or examples. A general command to obey, keep, avoid, or remember is not sufficient by itself. For a named multi-item list, retrieve and identify every requested item. For a comprehensive question, decompose the subject into its materially distinct textual categories and retrieve the strongest passage for each; do not add an external interpretive framework the reader did not request.

First classify the reasoning task. Use simple for ordinary factual or passage questions. Use doctrinal-claim when the reader asks whether Scripture teaches, proves, or supports a disputed doctrine, obligation, covenant claim, prophecy interpretation, or theological identity claim. Use apparent-contradiction when the question asks Scripture to reconcile statements that appear to pull in different directions. Set requiresScopeAnalysis whenever audience, role, covenant participants, conditions, location, institution, jurisdiction, or command applicability could change the answer. Set requiresTimeline whenever promise, inauguration, transition, fulfillment, resurrection, or future completion could change the answer.

Define the exact proposition before selecting passages. Do not replace a strong doctrine with a weaker proposition that is easier to prove. When the reader names an established compound doctrine, include every material assertion ordinarily entailed by that doctrine—such as claims about identity, number, essence or nature, equality, duration, authority, and relationship—rather than silently omitting the hardest assertion. For example, if coequality or coeternity belongs to the named doctrine, do not replace it with the weaker observation that subjects are named together or share divine work. For a compound doctrinal claim, decompose it into separately testable components. Keep identity, authority, nature, relationship, practice, and duration distinct: evidence for one does not automatically prove the others. A later theological label may name the subject, but it is not wording found in Scripture unless a selected passage actually uses it.

Do not make the proposition harder than the reader's actual question. Scope analysis, timeline analysis, interpretive method, and the need to account for genuine biblical changes are reasoning requirements, not extra assertions to append to the proposition. For a question asking whether believers should obey Torah or the law of Moses, the main proposition is whether believers are to obey Yahweh's instructions that apply to them. Do not append an "unchanged Levitical system," "old covenant package," or similar assertion that the reader did not make. Put necessary person-, role-, place-, and condition-specific qualifications in the explanation without using them to evade the core question.

Keep the proposition exactly responsive to the reader's question. Do not add a hidden requirement such as "restated to modern Christians," "in the same covenant form as Israel," or "as a binding covenant code" unless the reader asked that distinct question. Resolve a modern audience label from Scripture's descriptions of covenant participants and believers; do not demand that the Bible contain the modern label verbatim.

This component discipline is universal, not limited to doctrine labels. Keep covenant, Torah or command, covenant participants, priesthood, mediator, sanctuary, sacrifice, promise, timing, prophecy, chronology, and application distinct. A change in one component does not change another unless Scripture connects them. Preserve the Bible's own earlier definitions when reading later passages. The whole biblical witness is coherent: later inference may qualify scope or administration when the text establishes that change, but may not silently negate an earlier explicit proposition.

For command and application questions, retrieve the instruction itself and evidence that identifies its audience, role, triggering condition, location, institutional requirements, duration, and any explicit later change. A command assigned to priests, judges, landowners, parents, men, women, Israel, resident foreigners, or another stated group must not be indiscriminately reassigned or abolished. Present inability or absence of a sanctuary, land, court, or office concerns performance conditions; it is not by itself textual repeal.

When the reader asks whether a command given to Israel applies to Gentile or new-covenant believers, retrieve Scripture that actually establishes covenant identity and participation: the treatment of resident foreigners, prophetic foreigners who join themselves to Yahweh, the new covenant's named parties, grafting into the covenant people, former alienation from Israel's commonwealth followed by fellow citizenship, and belonging to Messiah as Abraham's seed. Do not assume either separation from or inclusion in the covenant people without testing that audience bridge from the text.

For covenant questions, map each relevant component separately: parties, Torah or instruction, priesthood, high priest, mediator, sanctuary, sacrifices, forgiveness, promises, inheritance, and timing. Preserve both explicit continuity and explicit change. In particular, a statement about covenant obsolescence cannot simply be substituted for a statement about every divine instruction, and Torah continuity cannot erase real priestly, sacrificial, sanctuary, mediator, or administrative changes. Retrieve the defining prophetic promise and the later passage that uses it. Distinguish promised, inaugurated, presently operating, transitioning, fulfilled, awaiting full realization, and uncertain timing from the text rather than from a theological slogan.

When the reader asks about "the law of Moses," preserve Scripture's presentation of Moses as the mediator who transmits Yahweh's instruction; do not recast the phrase as a merely Mosaic authority or as a synonym for the whole old covenant. Retrieve passages that identify the law's divine source, the new covenant's stated action toward that law, and the immediate context of phrases such as "under law," "discharged from the law," or "justified by the law." Include nearby statements that identify whether the subject is obedience, justification, condemnation, sin's dominion, priesthood, sacrifice, or manner of service.

For every subject, earlier structured claims are propositions to re-check, not conclusions to repeat. Plan the current evidence needed to preserve, narrow, or explicitly reconcile them. An ambiguous or inferential proposition may not override a previously established explicit proposition.

For doctrinal-claim plans, retrieve the strongest passages that directly establish the proposition and its necessary canonical foundations. Include a qualifying or contrasting passage only when that passage's own wording materially addresses the same proposition, command, scope, duration, audience, or condition. Never manufacture an opposing channel, impose a quota of countertexts, or include a passage merely because it is commonly used against the proposition. For apparent-contradiction plans, retrieve both named sides of the apparent contradiction so their actual objects and contexts can be compared. Association, joint naming, shared action, honor, agency, and authority do not by themselves prove identity, ontology, equality, or eternality. Plan enough evidence to test each component rather than treating related subject matter as proof of the whole claim.

When the reader explicitly asks for the strongest biblical cases for and against a proposition or asks to compare competing interpretations, frame the proposition neutrally as whether the claim is established. Retrieve the strongest passages whose actual wording materially supports each reading, including passages commonly offered against the claim when they address the same practice or governing category. Presenting both readings does not require artificial neutrality: grade each passage honestly, explain its actual object and limits, and reach the conclusion supported by the full scriptural context.

This comparison instruction is mandatory when the question says "for and against," "both sides," or "competing interpretations." The proposition must remain neutral rather than assume either conclusion, and the plan must contain materially relevant supporting and contrast passages when Scripture contains them. A plan that merely argues one side and calls one of its own supporting passages the opposing case does not answer that request.

The reader's preferred conclusion and earlier EMET claims are context, never evidence. Earlier structured claims must be re-checked from their cited passages in the current plan when they remain material. Do not reverse an earlier textual finding merely because the latest question pushes another direction; retrieve the passages needed either to preserve it or to explain a genuine scriptural reconciliation.

Use reader location, a named book, and prior questions to resolve what the reader means, not to restrict retrieval to that chapter or book. A new subject overrides earlier context. Search as broadly as the question requires, but return only the proportionate evidence defined by responseDesign: normally 2–4 high-value verses for concise questions, 4–8 for standard explanations, and enough verified witnesses for deep studies. Return individual verse references in the form "Genesis 6:2", never ranges. Never pad the plan with weak matches. Priority 100 means most important and 1 means least important.

Conversation turn outcomes are product context, not Scripture evidence. If the reader asks why an earlier turn failed, use the recorded answered/failed outcome: acknowledge a failed generation or verification turn plainly and offer to answer it again. Never invent a theological reason for a technical failure, and never claim an answered turn failed.

Never plan an argumentative passage or conversation as a detached proof text. When a proposed verse occurs inside a dispute, speech, legal decision, or sustained argument, include the minimum individual verses needed to show the initiating question or accusation, each materially different claim, the speaker's reasoning, and the stated decision or conclusion. The reader-facing answer must reflect who said what and what issue the conversation was deciding.

For identity, relationship, comparison, and event questions, deliberately check three channels: (1) the anchor passage in context, (2) other passages using the same source-language phrase or identifying description, and (3) later passages describing the same distinctive actors, actions, setting, and judgment even when they use different English vocabulary. Include a connection only when it materially helps answer the question, and mark a qualifying passage when Scripture does not explicitly name the connection.

Do not stop at identical labels. A later passage may recall an earlier event through a cluster such as actor class, transgression, punishment, chronology, named people, and surrounding judgment. When two or more distinctive features overlap, include the strongest retrospective passages as later-witness or qualifying evidence so the answer can distinguish an explicit identification from a supported canonical inference.

For obligation, law, covenant, or continuity questions that require scope analysis, reconciliation, or deep treatment, include the original command or institution, its named audience, its stated duration or end condition, later governing statements about the law or commandments as a class, and directly relevant application passages. For a concise question that is explicitly answered by direct Scripture, lead with that text and do not automatically expand into every possible covenant objection. Include a proposed change or qualification only when the passage itself identifies the same command or governing class and explicitly changes its scope, duration, audience, condition, or required practice. A passage about justification, condemnation, priesthood, sacrifice, covenant administration, or an unnamed practice is not automatically evidence that a different command ended. Omission from a later list is not cancellation.

Do not demand that an earlier command be repeated using a modern audience label before it can remain applicable. A continuity conclusion may follow strongly from the command's stated duration together with later governing statements that Torah is not abolished and is written within the new-covenant people. Distinguish the command's continuing authority from its person-, role-, place-, and condition-specific application.

When a repeated source-language phrase is materially relevant, add a source phrase hypothesis. Supply verified-looking Strong IDs when known (for example H1121), and/or normalized Hebrew or Greek lemmas. Leave an unknown array empty. Do not use an English gloss as if it proved a source identity. The application will independently validate every reference and source sequence and will discard anything that does not exist in its locked data.

The input's requestedCoverage was extracted deterministically from the reader's wording. Include every requested passage and every requestedCoverage.comparisonPassages reference in the plan even when it would otherwise be omitted. When requestedCoverage.subquestions is nonempty, use exactly those IDs as the plan components and return exactly one answer component check for every one of those IDs; do not substitute newly invented component IDs. Every requested passage reference must appear in at least one answer claim or component check. When language analysis is requested, plan the relevant Hebrew and/or Greek source form at the requested passages; never invent a lexical ID or map an English gloss to a source word without verification. In the finished reader-facing prose, name each verified source word in its original script, give its transliteration, explain its contextual meaning, and compare how the verified words function in the requested passages. Do not hide lexical work behind phrases such as "the Hebrew term" or "the Greek word."

Do not use denominational doctrine, consensus, or historical literature as proof. Do not put noncanonical references in passages. If the question asks about historical literature, record that limitation; EMETSEES handles such sources separately.

Give short retrieval reasons. Do not draft, summarize, or anticipate the final answer. Never assert an unverified lexical identity. Return only the required retrieval-plan structure.${subjectRetrievalDirective}`,
          },
          {
            role: "user",
            content: JSON.stringify(buildEmetAiRetrievalInput({
              ...input,
              questionContract,
            })),
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
      logUsage("plan", response, answerModel, performance.now() - planStartedAt);

      if (response.status !== "completed" || !response.output_text) {
        return null;
      }

      try {
        const draft = parseEmetAiRetrievalPlan(JSON.parse(response.output_text));
        if (!draft) {
          if (process.env.EMET_AI_DEBUG === "1") {
            console.error("EMET retrieval plan failed parsing.");
          }
          return null;
        }
        const referenceKey = (reference: string) => reference
          .normalize("NFKC")
          .toLocaleLowerCase("en-US")
          .replace(/\s+/g, " ")
          .trim();

        const requiredSubjectPassages = questionContract.topicDomains.includes("cosmology")
          ? [
              "Genesis 1:6-8", "Genesis 1:14-17", "Joshua 10:12-13",
              "1 Chronicles 16:30", "Psalms 19:4-6", "Psalms 93:1",
              "Psalms 104:5", "Ecclesiastes 1:5", "Job 37:18",
            ].map((reference) => ({
              reference,
              role: "foundation" as const,
              reason: "Neutral subject-coverage anchor requested for a comprehensive biblical cosmology question.",
              priority: 98,
            }))
          : [];
        if (requiredSubjectPassages.length) {
          const seen = new Set(draft.passages.map((passage) => referenceKey(passage.reference)));
          draft.passages.push(...requiredSubjectPassages.filter((passage) => {
            const key = referenceKey(passage.reference);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }));
          draft.passages = draft.passages.slice(0, 24);
        }
        if (draft.analysisMode === "simple") return draft;

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

        const mergedPassages = [];
        const seenPassages = new Set<string>();
        for (const passage of [
          ...draft.passages,
          ...continuityPassages,
        ]) {
          const key = referenceKey(passage.reference);
          if (seenPassages.has(key)) continue;
          seenPassages.add(key);
          mergedPassages.push(passage);
          if (mergedPassages.length >= 24) break;
        }

        return {
          ...draft,
          passages: mergedPassages,
        };
      } catch (error) {
        if (process.env.EMET_AI_DEBUG === "1") {
          console.error("EMET combined plan/answer parsing threw.", error);
        }
        return null;
      }
    },
    async generate(packet) {
      lastFailure = [];
      const instructionProfile = packet.requestedCoverage?.language.length
        ? "lexical"
        : packet.requestedCoverage?.competingInterpretations
          ? "comparison"
          : packet.responseDesign?.progressiveFollowUp
            ? "challenge"
            : packet.reasoning.mode !== "simple" || packet.responseDesign?.depth === "deep"
              ? "complex"
              : /^\s*(?:what\s+is|define)\b|\bwhat\s+does\s+.+\s+mean\b/i.test(packet.question)
                ? "definition"
                : "direct";
      const directProfile = instructionProfile === "direct" &&
        packet.reasoning.mode === "simple" &&
        packet.reasoning.establishedPropositions.length === 0;
      const systemInstruction = buildEmetAiSystemInstruction(
        instructionProfile,
      );
      const hasCommandContinuityComponent = packet.reasoning.components.some(
        (component) =>
          component.category === "command" ||
          component.category === "duration" ||
          component.category === "application",
      );
      const canonicalContinuityDirective =
        !directProfile && hasCommandContinuityComponent
          ? `\n\nMandatory canonical continuity method: begin with the original instruction and its stated audience, duration, and conditions; then read the verified later passages in that established frame. If those passages establish non-abolition, new-covenant internalization of Yahweh's law, faith establishing the law, or covenant-participant continuity, synthesize them instead of demanding a second one-line issuance to a modern audience. Conclude that believers obey Yahweh's instructions that apply to them when the verified Scripture supports that conclusion, unless verified Scripture explicitly changes or ends the same command. Narrow application only from the instruction's own stated audience, role, land, sanctuary, priesthood, judicial, or other performance conditions.`
          : "";
      const responseDesignDirective = packet.responseDesign
        ? `\n\nResponse design: ${packet.responseDesign.depth}. Target ${packet.responseDesign.targetMinWords}–${packet.responseDesign.targetMaxWords} reader-facing words and no more than ${packet.responseDesign.maxScriptureCitations} Scripture citations. Begin with the answer. ${packet.responseDesign.depth === "concise" ? "Use 1–3 sentences and do not introduce unasked objections or broad theological debate." : packet.responseDesign.progressiveFollowUp ? "Answer the follow-up directly using the established conversation context; do not restart the whole study." : "Use only the depth needed for the request."}`
        : "";
      const task = packet.reasoning.mode === "simple"
        ? "Give the reader a direct, concise Scripture-grounded explanation. Use your biblical understanding to read the passages naturally, while citing every biblical conclusion only to verified evidence in the packet. If the question asks what or which items, name the actual items or meaningful categories; if it asks how, state concrete actions and conditions. Do not answer by merely repeating the duty or category named in the question. Keep evidence bookkeeping in componentChecks, claims, and citations, not in the reader-facing answer. Return exactly one componentCheck for every reasoning component and an empty continuityChecks array when no established propositions are supplied."
        : `Test the exact proposition in packet.reasoning from the complete supplied Scripture evidence. This is universal biblical reasoning, not advocacy for a theological camp.

Separate every material component. Do not exchange identity for authority, covenant for Torah, priesthood for every command, sacrifice for morality, association for ontology, present participation for final consummation, or change in one administration for abolition of unrelated instruction.

When requiresScopeAnalysis is true, state the relevant audience, role, conditions, location, institution, and jurisdiction before applying the text. A command assigned to another office or activated only under stated conditions is not thereby abolished. When requiresTimeline is true, distinguish promised, inaugurated, presently operating, transitioning, fulfilled, awaiting full realization, and uncertain claims. Do not collapse an unfolding scriptural sequence into one instant.

For obligation and continuity questions, reason from the whole canonical sequence. An explicit command with a stated duration or unsatisfied end condition continues to govern unless supplied Scripture explicitly changes that same command. Do not demand a later restatement addressed in the reader's modern terminology. A selective apostolic list, silence, a passage about justification or condemnation, non-judgment language, an unnamed disputed day, or a change in priesthood or sacrifice is not repeal of another command. If such a passage is supplied, explain its actual object without allowing it to negate the earlier command. Distinguish continuing authority from the command's stated personal, role, place, and institutional conditions.

For law-of-Moses and new-covenant questions, do not use "old covenant administration," "binding covenant code," "same covenant form," "Mosaic administrative features," or similar theological shorthand as the conclusion. Trace Scripture's own objects: Yahweh gives the instruction through Moses; the new-covenant promise writes Yahweh's law within the people; Messiah denies abolishing the Law and the Prophets; faith establishes the law. Read "under law," discharge, and justification passages within that established frame and their immediate subject. A covenant change may alter mediator, priesthood, sacrifice, sanctuary, or administration without turning Torah into an expired authority. State that applicable instructions remain instructions, while each instruction's own audience, role, land, sanctuary, priesthood, judicial, and other stated conditions determine who can perform it and how. Do not imply that inward, Spirit-led obedience replaces outward obedience; Ezekiel's promise joins the Spirit's inward work to walking in Yahweh's statutes and doing His ordinances.

Use packet.reasoning.establishedPropositions as mandatory consistency constraints. They are included only when their Scripture references were independently reverified in this packet. Return exactly one continuityCheck for each. Preserve or narrow an established proposition; use reconciled only when current Scripture explicitly explains how both statements stand. Never allow lower-level inference or synthesis to negate an explicit statement. If a conflict remains unresolved, return insufficient-evidence rather than prose that contradicts the ledger.

Return exactly one componentCheck for every component in packet.reasoning.components. Grade the actual component proposition, not a weaker substitute. The full conclusionSupport may not be stronger than the weakest material component. If one required assertion is only possible or is not established, do not say the named compound proposition is established; explain naturally which parts Scripture states and which part it does not establish.

For each answer claim, provide a stable ID, evidence level, category, polarity, exact scope, and timing. The reader-facing answer must remain natural, direct, and concise. Begin with the answer, never with commentary about a draft, packet, model, method, or proposition. State the conclusion the supplied Scripture establishes; do not weaken an explicit command, duration, or governing statement merely because the reader used modern wording. Use a qualification only when its cited passage materially addresses the exact proposition. Do not introduce labels such as "Sinai administration" or "covenant setting" unless the cited text itself makes that distinction relevant to the answer. Give the precise conclusion justified by all materially relevant supplied Scripture.${canonicalContinuityDirective}`;
      const designedTask = `${task}${responseDesignDirective}`;
      try {
        const answerStartedAt = performance.now();
        const response = await client.responses.create({
            model: answerModel,
            store: false,
            reasoning: { effort: answerReasoningEffort },
            input: [
              {
                role: "system",
                content: systemInstruction,
              },
              {
                role: "user",
                content: JSON.stringify({ task: designedTask, packet }),
              },
            ],
            text: {
              format: {
                type: "json_schema",
                name: "emet_ai_answer",
                strict: true,
                schema: directProfile
                  ? conciseAnswerSchema(packet.evidence.map((item) => item.id))
                  : answerSchema(packet.evidence.map((item) => item.id)),
              },
            },
        });
        logUsage("answer", response, answerModel, performance.now() - answerStartedAt);
        performanceObserver?.stage("generation", performance.now() - answerStartedAt);
        if (response.status !== "completed" || !response.output_text) {
          return null;
        }
        const draft: unknown = JSON.parse(response.output_text);

        const allowedContinuityIds = new Set(
          packet.reasoning.establishedPropositions.map((item) => item.id),
        );
        const normalizeAnswer = (value: unknown) => {
          if (!value || typeof value !== "object") return value;
          const candidate = value as Record<string, unknown>;
          if (typeof candidate.answer === "string") {
            candidate.answer = candidate.answer
              .replace(/\s*\([^)]*\b(?:scripture|lexical|morphology):[^)]*\)/gi, "")
              .replace(/[ \t]+\n/g, "\n")
              .trim();
          }
          if (directProfile) {
            const claims = Array.isArray(candidate.claims)
              ? candidate.claims.filter((claim) => claim && typeof claim === "object") as Array<Record<string, unknown>>
              : [];
            const evidenceIds = Array.from(new Set(claims.flatMap((claim) =>
              Array.isArray(claim.evidenceIds)
                ? claim.evidenceIds.filter((id): id is string => typeof id === "string")
                : [],
            )));
            candidate.componentChecks = packet.reasoning.components.map((component) => ({
              componentId: component.id,
              support: candidate.conclusionSupport,
              explanation: typeof candidate.answer === "string" ? candidate.answer : "",
              evidenceIds,
            }));
            candidate.continuityChecks = [];
          }
          if (
            typeof candidate.answer === "string" &&
            packet.requestedCoverage?.language.length
          ) {
            const verifiedTerms = Array.from(new Map(
              packet.requestedCoverage.language
                .flatMap((requirement) => requirement.terms)
                .map((term) => [`${term.corpus}:${term.lexicalId}`, term]),
            ).values());
            const answerText = candidate.answer.toString();
            const missingTerms = Array.from(new Set(verifiedTerms.map((term) => term.corpus)))
              .flatMap((corpus) => {
                const corpusTerms = verifiedTerms.filter((term) => term.corpus === corpus);
                const hasVisibleTerm = corpusTerms.some((term) =>
                  answerText.includes(term.lemma) &&
                  answerText.toLocaleLowerCase("en-US")
                    .includes(term.transliteration.toLocaleLowerCase("en-US")),
                );
                return hasVisibleTerm ? [] : corpusTerms.slice(0, 1);
              });
            if (missingTerms.length) {
              candidate.answer = `${candidate.answer.toString().trim()}\n\nVerified source-language terms: ${missingTerms
                .map((term) => `${term.lemma} (${term.transliteration}) means ${term.meaning}`)
                .join("; ")}. These identities come from the locked source indexes; their contextual force is governed by the cited passages above.`;
            }
          }
          if (
            packet.requestedCoverage?.language.length &&
            Array.isArray(candidate.componentChecks)
          ) {
            const lexicalEvidenceIds = packet.evidence
              .filter((item) => item.kind === "lexical")
              .map((item) => item.id);
            const languageComponentIds = new Set(
              packet.reasoning.components
                .filter((component) =>
                  /\b(?:hebrew|greek|language|lexical|source word|word term)\b/i.test(component.proposition)
                )
                .map((component) => component.id),
            );
            for (const check of candidate.componentChecks) {
              if (!check || typeof check !== "object") continue;
              const component = check as Record<string, unknown>;
              if (!languageComponentIds.has(String(component.componentId || ""))) continue;
              const evidenceIds = Array.isArray(component.evidenceIds)
                ? component.evidenceIds.filter((id): id is string => typeof id === "string")
                : [];
              component.evidenceIds = Array.from(new Set([
                ...evidenceIds,
                ...lexicalEvidenceIds,
              ]));
            }
          }
          if (Array.isArray(candidate.continuityChecks)) {
            candidate.continuityChecks = candidate.continuityChecks.filter(
              (item) =>
                Boolean(item) &&
                typeof item === "object" &&
                allowedContinuityIds.has(
                  String((item as Record<string, unknown>).propositionId || ""),
              ),
            );
          }
          if (
            Array.isArray(candidate.componentChecks) &&
            typeof candidate.conclusionSupport === "string"
          ) {
            const rank = new Map<string, number>([
              ["does-not-establish", 0],
              ["possible-interpretation", 1],
              ["theological-synthesis", 2],
              ["strong-implication", 3],
              ["explicit-statement", 4],
            ]);
            const supports = candidate.componentChecks.flatMap((item) => {
              if (!item || typeof item !== "object") return [];
              const support = (item as Record<string, unknown>).support;
              return typeof support === "string" && rank.has(support)
                ? [support]
                : [];
            });
            if (
              supports.length > 0 &&
              supports.length === candidate.componentChecks.length
            ) {
              const weakest = supports.reduce((left, right) =>
                (rank.get(left) || 0) <= (rank.get(right) || 0) ? left : right,
              );
              if (
                (rank.get(candidate.conclusionSupport) ?? -1) >
                (rank.get(weakest) ?? -1)
              ) {
                candidate.conclusionSupport = weakest;
              }
            }
          }
          if (Array.isArray(candidate.citations)) {
            const cited = new Set(candidate.citations.flatMap((item) => {
              if (!item || typeof item !== "object") return [];
              const evidenceId = (item as Record<string, unknown>).evidenceId;
              return typeof evidenceId === "string" ? [evidenceId] : [];
            }));
            const used = [candidate.componentChecks, candidate.claims, candidate.continuityChecks]
              .flatMap((items) => Array.isArray(items) ? items : [])
              .flatMap((item) => {
                if (!item || typeof item !== "object") return [];
                const ids = (item as Record<string, unknown>).evidenceIds;
                return Array.isArray(ids)
                  ? ids.filter((id): id is string => typeof id === "string")
                  : [];
              });
            for (const evidenceId of used) {
              if (cited.has(evidenceId)) continue;
              const item = packet.evidence.find((entry) => entry.id === evidenceId);
              if (!item) continue;
              candidate.citations.push({
                evidenceId,
                ...(item.reference ? { reference: item.reference } : {}),
              });
              cited.add(evidenceId);
            }
          }
          return candidate;
        };

        const normalizedDraft = normalizeAnswer(draft);
        const parsedDraft = parseEmetAiAnswer(normalizedDraft);
        const validationStartedAt = performance.now();
        const initialValidation = parsedDraft
          ? validateEmetAiAnswer(packet, parsedDraft)
          : {
              ok: false as const,
              errors: ["The answer did not satisfy the required answer schema."],
            };
        performanceObserver?.stage("validation", performance.now() - validationStartedAt);
        if (initialValidation.ok) return initialValidation.value;

        if (process.env.EMET_AI_USAGE_LOG === "1") {
          console.info("EMET AI repair requested", {
            validationErrors: initialValidation.errors,
          });
        }

        // The combined fast path may name a sound verse that did not survive
        // canonical resolution into this packet. Rebuild from verified packet
        // IDs instead of asking the model to preserve a structurally defective
        // reference-backed draft.
        const repairStartedAt = performance.now();
        const repair = await client.responses.create({
          model: answerModel,
          store: false,
          reasoning: { effort: answerReasoningEffort },
          input: [
            {
              role: "system",
              content: `${systemInstruction}\n\nBuild a fresh answer using only the verified evidence packet supplied now. The fast provisional draft failed deterministic validation, so do not preserve its references or structured checks. Preserve a conclusion only when the verified packet supports it. Remove or qualify an unsupported secondary claim instead of discarding supported conclusions. Every component check and complete-answer claim must cite one or more available evidence IDs. Obey packet.responseDesign: concise means a direct 1–3 sentence answer, normally 30–65 words, with no unasked debate and no more than four strongest citations; standard and deep answers should remain proportionate to the request. Return only the complete answer object and do not discuss this recovery process in the reader-facing answer.`,
            },
            {
              role: "user",
              content: JSON.stringify({
                packet,
                validationErrors: initialValidation.errors,
              }),
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "emet_ai_answer_repair",
              strict: true,
              schema: answerSchema(packet.evidence.map((item) => item.id)),
            },
          },
        });
        logUsage("repair", repair, answerModel, performance.now() - repairStartedAt);
        performanceObserver?.stage("repair", performance.now() - repairStartedAt);
        if (repair.status !== "completed" || !repair.output_text) {
          lastFailure = [
            `Verified-packet recovery did not complete (${repair.status || "unknown status"}).`,
          ];
          return null;
        }

        const repaired = parseEmetAiAnswer(
          normalizeAnswer(JSON.parse(repair.output_text)),
        );
        if (!repaired) {
          lastFailure = ["Verified-packet recovery did not match the answer schema."];
          return null;
        }
        const repairedValidation = validateEmetAiAnswer(packet, repaired);
        if (repairedValidation.ok) return repairedValidation.value;

        lastFailure = repairedValidation.errors.map(
          (error) => `Verified-packet recovery: ${error}`,
        );

        if (process.env.EMET_AI_DEBUG === "1") {
          console.error("EMET answer repair failed validation.", {
            initialErrors: initialValidation.errors,
            repairErrors: repairedValidation.errors,
          });
        }
        return null;
      } catch (error) {
        lastFailure = [
          `Answer provider exception: ${error instanceof Error ? error.message : "unknown error"}`,
        ];
        console.error("EMET answer provider failed.", {
          stage: "generate-or-recover",
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },
  };
}
