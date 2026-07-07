const fs = require("fs");
const path = require("path");

const root = process.cwd();

const filePath = path.join(
  root,
  "app",
  "data",
  "lexicon",
  "generatedBibleIQEntities.json"
);

const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
const entities = Object.values(data.entities || {});

const problems = [];

for (const entity of entities) {
  const id = entity.id;
  const simple = entity.simple || {};
  const evidence = entity.evidence || {};
  const occurrences = evidence.occurrences || [];

  if (!simple.meaning) {
    problems.push([id, "missing simple.meaning"]);
  }

  if (!simple.inThisVerse) {
    problems.push([id, "missing simple.inThisVerse"]);
  }

  if (!evidence.firstMention && occurrences.length) {
    problems.push([id, "missing firstMention"]);
  }

  if (occurrences.length && !occurrences[0].englishText) {
    problems.push([id, "first occurrence missing englishText"]);
  }

  if (
    simple.meaning &&
    /animal word/.test(simple.meaning) &&
    /offering|sacrifice|tribute|oblation/i.test(
      `${evidence.definitions?.short || ""} ${evidence.definitions?.usage || ""}`
    )
  ) {
    problems.push([id, "possible wrong animal classification"]);
  }

  if (
    evidence.firstMention &&
    occurrences[0]?.reference &&
    evidence.firstMention !== occurrences[0].reference
  ) {
    problems.push([
      id,
      `firstMention mismatch: ${evidence.firstMention} vs ${occurrences[0].reference}`,
    ]);
  }
}

console.log(`Checked ${entities.length} BibleIQ entities`);

if (!problems.length) {
  console.log("No quality problems found.");
  process.exit(0);
}

console.log(`Found ${problems.length} possible problems:`);
for (const [id, issue] of problems.slice(0, 100)) {
  console.log(`- ${id}: ${issue}`);
}

if (problems.length > 100) {
  console.log(`...and ${problems.length - 100} more`);
}

process.exit(1);