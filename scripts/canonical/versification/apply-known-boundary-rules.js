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
      id: "exod-21-37-to-exod-22-1",
      sourceBook: "Exod",
      sourceChapter: 21,
      sourceVerseStart: 37,
      sourceVerseEnd: 37,
      targetBook: "Exod",
      targetChapter: 22,
      targetVerseOffset: -36,
      reason: "Hebrew Exod 21:37 maps to English Exod 22:1."
    },
    {
      id: "exod-22-1-30-to-exod-22-2-31",
      sourceBook: "Exod",
      sourceChapter: 22,
      sourceVerseStart: 1,
      sourceVerseEnd: 30,
      targetBook: "Exod",
      targetChapter: 22,
      targetVerseOffset: 1,
      reason: "Hebrew Exod 22:1-30 maps to English Exod 22:2-31."
    },

    {
      id: "gen-32-1-to-gen-31-55",
      sourceBook: "Gen",
      sourceChapter: 32,
      sourceVerseStart: 1,
      sourceVerseEnd: 1,
      targetBook: "Gen",
      targetChapter: 31,
      targetVerseOffset: 54,
      reason: "Hebrew Gen 32:1 maps to English Gen 31:55."
    },
    {
      id: "gen-32-2-33-to-gen-32-1-32",
      sourceBook: "Gen",
      sourceChapter: 32,
      sourceVerseStart: 2,
      sourceVerseEnd: 33,
      targetBook: "Gen",
      targetChapter: 32,
      targetVerseOffset: -1,
      reason: "Hebrew Gen 32:2-33 maps to English Gen 32:1-32."
    },

    {
      id: "num-17-1-15-to-num-16-36-50",
      sourceBook: "Num",
      sourceChapter: 17,
      sourceVerseStart: 1,
      sourceVerseEnd: 15,
      targetBook: "Num",
      targetChapter: 16,
      targetVerseOffset: 35,
      reason: "Hebrew Num 17:1-15 maps to English Num 16:36-50."
    },
    {
      id: "num-17-16-28-to-num-17-1-13",
      sourceBook: "Num",
      sourceChapter: 17,
      sourceVerseStart: 16,
      sourceVerseEnd: 28,
      targetBook: "Num",
      targetChapter: 17,
      targetVerseOffset: -15,
      reason: "Hebrew Num 17:16-28 maps to English Num 17:1-13."
    },

    {
      id: "2kgs-12-1-to-2kgs-11-21",
      sourceBook: "2Kgs",
      sourceChapter: 12,
      sourceVerseStart: 1,
      sourceVerseEnd: 1,
      targetBook: "2Kgs",
      targetChapter: 11,
      targetVerseOffset: 20,
      reason: "Hebrew 2Kgs 12:1 maps to English 2Kgs 11:21."
    },
    {
      id: "2kgs-12-2-22-to-2kgs-12-1-21",
      sourceBook: "2Kgs",
      sourceChapter: 12,
      sourceVerseStart: 2,
      sourceVerseEnd: 22,
      targetBook: "2Kgs",
      targetChapter: 12,
      targetVerseOffset: -1,
      reason: "Hebrew 2Kgs 12:2-22 maps to English 2Kgs 12:1-21."
    },

    {
      id: "eccl-4-17-to-eccl-5-1",
      sourceBook: "Eccl",
      sourceChapter: 4,
      sourceVerseStart: 17,
      sourceVerseEnd: 17,
      targetBook: "Eccl",
      targetChapter: 5,
      targetVerseOffset: -16,
      reason: "Hebrew Eccl 4:17 maps to English Eccl 5:1."
    },
    {
      id: "eccl-5-1-19-to-eccl-5-2-20",
      sourceBook: "Eccl",
      sourceChapter: 5,
      sourceVerseStart: 1,
      sourceVerseEnd: 19,
      targetBook: "Eccl",
      targetChapter: 5,
      targetVerseOffset: 1,
      reason: "Hebrew Eccl 5:1-19 maps to English Eccl 5:2-20."
    },

    {
      id: "jonah-2-1-to-jonah-1-17",
      sourceBook: "Jonah",
      sourceChapter: 2,
      sourceVerseStart: 1,
      sourceVerseEnd: 1,
      targetBook: "Jonah",
      targetChapter: 1,
      targetVerseOffset: 16,
      reason: "Hebrew Jonah 2:1 maps to English Jonah 1:17."
    },
    {
      id: "jonah-2-2-11-to-jonah-2-1-10",
      sourceBook: "Jonah",
      sourceChapter: 2,
      sourceVerseStart: 2,
      sourceVerseEnd: 11,
      targetBook: "Jonah",
      targetChapter: 2,
      targetVerseOffset: -1,
      reason: "Hebrew Jonah 2:2-11 maps to English Jonah 2:1-10."
    },

    {
      id: "nah-2-1-to-nah-1-15",
      sourceBook: "Nah",
      sourceChapter: 2,
      sourceVerseStart: 1,
      sourceVerseEnd: 1,
      targetBook: "Nah",
      targetChapter: 1,
      targetVerseOffset: 14,
      reason: "Hebrew Nah 2:1 maps to English Nah 1:15."
    },
    {
      id: "nah-2-2-14-to-nah-2-1-13",
      sourceBook: "Nah",
      sourceChapter: 2,
      sourceVerseStart: 2,
      sourceVerseEnd: 14,
      targetBook: "Nah",
      targetChapter: 2,
      targetVerseOffset: -1,
      reason: "Hebrew Nah 2:2-14 maps to English Nah 2:1-13."
    },

    {
      id: "isa-63-19-to-isa-64-1",
      sourceBook: "Isa",
      sourceChapter: 63,
      sourceVerseStart: 19,
      sourceVerseEnd: 19,
      targetBook: "Isa",
      targetChapter: 64,
      targetVerseOffset: -18,
      reason: "Hebrew Isa 63:19 maps to English Isa 64:1."
    },
    {
      id: "isa-64-1-11-to-isa-64-2-12",
      sourceBook: "Isa",
      sourceChapter: 64,
      sourceVerseStart: 1,
      sourceVerseEnd: 11,
      targetBook: "Isa",
      targetChapter: 64,
      targetVerseOffset: 1,
      reason: "Hebrew Isa 64:1-11 maps to English Isa 64:2-12."
    },

    {
      id: "mal-3-19-24-to-mal-4-1-6",
      sourceBook: "Mal",
      sourceChapter: 3,
      sourceVerseStart: 19,
      sourceVerseEnd: 24,
      targetBook: "Mal",
      targetChapter: 4,
      targetVerseOffset: -18,
      reason: "Hebrew Mal 3:19-24 maps to English Mal 4:1-6."
    },

    {
      id: "hos-2-1-2-to-hos-1-10-11",
      sourceBook: "Hos",
      sourceChapter: 2,
      sourceVerseStart: 1,
      sourceVerseEnd: 2,
      targetBook: "Hos",
      targetChapter: 1,
      targetVerseOffset: 9,
      reason: "Hebrew Hos 2:1-2 maps to English Hos 1:10-11."
    },
    {
      id: "hos-2-3-25-to-hos-2-1-23",
      sourceBook: "Hos",
      sourceChapter: 2,
      sourceVerseStart: 3,
      sourceVerseEnd: 25,
      targetBook: "Hos",
      targetChapter: 2,
      targetVerseOffset: -2,
      reason: "Hebrew Hos 2:3-25 maps to English Hos 2:1-23."
    },

    {
      id: "hos-12-1-to-hos-11-12",
      sourceBook: "Hos",
      sourceChapter: 12,
      sourceVerseStart: 1,
      sourceVerseEnd: 1,
      targetBook: "Hos",
      targetChapter: 11,
      targetVerseOffset: 11,
      reason: "Hebrew Hos 12:1 maps to English Hos 11:12."
    },
    {
      id: "hos-12-2-15-to-hos-12-1-14",
      sourceBook: "Hos",
      sourceChapter: 12,
      sourceVerseStart: 2,
      sourceVerseEnd: 15,
      targetBook: "Hos",
      targetChapter: 12,
      targetVerseOffset: -1,
      reason: "Hebrew Hos 12:2-15 maps to English Hos 12:1-14."
    },

    {
      id: "mic-4-14-to-mic-5-1",
      sourceBook: "Mic",
      sourceChapter: 4,
      sourceVerseStart: 14,
      sourceVerseEnd: 14,
      targetBook: "Mic",
      targetChapter: 5,
      targetVerseOffset: -13,
      reason: "Hebrew Mic 4:14 maps to English Mic 5:1."
    },
    {
      id: "mic-5-1-14-to-mic-5-2-15",
      sourceBook: "Mic",
      sourceChapter: 5,
      sourceVerseStart: 1,
      sourceVerseEnd: 14,
      targetBook: "Mic",
      targetChapter: 5,
      targetVerseOffset: 1,
      reason: "Hebrew Mic 5:1-14 maps to English Mic 5:2-15."
    },

    {
      id: "2chr-13-23-to-2chr-14-1",
      sourceBook: "2Chr",
      sourceChapter: 13,
      sourceVerseStart: 23,
      sourceVerseEnd: 23,
      targetBook: "2Chr",
      targetChapter: 14,
      targetVerseOffset: -22,
      reason: "Hebrew 2Chr 13:23 maps to English 2Chr 14:1."
    },
    {
      id: "2chr-14-1-14-to-2chr-14-2-15",
      sourceBook: "2Chr",
      sourceChapter: 14,
      sourceVerseStart: 1,
      sourceVerseEnd: 14,
      targetBook: "2Chr",
      targetChapter: 14,
      targetVerseOffset: 1,
      reason: "Hebrew 2Chr 14:1-14 maps to English 2Chr 14:2-15."
    }
  ];

  const ruleIds = new Set(rules.map((rule) => rule.id));

  const prefixesToRemove = [
    "exod-21-", "exod-22-",
    "gen-32-",
    "num-17-",
    "2kgs-12-",
    "eccl-4-17", "eccl-5-",
    "jonah-2-",
    "nah-2-",
    "isa-63-19", "isa-64-",
    "mal-3-19",
    "hos-2-", "hos-12-",
    "mic-4-14", "mic-5-",
    "2chr-13-23", "2chr-14-"
  ];

  const existingRules = Array.isArray(map.rules) ? map.rules : [];

  const withoutOld = existingRules.filter((rule) => {
    const id = String(rule.id || "");
    if (ruleIds.has(id)) return false;
    return !prefixesToRemove.some((prefix) => id.startsWith(prefix));
  });

  const nextMap = {
    ...map,
    rules: [...withoutOld, ...rules],
  };

  fs.writeFileSync(mapPath, JSON.stringify(nextMap, null, 2) + "\n", "utf8");

  console.log("Applied known boundary versification rules");
  console.log(`Existing rules: ${existingRules.length}`);
  console.log(`Added rules: ${rules.length}`);
  console.log(`Total rules now: ${nextMap.rules.length}`);
  console.log(rules.map((rule) => rule.id).join("\n"));
}

main();