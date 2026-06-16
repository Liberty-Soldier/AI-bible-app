# World English Bible - Project Documentation

## Overview

This project converts the [World English Bible (WEB)](http://ebible.org/web/) HTML files into programmatic JSON files with complete formatting metadata. The WEB is based on the **majority text** for the New Testament and the Masoretic text for the Old Testament.

## Project Structure

```
world-english-bible/
├── html/                       # Source HTML files (1,505 files)
│   ├── GEN01.htm              # Genesis chapter 1
│   ├── GEN02.htm              # Genesis chapter 2
│   └── ...                    # All 66 canonical books + deuterocanonical
├── intermediate/              # Intermediate processing output
│   └── chapters.json          # Parsed chapters with verse data
├── json/                      # Final JSON output (66 files)
│   ├── genesis.json
│   ├── exodus.json
│   └── ...
├── node_modules/              # Dependencies
├── build-final-data-structure.ts    # Stage 2: Processes intermediate to final JSON
├── parse-html.ts                    # Stage 1: Parses HTML to intermediate JSON
├── verse-counts.ts                  # Canonical verse counts (source of truth)
├── generate-verse-counts.ts         # Generates verse-counts from HTML (66 canonical books)
├── validate-web-parsing.ts          # Validates intermediate parsing
├── validate-json-output.ts          # Validates final JSON output
├── just-flatten.d.ts                # Type declarations for just-flatten
├── package.json                     # Project configuration and scripts
├── tsconfig.json                    # TypeScript configuration
└── readme.md                        # User-facing documentation

```

## Data Pipeline

The project uses a two-stage pipeline to convert HTML to JSON:

### Stage 1: HTML Parsing (`parse-html.ts`)

**Input:** `html/*.htm` (1,505 HTML files)
**Output:** `intermediate/chapters.json`

Parses HTML files using Cheerio and extracts:
- Verse numbers
- Paragraph text and line text
- Paragraph and stanza markers
- Line breaks
- Headers

**Run:** `npm run parse-html`

### Stage 2: Final Data Structure (`build-final-data-structure.ts`)

**Input:** `intermediate/chapters.json`
**Output:** `json/*.json` (66 files, one per canonical book)

Processing pipeline (in order):
1. `removeWhitespaceAtStartOfParagraphsOrBooks` - Removes leading whitespace
2. `removeWhitespaceAtStartOfLines` - Removes whitespace after line breaks
3. `moveChapterNumbersIntoVerseText` - Adds chapterNumber to text chunks
4. `mergeContinuedParagraphs` - Merges paragraphs that continue across verses
5. `addVerseNumberToVerses` - Adds verseNumber to text chunks (with assertions)
6. `putContiguousLinesInsideOfStanzaStartAndEnd` - Wraps poetry lines in stanza markers
7. `turnBreaksInsideOfStanzasIntoStanzaStartAndEnds` - Converts breaks to stanza boundaries
8. `removeBreaksBeforeStanzaStarts` - Cleans up redundant breaks
9. `combineContiguousTextChunks` - Merges adjacent text chunks with same verse
10. `addSectionNumbers` - Adds section numbers within verses
11. `reorderKeys` - Ensures consistent property order

**Run:** `npm run build`

## Data Format

### Final JSON Structure

Each book is a JSON array of chunk objects. Chunks have different types:

#### Text Chunks (with metadata)

```json
{
  "type": "paragraph text",
  "chapterNumber": 9,
  "verseNumber": 17,
  "sectionNumber": 1,
  "value": "The verse text here.  "
}
```

```json
{
  "type": "line text",
  "chapterNumber": 2,
  "verseNumber": 1,
  "sectionNumber": 2,
  "value": "Poetry line text here. "
}
```

#### Structure Markers (no metadata)

```json
{ "type": "paragraph start" }
{ "type": "paragraph end" }
{ "type": "stanza start" }
{ "type": "stanza end" }
{ "type": "line break" }
{ "type": "break" }
```

### Chunk Types

- **`paragraph text`** - Regular prose text (only between paragraph start/end)
- **`line text`** - Poetry/psalm text (only between stanza start/end)
- **`paragraph start`** - Begins a paragraph block
- **`paragraph end`** - Ends a paragraph block
- **`stanza start`** - Begins a poetry/psalm stanza
- **`stanza end`** - Ends a poetry/psalm stanza
- **`line break`** - Line break within a stanza
- **`break`** - Section break

### Text Chunk Properties

- `type`: `"paragraph text"` or `"line text"`
- `chapterNumber`: Integer chapter number
- `verseNumber`: Integer verse number
- `sectionNumber`: Integer section within the verse (starts at 1)
- `value`: The actual text content (string)

## Verse Counts

### `verse-counts.ts`

Contains the canonical verse counts for all 66 books based on WEB (majority text):

```typescript
export const versesByBook: Record<string, Record<number, number>> = {
  GEN: {
    1: 31,
    2: 25,
    // ... all chapters
  },
  // ... all books
};
```

### Notable Differences from KJV (Textus Receptus)

The WEB uses the majority text for the New Testament, which differs from the KJV's textus receptus:

- **Romans 14**: 26 verses (KJV has 23)
- **Romans 16**: 25 verses (KJV has 27)

### Generating Verse Counts

**Source of Truth**: `verse-counts.ts` is generated directly from HTML files and serves as the independent source of truth for validating the parser.

```bash
npm run generate:verse-counts
```

This script (`generate-verse-counts.ts`):
- Reads HTML files directly (not parser output)
- Filters to only **66 canonical books** (excludes deuterocanonical books like 1 Esdras, 1 Maccabees, etc.)
- Skips invalid chapters (like PSA000.htm which would be chapter 0)
- Outputs books in **biblical order** (not alphabetical)
- Counts verses by finding `<span class="verse" id="V\d+">` tags

**Why not generate from parser output?** We need an independent source to validate the parser. Generating verse counts from the parser's output would create a circular dependency where we can't detect parser bugs.

## NPM Scripts

### Production Scripts

- `npm run parse-html` - Parse HTML files to intermediate JSON
- `npm run build` - Build final JSON output from intermediate data

### Test Scripts

- `npm test` - Run all tests in parallel (types + validations)
- `npm run test:types` - TypeScript type checking
- `npm run test:validate-web` - Validate intermediate parsing against expected verse counts
- `npm run test:validate-json` - Validate final JSON output against expected verse counts

### Generation Scripts

- `npm run generate:verse-counts` - Generate verse-counts.ts from HTML files (source of truth)

## Validation

### `validate-web-parsing.ts`

Validates the intermediate parsing by:
1. Reading `intermediate/chapters.json`
2. Counting verse numbers in each chapter
3. Comparing against `verse-counts.ts`

**Expected result:** 1,189/1,189 chapters match (0 differences)

### `validate-json-output.ts`

Validates the final JSON output by:
1. Reading all files in `json/*.json`
2. Counting unique verse numbers in each chapter
3. Comparing against `verse-counts.ts`

**Expected result:** 1,189/1,189 chapters match (0 differences)

### Validation Chain

The project maintains a proper validation chain with an independent source of truth:

```
HTML files (source)
    │
    ├─→ generate-verse-counts.ts → verse-counts.ts (SOURCE OF TRUTH)
    │                                      ↓
    └─→ parse-html.ts → intermediate/chapters.json  ← validated
                │                          ↓
                └─→ build-final-data-structure.ts → json/*.json  ← validated
```

**Key principle:** `verse-counts.ts` is generated independently from HTML files (not from parser output) so it can be used to validate both parsing stages without circular dependencies.

## Key Implementation Details

### Verse Number Bleeding Bug (Fixed)

**Problem:** Verse numbers were bleeding across chapter boundaries. For example, Psalm 18's verse 50 was appearing in Psalm 19.

**Root Cause:** The `addVerseNumberToVerses()` function was resetting `currentVerseNumber` when detecting a chapter change via text chunks, even after verse number 1 had already been processed for the new chapter.

**Solution:** Modified the chapter change logic to NOT reset `currentVerseNumber` when it's 1, since verse 1 always belongs to the new chapter:

```typescript
if (lastChapterSeen !== undefined && currentVerseNumber !== 1) {
  currentVerseNumber = undefined;
}
```

### Assertions

The code uses assertions to validate expected behavior instead of silently dropping data:

```typescript
assert(
  chunk.value.trim() === '' || chunk.chapterNumber === undefined,
  `Unexpected text chunk without verse number: chapter ${chunk.chapterNumber}, value: "${chunk.value}"`
);
```

### ES Modules

The project uses ES modules (not CommonJS):
- `package.json` has `"type": "module"`
- All imports use `.ts` extensions for local modules
- Modern Node.js (v24+) runs TypeScript directly

## TypeScript Configuration

### `tsconfig.json`

- Module: `nodenext` (ES modules)
- Target: `esnext`
- Strict mode enabled
- Notable flags:
  - `noUncheckedIndexedAccess: true`
  - `exactOptionalPropertyTypes: true`
  - `isolatedModules: true`
  - `noEmit: true` (no compilation, just type checking)

## Dependencies

### Production
None - the JSON output is standalone

### Development

- `cheerio` (1.0.0-rc.2) - HTML parsing
- `just-flatten` (1.0.0) - Array flattening utility
- `typescript` (^5.9.3) - Type checking
- `npm-run-all` (^4.1.5) - Run scripts in parallel
- `@types/cheerio` (^0.22.35) - Cheerio type definitions
- `@types/node` (^24.10.1) - Node.js type definitions

## File Naming

JSON files use lowercase book names with spaces removed:

- Genesis → `genesis.json`
- 1 Samuel → `1samuel.json`
- Song of Solomon → `songofsolomon.json`

Book names follow the [books-of-the-bible](https://github.com/TehShrike/books-of-the-bible) package convention.

## Book Coverage

### Canonical Books (66)

All 66 canonical Protestant Bible books are included:
- 39 Old Testament books
- 27 New Testament books
- Total: 1,189 chapters

### Deuterocanonical Books

The HTML source includes deuterocanonical books, but these are filtered out during processing. Only the 66 canonical books appear in the final JSON output.

## Debugging

### Check Intermediate Parsing

```bash
npm run test:validate-web
```

Should show 1,189/1,189 matches.

### Check Final Output

```bash
npm run test:validate-json
```

Should show 1,189/1,189 matches.

### Check Specific Book

```bash
cat json/psalms.json | jq 'map(select(.verseNumber == 1)) | .[0:5]'
```

### Count Chapters in a Book

```bash
cat json/genesis.json | jq '[.[] | select(.type == "paragraph text" or .type == "line text") | .chapterNumber] | unique | length'
```

## Common Tasks

### Full Rebuild

```bash
npm run parse-html
npm run build
npm test
```

### Update Verse Counts

```bash
npm run generate:verse-counts
npm test
```

### Add New Validation

1. Create new script in root directory (e.g., `validate-xyz.ts`)
2. Add script to `package.json`:
   ```json
   "test:validate-xyz": "node validate-xyz.ts"
   ```
3. Run `npm test` to include in test suite

## Performance

- HTML parsing: ~5-10 seconds
- Final build: ~1-2 seconds
- Validation scripts: ~1-2 seconds each
- Verse count generation: ~2-3 seconds

## License

UNLICENSED

## Author

TehShrike

## Repository

https://github.com/TehShrike/world-english-bible
