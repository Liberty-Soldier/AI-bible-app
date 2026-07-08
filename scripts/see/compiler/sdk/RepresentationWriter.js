const fs = require("fs");
const path = require("path");
const { createChecksum } = require("./checksum");

function writeRepresentation(config, representationName, data) {
  const outDir = path.join(config.outputDir, representationName);
  fs.mkdirSync(outDir, { recursive: true });

  const checksum = createChecksum(data);

  const payload = {
    representation: representationName,
    compilerVersion: config.compilerVersion,
    profile: config.profile,
    checksum,
    generatedAt: new Date().toISOString(),
    data
  };

  fs.writeFileSync(
    path.join(outDir, "index.json"),
    JSON.stringify(payload, null, 2),
    "utf8"
  );

  return {
    representation: representationName,
    outDir,
    checksum
  };
}

module.exports = { writeRepresentation };