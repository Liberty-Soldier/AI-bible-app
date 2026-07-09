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
      id: "jer-8-23-to-jer-9-1",
      sourceBook: "Jer",
      sourceChapter: 8,
      sourceVerseStart: 23,
      sourceVerseEnd: 23,
      targetBook: "Jer",
      targetChapter: 9,
      targetVerseOffset: -22,
      reason: "Hebrew Jer 8:23 maps to English Jer 9:1."
    },
    {
      id: "jer-9-1-25-to-jer-9-2-26",
      sourceBook: "Jer",
      sourceChapter: 9,
      sourceVerseStart: 1,
      sourceVerseEnd: 25,
      targetBook: "Jer",
      targetChapter: 9,
      targetVerseOffset: 1,
      reason: "Hebrew Jer 9:1-25 maps to English Jer 9:2-26."
    },

    {
      id: "deut-13-1-to-deut-12-32",
      sourceBook: "Deut",
      sourceChapter: 13,
      sourceVerseStart: 1,
      sourceVerseEnd: 1,
      targetBook: "Deut",
      targetChapter: 12,
      targetVerseOffset: 31,
      reason: "Hebrew Deut 13:1 maps to English Deut 12:32."
    },
    {
      id: "deut-13-2-19-to-deut-13-1-18",
      sourceBook: "Deut",
      sourceChapter: 13,
      sourceVerseStart: 2,
      sourceVerseEnd: 19,
      targetBook: "Deut",
      targetChapter: 13,
      targetVerseOffset: -1,
      reason: "Hebrew Deut 13:2-19 maps to English Deut 13:1-18."
    },

    {
      id: "deut-23-1-to-deut-22-30",
      sourceBook: "Deut",
      sourceChapter: 23,
      sourceVerseStart: 1,
      sourceVerseEnd: 1,
      targetBook: "Deut",
      targetChapter: 22,
      targetVerseOffset: 29,
      reason: "Hebrew Deut 23:1 maps to English Deut 22:30."
    },
    {
      id: "deut-23-2-26-to-deut-23-1-25",
      sourceBook: "Deut",
      sourceChapter: 23,
      sourceVerseStart: 2,
      sourceVerseEnd: 26,
      targetBook: "Deut",
      targetChapter: 23,
      targetVerseOffset: -1,
      reason: "Hebrew Deut 23:2-26 maps to English Deut 23:1-25."
    },

    {
      id: "deut-28-69-to-deut-29-1",
      sourceBook: "Deut",
      sourceChapter: 28,
      sourceVerseStart: 69,
      sourceVerseEnd: 69,
      targetBook: "Deut",
      targetChapter: 29,
      targetVerseOffset: -68,
      reason: "Hebrew Deut 28:69 maps to English Deut 29:1."
    },
    {
      id: "deut-29-1-28-to-deut-29-2-29",
      sourceBook: "Deut",
      sourceChapter: 29,
      sourceVerseStart: 1,
      sourceVerseEnd: 28,
      targetBook: "Deut",
      targetChapter: 29,
      targetVerseOffset: 1,
      reason: "Hebrew Deut 29:1-28 maps to English Deut 29:2-29."
    },

    {
      id: "dan-3-31-33-to-dan-4-1-3",
      sourceBook: "Dan",
      sourceChapter: 3,
      sourceVerseStart: 31,
      sourceVerseEnd: 33,
      targetBook: "Dan",
      targetChapter: 4,
      targetVerseOffset: -30,
      reason: "Hebrew Dan 3:31-33 maps to English Dan 4:1-3."
    },
    {
      id: "dan-4-1-34-to-dan-4-4-37",
      sourceBook: "Dan",
      sourceChapter: 4,
      sourceVerseStart: 1,
      sourceVerseEnd: 34,
      targetBook: "Dan",
      targetChapter: 4,
      targetVerseOffset: 3,
      reason: "Hebrew Dan 4:1-34 maps to English Dan 4:4-37."
    },

    {
      id: "dan-6-1-to-dan-5-31",
      sourceBook: "Dan",
      sourceChapter: 6,
      sourceVerseStart: 1,
      sourceVerseEnd: 1,
      targetBook: "Dan",
      targetChapter: 5,
      targetVerseOffset: 30,
      reason: "Hebrew Dan 6:1 maps to English Dan 5:31."
    },
    {
      id: "dan-6-2-29-to-dan-6-1-28",
      sourceBook: "Dan",
      sourceChapter: 6,
      sourceVerseStart: 2,
      sourceVerseEnd: 29,
      targetBook: "Dan",
      targetChapter: 6,
      targetVerseOffset: -1,
      reason: "Hebrew Dan 6:2-29 maps to English Dan 6:1-28."
    },

    {
      id: "1sam-21-1-to-1sam-20-42",
      sourceBook: "1Sam",
      sourceChapter: 21,
      sourceVerseStart: 1,
      sourceVerseEnd: 1,
      targetBook: "1Sam",
      targetChapter: 20,
      targetVerseOffset: 41,
      reason: "Hebrew 1Sam 21:1 maps to English 1Sam 20:42."
    },
    {
      id: "1sam-21-2-16-to-1sam-21-1-15",
      sourceBook: "1Sam",
      sourceChapter: 21,
      sourceVerseStart: 2,
      sourceVerseEnd: 16,
      targetBook: "1Sam",
      targetChapter: 21,
      targetVerseOffset: -1,
      reason: "Hebrew 1Sam 21:2-16 maps to English 1Sam 21:1-15."
    },

    {
      id: "1sam-24-1-to-1sam-23-29",
      sourceBook: "1Sam",
      sourceChapter: 24,
      sourceVerseStart: 1,
      sourceVerseEnd: 1,
      targetBook: "1Sam",
      targetChapter: 23,
      targetVerseOffset: 28,
      reason: "Hebrew 1Sam 24:1 maps to English 1Sam 23:29."
    },
    {
      id: "1sam-24-2-23-to-1sam-24-1-22",
      sourceBook: "1Sam",
      sourceChapter: 24,
      sourceVerseStart: 2,
      sourceVerseEnd: 23,
      targetBook: "1Sam",
      targetChapter: 24,
      targetVerseOffset: -1,
      reason: "Hebrew 1Sam 24:2-23 maps to English 1Sam 24:1-22."
    },

    {
      id: "2sam-19-1-to-2sam-18-33",
      sourceBook: "2Sam",
      sourceChapter: 19,
      sourceVerseStart: 1,
      sourceVerseEnd: 1,
      targetBook: "2Sam",
      targetChapter: 18,
      targetVerseOffset: 32,
      reason: "Hebrew 2Sam 19:1 maps to English 2Sam 18:33."
    },
    {
      id: "2sam-19-2-44-to-2sam-19-1-43",
      sourceBook: "2Sam",
      sourceChapter: 19,
      sourceVerseStart: 2,
      sourceVerseEnd: 44,
      targetBook: "2Sam",
      targetChapter: 19,
      targetVerseOffset: -1,
      reason: "Hebrew 2Sam 19:2-44 maps to English 2Sam 19:1-43."
    },

    {
      id: "neh-3-33-38-to-neh-4-1-6",
      sourceBook: "Neh",
      sourceChapter: 3,
      sourceVerseStart: 33,
      sourceVerseEnd: 38,
      targetBook: "Neh",
      targetChapter: 4,
      targetVerseOffset: -32,
      reason: "Hebrew Neh 3:33-38 maps to English Neh 4:1-6."
    },
    {
      id: "neh-4-1-17-to-neh-4-7-23",
      sourceBook: "Neh",
      sourceChapter: 4,
      sourceVerseStart: 1,
      sourceVerseEnd: 17,
      targetBook: "Neh",
      targetChapter: 4,
      targetVerseOffset: 6,
      reason: "Hebrew Neh 4:1-17 maps to English Neh 4:7-23."
    },

    {
      id: "job-40-25-32-to-job-41-1-8",
      sourceBook: "Job",
      sourceChapter: 40,
      sourceVerseStart: 25,
      sourceVerseEnd: 32,
      targetBook: "Job",
      targetChapter: 41,
      targetVerseOffset: -24,
      reason: "Hebrew Job 40:25-32 maps to English Job 41:1-8."
    },
    {
      id: "job-41-1-26-to-job-41-9-34",
      sourceBook: "Job",
      sourceChapter: 41,
      sourceVerseStart: 1,
      sourceVerseEnd: 26,
      targetBook: "Job",
      targetChapter: 41,
      targetVerseOffset: 8,
      reason: "Hebrew Job 41:1-26 maps to English Job 41:9-34."
    },

    {
      id: "num-30-1-to-num-29-40",
      sourceBook: "Num",
      sourceChapter: 30,
      sourceVerseStart: 1,
      sourceVerseEnd: 1,
      targetBook: "Num",
      targetChapter: 29,
      targetVerseOffset: 39,
      reason: "Hebrew Num 30:1 maps to English Num 29:40."
    },
    {
      id: "num-30-2-17-to-num-30-1-16",
      sourceBook: "Num",
      sourceChapter: 30,
      sourceVerseStart: 2,
      sourceVerseEnd: 17,
      targetBook: "Num",
      targetChapter: 30,
      targetVerseOffset: -1,
      reason: "Hebrew Num 30:2-17 maps to English Num 30:1-16."
    },

    {
      id: "1chr-12-1-to-1chr-11-47",
      sourceBook: "1Chr",
      sourceChapter: 12,
      sourceVerseStart: 1,
      sourceVerseEnd: 1,
      targetBook: "1Chr",
      targetChapter: 11,
      targetVerseOffset: 46,
      reason: "Hebrew 1Chr 12:1 maps to English 1Chr 11:47."
    },
    {
      id: "1chr-12-2-41-to-1chr-12-1-40",
      sourceBook: "1Chr",
      sourceChapter: 12,
      sourceVerseStart: 2,
      sourceVerseEnd: 41,
      targetBook: "1Chr",
      targetChapter: 12,
      targetVerseOffset: -1,
      reason: "Hebrew 1Chr 12:2-41 maps to English 1Chr 12:1-40."
    }
  ];

  const prefixesToRemove = [
    "jer-8-23", "jer-9-",
    "deut-13-", "deut-23-", "deut-28-69", "deut-29-",
    "dan-3-31", "dan-4-", "dan-6-",
    "1sam-21-", "1sam-24-",
    "2sam-19-",
    "neh-3-33", "neh-4-",
    "job-40-25", "job-41-",
    "num-30-",
    "1chr-12-"
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

  console.log("Applied final known boundary rules");
  console.log(`Existing rules: ${existingRules.length}`);
  console.log(`Added rules: ${rules.length}`);
  console.log(`Total rules now: ${nextMap.rules.length}`);
  console.log(rules.map((rule) => rule.id).join("\n"));
}

main();