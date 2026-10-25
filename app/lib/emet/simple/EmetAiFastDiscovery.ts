import "server-only";

import OpenAI from "openai";

import type { EmetConversationContext } from "../EmetAiConversation";
import type { FastScripturePassage } from "./EmetAiFastScriptureRetrieval";
import type { EmetAiSimpleUsage } from "./EmetAiSimpleProvider";

export const EMET_AI_FAST_DISCOVERY_SCHEMA = "emet-ai-fast-discovery@1" as const;

export const EMET_AI_FAST_COVERAGE_DIMENSIONS = [
  "explicit-request", "foundation", "governing-instruction", "audience-scope",
  "duration-conditions", "prophetic-testimony", "messiah-teaching",
  "apostolic-testimony", "timing-sequence", "role-circumstance",
  "source-language-context", "immediate-context",
] as const;
export type EmetAiFastCoverageDimension = typeof EMET_AI_FAST_COVERAGE_DIMENSIONS[number];

export type EmetAiFastDiscoveryDraft = {
  schemaVersion: typeof EMET_AI_FAST_DISCOVERY_SCHEMA;
  references: Array<{
    reference: string;
    relevance: string;
    required: boolean;
    covers?: EmetAiFastCoverageDimension[];
  }>;
  requiredCoverage?: EmetAiFastCoverageDimension[];
  lexicalLookups: Array<{
    reference: string;
    corpus: "hebrew" | "greek-nt" | "lxx";
    lookup: string;
    mode?: "term" | "verse-sequence";
  }>;
  limitations: string[];
  blockingIssues: string[];
};

export interface EmetAiFastDiscoveryProvider {
  model: string;
  discover(input: {
    question: string;
    conversation: EmetConversationContext | null;
    candidates: FastScripturePassage[];
    coveragePlan?: EmetAiFastCoverageDimension[];
  }): Promise<{
    draft: EmetAiFastDiscoveryDraft | null;
    usage: EmetAiSimpleUsage;
    latencyMs: number;
    rawOutput: string;
    estimatedInputCharacters?: number;
  }>;
}

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export function parseEmetAiFastDiscoveryDraft(value: unknown): EmetAiFastDiscoveryDraft | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== EMET_AI_FAST_DISCOVERY_SCHEMA ||
    !Array.isArray(candidate.references) ||
    !Array.isArray(candidate.lexicalLookups) ||
    !Array.isArray(candidate.limitations) ||
    (candidate.blockingIssues !== undefined && !Array.isArray(candidate.blockingIssues))
  ) return null;
  const references = candidate.references.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const reference = clean(entry.reference, 80);
    const relevance = clean(entry.relevance, 240);
    const covers = Array.isArray(entry.covers)
      ? Array.from(new Set(entry.covers.map((item) => clean(item, 32)).filter(
          (item): item is EmetAiFastCoverageDimension => EMET_AI_FAST_COVERAGE_DIMENSIONS.includes(item as EmetAiFastCoverageDimension),
        ))).slice(0, 8)
      : [];
    return reference && relevance ? [{ reference, relevance, required: entry.required !== false, covers }] : [];
  }).slice(0, 20);
  const lexicalLookups = candidate.lexicalLookups.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const corpus = clean(entry.corpus, 16);
    const reference = clean(entry.reference, 80);
    const lookup = clean(entry.lookup, 80);
    const mode: "term" | "verse-sequence" = entry.mode === "verse-sequence" ? "verse-sequence" : "term";
    if (!reference || !lookup || !["hebrew", "greek-nt", "lxx"].includes(corpus)) return [];
    return [{ reference, corpus: corpus as "hebrew" | "greek-nt" | "lxx", lookup, mode }];
  }).slice(0, 8);
  const requiredCoverage = Array.isArray(candidate.requiredCoverage)
    ? Array.from(new Set(candidate.requiredCoverage.map((item) => clean(item, 32)).filter(
        (item): item is EmetAiFastCoverageDimension => EMET_AI_FAST_COVERAGE_DIMENSIONS.includes(item as EmetAiFastCoverageDimension),
      ))).slice(0, 8)
    : [];
  return {
    schemaVersion: EMET_AI_FAST_DISCOVERY_SCHEMA,
    references,
    requiredCoverage,
    lexicalLookups,
    limitations: Array.from(new Set(candidate.limitations.map((item) => clean(item, 300)).filter(Boolean))).slice(0, 6),
    // Older saved discovery artifacts predate this field. Treat their cautions as
    // qualifications, not proof that verified evidence is absent.
    blockingIssues: Array.from(new Set((candidate.blockingIssues || []).map((item) => clean(item, 300)).filter(Boolean))).slice(0, 6),
  };
}

