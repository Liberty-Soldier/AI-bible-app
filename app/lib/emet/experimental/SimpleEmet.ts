import "server-only";

import OpenAI from "openai";

export const SIMPLE_EMET_SYSTEM = `You are EMET, a knowledgeable Scripture teacher approaching the Bible from a Torah-observant, non-Trinitarian Messianic perspective.

Your purpose is to help people understand Scripture through careful contextual reading and sound reasoning.

Yahweh and Yahshua

Yahweh is the Father, the one true God. Yahshua is His Messiah and Son, personally distinct from the Father.

Explain this non-Trinitarian understanding from Scripture rather than relying on denominational creeds.

Yahweh's commandments

Yahweh's commandments remain authoritative for His people. The Messiah did not abolish the Law and Prophets.

Obedience is relevant to all believers, including Gentiles who have joined themselves to Yahweh through the Messiah.

Do not assume a commandment was abolished merely because a later passage is interpreted differently.

Israel and believers

Yahweh has one covenant people. Gentile believers are grafted into Israel and become fellow citizens through Messiah.

The Church has not replaced Israel, and Gentile believers do not belong to a separate covenant people governed by unrelated divine standards.

Reasoning and communication

- Begin with the Torah and Prophets as foundational Scripture.
- Understand the New Testament in continuity with the earlier Scriptures.
- Consider the context, speaker, audience, and purpose of relevant passages.
- Examine passages that appear to challenge the conclusion.
- Distinguish explicit statements from interpretations.
- Answer simple questions simply.
- Cite Scripture accurately.
- Follow the conversation across turns.
- Reconsider previous conclusions when the user identifies an apparent contradiction.
- Do not invent verses or present an interpretation as an explicit quotation.
- Explain meaningful alternative interpretations fairly when relevant, while making EMET's perspective clear.

Scripture is the authority, not the assistant's previous answers.

Write naturally, clearly, concisely, and respectfully.`;

export type SimpleTurn = { question: string; answer: string };
export type SimpleDraft = {
  status: "complete" | "insufficient-evidence";
  answer: string;
  support: "explicit-statement" | "strong-implication" | "theological-synthesis" | "possible-interpretation" | "does-not-establish";
  references: Array<{ reference: string; translation: "web" | "kjv" | "brenton" }>;
  quotations: Array<{ reference: string; translation: "web" | "kjv" | "brenton"; text: string }>;
  limitations: string[];
};

export function parseSimpleHistory(value: unknown): SimpleTurn[] | null {
  if (!Array.isArray(value) || value.length > 6) return null;
  let characters = 0;
  const turns: SimpleTurn[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") return null;
    const turn = candidate as Record<string, unknown>;
    if (typeof turn.question !== "string" || !turn.question.trim() || turn.question.length > 800 || typeof turn.answer !== "string" || turn.answer.length > 10_000) return null;
    characters += turn.question.length + turn.answer.length;
    if (characters > 32_000) return null;
    turns.push({ question: turn.question, answer: turn.answer });
  }
  return turns;
}

export function configuredSimpleEmetModel() {
  return process.env.EMET_AI_FAST_ENGINE === "true"
    ? process.env.EMET_AI_SIMPLE_MODEL?.trim() || "gpt-5.4-mini"
    : process.env.EMET_AI_ANSWER_MODEL?.trim() || "gpt-5.4-2026-03-05";
}

export const SIMPLE_EMET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["complete", "insufficient-evidence"] },
    answer: { type: "string", description: "The natural conversational explanation. Sources belong in references. Declare any Scripture quotations in quotations with their exact passage and translation; incidental quoted explanatory phrases are not Scripture quotations." },
    support: { type: "string", enum: ["explicit-statement", "strong-implication", "theological-synthesis", "possible-interpretation", "does-not-establish"] },
    references: {
      type: "array", maxItems: 16,
      items: {
        type: "object", additionalProperties: false,
        properties: { reference: { type: "string", description: "Book chapter:verse or a bounded contiguous verse range." }, translation: { type: "string", enum: ["web", "kjv", "brenton"] } },
        required: ["reference", "translation"],
      },
    },
    quotations: {
      type: "array", maxItems: 16,
      description: "Explicit Scripture quotations only. Use an empty array when none. Each quotation must match its own referenced passage and translation, also included in references.",
      items: {
        type: "object", additionalProperties: false,
        properties: { reference: { type: "string" }, translation: { type: "string", enum: ["web", "kjv", "brenton"] }, text: { type: "string" } },
        required: ["reference", "translation", "text"],
      },
    },
    limitations: { type: "array", maxItems: 8, items: { type: "string" } },
  },
  required: ["status", "answer", "support", "references", "quotations", "limitations"],
} as const;

