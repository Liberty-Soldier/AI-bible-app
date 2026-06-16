import * as fs from 'fs';
import { versesByBook } from './verse-counts.ts';

interface ChunkType {
  type: string;
  value?: any;
}

interface ChapterData {
  chunks: ChunkType[];
  chapterNumber: number;
  bookName: string;
  fileName?: string;
  bookIdentifier?: string;
}

// Map of full book names to abbreviations (matching parse-html.ts)
const bookNameToAbbr: Record<string, string> = {
  'Genesis': 'GEN',
  'Exodus': 'EXO',
  'Leviticus': 'LEV',
  'Numbers': 'NUM',
  'Deuteronomy': 'DEU',
  'Joshua': 'JOS',
  'Judges': 'JDG',
  'Ruth': 'RUT',
  '1 Samuel': '1SA',
  '2 Samuel': '2SA',
  '1 Kings': '1KI',
  '2 Kings': '2KI',
  '1 Chronicles': '1CH',
  '2 Chronicles': '2CH',
  'Ezra': 'EZR',
  'Nehemiah': 'NEH',
  'Esther': 'EST',
  'Job': 'JOB',
  'Psalms': 'PSA',
  'Proverbs': 'PRO',
  'Ecclesiastes': 'ECC',
  'Song of Solomon': 'SNG',
  'Isaiah': 'ISA',
  'Jeremiah': 'JER',
  'Lamentations': 'LAM',
  'Ezekiel': 'EZK',
  'Daniel': 'DAN',
  'Hosea': 'HOS',
  'Joel': 'JOL',
  'Amos': 'AMO',
  'Obadiah': 'OBA',
  'Jonah': 'JON',
  'Micah': 'MIC',
  'Nahum': 'NAM',
  'Habakkuk': 'HAB',
  'Zephaniah': 'ZEP',
  'Haggai': 'HAG',
  'Zechariah': 'ZEC',
  'Malachi': 'MAL',
  'Matthew': 'MAT',
  'Mark': 'MRK',
  'Luke': 'LUK',
  'John': 'JHN',
  'Acts': 'ACT',
  'Romans': 'ROM',
  '1 Corinthians': '1CO',
  '2 Corinthians': '2CO',
  'Galatians': 'GAL',
  'Ephesians': 'EPH',
  'Philippians': 'PHP',
  'Colossians': 'COL',
  '1 Thessalonians': '1TH',
  '2 Thessalonians': '2TH',
  '1 Timothy': '1TI',
  '2 Timothy': '2TI',
  'Titus': 'TIT',
  'Philemon': 'PHM',
  'Hebrews': 'HEB',
  'James': 'JAS',
  '1 Peter': '1PE',
  '2 Peter': '2PE',
  '1 John': '1JN',
  '2 John': '2JN',
  '3 John': '3JN',
  'Jude': 'JUD',
  'Revelation': 'REV',
};

// Read chapters.json
const chaptersData: ChapterData[] = JSON.parse(
  fs.readFileSync('./intermediate/chapters.json', 'utf8')
);

console.log('Validating WEB parsing against expected verse counts...\n');

// Count verses in WEB data
const webVerseCounts: Record<string, Record<number, number>> = {};
let totalChapters = 0;
let differenceCount = 0;
let matchCount = 0;
let webOnlyCount = 0;

chaptersData.forEach(chapter => {
  const abbr = bookNameToAbbr[chapter.bookName];

  if (!abbr) {
    // WEB has books not in canonical 66 (deuterocanonical)
    return;
  }

  if (!webVerseCounts[abbr]) {
    webVerseCounts[abbr] = {};
  }

  // Count verse number chunks
  const verseNumbers = chapter.chunks.filter(chunk => chunk.type === 'verse number');
  const verseCount = verseNumbers.length;

  webVerseCounts[abbr]![chapter.chapterNumber] = verseCount;
  totalChapters++;
});

// Compare WEB counts to expected counts
Object.keys(webVerseCounts).sort().forEach(bookAbbr => {
  const webChapters = webVerseCounts[bookAbbr];
  const expectedChapters = versesByBook[bookAbbr];

  if (!webChapters || !expectedChapters) {
    if (!expectedChapters && webChapters) {
      console.log(`❌ ${bookAbbr}: Book exists in WEB but not in expected counts`);
      Object.keys(webChapters).forEach(ch => webOnlyCount++);
    }
    return;
  }

  Object.keys(webChapters).map(Number).sort((a, b) => a - b).forEach(chapterNum => {
    const webCount = webChapters[chapterNum];
    const expectedCount = expectedChapters[chapterNum];

    if (expectedCount === undefined) {
      console.log(`❌ ${bookAbbr} ${chapterNum}: Chapter exists in WEB (${webCount} verses) but not in expected counts`);
      webOnlyCount++;
    } else if (webCount !== undefined && webCount !== expectedCount) {
      const diff = webCount - expectedCount;
      const sign = diff > 0 ? '+' : '';
      console.log(`⚠️  ${bookAbbr} ${chapterNum}: WEB has ${webCount} verses, expected ${expectedCount} verses (${sign}${diff})`);
      differenceCount++;
    } else {
      matchCount++;
    }
  });
});

// Check for chapters in expected counts that aren't in WEB
Object.keys(versesByBook).sort().forEach(bookAbbr => {
  const expectedChapters = versesByBook[bookAbbr];
  const webChapters = webVerseCounts[bookAbbr];

  if (!expectedChapters) return;

  if (!webChapters) {
    console.log(`❌ ${bookAbbr}: Book exists in expected counts but not in WEB`);
    return;
  }

  Object.keys(expectedChapters).map(Number).forEach(chapterNum => {
    if (webChapters[chapterNum] === undefined) {
      const count = expectedChapters[chapterNum];
      console.log(`❌ ${bookAbbr} ${chapterNum}: Chapter exists in expected counts (${count} verses) but not in WEB`);
    }
  });
});

console.log(`\n${'='.repeat(70)}`);
console.log(`Total WEB chapters processed: ${totalChapters}`);
console.log(`Matches: ${matchCount}`);
console.log(`Differences: ${differenceCount}`);
console.log(`WEB-only chapters: ${webOnlyCount}`);

if (differenceCount === 0) {
  console.log('✅ All verse counts match between WEB parsing and expected counts!');
} else {
  console.log(`\n⚠️  Found ${differenceCount} chapters with different verse counts.`);
  console.log('These differences may indicate:');
  console.log('  - Parsing issues in the WEB HTML');
  console.log('  - Issues in the intermediate data processing');
  console.log('  - Verse counting discrepancies');
}
