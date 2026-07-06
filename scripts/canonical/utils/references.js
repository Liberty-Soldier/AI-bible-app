function parseSourceReference(reference) {
  const match = String(reference || "").match(/^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/);
  if (!match) return null;

  return {
    book: match[1],
    chapter: Number(match[2]),
    verse: Number(match[3]),
  };
}

function toVerseKey(book, chapter, verse) {
  return `${book}:${chapter}:${verse}`;
}

function getEvidenceBook(book) {
  const map = {
    Genesis: "Gen",
    Exodus: "Exod",
    Leviticus: "Lev",
    Numbers: "Num",
    Deuteronomy: "Deut",
    Joshua: "Josh",
    Judges: "Judg",
    Ruth: "Ruth",
    "1 Samuel": "1Sam",
    "2 Samuel": "2Sam",
    "1 Kings": "1Kgs",
    "2 Kings": "2Kgs",
    "1 Chronicles": "1Chr",
    "2 Chronicles": "2Chr",
    Ezra: "Ezra",
    Nehemiah: "Neh",
    Esther: "Esth",
    Job: "Job",
    Psalms: "Ps",
    Proverbs: "Prov",
    Ecclesiastes: "Eccl",
    "Song of Solomon": "Song",
    Isaiah: "Isa",
    Jeremiah: "Jer",
    Lamentations: "Lam",
    Ezekiel: "Ezek",
    Daniel: "Dan",
    Hosea: "Hos",
    Joel: "Joel",
    Amos: "Amos",
    Obadiah: "Obad",
    Jonah: "Jonah",
    Micah: "Mic",
    Nahum: "Nah",
    Habakkuk: "Hab",
    Zephaniah: "Zeph",
    Haggai: "Hag",
    Zechariah: "Zech",
    Malachi: "Mal",
  };

  return map[book] || book;
}

module.exports = {
  parseSourceReference,
  toVerseKey,
  getEvidenceBook,
};