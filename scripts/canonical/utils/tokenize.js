const { normalize } = require("./normalize");

function tokenizeDisplayText(text) {
  const parts = String(text || "").split(/(\s+)/);
  const tokens = [];

  for (const part of parts) {
    if (!part || /^\s+$/.test(part)) continue;

    const clean = part.replace(/[.,;:!?()[\]{}"“”‘’]/g, "").trim();
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