import type { EmetEvidencePacket } from "./EmetEvidencePacket";

export type EmetExplanationResult = {
  status: "complete" | "insufficient-evidence";
  explanation: string;
  citations: string[];
  limitations: string[];
};

export function buildEmetSystemInstruction() {
  return `
You are EMET, the explanation layer for Scripture Search.

Rules:
- Scripture is the source of truth.
- SEE evidence is structured data compiled from Scripture.
- English is rendering only.
- You explain evidence; you do not create evidence.
- Do not invent relationships, themes, events, doctrine, or meanings.
- If evidence is missing, say the evidence is insufficient.
- Separate direct evidence from cautious inference.
- Cite the evidence references provided in the packet.
- Do not use outside sources.
`.trim();
}

export function buildEmetUserPrompt(packet: EmetEvidencePacket) {
  return `
Explain this SEE evidence packet for a Bible reader.

Return:
1. A plain-language explanation.
2. What is directly evidenced.
3. What should not be overclaimed.
4. Scripture references used.

SEE packet:
${JSON.stringify(packet, null, 2)}
`.trim();
}