export function parseSimpleDraft(value: unknown): SimpleDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = SIMPLE_EMET_SCHEMA.required;
  if (Object.keys(value).some((key) => !keys.includes(key as typeof keys[number]))) return null;
  const draft = value as SimpleDraft;
  if (!["complete", "insufficient-evidence"].includes(draft.status) || typeof draft.answer !== "string" || !draft.answer.trim() || draft.answer.length > 16_000 ||
    !SIMPLE_EMET_SCHEMA.properties.support.enum.includes(draft.support) || !Array.isArray(draft.references) || draft.references.length > 16 ||
    draft.references.some((item) => !item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some((key) => key !== "reference" && key !== "translation") || typeof item.reference !== "string" || !item.reference.trim() || item.reference.length > 160 || !["web", "kjv", "brenton"].includes(item.translation)) ||
    !Array.isArray(draft.quotations) || draft.quotations.length > 16 || draft.quotations.some((item) => !item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some((key) => !["reference", "translation", "text"].includes(key)) || typeof item.reference !== "string" || !item.reference.trim() || item.reference.length > 160 || !["web", "kjv", "brenton"].includes(item.translation) || typeof item.text !== "string" || !item.text.trim() || item.text.length > 10_000) ||
    !Array.isArray(draft.limitations) || draft.limitations.length > 8 || draft.limitations.some((item) => typeof item !== "string" || item.length > 1000)) return null;
  return draft;
}

export type SimpleGenerationDiagnostics = {
  stage: "model-response" | "json-parsing" | "structured-output" | "model-answer";
  code: "model-incomplete" | "model-not-completed" | "model-refusal" | "empty-output" | "invalid-json" | "invalid-structure" | "model-insufficient-evidence" | "draft-ready";
  responseStatus: "completed" | "incomplete" | "failed" | "cancelled" | "queued" | "in_progress" | "unknown";
  incompleteReason: "max_output_tokens" | "content_filter" | "other" | null;
  outputCharacters: number;
  outputTokens: number | null;
  reasoningTokens: number | null;
  json: "not-attempted" | "invalid" | "valid";
  structure: "not-checked" | "invalid" | "valid";
  modelAnswerStatus: SimpleDraft["status"] | null;
};
export type SimpleGenerationResult = { draft: SimpleDraft | null; diagnostics: SimpleGenerationDiagnostics };

// Only allowlisted statuses and bounded counters leave the provider boundary.
// Never retain output items, refusal text, model reasoning, prompts or API errors.
export function inspectSimpleResponse(response: {
  status?: string; incomplete_details?: { reason?: string } | null; output_text?: string;
  output?: Array<{ type: string; content?: Array<{ type: string }> }>;
  usage?: { output_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } | null } | null;
}): SimpleGenerationResult {
  const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1_000_000) : null;
  const text = typeof response.output_text === "string" ? response.output_text : "";
  const diagnostics: SimpleGenerationDiagnostics = {
    stage: "model-response", code: "model-not-completed",
    responseStatus: (["completed", "incomplete", "failed", "cancelled", "queued", "in_progress"].includes(response.status || "") ? response.status : "unknown") as SimpleGenerationDiagnostics["responseStatus"],
    incompleteReason: response.incomplete_details?.reason ? (["max_output_tokens", "content_filter"].includes(response.incomplete_details.reason) ? response.incomplete_details.reason as "max_output_tokens" | "content_filter" : "other") : null,
    outputCharacters: Math.min(text.length, 1_000_000), outputTokens: count(response.usage?.output_tokens),
    reasoningTokens: count(response.usage?.output_tokens_details?.reasoning_tokens),
    json: "not-attempted", structure: "not-checked", modelAnswerStatus: null,
  };
  if (response.status !== "completed") {
    diagnostics.code = response.status === "incomplete" ? "model-incomplete" : "model-not-completed";
    return { draft: null, diagnostics };
  }
  if (response.output?.some((item) => item.type === "message" && item.content?.some((part) => part.type === "refusal"))) {
    diagnostics.code = "model-refusal";
    return { draft: null, diagnostics };
  }
  if (!text.trim()) { diagnostics.code = "empty-output"; return { draft: null, diagnostics }; }
  diagnostics.stage = "json-parsing";
  let value: unknown;
  try { value = JSON.parse(text); diagnostics.json = "valid"; }
  catch { diagnostics.json = "invalid"; diagnostics.code = "invalid-json"; return { draft: null, diagnostics }; }
  diagnostics.stage = "structured-output";
  const draft = parseSimpleDraft(value);
  diagnostics.structure = draft ? "valid" : "invalid";
  if (!draft) { diagnostics.code = "invalid-structure"; return { draft: null, diagnostics }; }
  diagnostics.stage = "model-answer";
  diagnostics.modelAnswerStatus = draft.status;
  diagnostics.code = draft.status === "complete" ? "draft-ready" : "model-insufficient-evidence";
  return { draft, diagnostics };
}

export async function generateSimpleEmet(question: string, history: SimpleTurn[], context: unknown, model = configuredSimpleEmetModel()): Promise<SimpleGenerationResult> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("Model unavailable");
  const client = new OpenAI({ apiKey: key, maxRetries: 0, timeout: 90_000 });
  const response = await client.responses.create({
    model, store: false, max_output_tokens: 2200,
    input: [
      { role: "system", content: SIMPLE_EMET_SYSTEM },
      ...history.flatMap((turn) => [{ role: "user" as const, content: turn.question }, { role: "assistant" as const, content: turn.answer }]),
      { role: "user", content: JSON.stringify({ question, readerContext: context }) },
    ],
    text: { format: { type: "json_schema", name: "simple_emet_owner_answer", strict: true, schema: SIMPLE_EMET_SCHEMA } },
  });
  return inspectSimpleResponse(response);
}
