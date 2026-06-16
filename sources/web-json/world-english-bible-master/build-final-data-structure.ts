import flatten from 'just-flatten';
import * as fs from 'fs';
import assert from 'assert';

const parsed = JSON.parse(fs.readFileSync('./intermediate/chapters.json', 'utf8'));

const types = {
	PARAGRAPH_START: `paragraph start`,
	PARAGRAPH_END: `paragraph end`,
	STANZA_START: `stanza start`,
	STANZA_END: `stanza end`,
	PARAGRAPH_TEXT: `paragraph text`,
	LINE_TEXT: `line text`,
	LINE_BREAK: `line break`,
	CHAPTER_NUMBER: `chapter number`,
	VERSE_NUMBER: `verse number`,
	CONTINUE_PREVIOUS_PARAGRAPH: `continue previous paragraph`,
	BREAK: `break`,
} as const;

const properKeyOrder = [
	`type`,
	`chapterNumber`,
	`verseNumber`,
	`sectionNumber`,
	`value`,
];

type ChunkType =
	| { type: typeof types.PARAGRAPH_START }
	| { type: typeof types.PARAGRAPH_END }
	| { type: typeof types.STANZA_START }
	| { type: typeof types.STANZA_END }
	| { type: typeof types.PARAGRAPH_TEXT; chapterNumber?: number; verseNumber?: number; sectionNumber?: number; value: string }
	| { type: typeof types.LINE_TEXT; chapterNumber?: number; verseNumber?: number; sectionNumber?: number; value: string }
	| { type: typeof types.LINE_BREAK }
	| { type: typeof types.CHAPTER_NUMBER; value: number }
	| { type: typeof types.VERSE_NUMBER; value: number }
	| { type: typeof types.CONTINUE_PREVIOUS_PARAGRAPH }
	| { type: typeof types.BREAK }
	| { type: 'header'; value: string };

interface Chapter {
	chunks: ChunkType[];
	chapterNumber: number;
	bookName: string;
}

const stanzaStart: ChunkType = { type: types.STANZA_START };
const stanzaEnd: ChunkType = { type: types.STANZA_END };

function main(): void {
	const finalForm = buildFinalForm(parsed as Chapter[]);

	Object.keys(finalForm).forEach(bookName => {
		const filename = turnBookNameIntoFileName(bookName);

		fs.writeFileSync(`./json/` + filename + `.json`, json(finalForm[bookName]));
	});
}

function buildFinalForm(chunks: Chapter[]): Record<string, ChunkType[]> {
	const mapOfBooks = makeMapOfBooks(chunks);

	Object.keys(mapOfBooks).forEach(bookName => {
		const book = mapOfBooks[bookName];
		if (book) {
			mapOfBooks[bookName] = fixChunks(book);
		}
	});

	return mapOfBooks;
}

function makeMapOfBooks(arrayOfChapters: Chapter[]): Record<string, ChunkType[]> {
	const map = emptyMap<any[]>();

	arrayOfChapters.forEach(chapter => {
		const bookName = chapter.bookName;
		map[bookName] = map[bookName] || [];
		map[bookName]!.push(chapter as any);
	});

	Object.keys(map).forEach(bookName => {
		const chapters = map[bookName];
		if (chapters) {
			map[bookName] = flatten(sortChapters(chapters as any[] as Chapter[]).map(chapter => {
				const chapterNumber = chapter.chapterNumber;

				const chapterNumberChunk: ChunkType = { type: types.CHAPTER_NUMBER, value: chapterNumber };

				return [ chapterNumberChunk, ...chapter.chunks ];
			})) as ChunkType[];
		}
	});

	return map;
}

function sortChapters(chapters: Chapter[]): Chapter[] {
	return [ ...chapters ].sort((a, b) => a.chapterNumber - b.chapterNumber);
}

const emptyMap = <T>(): Record<string, T> => Object.create(null);

function fixChunks(chunks: ChunkType[]): ChunkType[] {
	return pipe(chunks,
		removeWhitespaceAtStartOfParagraphsOrBooks,
		removeWhitespaceAtStartOfLines,
		moveChapterNumbersIntoVerseText,
		mergeContinuedParagraphs,
		addVerseNumberToVerses,
		putContiguousLinesInsideOfStanzaStartAndEnd,
		turnBreaksInsideOfStanzasIntoStanzaStartAndEnds,
		removeBreaksBeforeStanzaStarts,
		combineContiguousTextChunks,
		addSectionNumbers,
		reorderKeys,
	);
}

