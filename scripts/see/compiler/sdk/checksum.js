const crypto = require("crypto");

function stableStringify(value) {
  return JSON.stringify(value, Object.keys(value).sort(), 2);
}

function createChecksum(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

module.exports = {
  createChecksum,
  stableStringify
};