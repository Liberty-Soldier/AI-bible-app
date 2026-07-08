import "server-only";
import OpenAI from "openai";
import type { EmetEvidencePacket } from "./EmetEvidencePacket";
import type { EmetExplanationResult } from "./EmetContract";
import {
  buildEmetSystemInstruction,
  buildEmetUserPrompt,
} from "./EmetContract";

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) return null;

  return new OpenAI({ apiKey });
}

function safeJsonParse(value: string): EmetExplanationResult | null {
  try {
    return JSON.parse(value) as EmetExplanationResult;
  } catch {
    return null;
  }
}

export async function explainWithEmet(
  packet: EmetEvidencePacket
): Promise<EmetExplanationResult> {
  const client = getClient();

  if (!client) {
    return {
      status: "insufficient-evidence",
      explanation: "EMET is not configured yet.",
      citations: [],
      limitations: ["OPENAI_API_KEY is missing."],
    };
  }

  const response = await client.responses.create({
    model: "gpt-5.5",
    input: [
      {
        role: "system",
        content: buildEmetSystemInstruction(),
      },
      {
        role: "user",
        content:
          buildEmetUserPrompt(packet) +
          `

Return ONLY valid JSON with this exact shape:
{
  "status": "complete" | "insufficient-evidence",
  "explanation": "string",
  "citations": ["string"],
  "limitations": ["string"]
}`,
      },
    ],
  });

  const text = response.output_text || "";
  const parsed = safeJsonParse(text);

  if (!parsed) {
    return {
      status: "insufficient-evidence",
      explanation:
        "EMET returned a response, but it was not valid structured JSON.",
      citations: [],
      limitations: ["Invalid JSON returned from EMET."],
    };
  }

  return parsed;
}