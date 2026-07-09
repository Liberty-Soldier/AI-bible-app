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
  "psalm-superscription-audit.json"
);

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
  const map = readJson(mapPath);
  const report = readJson(reportPath);

  const proposedRules = Array.isArray(report.proposedRules)
    ? report.proposedRules
    : [];

  if (!proposedRules.length) {
    throw new Error("No proposed Psalm superscription rules found.");
  }

  const existingRules = Array.isArray(map.rules) ? map.rules : [];

  const nonPsalmSuperscriptionRules = existingRules.filter(
    (rule) => !String(rule.id || "").startsWith("ps-")
  );

  const nextRules = [...nonPsalmSuperscriptionRules, ...proposedRules];

  const nextMap = {
    ...map,
    rules: nextRules,
  };

  fs.writeFileSync(mapPath, JSON.stringify(nextMap, null, 2) + "\n", "utf8");

  console.log("Applied Psalm superscription rules");
  console.log(`Existing rules: ${existingRules.length}`);
  console.log(`Removed old Psalm rules: ${existingRules.length - nonPsalmSuperscriptionRules.length}`);
  console.log(`Added Psalm rules: ${proposedRules.length}`);
  console.log(`Total rules now: ${nextRules.length}`);
  console.log(`Updated: ${mapPath}`);
}

main();