import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { isEmetAiCachedAnswerAuthorityVerified } from "../app/lib/emet/EmetAiCachedAnswerAuthority.ts";

const artifact = JSON.parse(await fs.readFile(
  ".private/phase2e-budget-recovery/results.json", "utf8",
));
let cases = 0;
for (const row of artifact.results) {
  const verify = (mutate, expected = false) => {
    const input = { packet: structuredClone(row.result.packet), answer: structuredClone(row.publicPayload), question: row.question };
    mutate(input);
    assert.equal(isEmetAiCachedAnswerAuthorityVerified(input), expected, row.id);
    cases++;
  };
  verify(() => {}, true);
  verify(({ answer }) => { answer.answer += " Yahshua and Yahweh share unity of divine nature."; });
  verify(({ answer }) => { answer.answer += " This is another unsupported material assertion."; });
  verify(({ packet }) => { delete packet.foundationalIdentityContract; });
  verify(({ packet }) => { packet.foundationalIdentityContract.interpretations[0].id = "forged-authority"; });
  verify(({ packet }) => { packet.foundationalIdentityContract.interpretations[0].evidenceLevel = "direct-scripture"; });
  verify(({ packet }) => { packet.foundationalIdentityContract.interpretations[0].basisIds = ["forged-premise"]; });
  verify(({ packet }) => { packet.foundationalIdentityContract.answerRequirements = []; });
  verify(({ packet }) => { packet.foundationalIdentityContract.interpretations[0].evidenceReferences = ["John 1:1"]; });
  verify(({ packet }) => { packet.evidence.find(item => item.reference === "John 20:17").text = "Fabricated Scripture text."; });
  verify(({ answer }) => { answer.claims[0].evidenceIds = []; });
  verify(({ answer }) => { answer.citations.pop(); });
  verify(({ packet, answer }) => {
    const authority = packet.foundationalIdentityContract.interpretations.find(item =>
      answer.claims.some(claim => claim.text === item.text)
    );
    const original = authority.text;
    authority.text += " Yahshua and Yahweh share unity of divine nature.";
    answer.claims.find(claim => claim.text === original).text = authority.text;
    answer.answer = answer.answer.replace(original, authority.text);
  });
  verify(({ packet }) => { packet.question = "Who created the heavens and the earth?"; delete packet.foundationalIdentityContract; });
  verify(({ answer }) => { answer.claims = []; });
  verify(({ answer }) => {
    answer.answer = `Yes. ${answer.answer}`;
    answer.claims.forEach(claim => { claim.polarity = "affirms"; });
  });
  verify(({ answer }) => {
    answer.claims.forEach(claim => { claim.polarity = claim.polarity === "denies" ? "affirms" : "denies"; });
  });
}
console.log(`EMET cached identity authority verification passed (${cases} cases; no model or network calls).`);
