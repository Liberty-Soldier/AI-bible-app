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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
  const map = readJson(mapPath);

  const leviticusRules = [
    {
      id: "lev-5-20-26-to-lev-6-1-7",
      sourceBook: "Lev",
      sourceChapter: 5,
      sourceVerseStart: 20,
      sourceVerseEnd: 26,
      targetBook: "Lev",
      targetChapter: 6,
      targetVerseOffset: -19,
      reason: "Hebrew Lev 5:20-26 maps to English Lev 6:1-7."
    },
    {
      id: "lev-6-1-23-to-lev-6-8-30",
      sourceBook: "Lev",
      sourceChapter: 6,
      sourceVerseStart: 1,
      sourceVerseEnd: 23,
      targetBook: "Lev",
      targetChapter: 6,
      targetVerseOffset: 7,
      reason: "Hebrew Lev 6:1-23 maps to English Lev 6:8-30."
    }
  ];

  const existingRules = Array.isArray(map.rules) ? map.rules : [];

  const withoutOldLeviticus = existingRules.filter(
    (rule) => !String(rule.id || "").startsWith("lev-")
  );

  const nextMap = {
    ...map,
    rules: [...withoutOldLeviticus, ...leviticusRules],
  };

  fs.writeFileSync(mapPath, JSON.stringify(nextMap, null, 2) + "\n", "utf8");

  console.log("Applied Leviticus versification rules");
  console.log(`Existing rules: ${existingRules.length}`);
  console.log(`Added Leviticus rules: ${leviticusRules.length}`);
  console.log(`Total rules now: ${nextMap.rules.length}`);
}

main();
