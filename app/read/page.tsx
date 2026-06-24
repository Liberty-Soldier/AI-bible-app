"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { allScripture } from "@/app/data/scripture/allScripture";
import MobileBottomNav from "@/app/components/MobileBottomNav";

type Translation = "web" | "kjv" | "brenton";

type Section =
  | "torah"
  | "history"
  | "wisdom"
  | "prophets"
  | "septuagint"
  | "new";

  const bookAliases: Record<string, string> = {
  gen: "Genesis",
  ge: "Genesis",
  ex: "Exodus",
  exod: "Exodus",
  lev: "Leviticus",
  num: "Numbers",
  deut: "Deuteronomy",
  dt: "Deuteronomy",

  josh: "Joshua",
  judg: "Judges",
  jdg: "Judges",
  ruth: "Ruth",

  "1 sam": "1 Samuel",
  "1sam": "1 Samuel",
  "2 sam": "2 Samuel",
  "2sam": "2 Samuel",
  "1 kgs": "1 Kings",
  "1kgs": "1 Kings",
  "2 kgs": "2 Kings",
  "2kgs": "2 Kings",
  "1 chr": "1 Chronicles",
  "1chr": "1 Chronicles",
  "2 chr": "2 Chronicles",
  "2chr": "2 Chronicles",

  ezra: "Ezra",
  neh: "Nehemiah",
  job: "Job",
  ps: "Psalms",
  psa: "Psalms",
  pss: "Psalms",
  prov: "Proverbs",
  pro: "Proverbs",
  eccl: "Ecclesiastes",
  song: "Song of Songs",
  sos: "Song of Songs",

  isa: "Isaiah",
  jer: "Jeremiah",
  lam: "Lamentations",
  ezek: "Ezekiel",
  eze: "Ezekiel",
  dan: "Daniel Greek",
  hos: "Hosea",
  joel: "Joel",
  amos: "Amos",
  obad: "Obadiah",
  jonah: "Jonah",
  mic: "Micah",
  nah: "Nahum",
  hab: "Habakkuk",
  zeph: "Zephaniah",
  hag: "Haggai",
  zech: "Zechariah",
  mal: "Malachi",

  tob: "Tobit",
  jdt: "Judith",
  judith: "Judith",
  wis: "Wisdom",
  sir: "Sirach",
  bar: "Baruch",
  "1 macc": "1 Maccabees",
  "1macc": "1 Maccabees",
  "2 macc": "2 Maccabees",
  "2macc": "2 Maccabees",
  "3 macc": "3 Maccabees",
  "3macc": "3 Maccabees",
  "4 macc": "4 Maccabees",
  "4macc": "4 Maccabees",

  matt: "Matthew",
  mt: "Matthew",
  mark: "Mark",
  mk: "Mark",
  luke: "Luke",
  lk: "Luke",
  john: "John",
  jn: "John",
  acts: "Acts",
  rom: "Romans",
  "1 cor": "1 Corinthians",
  "1cor": "1 Corinthians",
  "2 cor": "2 Corinthians",
  "2cor": "2 Corinthians",
  gal: "Galatians",
  eph: "Ephesians",
  phil: "Philippians",
  col: "Colossians",
  "1 thess": "1 Thessalonians",
  "1thess": "1 Thessalonians",
  "2 thess": "2 Thessalonians",
  "2thess": "2 Thessalonians",
  "1 tim": "1 Timothy",
  "1tim": "1 Timothy",
  "2 tim": "2 Timothy",
  "2tim": "2 Timothy",
  titus: "Titus",
  phlm: "Philemon",
  heb: "Hebrews",
  jas: "James",
  james: "James",
  "1 pet": "1 Peter",
  "1pet": "1 Peter",
  "2 pet": "2 Peter",
  "2pet": "2 Peter",
  "1 john": "1 John",
  "1john": "1 John",
  "2 john": "2 John",
  "2john": "2 John",
  "3 john": "3 John",
  "3john": "3 John",
  jude: "Jude",
  rev: "Revelation",
};

type BookInfo = {
  book: string;
  chapters: number;
};

const torahBooks = new Set([
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
]);

const historyBooks = new Set([
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
]);

const wisdomBooks = new Set([
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Songs",
]);

const prophetsBooks = new Set([
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
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
]);

const septuagintBooks = new Set([
  "Tobit",
  "Judith",
  "Esther Greek",
  "Wisdom",
  "Sirach",
  "Baruch",
  "Letter of Jeremiah",
  "Susanna",
  "Bel and the Dragon",
  "1 Maccabees",
  "2 Maccabees",
  "1 Esdras",
  "Prayer of Manasseh",
  "3 Maccabees",
  "4 Maccabees",
  "Daniel Greek",
]);

function getBooksFromScripture(): BookInfo[] {
  const bookMap = new Map<string, number>();

  for (const verse of allScripture) {
    const currentMax = bookMap.get(verse.book) || 0;
    bookMap.set(verse.book, Math.max(currentMax, verse.chapter));
  }

  return Array.from(bookMap.entries()).map(([book, chapters]) => ({
    book,
    chapters,
  }));
}

