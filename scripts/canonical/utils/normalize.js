function normalizeTextEncoding(value) {
  return String(value || "")
    // Common mojibake apostrophes / quotes
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€\u009d/g, '"')

    // Real curly quotes
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"');
}

function normalize(value) {
  return normalizeTextEncoding(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

    // English possessive:
    // Yahweh's -> Yahweh
    // LORD's   -> LORD
    // God's    -> God
    // children’s -> children
    .replace(/\b([a-zA-Z0-9]+)'s\b/g, "$1")
    .replace(/\b([a-zA-Z0-9]+)s'\b/g, "$1s")

    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

module.exports = {
  normalize,
  normalizeTextEncoding,
};