import "server-only";

import OpenAI from "openai";

import type { EmetConversationContext } from "../EmetAiConversation";
import type { EmetAiEvidencePacket } from "../EmetAiContract";
import {
  EMET_AI_SIMPLE_GENERATION_SCHEMA,
  hydrateEmetAiSimpleGenerationDraft,
  parseEmetAiSimpleGenerationDraft,
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

Answer the actual question directly in one concise paragraph when possible. Preserve the question's modal force: a positive answer to “should X do Y?” must explicitly say “X should do Y”; a negative answer must explicitly say X should not or need not do Y. Do not weaken should/must into may/can unless the question asks permission. Use conclusion=yes when the proposition asked is affirmed even if the support is a strong implication or theological synthesis; support type records how the conclusion follows and does not itself make the answer qualified. Use qualified only when a concrete textual condition, exception, mixed result, or scope restriction materially changes the answer, and identify that limitation. Match the opening yes/no to the exact proposition asked: for example, if a question asks whether a person outside an assigned role must perform that role's duties and the text restricts those duties to the role, answer no. Treat Christians, believers, or followers of Messiah named without qualification as people genuinely belonging to Messiah, not as a question about nominal self-labels. Do not make the answer conditional on whether such people really belong, and do not contrast them with “self-described” or nominal members unless the reader explicitly asks about false profession. When several passages establish one conclusion together, state that synthesis clearly. Distinguish explicit text from inference through the support classification and wording, not by weakening an otherwise established conclusion. Do not invent continuity, repeal, exemption, or change from silence or omission from a later list; the lack of a repeated New Testament command proves neither continuity nor repeal. For command-applicability questions, reason from the supplied earliest foundation, governing instruction, recipients, conditions and duration, membership evidence, Messiah's relevant teaching, and material later testimony. A stated audience is not by itself proof of exclusive scope, and membership in a people is not by itself proof that every role-specific instruction applies to every member. When the evidence establishes both that an instruction governs the covenant people and that the people asked about share in that people and its promises, application to them is a reasoned synthesis unless the supplied text establishes a relevant role, circumstance, or scope limitation. State and cite that membership premise in the reader-facing reasoning. A neutral component assessment that one passage does not establish something cannot weaken a conclusion established by other supplied passages. Do not demand that the ancient text repeat the command in modern institutional wording, and do not qualify an answer by saying the text lacks a simple or universal obligation for modern believers. Keep predicates distinct: a statement about whether others may judge a practice does not by itself abolish, exempt, or establish whether the underlying practice applies. Follow the actual premises and qualifications in the text. Do not independently introduce a contradiction, exception, or controversy. Address a textual qualification when it is materially relevant.

Before using a passage in the reader-facing answer, identify its actual subject, speaker and audience, the action or circumstance it addresses, and the proposition its wording establishes. A passage is not contrary or qualifying evidence merely because it shares a topic word with the question. Different predicates remain distinct even when they concern the same object: a command about judging, permitting, discussing, or remembering a practice does not by itself answer whether someone should perform that practice. Do not place such a passage after “but,” “however,” or “likewise” as a qualification unless its text establishes a logical connection to the exact proposition asked. A negative applicability conclusion requires affirmative text supporting a role, circumstance, scope restriction, or change; inability to find a repeated command is not that support. Do not substitute personal estimation, historical practice, or a neighboring event for a statement about the command, action, identity, or timing actually asked. Use a possible counterpoint only when its own text materially bears on the same proposition or the user asks for the comparison. State whether a conclusion is explicit, contextually supported, or inferred; never infer a different subject from what a passage does not say.

For broad identity questions, make the first independent clause state the direct textual identification of the person or subject asked about and cite that direct identification publicly. Do not postpone that identification until after a list of titles. In a concise answer, add only the few prophetic descriptions or relational distinctions needed to answer the question; keep the fuller verified evidence internal unless the reader requests a survey. Then report any included prophetic descriptions and titles, keeping each title attached to its own speaker and passage. Keep relational statements distinct: who is the Father, who is the Son, who sends, appoints, raises, exalts, or gives authority, and who receives it. Preserve the exact pair named in an identity comparison: evidence that A is distinct from B does not establish whether A is identical with, named as, or shares a title or nature with C. Distinguish personal identity, application of a name or title, divine identity or nature, and relational roles. Do not turn a shared title into personal identity, or a relational distinction into denial of a title or name. Interpret “God” according to the passage's speaker, referent, context, and wording. If the supplied evidence establishes related distinctions but not the exact categorical identity proposition, state what it establishes naturally instead of manufacturing yes or no. Label any conclusion beyond the direct wording as synthesis. Address every material proposition in a multi-part question without repeating the same distinction.

When comparing covenants, commands, people, or institutions, preserve the grammatical target of every predicate: fault found with people is not automatically fault attributed to the covenant, and a statement about an arrangement is not automatically a statement about its law or participants. Preserve negative and comparative constructions without strengthening them into a different positive label: “not faultless” must not be silently rewritten as “faulty.” When the supplied covenant evidence separately states fault found with people and the status of a covenant, state both without transferring the first predicate to the second. Preserve temporal wording separately—completed action, present transition, and future result must not be flattened into one tense. When later Scripture describes a covenantal change while also repeating law written inwardly, report both propositions rather than using one to erase the other.

Use the smallest sufficient set of materially relevant references in the verified evidence. Never invent quotations, citations, historical facts, or lexical identities. Do not put quotation marks around a paraphrase, compressed wording, or wording joined with an ellipsis. Keep distinct speakers, events, and passages distinct. Use clear English prose and never combine two writing systems inside one word. Every essential reasoning premise must correspond to a clause actually displayed in the reader-facing answer. Omit unused internal evidence from the public citation list. If a clear conclusion follows, state it confidently without demanding a modern wording of the question in the ancient text. Leave limitations empty unless a concrete, material limitation prevents an answer. For lexical requests use only verified source evidence. State the word's contextual sense in the requested verse first; if useful, introduce other dictionary glosses separately as its broader lexical range. Never attach an unused broader gloss to the contextual meaning with “or.”`;

const VERIFIED_EVIDENCE_ONLY_SUFFIX = `

The supplied verified evidence is the finalized evidence set for this answer. Use only references and source-language identities present in it for material Scripture claims. Do not introduce another biblical reference from memory. If that evidence is insufficient, return insufficient-evidence and state the limitation.`;

function responseSchema(packet: EmetAiEvidencePacket | null) {
  const publicReferenceLimit = Math.max(1, Math.min(24, packet?.responseDesign?.maxScriptureCitations || 8));
  const verifiedReferences = Array.from(new Set(
    (packet?.evidence || []).flatMap((item) => item.reference ? [item.reference] : []),
  ));
  const verifiedReferenceSchema = verifiedReferences.length > 0
    ? { type: "string", enum: verifiedReferences }
    : { type: "string" };
  const claimAuthorityIds = packet?.foundationalIdentityContract
    ? [
        ...packet.foundationalIdentityContract.propositions.map((item) => item.id),
        ...packet.foundationalIdentityContract.interpretations.map((item) => item.id),
      ]
    : ["model-evidence-claim"];
  return {
    type: "object",
    properties: {
      schemaVersion: { type: "string", const: EMET_AI_SIMPLE_GENERATION_SCHEMA },
      status: { type: "string", enum: ["complete", "insufficient-evidence"] },
      conclusion: {
        type: "string",
        description: "Use yes/no only for a polar question and not-applicable for who, what, when, where, why, how, lexical, and explanatory questions.",
        enum: ["yes", "no", "qualified", "not-applicable"],
      },
      conclusionSupport: { type: "string", enum: ["explicit-statement", "strong-implication", "theological-synthesis", "possible-interpretation", "does-not-establish"] },
      answer: {
        type: "string",
        description: packet?.foundationalIdentityContract
          ? "A provisional concise rendering of the ordered reasoning claims. Do not add any material assertion absent from reasoning; the displayed identity answer is constructed from those claims."
          : "The concise reader-facing answer.",
      },
      references: {
        type: "array",
        description: "Smallest sufficient public citation set. Use one exact verified reference per item.",
        items: verifiedReferenceSchema,
        maxItems: publicReferenceLimit,
      },
      reasoning: {
        type: "array",
        description: packet?.foundationalIdentityContract
          ? "Ordered, natural reader-facing claim sentences. These exact claim texts form the displayed answer, so include the direct answer and every material identity assertion here; do not put unsupported connective theology only in answer."
          : "Only the essential premises and links needed to understand the displayed conclusion. Do not repeat Scripture quotations.",
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            support: { type: "string", enum: ["explicit-statement", "strong-implication", "theological-synthesis", "possible-interpretation", "does-not-establish"] },
            answerBearing: {
              type: "boolean",
              description: "True only when this claim itself directly answers a proposition asked by the user. A complete foundational-identity answer requires at least one supported answer-bearing claim.",
            },
            authorityId: {
              type: "string",
              description: packet?.foundationalIdentityContract
                ? "Select one permitted proposition or interpretation ID. The application controls its claim type, approved wording, and evidence dependencies."
                : "Use model-evidence-claim for an evidence-linked nonidentity claim.",
              enum: claimAuthorityIds,
            },
            references: { type: "array", items: verifiedReferenceSchema, maxItems: 10 },
          },
          required: ["text", "support", "answerBearing", "authorityId", "references"],
          additionalProperties: false,
        },
      },
      lexicalAnalyses: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          properties: {
            reference: verifiedReferenceSchema,
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
    required: ["schemaVersion", "status", "conclusion", "conclusionSupport", "answer", "references", "reasoning", "lexicalAnalyses", "limitations"],
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
    evidenceId: item.id,
    kind: item.kind,
    corpus: item.corpus,
    reference: item.reference || "",
    text: item.text,
    lexicalId: item.lexicalId || "",
    relevance: item.provenance.retrieval ? {
      method: item.provenance.retrieval.method,
      role: item.provenance.retrieval.role,
      score: item.provenance.retrieval.score,
    } : null,
  }));
}

