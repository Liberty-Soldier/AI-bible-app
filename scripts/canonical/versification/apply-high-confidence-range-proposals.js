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

const MIN_AVERAGE_SCORE = 75;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isIdentityRule(rule) {
  return (
    rule.sourceBook === rule.targetBook &&
    rule.sourceChapter === rule.targetChapter &&
    rule.sourceVerseStart === rule.targetVerseStart &&
    rule.sourceVerseEnd === rule.targetVerseEnd
  );
}

function isAccepted(rule) {
  return (
    rule.confidence === "high" &&
    rule.mappingCount >= 2 &&
    !isIdentityRule(rule) &&
    rule.averageScore >= MIN_AVERAGE_SCORE
  );
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
    reason:
      `Accepted high-confidence range proposal. ` +
      `${proposal.sourceBook} ${proposal.sourceChapter}:${proposal.sourceVerseStart}-${proposal.sourceVerseEnd} ` +
      `maps to ${proposal.targetBook} ${proposal.targetChapter}:${proposal.targetVerseStart}-${proposal.targetVerseEnd}. ` +
      `mappingCount=${proposal.mappingCount}; averageScore=${proposal.averageScore}.`,
  };
}

function main() {
  const map = readJson(mapPath);
  const proposals = readJson(proposalsPath);

  const acceptedRules = (proposals.proposedRules || [])
    .filter(isAccepted)
    .map(toMapRule);

  if (!acceptedRules.length) {
    console.log("No high-confidence range proposals accepted.");
    return;
  }

  const acceptedIds = new Set(acceptedRules.map((rule) => rule.id));
  const existingRules = Array.isArray(map.rules) ? map.rules : [];

  const withoutOldAccepted = existingRules.filter(
    (rule) => !acceptedIds.has(String(rule.id || ""))
  );

  const nextMap = {
    ...map,
    rules: [...withoutOldAccepted, ...acceptedRules],
  };

  fs.writeFileSync(mapPath, JSON.stringify(nextMap, null, 2) + "\n", "utf8");

  console.log("Applied high-confidence range proposal rules");
  console.log(`Minimum average score: ${MIN_AVERAGE_SCORE}`);
  console.log(`Existing rules: ${existingRules.length}`);
  console.log(`Accepted rules: ${acceptedRules.length}`);
  console.log(`Total rules now: ${nextMap.rules.length}`);
  console.log("");
  console.log(
    acceptedRules
      .map(
        (rule) =>
          `${rule.id}: ${rule.sourceBook} ${rule.sourceChapter}:${rule.sourceVerseStart}-${rule.sourceVerseEnd} -> ${rule.targetBook} ${rule.targetChapter} offset ${rule.targetVerseOffset}`
      )
      .join("\n")
  );
}

main();