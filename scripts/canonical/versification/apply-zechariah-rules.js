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

  const zechariahRules = [
    {
      id: "zech-2-1-4-to-zech-1-18-21",
      sourceBook: "Zech",
      sourceChapter: 2,
      sourceVerseStart: 1,
      sourceVerseEnd: 4,
      targetBook: "Zech",
      targetChapter: 1,
      targetVerseOffset: 17,
      reason: "Hebrew Zech 2:1-4 maps to English Zech 1:18-21."
    },
    {
      id: "zech-2-5-17-to-zech-2-1-13",
      sourceBook: "Zech",
      sourceChapter: 2,
      sourceVerseStart: 5,
      sourceVerseEnd: 17,
      targetBook: "Zech",
      targetChapter: 2,
      targetVerseOffset: -4,
      reason: "Hebrew Zech 2:5-17 maps to English Zech 2:1-13."
    }
  ];

  const existingRules = Array.isArray(map.rules) ? map.rules : [];

  const withoutOldZechariah = existingRules.filter(
    (rule) => !String(rule.id || "").startsWith("zech-2-")
  );

  const nextMap = {
    ...map,
    rules: [...withoutOldZechariah, ...zechariahRules],
  };

  fs.writeFileSync(mapPath, JSON.stringify(nextMap, null, 2) + "\n", "utf8");

  console.log("Applied Zechariah versification rules");
  console.log(`Existing rules: ${existingRules.length}`);
  console.log(`Added Zechariah rules: ${zechariahRules.length}`);
  console.log(`Total rules now: ${nextMap.rules.length}`);
}

main();