function getSection(book: string): Section {
  if (torahBooks.has(book)) return "torah";
  if (historyBooks.has(book)) return "history";
  if (wisdomBooks.has(book)) return "wisdom";
  if (prophetsBooks.has(book)) return "prophets";
  if (septuagintBooks.has(book)) return "septuagint";

  return "new";
}

export default function ReadPage() {
  const router = useRouter();

  const books = useMemo(() => getBooksFromScripture(), []);

  const [translation, setTranslation] = useState<Translation>("web");
  const [section, setSection] = useState<Section>("torah");
  const [book, setBook] = useState("Genesis");
  const [chapter, setChapter] = useState(1);
  const [quickJump, setQuickJump] = useState("");

  const sectionBooks = books.filter((item) => getSection(item.book) === section);
  const selectedBook = books.find((item) => item.book === book);

  useEffect(() => {
    const saved = localStorage.getItem("preferredTranslation");

    if (saved === "web" || saved === "kjv" || saved === "brenton") {
      setTranslation(saved);
    }
  }, []);

  useEffect(() => {
    const firstBook = sectionBooks[0];

    if (firstBook) {
      setBook(firstBook.book);
      setChapter(1);
    }
  }, [section, sectionBooks]);

  function openChapter() {
    if (!book) return;

    router.push(
      `/read/${encodeURIComponent(book)}/${chapter}?translation=${translation}`
    );
  }

  function handleQuickJump() {
    const value = quickJump.trim();
    if (!value) return;

    const match = value.match(/^(.+?)\s*(\d+)(?::(\d+))?$/);

    if (!match) return;

const jumpBook = match[1].trim();
const jumpChapter = Number(match[2]);
const jumpVerse = match[3] ? Number(match[3]) : null;

const normalizedBook =
  bookAliases[jumpBook.toLowerCase()] || jumpBook;

const found = books.find(
  (item) => item.book.toLowerCase() === normalizedBook.toLowerCase()
);

    if (!found) return;

    router.push(
      `/read/${encodeURIComponent(found.book)}/${jumpChapter}?translation=${translation}${
        jumpVerse ? `&verse=${jumpVerse}` : ""
      }`
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 pb-24 text-white sm:px-6 sm:py-10">
      <section className="mx-auto max-w-2xl">
        <div className="mb-8">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-neutral-500">
            Read
          </p>

          <h1 className="text-4xl font-bold sm:text-5xl">Open Scripture</h1>

          <p className="mt-3 text-neutral-400">
            Jump directly or choose a section, book, and chapter.
          </p>
        </div>

        <div className="space-y-5 rounded-3xl border border-neutral-800 bg-neutral-950/60 p-5">
          <div>
            <label className="mb-2 block text-sm text-neutral-400">
              Quick Jump
            </label>

            <div className="flex gap-2">
              <input
                value={quickJump}
                onChange={(event) => setQuickJump(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleQuickJump();
                }}
                placeholder="Genesis 1, Isaiah 53, John 3:16, Tobit 4"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-white outline-none"
              />

              <button
                type="button"
                onClick={handleQuickJump}
                className="rounded-xl bg-white px-4 py-3 font-medium text-black"
              >
                Go
              </button>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-neutral-400">
              Translation
            </label>

            <select
              value={translation}
              onChange={(event) => {
                const next = event.target.value as Translation;
                setTranslation(next);
                localStorage.setItem("preferredTranslation", next);
              }}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-white"
            >
              <option value="web">World English Bible</option>
              <option value="kjv">King James Version</option>
              <option value="brenton">Brenton Septuagint</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm text-neutral-400">
              Section
            </label>

            <select
              value={section}
              onChange={(event) => setSection(event.target.value as Section)}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-white"
            >
              <option value="torah">Law (Torah)</option>
              <option value="history">History</option>
              <option value="wisdom">Wisdom</option>
              <option value="prophets">Prophets</option>
              <option value="septuagint">Septuagint Books</option>
              <option value="new">New Testament</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm text-neutral-400">Book</label>

            <select
              value={book}
              onChange={(event) => {
                setBook(event.target.value);
                setChapter(1);
              }}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-white"
            >
              {sectionBooks.map((item) => (
                <option key={item.book} value={item.book}>
                  {item.book}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm text-neutral-400">
              Chapter
            </label>

            <select
              value={chapter}
              onChange={(event) => setChapter(Number(event.target.value))}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-white"
            >
              {Array.from({ length: selectedBook?.chapters || 1 }).map(
                (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1}
                  </option>
                )
              )}
            </select>
          </div>

          <button
            type="button"
            onClick={openChapter}
            className="w-full rounded-xl bg-white px-4 py-3 font-semibold text-black"
          >
            Open Chapter
          </button>
        </div>
      </section>

      <MobileBottomNav />
    </main>
  );
}