const { normalize, normalizeTextEncoding } = require("./normalize");

function cleanDisplayToken(value) {
  return normalizeTextEncoding(value)
    .replace(/^[\s.,;:!?()[\]{}"“”]+/g, "")
    .replace(/[\s.,;:!?()[\]{}"“”]+$/g, "")
    .trim();
}

function tokenizeDisplayText(text) {
  const parts = String(text || "").split(/(\s+)/);
  const tokens = [];

  for (const part of parts) {
    if (!part || /^\s+$/.test(part)) continue;

    const clean = cleanDisplayToken(part);
    const normalized = normalize(clean);

    if (!clean || !normalized) continue;

    tokens.push({
      index: tokens.length,
      text: clean,
      normalized,
      alignedSourceTokenIds: [],
    });
  }

  return tokens;
}

module.exports = { tokenizeDisplayText };