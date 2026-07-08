import type { EmetEvidencePacket } from "./EmetEvidencePacket";
import type { EmetExplanationResult } from "./EmetContract";

function joinRefs(values: Array<string | undefined>) {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean))
  );
}

export function interpretEmetPacket(
  packet: EmetEvidencePacket | null | undefined
): EmetExplanationResult {
  if (!packet) {
    return {
      status: "insufficient-evidence",
      explanation:
        "SEE does not yet have enough structured evidence for EMET to explain this word.",
      citations: [],
      limitations: ["No SEE evidence packet was available."],
    };
  }

  const refs = joinRefs([
    packet.verseContext.reference,
    packet.evidence.firstOccurrence,
    packet.evidence.lastOccurrence,
  ]);

  const lemmaLabel =
    packet.entity.lemma ||
    packet.entity.surface ||
    packet.entity.strong ||
    packet.entity.inputId;

  const explanation = `${lemmaLabel} is connected to SEE evidence from the ${packet.entity.source} witness. SEE records ${packet.evidence.occurrenceCount.toLocaleString()} occurrence${
    packet.evidence.occurrenceCount === 1 ? "" : "s"
  }, with the first occurrence at ${
    packet.evidence.firstOccurrence || "an unavailable reference"
  } and the last occurrence at ${
    packet.evidence.lastOccurrence || "an unavailable reference"
  }. This is evidence data only; EMET should explain its significance without inventing meanings, relationships, or doctrine beyond the packet.`;

  return {
    status: "complete",
    explanation,
    citations: refs,
    limitations: [
      "This is a temporary local interpreter.",
      "Final EMET explanations will be generated from the same packet under the EMET contract.",
    ],
  };
}