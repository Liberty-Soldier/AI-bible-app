const OT_BOOKS = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
];

const NT_BOOKS = [
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "1 John",
  "2 John",
  "3 John",
  "Jude",
  "Revelation",
];

const OT_SET = new Set(OT_BOOKS);
const NT_SET = new Set(NT_BOOKS);

function normalizeBookName(book) {
  if (!book) return null;

  const raw = String(book).trim();

  const compact = raw
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const aliases = {
    gen: "Genesis",
    genesis: "Genesis",

    exod: "Exodus",
    exo: "Exodus",
    exodus: "Exodus",

    lev: "Leviticus",
    leviticus: "Leviticus",

    num: "Numbers",
    numbers: "Numbers",

    deut: "Deuteronomy",
    deuteronomy: "Deuteronomy",

    josh: "Joshua",
    jos: "Joshua",
    joshua: "Joshua",

    judg: "Judges",
    judges: "Judges",

    ruth: "Ruth",

    "1sam": "1 Samuel",
    "1samuel": "1 Samuel",
    isamuel: "1 Samuel",
    firstsamuel: "1 Samuel",

    "2sam": "2 Samuel",
    "2samuel": "2 Samuel",
    iisamuel: "2 Samuel",
    secondsamuel: "2 Samuel",

    "1kgs": "1 Kings",
    "1ki": "1 Kings",
    "1kings": "1 Kings",
    ikings: "1 Kings",
    firstkings: "1 Kings",

    "2kgs": "2 Kings",
    "2ki": "2 Kings",
    "2kings": "2 Kings",
    iikings: "2 Kings",
    secondkings: "2 Kings",

    "1chr": "1 Chronicles",
    "1chronicles": "1 Chronicles",
    ichronicles: "1 Chronicles",
    firstchronicles: "1 Chronicles",

    "2chr": "2 Chronicles",
    "2chronicles": "2 Chronicles",
    iichronicles: "2 Chronicles",
    secondchronicles: "2 Chronicles",

    ezra: "Ezra",
    neh: "Nehemiah",
    nehemiah: "Nehemiah",
    esth: "Esther",
    esther: "Esther",
    job: "Job",

    ps: "Psalms",
    psa: "Psalms",
    psalm: "Psalms",
    psalms: "Psalms",

    prov: "Proverbs",
    proverbs: "Proverbs",

    eccl: "Ecclesiastes",
    ecclesiastes: "Ecclesiastes",

    song: "Song of Solomon",
    songofsongs: "Song of Solomon",
    songofsolomon: "Song of Solomon",
    canticles: "Song of Solomon",

    isa: "Isaiah",
    isaiah: "Isaiah",

    jer: "Jeremiah",
    jeremiah: "Jeremiah",

    lam: "Lamentations",
    lamentations: "Lamentations",

    ezek: "Ezekiel",
    ezekiel: "Ezekiel",

    dan: "Daniel",
    daniel: "Daniel",

    hos: "Hosea",
    hosea: "Hosea",

    joel: "Joel",
    amos: "Amos",
    obad: "Obadiah",
    obadiah: "Obadiah",
    jonah: "Jonah",
    mic: "Micah",
    micah: "Micah",
    nah: "Nahum",
    nahum: "Nahum",
    hab: "Habakkuk",
    habakkuk: "Habakkuk",
    zeph: "Zephaniah",
    zephaniah: "Zephaniah",
    hag: "Haggai",
    haggai: "Haggai",
    zech: "Zechariah",
    zechariah: "Zechariah",
    mal: "Malachi",
    malachi: "Malachi",

    matt: "Matthew",
    mat: "Matthew",
    mt: "Matthew",
    matthew: "Matthew",

    mark: "Mark",
    mrk: "Mark",
    mk: "Mark",

    luke: "Luke",
    luk: "Luke",
    lk: "Luke",

    john: "John",
    jhn: "John",
    joh: "John",

    acts: "Acts",
    act: "Acts",

    rom: "Romans",
    romans: "Romans",

    "1cor": "1 Corinthians",
    "1corinthians": "1 Corinthians",
    icorinthians: "1 Corinthians",
    firstcorinthians: "1 Corinthians",

    "2cor": "2 Corinthians",
    "2corinthians": "2 Corinthians",
    iicorinthians: "2 Corinthians",
    secondcorinthians: "2 Corinthians",

    gal: "Galatians",
    galatians: "Galatians",

    eph: "Ephesians",
    ephesians: "Ephesians",

    phil: "Philippians",
    php: "Philippians",
    philippians: "Philippians",

    col: "Colossians",
    colossians: "Colossians",

    "1thess": "1 Thessalonians",
    "1thes": "1 Thessalonians",
    "1thessalonians": "1 Thessalonians",
    ithessalonians: "1 Thessalonians",
    firstthessalonians: "1 Thessalonians",

    "2thess": "2 Thessalonians",
    "2thes": "2 Thessalonians",
    "2thessalonians": "2 Thessalonians",
    iithessalonians: "2 Thessalonians",
    secondthessalonians: "2 Thessalonians",

    "1tim": "1 Timothy",
    "1timothy": "1 Timothy",
    itimothy: "1 Timothy",
    firsttimothy: "1 Timothy",

    "2tim": "2 Timothy",
    "2timothy": "2 Timothy",
    iitimothy: "2 Timothy",
    secondtimothy: "2 Timothy",

    titus: "Titus",
    tit: "Titus",

    phlm: "Philemon",
    philemon: "Philemon",

    heb: "Hebrews",
    hebrews: "Hebrews",

    jas: "James",
    jam: "James",
    james: "James",

    "1pet": "1 Peter",
    "1peter": "1 Peter",
    ipeter: "1 Peter",
    firstpeter: "1 Peter",

    "2pet": "2 Peter",
    "2peter": "2 Peter",
    iipeter: "2 Peter",
    secondpeter: "2 Peter",

    "1john": "1 John",
    "1jn": "1 John",
    ijohn: "1 John",
    firstjohn: "1 John",

    "2john": "2 John",
    "2jn": "2 John",
    iijohn: "2 John",
    secondjohn: "2 John",

    "3john": "3 John",
    "3jn": "3 John",
    iiijohn: "3 John",
    thirdjohn: "3 John",

    jude: "Jude",

    rev: "Revelation",
    revelation: "Revelation",
    apocalypse: "Revelation",
  };

  return aliases[compact] || raw;
}

function isOldTestamentBook(book) {
  return OT_SET.has(normalizeBookName(book));
}

function isNewTestamentBook(book) {
  return NT_SET.has(normalizeBookName(book));
}

function sourceCorpusForBook(book) {
  const normalized = normalizeBookName(book);

  if (OT_SET.has(normalized)) return "hebrew";
  if (NT_SET.has(normalized)) return "greek-nt";

  return null;
}

function assertSourceCorpusOwnsBook(corpus, book) {
  const expected = sourceCorpusForBook(book);

  if (!expected) {
    throw new Error(`Unknown canonical book: ${book}`);
  }

  if (expected !== corpus) {
    throw new Error(
      `Invalid corpus ownership: ${corpus} cannot own ${book}. Expected ${expected}.`
    );
  }
}

module.exports = {
  OT_BOOKS,
  NT_BOOKS,
  OT_SET,
  NT_SET,
  normalizeBookName,
  isOldTestamentBook,
  isNewTestamentBook,
  sourceCorpusForBook,
  assertSourceCorpusOwnsBook,
};