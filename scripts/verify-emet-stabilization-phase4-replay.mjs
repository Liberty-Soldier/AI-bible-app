import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { validateEmetAiAnswer } from "../app/lib/emet/EmetAiContract.ts";

const auditDirectory = path.join(process.cwd(), ".private", "emet-live-audits");
const artifactNames = fs.readdirSync(auditDirectory)
  .filter((name) =>
    /^phase3-.*\.json$/.test(name) &&
    name < "phase3-2026-10-12T10-51"
  )
  .sort();

assert.ok(artifactNames.length >= 2, "Phase 3 verbatim audit artifacts are required.");

const results = artifactNames.flatMap((name) => {
  const artifact = JSON.parse(fs.readFileSync(path.join(auditDirectory, name), "utf8"));
  return artifact.results.map((result) => ({ artifact: name, ...result }));
});

const replay = results.map((result) => {
  const validation = validateEmetAiAnswer(
    result.verifiedEvidencePacket,
    result.cold.answer,
  );
  return {
    question: result.question,
    savedStatus: result.cold.answer.status,
    replayValid: validation.ok,
    errors: validation.ok ? [] : validation.errors,
  };
});

for (const item of replay) {
  console.log(JSON.stringify(item));
}

const commandmentReplay = replay.find((item) =>
  item.question === "What commandments should believers keep?"
);
assert.ok(commandmentReplay, "The Phase 3 commandment artifact is required.");
assert.equal(commandmentReplay.replayValid, false);
assert.ok(commandmentReplay.errors.some((error) =>
  /representative rather than.*exhaustive/i.test(error)
));

for (const item of replay.filter((entry) =>
  entry.savedStatus === "complete" && entry !== commandmentReplay
)) {
  assert.equal(item.replayValid, true, `${item.question}: ${item.errors.join(" | ")}`);
}

for (const item of replay.filter((entry) => entry.savedStatus === "insufficient-evidence")) {
  assert.equal(item.replayValid, true, `${item.question}: fail-closed replay must remain valid`);
}

console.log("EMET Phase 4 preserved-artifact replay passed.");
console.log("- Previously successful answers remain valid except the known partial-list completeness defect.");
console.log("- Phase 3 fail-closed answers remain safe and valid.");
console.log("- Rejected model drafts were not persisted, so their prose cannot be reconstructed or claimed as replayed.");