const pipe = (value: ChunkType[], ...fns: Array<(chunks: ChunkType[]) => ChunkType[]>): ChunkType[] =>
	fns.reduce((previous, fn) => fn(previous), value);

function removeWhitespaceAtStartOfParagraphsOrBooks(chunks: ChunkType[]): ChunkType[] {
	let pastFirstVerse = false;
	let lastChunk: ChunkType | null = null;
	return chunks.filter(chunk => {
		const startOfBook = !pastFirstVerse;
		const startOfParagraph = lastChunk
			&& (lastChunk.type === types.PARAGRAPH_START || lastChunk.type === types.CONTINUE_PREVIOUS_PARAGRAPH);

		const removeChunk = (startOfBook || startOfParagraph)
			&& isTextChunk(chunk)
			&& !chunk.value.trim();

		lastChunk = chunk;
		if (chunk.type === types.VERSE_NUMBER) {
			pastFirstVerse = true;
		}

		return !removeChunk;
	});
}

function removeWhitespaceAtStartOfLines(chunks: ChunkType[]): ChunkType[] {
	let lastChunk: ChunkType | null = null;

	return chunks.filter(chunk => {
		const firstChunkAfterLineBreak = lastChunk && lastChunk.type === types.LINE_BREAK;

		const removeChunk = firstChunkAfterLineBreak
			&& isTextChunk(chunk)
			&& !chunk.value.trim();

		lastChunk = chunk;

		return !removeChunk;
	});
}

function moveChapterNumbersIntoVerseText(chunks: ChunkType[]): ChunkType[] {
	let currentChapterNumber: number | undefined = undefined;
	return chunks.map(chunk => {
		if (chunk.type === types.CHAPTER_NUMBER) {
			currentChapterNumber = chunk.value;
			return undefined;
		} else if (isTextChunk(chunk)) {
			return {
				...chunk,
				chapterNumber: currentChapterNumber!,
			};
		} else {
			return chunk;
		}
	}).filter(truthy);
}

function mergeContinuedParagraphs(chunks: ChunkType[]): ChunkType[] {
	const output: ChunkType[] = [];

	chunks.forEach(chunk => {
		if (chunk.type === types.CONTINUE_PREVIOUS_PARAGRAPH) {
			const last = output[output.length - 1];
			assert(last && last.type === types.PARAGRAPH_END);

			output.pop();
		} else {
			output.push(chunk);
		}
	});

	assert(numberOfType(output, types.CONTINUE_PREVIOUS_PARAGRAPH) === 0);
	assert(numberOfType(output, types.PARAGRAPH_START) === numberOfType(output, types.PARAGRAPH_END));

	return output;
}

function addVerseNumberToVerses(chunks: ChunkType[]): ChunkType[] {
	let currentVerseNumber: number | undefined = undefined;
	let lastChapterSeen: number | undefined = undefined;
	const output: ChunkType[] = [];
	chunks.forEach(chunk => {
		if (chunk.type === types.VERSE_NUMBER) {
			currentVerseNumber = chunk.value;
		} else if (isTextChunk(chunk)) {
			// Detect if we've moved to a new chapter
			if (chunk.chapterNumber !== undefined && chunk.chapterNumber !== lastChapterSeen) {
				// We're in a new chapter - reset verse number to avoid carrying over from previous chapter
				// UNLESS currentVerseNumber is 1, which always belongs to the new chapter
				if (lastChapterSeen !== undefined && currentVerseNumber !== 1) {
					currentVerseNumber = undefined;
				}
				lastChapterSeen = chunk.chapterNumber;
			}

			// Only add text chunks that have a verse number
			if (currentVerseNumber !== undefined) {
				output.push({
					...chunk,
					verseNumber: currentVerseNumber as number,
				} as ChunkType);
			} else {
				// Validate that text chunks without verse numbers are expected
				// These should only be whitespace or text without chapter numbers (shouldn't happen after moveChapterNumbersIntoVerseText)
				assert(
					chunk.value.trim() === '' || chunk.chapterNumber === undefined,
					`Unexpected text chunk without verse number: chapter ${chunk.chapterNumber}, value: "${chunk.value}"`
				);
				// Intentionally skip pre-verse whitespace and uncategorized text
			}
		} else {
			output.push(chunk);
		}
	});
	return output;
}

