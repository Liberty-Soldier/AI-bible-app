import type { TranslationPreference } from "@/app/lib/translationPreference";

export type BookInfo = {
  book: string;
  chapters: number;
  translations?: readonly TranslationPreference[];
  note?: string;
  chapterNumbers?: Partial<Record<TranslationPreference, readonly number[]>>;
};

export const bookCatalog: BookInfo[] = [
  { book: "Genesis", chapters: 50, translations: ["web", "kjv", "brenton"] },
  { book: "Exodus", chapters: 40, translations: ["web", "kjv", "brenton"] },
  { book: "Leviticus", chapters: 27, translations: ["web", "kjv", "brenton"] },
  { book: "Numbers", chapters: 36, translations: ["web", "kjv", "brenton"] },
  { book: "Deuteronomy", chapters: 34, translations: ["web", "kjv", "brenton"] },
  { book: "Joshua", chapters: 24, translations: ["web", "kjv", "brenton"] },
  { book: "Judges", chapters: 21, translations: ["web", "kjv", "brenton"] },
  { book: "Ruth", chapters: 4, translations: ["web", "kjv", "brenton"] },
  { book: "1 Samuel", chapters: 31, translations: ["web", "kjv", "brenton"] },
  { book: "2 Samuel", chapters: 24, translations: ["web", "kjv", "brenton"] },
  { book: "1 Kings", chapters: 22, translations: ["web", "kjv", "brenton"] },
  { book: "2 Kings", chapters: 25, translations: ["web", "kjv", "brenton"] },
  { book: "1 Chronicles", chapters: 29, translations: ["web", "kjv", "brenton"] },
  { book: "2 Chronicles", chapters: 36, translations: ["web", "kjv", "brenton"] },
  { book: "Ezra", chapters: 10, translations: ["web", "kjv", "brenton"] },
  { book: "Nehemiah", chapters: 13, translations: ["web", "kjv", "brenton"] },
  { book: "Esther", chapters: 10, translations: ["web", "kjv"] },
  { book: "Job", chapters: 42, translations: ["web", "kjv", "brenton"] },
  { book: "Psalms", chapters: 150, translations: ["web", "kjv", "brenton"], chapterNumbers: { brenton: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151] } },
  { book: "Proverbs", chapters: 31, translations: ["web", "kjv", "brenton"], chapterNumbers: { brenton: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31] } },
  { book: "Ecclesiastes", chapters: 12, translations: ["web", "kjv", "brenton"] },
  { book: "Song of Solomon", chapters: 8, translations: ["web", "kjv"] },
  { book: "Isaiah", chapters: 66, translations: ["web", "kjv", "brenton"] },
  { book: "Jeremiah", chapters: 52, translations: ["web", "kjv", "brenton"] },
  { book: "Lamentations", chapters: 5, translations: ["web", "kjv", "brenton"] },
  { book: "Ezekiel", chapters: 48, translations: ["web", "kjv", "brenton"] },
  { book: "Daniel", chapters: 12, translations: ["web", "kjv"] },
  { book: "Hosea", chapters: 14, translations: ["web", "kjv", "brenton"] },
  { book: "Joel", chapters: 3, translations: ["web", "kjv", "brenton"], chapterNumbers: { brenton: [1, 2, 3, 4] } },
  { book: "Amos", chapters: 9, translations: ["web", "kjv", "brenton"] },
  { book: "Obadiah", chapters: 1, translations: ["web", "kjv", "brenton"] },
  { book: "Jonah", chapters: 4, translations: ["web", "kjv", "brenton"] },
  { book: "Micah", chapters: 7, translations: ["web", "kjv", "brenton"] },
  { book: "Nahum", chapters: 3, translations: ["web", "kjv", "brenton"] },
  { book: "Habakkuk", chapters: 3, translations: ["web", "kjv", "brenton"] },
  { book: "Zephaniah", chapters: 3, translations: ["web", "kjv", "brenton"] },
  { book: "Haggai", chapters: 2, translations: ["web", "kjv", "brenton"] },
  { book: "Zechariah", chapters: 14, translations: ["web", "kjv", "brenton"] },
  { book: "Malachi", chapters: 4, translations: ["web", "kjv", "brenton"] },
  { book: "Matthew", chapters: 28, translations: ["web", "kjv"] },
  { book: "Mark", chapters: 16, translations: ["web", "kjv"] },
  { book: "Luke", chapters: 24, translations: ["web", "kjv"] },
  { book: "John", chapters: 21, translations: ["web", "kjv"] },
  { book: "Acts", chapters: 28, translations: ["web", "kjv"] },
  { book: "Romans", chapters: 16, translations: ["web", "kjv"] },
  { book: "1 Corinthians", chapters: 16, translations: ["web", "kjv"] },
  { book: "2 Corinthians", chapters: 13, translations: ["web", "kjv"] },
  { book: "Galatians", chapters: 6, translations: ["web", "kjv"] },
  { book: "Ephesians", chapters: 6, translations: ["web", "kjv"] },
  { book: "Philippians", chapters: 4, translations: ["web", "kjv"] },
  { book: "Colossians", chapters: 4, translations: ["web", "kjv"] },
  { book: "1 Thessalonians", chapters: 5, translations: ["web", "kjv"] },
  { book: "2 Thessalonians", chapters: 3, translations: ["web", "kjv"] },
  { book: "1 Timothy", chapters: 6, translations: ["web", "kjv"] },
  { book: "2 Timothy", chapters: 4, translations: ["web", "kjv"] },
  { book: "Titus", chapters: 3, translations: ["web", "kjv"] },
  { book: "Philemon", chapters: 1, translations: ["web", "kjv"] },
  { book: "Hebrews", chapters: 13, translations: ["web", "kjv"] },
  { book: "James", chapters: 5, translations: ["web", "kjv"] },
  { book: "1 Peter", chapters: 5, translations: ["web", "kjv"] },
  { book: "2 Peter", chapters: 3, translations: ["web", "kjv"] },
  { book: "1 John", chapters: 5, translations: ["web", "kjv"] },
  { book: "2 John", chapters: 1, translations: ["web", "kjv"] },
  { book: "3 John", chapters: 1, translations: ["web", "kjv"] },
  { book: "Jude", chapters: 1, translations: ["web", "kjv"] },
  { book: "Revelation", chapters: 22, translations: ["web", "kjv"] },
  { book: "Tobit", chapters: 14, translations: ["brenton"] },
  { book: "Judith", chapters: 16, translations: ["brenton"] },
  { book: "Wisdom", chapters: 19, translations: ["brenton"] },
  { book: "Sirach", chapters: 51, translations: ["brenton"] },
  { book: "Baruch", chapters: 5, translations: ["brenton"] },
  { book: "Daniel Greek", chapters: 12, translations: ["brenton"] },
  { book: "Susanna", chapters: 1, translations: ["brenton"], note: "Also numbered Daniel 13 in some traditions; presented here as Susanna 1." },
  { book: "Bel and the Dragon", chapters: 1, translations: ["brenton"], note: "Also numbered Daniel 14 in some traditions; presented here as Bel and the Dragon 1." },
  { book: "1 Maccabees", chapters: 16, translations: ["brenton"] },
  { book: "2 Maccabees", chapters: 15, translations: ["brenton"] },
  { book: "3 Maccabees", chapters: 7, translations: ["brenton"] },
  { book: "4 Maccabees", chapters: 18, translations: ["brenton"] },
  { book: "1 Esdras", chapters: 9, translations: ["brenton"] },
  { book: "Esther Greek", chapters: 10, translations: ["brenton"] },
  { book: "Letter of Jeremiah", chapters: 1, translations: ["brenton"] },
  { book: "Prayer of Manasseh", chapters: 1, translations: ["brenton"] },
  { book: "Song of Songs", chapters: 8, translations: ["brenton"] },
];

// Navigation metadata mirrors existing runtime files; source coordinates remain unchanged.
export function getBookTranslation(book: string, preferred: TranslationPreference): TranslationPreference {
  const available = bookCatalog.find(item => item.book === book)?.translations;
  return available && !available.includes(preferred) ? available[0] : preferred;
}

export function getBookChapters(book: string, translation: TranslationPreference): number[] {
  const info = bookCatalog.find(item => item.book === book);
  if (!info || !info.translations?.includes(translation)) return [];
  return info.chapterNumbers?.[translation]?.slice() || Array.from({ length: info.chapters }, (_, index) => index + 1);
}