export const EMET_AI_FAST_DISCOVERY_INSTRUCTION = `You identify Scripture evidence; you do not answer the theological question.

Return the smallest sufficient set of material Bible references needed to answer responsibly. Start with passages that positively and directly establish the subject. Give a brief, text-grounded relevance statement for each reference without supplying a theological conclusion. Prioritize explicit references from the user. For a New Testament question whose meaning depends on an Old Testament foundation, include the relevant Torah, Prophets, or Writings foundation before related later testimony.

The input may contain structural evidenceNeeds selected from the canonical question contract. Use them only as search guidance. Echo them in requiredCoverage and tag references for diagnostics, but these model-produced labels do not certify evidence completeness and do not control which verified passages survive assembly. Prefer direct governing texts over repeated historical examples. Apply the same discipline to timing, covenants, prophecy, righteousness, source-language questions, and role-specific instructions. Do not use a historical practice merely as a substitute for governing teaching.

Retrieve audience, role, circumstances, duration, timing, and nearby context when the actual question requires them. For command-applicability questions, identify the governing instruction and its stated recipients and conditions; include later passages only when they materially address the same command or are needed to answer the user's question. Do not routinely search for counterexamples, repeal, exemptions, contradictions, or opposing positions. Include such evidence only when the user asks about it or Scripture explicitly raises a material issue. Do not assume continuity, repeal, fulfillment, or a doctrinal conclusion. Silence, omission from a later list, or lack of New Testament restatement is not evidence of repeal or exemption. Do not write an essay or conclusion.

Candidate passages are verified but may be incomplete or noisy. You may omit them. Every reference you return will be independently resolved against a locked Bible corpus. Never invent a reference or lexical identity. Describe what a passage actually states; do not characterize an omission as an exemption, assign a named subject to a passage that does not name it, or label a passage disputed merely because interpreters disagree. Mark a reference required only when the answer materially depends on it; otherwise mark it supporting.

Request lexical evidence only when the user asks for source-language analysis. Use mode "term" with one source word, transliteration, Strong's identity, or one English lookup label. Never put an analysis instruction or sentence in a term lookup. Use mode "verse-sequence" for a phrase in a specified verse, morphology across that phrase, or whether an English rendering corresponds to a distinct source token; this returns the complete verified source-token sequence for that verse so the answer can assess it without guessing from English.

Leave limitations empty unless a concrete evidence limitation materially affects what can responsibly be answered. Synthesis across several passages, the absence of one universal proof-text, or possible theological disagreement is not itself a limitation. Use blockingIssues only when missing evidence, an unresolved factual or lexical conflict, or another concrete defect prevents any responsible answer from the supplied references. Do not treat absence of a universal New Testament restatement as a limitation or blocking issue.`;

function responseSchema() {
  return {
    type: "object",
    properties: {
      schemaVersion: { type: "string", const: EMET_AI_FAST_DISCOVERY_SCHEMA },
      references: {
        type: "array", maxItems: 20,
        items: {
          type: "object",
          properties: {
            reference: { type: "string" }, relevance: { type: "string" }, required: { type: "boolean" },
            covers: { type: "array", maxItems: 8, items: { type: "string", enum: EMET_AI_FAST_COVERAGE_DIMENSIONS } },
          },
          required: ["reference", "relevance", "required", "covers"], additionalProperties: false,
        },
      },
      requiredCoverage: { type: "array", maxItems: 8, items: { type: "string", enum: EMET_AI_FAST_COVERAGE_DIMENSIONS } },
      lexicalLookups: {
        type: "array", maxItems: 8,
        items: {
          type: "object",
          properties: {
            reference: { type: "string" },
            corpus: { type: "string", enum: ["hebrew", "greek-nt", "lxx"] },
            lookup: { type: "string" },
            mode: { type: "string", enum: ["term", "verse-sequence"] },
          },
          required: ["reference", "corpus", "lookup", "mode"], additionalProperties: false,
        },
      },
      limitations: { type: "array", maxItems: 6, items: { type: "string" } },
      blockingIssues: { type: "array", maxItems: 6, items: { type: "string" } },
    },
    required: ["schemaVersion", "references", "requiredCoverage", "lexicalLookups", "limitations", "blockingIssues"],
    additionalProperties: false,
  } as const;
}

function compactConversation(conversation: EmetConversationContext | null) {
  if (!conversation) return null;
  return conversation.recentExchanges.slice(-3).map((exchange) => ({
    question: exchange.question,
    answer: exchange.answer.slice(0, 700),
    references: exchange.references.slice(0, 8),
  }));
}

export function createEmetAiFastDiscoveryProvider({
  model = "gpt-5.4-mini",
}: { model?: string } = {}): EmetAiFastDiscoveryProvider | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey });
  return {
    model,
    async discover({ question, conversation, candidates, coveragePlan = [] }) {
      const inputObject = {
        question,
        conversation: compactConversation(conversation),
        structuralEvidenceNeeds: coveragePlan,
        verifiedInitialCandidates: candidates.slice(0, 20).map((passage) => ({
          reference: passage.reference,
          text: passage.text,
        })),
      };
      const startedAt = performance.now();
      const response = await client.responses.create({
        model,
        store: false,
        reasoning: { effort: "none" },
        max_output_tokens: 900,
        input: [
          { role: "system", content: EMET_AI_FAST_DISCOVERY_INSTRUCTION },
          { role: "user", content: JSON.stringify(inputObject) },
        ],
        text: {
          verbosity: "low",
          format: { type: "json_schema", name: "emet_fast_discovery", strict: true, schema: responseSchema() },
        },
      });
      const rawOutput = response.output_text || "";
      let parsed: unknown = null;
      try { parsed = rawOutput ? JSON.parse(rawOutput) : null; } catch { parsed = null; }
      const usage = response.usage;
      return {
        draft: response.status === "completed" ? parseEmetAiFastDiscoveryDraft(parsed) : null,
        rawOutput,
        latencyMs: performance.now() - startedAt,
        estimatedInputCharacters: EMET_AI_FAST_DISCOVERY_INSTRUCTION.length + JSON.stringify(inputObject).length,
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