function putContiguousLinesInsideOfStanzaStartAndEnd(chunks: ChunkType[]): ChunkType[] {
	let insideStanza = false;
	return flatMap(chunks, chunk => {
		if (insideStanza && (!isStanzaChunk(chunk) && chunk.type !== types.BREAK)) {
			insideStanza = false;
			return [ stanzaEnd, chunk ];
		} else if (!insideStanza && isStanzaChunk(chunk)) {
			insideStanza = true;
			return [ stanzaStart, chunk ];
		} else {
			return chunk;
		}
	});
}

function turnBreaksInsideOfStanzasIntoStanzaStartAndEnds(chunks: ChunkType[]): ChunkType[] {
	let insideStanza = false;
	return flatMap(chunks, chunk => {
		if (chunk.type === types.STANZA_START) {
			insideStanza = true;
		} else if (chunk.type === types.STANZA_END) {
			insideStanza = false;
		}

		if (insideStanza && chunk.type === types.BREAK) {
			return [ stanzaEnd, stanzaStart ];
		} else {
			return chunk;
		}
	});
}

function removeBreaksBeforeStanzaStarts(chunks: ChunkType[]): ChunkType[] {
	const output: ChunkType[] = [];

	let last: ChunkType | null = null;
	chunks.forEach(chunk => {
		if (chunk.type === types.BREAK) {
			last = chunk;
			return;
		} else if (last && chunk.type !== types.STANZA_START) {
			output.push(last);
		}

		last = null;
		output.push(chunk);
	});

	return output;
}

function combineContiguousTextChunks(chunks: ChunkType[]): ChunkType[] {
	let last: ChunkType | null = null;
	const outputChunks: ChunkType[] = [];

	chunks.forEach(chunk => {
		if (
			isTextChunk(chunk)
			&& last
			&& isTextChunk(last)
			&& last.type === chunk.type
			&& last.verseNumber === chunk.verseNumber
			&& last.chapterNumber === chunk.chapterNumber
		) {
			last.value += chunk.value;
		} else {
			last = chunk;
			outputChunks.push(chunk);
		}
	});

	return outputChunks;
}

function addSectionNumbers(chunks: ChunkType[]): ChunkType[] {
	let lastChapter: number | null = null;
	let lastVerse: number | null = null;
	let lastSection = 0;

	return chunks.map(chunk => {
		if (isTextChunk(chunk)) {
			const { verseNumber, chapterNumber } = chunk;

			if (verseNumber !== lastVerse || chapterNumber !== lastChapter) {
				lastChapter = chapterNumber!;
				lastVerse = verseNumber!;
				lastSection = 0;
			}

			lastSection++;

			return {
				...chunk,
				sectionNumber: lastSection,
			};
		} else {
			return chunk;
		}
	});
}

function reorderKeys(chunks: ChunkType[]): ChunkType[] {
	return chunks.map(chunk => {
		const proper: Record<string, unknown> = {};

		properKeyOrder.forEach(key => {
			if ((chunk as any)[key] !== undefined) {
				proper[key] = (chunk as any)[key];
			}
		});

		return proper as ChunkType;
	});
}

const truthy = <T>(value: T | null | undefined): value is T => !!value;
const numberOfType = (chunks: ChunkType[], type: string): number =>
	chunks.reduce((count, chunk) => count + (chunk.type === type ? 1 : 0), 0);
const json = (value: unknown): string => JSON.stringify(value, null, `\t`);
const flatMap = (array: ChunkType[], fn: (chunk: ChunkType) => ChunkType | ChunkType[]): ChunkType[] =>
	flatten(array.map(fn));
const isTextChunk = (chunk: ChunkType): chunk is Extract<ChunkType, { value: string; type: typeof types.PARAGRAPH_TEXT | typeof types.LINE_TEXT }> =>
	chunk.type === types.PARAGRAPH_TEXT || chunk.type === types.LINE_TEXT;
const isStanzaChunk = (chunk: ChunkType): boolean =>
	chunk.type === types.LINE_TEXT || chunk.type === types.LINE_BREAK;
const turnBookNameIntoFileName = (bookName: string): string =>
	bookName.replace(/ /g, ``).toLowerCase();

main();
