const fs = require("fs");
const path = require("path");

const inputFile = path.join(
  process.cwd(),
  "app",
  "data",
  "scripture",
  "generatedLXX.ts"
);

const outputFile = path.join(
  process.cwd(),
  "app",
  "data",
  "scripture",
  "generatedLXX.json"
);

const content = fs.readFileSync(inputFile, "utf8");

const jsonText = content
  .replace("export const generatedLXX = ", "")
  .replace(/\s+as const;\s*$/, "");

fs.writeFileSync(outputFile, jsonText, "utf8");

console.log(`Created ${outputFile}`);