const fs = require("fs");
const path = require("path");

const root = process.cwd();

const mapPath = path.join(
  root,
  "scripts",
  "canonical",
  "versification",
  "hebrew-to-english.json"
);

const proposalsPath = path.join(
  root,
  "reports",
  "versification-rule-proposals.json"
);

const ALLOW_IDS = new Set([
  "joel-4-16-18-to-joel-3-16-18",
  "deut-23-21-22-to-deut-23-20-21",
  "neh-10-29-30-to-neh-10-28-29",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toMapRule(proposal) {
  return {
    id: proposal.id,
    sourceBook: proposal.sourceBook,
    sourceChapter: proposal.sourceChapter,
    sourceVerseStart: proposal.sourceVerseStart,
    sourceVerseEnd: proposal.sourceVerseEnd,
    targetBook: proposal.targetBook,
    targetChapter: proposal.targetChapter,
    targetVerseOffset: proposal.targetVerseOffset,
    reason: `Accepted high-confidence proposal: ${proposal.sourceBook} ${proposal.sourceChapter}:${proposal.sourceVerseStart}-${proposal.sourceVerseEnd} maps to ${proposal.targetBook} ${proposal.targetChapter}:${proposal.targetVerseStart}-${proposal.targetVerseEnd}.`,
  };
}

function main() {
  const map = readJson(mapPath);
  const proposals = readJson(proposalsPath);

  const acceptedRules = (proposals.proposedRules || [])
    .filter((rule) => ALLOW_IDS.has(rule.id))
    .map(toMapRule);

  if (acceptedRules.length !== ALLOW_IDS.size) {
    throw new Error(
      `Expected ${ALLOW_IDS.size} accepted rules but found ${acceptedRules.length}.`
    );
  }

  const existingRules = Array.isArray(map.rules) ? map.rules : [];

  const withoutOldAccepted = existingRules.filter(
    (rule) => !ALLOW_IDS.has(String(rule.id || ""))
  );

  const nextMap = {
    ...map,
    rules: [...withoutOldAccepted, ...acceptedRules],
  };

  fs.writeFileSync(mapPath, JSON.stringify(nextMap, null, 2) + "\n", "utf8");

  console.log("Applied safe proposed versification rules");
  console.log(`Existing rules: ${existingRules.length}`);
  console.log(`Added accepted rules: ${acceptedRules.length}`);
  console.log(`Total rules now: ${nextMap.rules.length}`);
  console.log(acceptedRules.map((rule) => rule.id).join("\n"));
}

main();