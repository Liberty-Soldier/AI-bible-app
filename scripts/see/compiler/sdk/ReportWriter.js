const fs = require("fs");
const path = require("path");

function writeReport(config, passId, report) {
  fs.mkdirSync(config.reportDir, { recursive: true });

  const filePath = path.join(config.reportDir, `${passId}.json`);

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf8");

  return filePath;
}

module.exports = { writeReport };