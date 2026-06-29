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

const newTestamentBooks = new Set([
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
  if (newTestamentBooks.has(book)) return "new";

  return "septuagint";
}

export default function ReadPage() {
  const router = useRouter();

  const books = useMemo(() => getBooksFromScripture(), []);

  const [translation, setTranslation] = useState<Translation>("web");
  const [section, setSection] = useState<Section>("torah");
  const [book, setBook] = useState("Genesis");
  const [chapter, setChapter] = useState(1);
  const [quickJump, setQuickJump] = useState("");

  const [pickerStep, setPickerStep] = useState<"section" | "book" | "chapter">(
  "section"
);
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
}, [section]);

  function openChapter() {
    if (!book) return;

    router.push(
      `/read/${encodeURIComponent(book)}/${chapter}?translation=${translation}`
    );
  }

  function handleQuickJump() {
    const value = quickJump.trim();
    if (!value) return;

    const match = value.match(/^(.+?)\s+(\d+)(?:(?::|\s+)(\d+))?$/);

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
  <main className="min-h-screen bg-[var(--background)] px-4 py-6 pb-24 text-[var(--foreground)]">
    <section className="mx-auto max-w-2xl">
      <div className="mb-6">
        <p className="mb-3 text-sm uppercase tracking-[0.3em] text-[var(--muted)]">
          Read
        </p>
        <h1 className="text-4xl font-bold">Open Scripture</h1>
        <p className="mt-3 text-[var(--muted)]">
          Jump straight to a passage or tap through Scripture.
        </p>
      </div>

      <div className="mb-6 rounded-3xl border border-[var(--border)] bg-[var(--surface)]/70 p-4">
        <label className="mb-2 block text-sm font-medium text-[var(--muted)]">
          Go to Scripture
        </label>

        <div className="flex gap-2">
<input
  value={quickJump}
  onChange={(event) => setQuickJump(event.target.value)}
  onKeyDown={(event) => {
    if (event.key === "Enter") handleQuickJump();
  }}
  placeholder="John 3:16 or John 3 16"
  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] outline-none"
/>

          <button
            type="button"
            onClick={handleQuickJump}
            className="rounded-2xl bg-white px-5 py-3 font-semibold text-black"
          >
            Go
          </button>
        </div>
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto">
        {[
          ["web", "WEB"],
          ["kjv", "KJV"],
          ["brenton", "Brenton"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              const next = value as Translation;
              setTranslation(next);
              localStorage.setItem("preferredTranslation", next);
            }}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              translation === value
                ? "bg-[var(--foreground)] text-[var(--background)]"
                : "bg-[var(--surface)] text-[var(--muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-[var(--muted)]">Choose passage</p>
            <h2 className="text-xl font-bold">
              {pickerStep === "section" && "Section"}
              {pickerStep === "book" && "Book"}
              {pickerStep === "chapter" && book}
            </h2>
          </div>

          {pickerStep !== "section" && (
            <button
              type="button"
              onClick={() => {
                if (pickerStep === "chapter") setPickerStep("book");
                else setPickerStep("section");
              }}
              className="rounded-full bg-[var(--surface)] px-4 py-2 text-sm text-[var(--muted)]"
            >
              Back
            </button>
          )}
        </div>

        {pickerStep === "section" && (
          <div className="grid grid-cols-2 gap-3">
            {[
              ["torah", "Torah", "Genesis–Deuteronomy"],
              ["history", "History", "Joshua–Nehemiah"],
              ["wisdom", "Wisdom", "Job–Song"],
              ["prophets", "Prophets", "Isaiah–Malachi"],
              ["septuagint", "Septuagint", "Greek books"],
              ["new", "New Testament", "Matthew–Revelation"],
            ].map(([value, label, helper]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setSection(value as Section);
                  setPickerStep("book");
                }}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left"
              >
                <span className="block font-semibold">{label}</span>
                <span className="mt-1 block text-sm text-[var(--muted)]">
                  {helper}
                </span>
              </button>
            ))}
          </div>
        )}

        {pickerStep === "book" && (
          <div className="grid grid-cols-2 gap-3">
            {sectionBooks.map((item) => (
              <button
                key={item.book}
                type="button"
                onClick={() => {
                  setBook(item.book);
                  setChapter(1);
                  setPickerStep("chapter");
                }}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left"
              >
                <span className="block font-semibold">{item.book}</span>
                <span className="mt-1 block text-sm text-[var(--muted)]">
                  {item.chapters} chapters
                </span>
              </button>
            ))}
          </div>
        )}

        {pickerStep === "chapter" && (
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: selectedBook?.chapters || 1 }).map(
              (_, index) => {
                const chapterNumber = index + 1;

                return (
                  <button
                    key={chapterNumber}
                    type="button"
                    onClick={() => {
                      router.push(
                        `/read/${encodeURIComponent(
                          book
                        )}/${chapterNumber}?translation=${translation}`
                      );
                    }}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] py-3 text-sm font-semibold text-[var(--foreground)]"
                  >
                    {chapterNumber}
                  </button>
                );
              }
            )}
          </div>
        )}
      </div>
    </section>

    <MobileBottomNav />
  </main>
);
}