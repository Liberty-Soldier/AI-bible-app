import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlDir = path.join(__dirname, 'html');
const files = fs.readdirSync(htmlDir);

// Canonical 66 books in biblical order
const canonicalBooks = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA',
  '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO',
  'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO',
  'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL', 'MAT',
  'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP',
  'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE',
  '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'
];

const canonicalBooksSet = new Set(canonicalBooks);

// Filter for chapter files (e.g., GEN01.htm, 1CH01.htm)
const chapterFiles = files.filter(file => /^[0-9A-Z]+[0-9]+\.htm$/.test(file));

// Group chapters by book
const bookData: Record<string, Record<number, number>> = {};

chapterFiles.forEach(file => {
  // Extract book abbreviation and chapter number
  const match = file.match(/^([0-9A-Z]+?)([0-9]+)\.htm$/);
  if (!match) return;

  const [, book, chapterStr] = match;
  if (!book || !chapterStr) return;

  // Skip non-canonical books
  if (!canonicalBooksSet.has(book)) {
    return;
  }

  const chapter = parseInt(chapterStr, 10);

  // Skip chapter 0 (invalid chapters like PSA000.htm)
  if (chapter === 0) {
    return;
  }

  // Read the file and count verses
  const filePath = path.join(htmlDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // Count verse spans - look for <span class="verse" id="V{number}">
  const verseMatches = content.match(/<span class="verse" id="V\d+"/g);
  const verseCount = verseMatches ? verseMatches.length : 0;

  // Initialize book if not exists
  if (!bookData[book]) {
    bookData[book] = {};
  }

  // Store verse count for this chapter
  bookData[book]![chapter] = verseCount;
});

// Sort books in canonical order
const sortedBooks = canonicalBooks.filter(book => bookData[book] !== undefined);

// Helper function to quote identifiers that start with numbers
const formatBookName = (book: string): string => {
  return /^\d/.test(book) ? `'${book}'` : book;
};

// Generate TypeScript content
let tsContent = '// WEB Bible verse counts - Source of truth for validation\n';
tsContent += '// Generated from HTML files (canonical 66 books only)\n';
tsContent += '// Do not edit manually - regenerate with: npm run generate:verse-counts\n\n';
tsContent += 'export const versesByBook: Record<string, Record<number, number>> = {\n';

sortedBooks.forEach((book, index) => {
  const chapters = bookData[book];
  if (!chapters) return;

  const chapterNums = Object.keys(chapters).map(Number).sort((a, b) => a - b);

  tsContent += `  ${formatBookName(book)}: {\n`;
  chapterNums.forEach((chapterNum, chapterIndex) => {
    const verseCount = chapters[chapterNum];
    const comma = chapterIndex < chapterNums.length - 1 ? ',' : '';
    tsContent += `    ${chapterNum}: ${verseCount}${comma}\n`;
  });
  const comma = index < sortedBooks.length - 1 ? ',' : '';
  tsContent += `  }${comma}\n`;
});

tsContent += '};\n';

// Write the TypeScript file
const outputPath = path.join(__dirname, 'verse-counts.ts');
fs.writeFileSync(outputPath, tsContent, 'utf8');

// Count total chapters
const totalChapters = sortedBooks.reduce((sum, book) => {
  const chapters = bookData[book];
  return sum + (chapters ? Object.keys(chapters).length : 0);
}, 0);

console.log(`Generated ${outputPath}`);
console.log(`Total books: ${sortedBooks.length}`);
console.log(`Total chapters: ${totalChapters}`);
