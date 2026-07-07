const BOOK_NAMES = {
  Gen: "Genesis",
  Exod: "Exodus",
  Lev: "Leviticus",
  Num: "Numbers",
  Deut: "Deuteronomy",
  Josh: "Joshua",
  Judg: "Judges",
  Ruth: "Ruth",
  "1Sam": "1 Samuel",
  "2Sam": "2 Samuel",
  "1Kgs": "1 Kings",
  "2Kgs": "2 Kings",
  "1Chr": "1 Chronicles",
  "2Chr": "2 Chronicles",
  Ezra: "Ezra",
  Neh: "Nehemiah",
  Esth: "Esther",
  Job: "Job",
  Ps: "Psalms",
  Prov: "Proverbs",
  Eccl: "Ecclesiastes",
  Song: "Song of Songs",
  Isa: "Isaiah",
  Jer: "Jeremiah",
  Lam: "Lamentations",
  Ezek: "Ezekiel",
  Dan: "Daniel",
  Hos: "Hosea",
  Joel: "Joel",
  Amos: "Amos",
  Obad: "Obadiah",
  Jonah: "Jonah",
  Mic: "Micah",
  Nah: "Nahum",
  Hab: "Habakkuk",
  Zeph: "Zephaniah",
  Hag: "Haggai",
  Zech: "Zechariah",
  Mal: "Malachi",
};

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripStrongPrefix(value) {
  return String(value || "").replace(/^H/i, "").trim();
}

function toStrong(value) {
  const num = stripStrongPrefix(value);
  return num ? `H${num}` : "";
}

function fullBookName(book) {
  return BOOK_NAMES[book] || book;
}

function formatReference(ref) {
  const [book, chapter, verse] = String(ref || "").split(".");
  if (!book || !chapter || !verse) return String(ref || "");
  return `${fullBookName(book)} ${chapter}:${verse}`;
}

function parseReference(ref) {
  const [book = "", chapter = "0", verse = "0"] = String(ref || "").split(".");
  return { book, chapter: Number(chapter), verse: Number(verse) };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

module.exports = {
  cleanText,
  stripStrongPrefix,
  toStrong,
  formatReference,
  parseReference,
  unique,
  fullBookName,
};