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

  const propheticRules = [
    {
      id: "isa-8-23-to-isa-9-1",
      sourceBook: "Isa",
      sourceChapter: 8,
      sourceVerseStart: 23,
      sourceVerseEnd: 23,
      targetBook: "Isa",
      targetChapter: 9,
      targetVerseOffset: -22,
      reason: "Hebrew Isa 8:23 maps to English Isa 9:1."
    },
    {
      id: "isa-9-1-20-to-isa-9-2-21",
      sourceBook: "Isa",
      sourceChapter: 9,
      sourceVerseStart: 1,
      sourceVerseEnd: 20,
      targetBook: "Isa",
      targetChapter: 9,
      targetVerseOffset: 1,
      reason: "Hebrew Isa 9:1-20 maps to English Isa 9:2-21."
    },
    {
      id: "ezek-21-1-5-to-ezek-20-45-49",
      sourceBook: "Ezek",
      sourceChapter: 21,
      sourceVerseStart: 1,
      sourceVerseEnd: 5,
      targetBook: "Ezek",
      targetChapter: 20,
      targetVerseOffset: 44,
      reason: "Hebrew Ezek 21:1-5 maps to English Ezek 20:45-49."
    },
    {
      id: "ezek-21-6-37-to-ezek-21-1-32",
      sourceBook: "Ezek",
      sourceChapter: 21,
      sourceVerseStart: 6,
      sourceVerseEnd: 37,
      targetBook: "Ezek",
      targetChapter: 21,
      targetVerseOffset: -5,
      reason: "Hebrew Ezek 21:6-37 maps to English Ezek 21:1-32."
    }
  ];

  const acceptedIds = new Set(propheticRules.map((rule) => rule.id));
  const existingRules = Array.isArray(map.rules) ? map.rules : [];

  const withoutOld = existingRules.filter(
    (rule) => !acceptedIds.has(String(rule.id || ""))
  );

  const nextMap = {
    ...map,
    rules: [...withoutOld, ...propheticRules],
  };

  fs.writeFileSync(mapPath, JSON.stringify(nextMap, null, 2) + "\n", "utf8");

  console.log("Applied major prophetic versification rules");
  console.log(`Existing rules: ${existingRules.length}`);
  console.log(`Added rules: ${propheticRules.length}`);
  console.log(`Total rules now: ${nextMap.rules.length}`);
  console.log(propheticRules.map((rule) => rule.id).join("\n"));
}

main();