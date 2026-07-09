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

const reportPath = path.join(
  root,
  "reports",
  "psalm-title-offset-audit.json"
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
  const map = readJson(mapPath);
  const report = readJson(reportPath);

  const proposedRules = Array.isArray(report.proposedRules)
    ? report.proposedRules
    : [];

  if (!proposedRules.length) {
    throw new Error("No Psalm multi-title rules found.");
  }

  const chapters = new Set(
    proposedRules
      .filter((rule) => rule.sourceBook === "Ps")
      .map((rule) => Number(rule.sourceChapter))
  );

  const existingRules = Array.isArray(map.rules) ? map.rules : [];

  const withoutOldPsalmChapterRules = existingRules.filter((rule) => {
    if (rule.sourceBook !== "Ps") return true;
    return !chapters.has(Number(rule.sourceChapter));
  });

  const nextMap = {
    ...map,
    rules: [...withoutOldPsalmChapterRules, ...proposedRules],
  };

  fs.writeFileSync(mapPath, JSON.stringify(nextMap, null, 2) + "\n", "utf8");

  console.log("Applied Psalm multi-title rules");
  console.log(
    `Chapters: ${Array.from(chapters).sort((a, b) => a - b).join(", ")}`
  );
  console.log(`Existing rules: ${existingRules.length}`);
  console.log(
    `Removed old Psalm chapter rules: ${
      existingRules.length - withoutOldPsalmChapterRules.length
    }`
  );
  console.log(`Added rules: ${proposedRules.length}`);
  console.log(`Total rules now: ${nextMap.rules.length}`);
  console.log(proposedRules.map((rule) => rule.id).join("\n"));
}

main();