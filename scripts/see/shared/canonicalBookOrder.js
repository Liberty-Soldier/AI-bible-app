const canonicalBookOrder = [
  "Gen", "Exod", "Lev", "Num", "Deut",
  "Josh", "Judg", "Ruth", "1Sam", "2Sam", "1Kgs", "2Kgs",
  "1Chr", "2Chr", "Ezra", "Neh", "Esth",
  "Job", "Ps", "Prov", "Eccl", "Song",
  "Isa", "Jer", "Lam", "Ezek", "Dan",
  "Hos", "Joel", "Amos", "Obad", "Jonah", "Mic", "Nah", "Hab", "Zeph", "Hag", "Zech", "Mal",
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans",
  "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians",
  "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon",
  "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"
];

const orderMap = new Map(canonicalBookOrder.map((book, index) => [book, index + 1]));

function getBookOrder(book) {
  return orderMap.get(book) || 9999;
}

module.exports = {
  canonicalBookOrder,
  getBookOrder
};