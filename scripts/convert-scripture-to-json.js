const fs = require("fs");
const path = require("path");

const datasets = [
  { constName: "generatedHebrew", tsFile: "generatedHebrew.ts", jsonFile: "generatedHebrew.json" },
  { constName: "generatedLXX", tsFile: "generatedLXX.ts", jsonFile: "generatedLXX.json" },
  { constName: "generatedKJV", tsFile: "generatedKJV.ts", jsonFile: "generatedKJV.json" },
  { constName: "generatedBrenton", tsFile: "generatedBrenton.ts", jsonFile: "generatedBrenton.json" },
  { constName: "generatedWEB", tsFile: "generatedWEB.ts", jsonFile: "generatedWEB.json" },
];

const scriptureDir = path.join(process.cwd(), "app", "data", "scripture");

for (const dataset of datasets) {
  const inputFile = path.join(scriptureDir, dataset.tsFile);
  const outputFile = path.join(scriptureDir, dataset.jsonFile);

  const content = fs.readFileSync(inputFile, "utf8");

  const startMarker = `export const ${dataset.constName}`;
  const startIndex = content.indexOf(startMarker);

  if (startIndex === -1) {
    throw new Error(`Could not find ${startMarker}`);
  }

  const afterExport = content.slice(startIndex);
  const equalsIndex = afterExport.indexOf("=");

  if (equalsIndex === -1) {
    throw new Error(`Could not find equals sign in ${dataset.tsFile}`);
  }

  const afterEquals = afterExport.slice(equalsIndex + 1);
  const firstBracket = afterEquals.indexOf("[");
  const lastBracket = afterEquals.lastIndexOf("]");

  const jsonText = afterEquals.slice(firstBracket, lastBracket + 1);

  JSON.parse(jsonText);
  fs.writeFileSync(outputFile, jsonText, "utf8");

  console.log(`Created ${outputFile}`);
}