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

  const rules = [
    {
      id: "2chr-1-18-to-2chr-2-1",
      sourceBook: "2Chr",
      sourceChapter: 1,
      sourceVerseStart: 18,
      sourceVerseEnd: 18,
      targetBook: "2Chr",
      targetChapter: 2,
      targetVerseOffset: -17,
      reason: "Hebrew 2Chr 1:18 maps to English 2Chr 2:1."
    },
    {
      id: "2chr-2-1-17-to-2chr-2-2-18",
      sourceBook: "2Chr",
      sourceChapter: 2,
      sourceVerseStart: 1,
      sourceVerseEnd: 17,
      targetBook: "2Chr",
      targetChapter: 2,
      targetVerseOffset: 1,
      reason: "Hebrew 2Chr 2:1-17 maps to English 2Chr 2:2-18."
    },

    {
      id: "neh-10-1-to-neh-9-38",
      sourceBook: "Neh",
      sourceChapter: 10,
      sourceVerseStart: 1,
      sourceVerseEnd: 1,
      targetBook: "Neh",
      targetChapter: 9,
      targetVerseOffset: 37,
      reason: "Hebrew Neh 10:1 maps to English Neh 9:38."
    },
    {
      id: "neh-10-2-40-to-neh-10-1-39",
      sourceBook: "Neh",
      sourceChapter: 10,
      sourceVerseStart: 2,
      sourceVerseEnd: 40,
      targetBook: "Neh",
      targetChapter: 10,
      targetVerseOffset: -1,
      reason: "Hebrew Neh 10:2-40 maps to English Neh 10:1-39."
    }
  ];

  const prefixesToRemove = [
    "2chr-1-18",
    "2chr-2-",
    "neh-10-"
  ];

  const existingRules = Array.isArray(map.rules) ? map.rules : [];

  const withoutOld = existingRules.filter((rule) => {
    const id = String(rule.id || "");
    return !prefixesToRemove.some((prefix) => id.startsWith(prefix));
  });

  const nextMap = {
    ...map,
    rules: [...withoutOld, ...rules],
  };

  fs.writeFileSync(mapPath, JSON.stringify(nextMap, null, 2) + "\n", "utf8");

  console.log("Applied final edge versification rules");
  console.log(`Existing rules: ${existingRules.length}`);
  console.log(`Added rules: ${rules.length}`);
  console.log(`Total rules now: ${nextMap.rules.length}`);
  console.log(rules.map((rule) => rule.id).join("\n"));
}

main();