function requiredEvidenceComponents(packet: EmetAiEvidencePacket | null) {
  if (!packet) return [];
  return packet.reasoning.components.map((component) => {
    const evidenceIds = packet.governingCoverage?.find((item) => item.componentId === component.id)?.evidenceIds || [];
    return {
      componentId: component.id,
      proposition: component.proposition,
      evidence: evidenceIds.flatMap((id) => {
        const item = packet.evidence.find((evidence) => evidence.id === id);
        return item?.reference ? [{ evidenceId: id, reference: item.reference }] : [];
      }),
    };
  });
}

function reasoningEffortForPacket(
  packet: EmetAiEvidencePacket | null,
  fallback: "none" | "low" | "medium",
) {
  if (!packet) return fallback;
  const componentIds = new Set(packet.reasoning.components.map((component) => component.id));
  const books = new Set(packet.evidence.flatMap((item) => {
    const book = item.reference?.match(/^((?:[1-3]\s+)?[A-Za-z]+(?:\s+[A-Za-z]+)*)\s+\d+:/)?.[1];
    return book ? [book] : [];
  }));
  const materiallyRelational =
    componentIds.has("source-language-context") ||
    (componentIds.has("explicit-request") && books.size >= 2);
  if (materiallyRelational) return "medium";
  if (packet.reasoning.components.length >= 3 ||
    (componentIds.has("prophetic-testimony") && componentIds.has("apostolic-testimony"))) {
    return "low";
  }
  return fallback;
}
export function createEmetAiSimpleOpenAiProvider({
  model = process.env.EMET_AI_SIMPLE_MODEL?.trim() || "gpt-5.4-mini",
  reasoningEffort = process.env.EMET_AI_SIMPLE_REASONING_EFFORT?.trim() === "medium"
    ? "medium"
    : process.env.EMET_AI_SIMPLE_REASONING_EFFORT?.trim() === "low" ? "low" : "none",
  verifiedEvidenceOnly = false,
}: {
  model?: string;
  reasoningEffort?: "none" | "low" | "medium";
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
        reasoning: {
          effort: reasoningEffortForPacket(candidatePacket, reasoningEffort),
        },
        // Structured verification accompanies the public answer. A deep but
        // still concise comparison can spend several thousand tokens on model
        // reasoning before emitting its claims, so 4,000 could cut valid JSON
        // off mid-field. This is a ceiling, not a requested response length.
        max_output_tokens: 6_000,
        input: [
          { role: "system", content: `${EMET_AI_SIMPLE_SYSTEM_INSTRUCTION}${verifiedEvidenceOnly ? VERIFIED_EVIDENCE_ONLY_SUFFIX : ""}` },
          {
            role: "user",
            content: JSON.stringify({
              question,
              conversation: compactConversation(conversation),
              responseDesign: candidatePacket?.responseDesign || null,
              verifiedCandidateEvidence: compactEvidenceForSimpleAnswer(candidatePacket),
              foundationalIdentityContract: candidatePacket?.foundationalIdentityContract || null,
              requiredEvidenceComponents: requiredEvidenceComponents(candidatePacket),
              verificationRequirement: "Return the direct public answer and only the essential reasoning premises that connect its cited evidence to its conclusion. Do not reproduce Scripture excerpts; they are already locked in the packet. Mark answerBearing=true only on a reasoning proposal that directly answers a proposition in the user's question. When a foundationalIdentityContract is supplied, select one available authorityId for each reasoning item. The application, not the model, controls the selected authority's claim type, exact approved wording, and complete evidence dependencies. The active answerRequirements identify the propositions the final answer must address. A God-language authority does not answer a personal-identity proposition, and a personal-identity authority does not answer whether Scripture applies the title God. Proposed text may explain why an authority was selected, but it is not authoritative public prose and cannot replace the registry statement. Do not invent authority IDs or classify evidence levels. Applying God, Elohim, Lord, or divine language does not by itself establish personal identity or shared nature. Every biblical reference explicitly named in a reasoning sentence must appear in its references. Do not emit an item for every coverage component. For nonidentity questions use authorityId=model-evidence-claim and preserve should/must force. If the evidence does not establish the answer, return insufficient-evidence.",
              relevanceRequirement: "For each reader-facing claim, use passages whose actual subject and predicate establish that claim. A passage about a related but different action may remain in internal component assessment, but must not become a public counterpoint, qualification, or citation unless the answer explains a text-supported logical connection to the proposition asked. Retrieval or component coverage alone never creates a duty to mention a passage publicly. Omit a correct secondary point unless it materially changes the answer to the exact proposition asked.",
              citationRequirement: "Treat responseDesign.maxScriptureCitations as the public citation limit. Prefer the passage that directly identifies the answer or states the governing proposition, then the smallest necessary foundational and later witnesses. For a broad identity answer, spend a citation on direct identification before titles or descriptive breadth. If the citation budget cannot support a descriptive detail, omit that detail instead of attaching an indirect citation. Do not cite every retained packet passage or every internal assessment. Material evidence remains available internally even when it is not displayed.",
              textualDistinctionRequirement: "Preserve material differences in subject, predicate, negation, and tense in both the public answer and essential reasoning. Keep separately stated fault, people, covenant status, inward law, promise, and fulfillment distinct. Do not turn becoming old or approaching disappearance into a completed disappearance, and do not add a causal relationship unless the cited text states or supports it.",
            }),
          },
        ],
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "emet_ai_simple_generation",
            strict: true,
            schema: responseSchema(candidatePacket),
          },
        },
      });
      const latencyMs = performance.now() - startedAt;
      const rawOutput = response.output_text || "";
      let parsed: unknown = null;
      try { parsed = rawOutput ? JSON.parse(rawOutput) : null; } catch { parsed = null; }
      const usage = response.usage;
      const generationDraft = response.status === "completed"
        ? parseEmetAiSimpleGenerationDraft(parsed)
        : null;
      return {
        draft: generationDraft && candidatePacket
          ? hydrateEmetAiSimpleGenerationDraft({ packet: candidatePacket, draft: generationDraft })
          : null,
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
