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
    answer: { type: "string", description: "The complete natural answer. Include every cited passage in references; quote Scripture exactly in its selected translation." },
    support: { type: "string", enum: ["explicit-statement", "strong-implication", "theological-synthesis", "possible-interpretation", "does-not-establish"] },
    references: {
      type: "array", maxItems: 16,
      items: {
        type: "object", additionalProperties: false,
        properties: { reference: { type: "string", description: "Book chapter:verse or a bounded contiguous verse range." }, translation: { type: "string", enum: ["web", "kjv", "brenton"] } },
        required: ["reference", "translation"],
      },
    },
    limitations: { type: "array", maxItems: 8, items: { type: "string" } },
  },
  required: ["status", "answer", "support", "references", "limitations"],
} as const;

export function parseSimpleDraft(value: unknown): SimpleDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as SimpleDraft;
  if (!["complete", "insufficient-evidence"].includes(draft.status) || typeof draft.answer !== "string" || !draft.answer.trim() || draft.answer.length > 16_000 ||
    !SIMPLE_EMET_SCHEMA.properties.support.enum.includes(draft.support) || !Array.isArray(draft.references) || draft.references.length > 16 ||
    draft.references.some((item) => !item || typeof item.reference !== "string" || item.reference.length > 160 || !["web", "kjv", "brenton"].includes(item.translation)) ||
    !Array.isArray(draft.limitations) || draft.limitations.length > 8 || draft.limitations.some((item) => typeof item !== "string" || item.length > 1000)) return null;
  return draft;
}

export async function generateSimpleEmet(question: string, history: SimpleTurn[], context: unknown, model = configuredSimpleEmetModel()) {
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
  if (response.status !== "completed") return null;
  try { return parseSimpleDraft(JSON.parse(response.output_text || "null")); } catch { return null; }
}
