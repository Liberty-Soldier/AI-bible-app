const hebrewToEnglish = require("../versification/hebrew-to-english.json");

function appliesToRule(parsed, rule) {
  if (!parsed || !rule) return false;

  if (parsed.book !== rule.sourceBook) return false;
  if (parsed.chapter !== rule.sourceChapter) return false;
  if (parsed.verse < rule.sourceVerseStart) return false;
  if (parsed.verse > rule.sourceVerseEnd) return false;

  return true;
}

function applyRule(parsed, rule) {
  if (!appliesToRule(parsed, rule)) return null;

  if (rule.action === "skip") {
    return {
      action: "skip",
      ruleId: rule.id,
      reason: rule.reason || "",
    };
  }

  if (!rule.targetBook || !rule.targetChapter) {
    throw new Error(
      `Invalid versification rule ${rule.id}: missing targetBook/targetChapter`
    );
  }

  if (typeof rule.targetVerseOffset !== "number") {
    throw new Error(
      `Invalid versification rule ${rule.id}: missing numeric targetVerseOffset`
    );
  }

  return {
    action: "map",
    book: rule.targetBook,
    chapter: rule.targetChapter,
    verse: parsed.verse + rule.targetVerseOffset,
    ruleId: rule.id,
    reason: rule.reason || "",
  };
}

function mapSourceReferenceToCanonicalReference(source, parsed) {
  if (!parsed) return null;

  if (source === "hebrew") {
    for (const rule of hebrewToEnglish.rules || []) {
      const mapped = applyRule(parsed, rule);

      if (!mapped) continue;

      if (mapped.action === "skip") return null;

      return {
        book: mapped.book,
        chapter: mapped.chapter,
        verse: mapped.verse,
        ruleId: mapped.ruleId,
      };
    }
  }

  return {
    book: parsed.book,
    chapter: parsed.chapter,
    verse: parsed.verse,
    ruleId: null,
  };
}

module.exports = {
  mapSourceReferenceToCanonicalReference,
};