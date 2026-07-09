import OpenAI from "openai";

let client: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  if (!client) {
    client = new OpenAI({
      apiKey,
    });
  }

  return client;
}

export async function callEmetProvider(prompt: string): Promise<string> {
  const openai = getOpenAIClient();

  const response = await openai.responses.create({
    model: "gpt-5.5",
    input: prompt,
    temperature: 0.2,
  });

  let text = "";

  for (const output of response.output ?? []) {
    if (output.type !== "message") continue;

    for (const content of output.content ?? []) {
      if (content.type === "output_text") {
        text += content.text;
      }
    }
  }

  return text.trim();
}