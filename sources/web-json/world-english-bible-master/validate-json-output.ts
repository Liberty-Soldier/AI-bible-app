import * as fs from 'fs';
import * as path from 'path';
import { versesByBook } from './verse-counts.ts';

interface ChunkType {
  type: string;
  chapterNumber?: number;
  verseNumber?: number;
  sectionNumber?: number;
  value?: any;
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

// Reverse mapping: filename to book name
const fileNameToBookName: Record<string, string> = {
  'genesis': 'Genesis',
  'exodus': 'Exodus',
  'leviticus': 'Leviticus',
  'numbers': 'Numbers',
  'deuteronomy': 'Deuteronomy',
  'joshua': 'Joshua',
  'judges': 'Judges',
  'ruth': 'Ruth',
  '1samuel': '1 Samuel',
  '2samuel': '2 Samuel',
  '1kings': '1 Kings',
  '2kings': '2 Kings',
  '1chronicles': '1 Chronicles',
  '2chronicles': '2 Chronicles',
  'ezra': 'Ezra',
  'nehemiah': 'Nehemiah',
  'esther': 'Esther',
  'job': 'Job',
  'psalms': 'Psalms',
  'proverbs': 'Proverbs',
  'ecclesiastes': 'Ecclesiastes',
  'songofsolomon': 'Song of Solomon',
  'isaiah': 'Isaiah',
  'jeremiah': 'Jeremiah',
  'lamentations': 'Lamentations',
  'ezekiel': 'Ezekiel',
  'daniel': 'Daniel',
  'hosea': 'Hosea',
  'joel': 'Joel',
  'amos': 'Amos',
  'obadiah': 'Obadiah',
  'jonah': 'Jonah',
  'micah': 'Micah',
  'nahum': 'Nahum',
  'habakkuk': 'Habakkuk',
  'zephaniah': 'Zephaniah',
  'haggai': 'Haggai',
  'zechariah': 'Zechariah',
  'malachi': 'Malachi',
  'matthew': 'Matthew',
  'mark': 'Mark',
  'luke': 'Luke',
  'john': 'John',
  'acts': 'Acts',
  'romans': 'Romans',
  '1corinthians': '1 Corinthians',
  '2corinthians': '2 Corinthians',
  'galatians': 'Galatians',
  'ephesians': 'Ephesians',
  'philippians': 'Philippians',
  'colossians': 'Colossians',
  '1thessalonians': '1 Thessalonians',
  '2thessalonians': '2 Thessalonians',
  '1timothy': '1 Timothy',
  '2timothy': '2 Timothy',
  'titus': 'Titus',
  'philemon': 'Philemon',
  'hebrews': 'Hebrews',
  'james': 'James',
  '1peter': '1 Peter',
  '2peter': '2 Peter',
  '1john': '1 John',
  '2john': '2 John',
  '3john': '3 John',
  'jude': 'Jude',
  'revelation': 'Revelation',
};

const jsonDir = './json';

console.log('Validating JSON output files against expected verse counts...\n');

let totalChapters = 0;
let differenceCount = 0;
let matchCount = 0;
let filesProcessed = 0;
let filesSkipped = 0;

// Read all JSON files in the json directory
const files = fs.readdirSync(jsonDir).filter(f => f.endsWith('.json'));

files.forEach(fileName => {
  const fileBaseName = fileName.replace('.json', '');
  const bookName = fileNameToBookName[fileBaseName];

  if (!bookName) {
    console.log(`⚠️  Skipping ${fileName} - no book name mapping found`);
    filesSkipped++;
    return;
  }

  const abbr = bookNameToAbbr[bookName];
  if (!abbr) {
    console.log(`⚠️  Skipping ${fileName} (${bookName}) - no abbreviation found`);
    filesSkipped++;
    return;
  }

  const expectedChapters = versesByBook[abbr];
  if (!expectedChapters) {
    console.log(`⚠️  Skipping ${fileName} (${bookName}) - not in expected verse counts`);
    filesSkipped++;
    return;
  }

  // Read and parse the JSON file
  const filePath = path.join(jsonDir, fileName);
  const chunks: ChunkType[] = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Count verses per chapter
  const chapterVerseCounts: Record<number, Set<number>> = {};

  chunks.forEach(chunk => {
    if (chunk.chapterNumber !== undefined && chunk.verseNumber !== undefined) {
      if (!chapterVerseCounts[chunk.chapterNumber]) {
        chapterVerseCounts[chunk.chapterNumber] = new Set();
      }
      chapterVerseCounts[chunk.chapterNumber]!.add(chunk.verseNumber);
    }
  });

  // Compare to expected counts
  Object.keys(chapterVerseCounts).map(Number).sort((a, b) => a - b).forEach(chapterNum => {
    const verseSet = chapterVerseCounts[chapterNum];
    if (!verseSet) return;

    const jsonVerseCount = verseSet.size;
    const expectedVerseCount = expectedChapters[chapterNum];

    totalChapters++;

    if (expectedVerseCount === undefined) {
      console.log(`❌ ${abbr} ${chapterNum}: Chapter exists in JSON (${jsonVerseCount} verses) but not in expected counts`);
      differenceCount++;
    } else if (jsonVerseCount !== expectedVerseCount) {
      const diff = jsonVerseCount - expectedVerseCount;
      const sign = diff > 0 ? '+' : '';
      console.log(`⚠️  ${abbr} ${chapterNum}: JSON has ${jsonVerseCount} verses, expected ${expectedVerseCount} verses (${sign}${diff})`);
      differenceCount++;

      // Show which verses are present
      const verses = Array.from(verseSet).sort((a, b) => a - b);
      const maxVerse = Math.max(...verses);
      const minVerse = Math.min(...verses);
      if (maxVerse > expectedVerseCount || minVerse < 1) {
        console.log(`   Verse range in JSON: ${minVerse}-${maxVerse}`);
      }
    } else {
      matchCount++;
    }
  });

  // Check for chapters in expected counts that aren't in JSON
  Object.keys(expectedChapters).map(Number).forEach(chapterNum => {
    if (!chapterVerseCounts[chapterNum]) {
      console.log(`❌ ${abbr} ${chapterNum}: Chapter exists in expected counts (${expectedChapters[chapterNum]} verses) but not in JSON`);
      differenceCount++;
    }
  });

  filesProcessed++;
});

console.log(`\n${'='.repeat(70)}`);
console.log(`Files processed: ${filesProcessed}`);
console.log(`Files skipped: ${filesSkipped}`);
console.log(`Total chapters validated: ${totalChapters}`);
console.log(`Matches: ${matchCount}`);
console.log(`Differences: ${differenceCount}`);

if (differenceCount === 0) {
  console.log('✅ All verse counts in JSON output match expected counts!');
} else {
  console.log(`\n⚠️  Found ${differenceCount} chapters with different verse counts.`);
  console.log('These differences may indicate:');
  console.log('  - Issues in the build-final-data-structure processing');
  console.log('  - Issues in the HTML parsing');
  console.log('  - Verse counting discrepancies');
}
