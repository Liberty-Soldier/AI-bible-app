import fs from "fs";
import path from "path";
import Link from "next/link";
import { allScripture } from "../../data/scripture/allScripture";
import ScriptureText from "../../components/ScriptureText";
import SacredNameToggle from "../../components/SacredNameToggle";
import { notFound } from "next/navigation";
import AppNav from "@/app/components/AppNav";

type SourceVerse = {
  reference: string;
  sources: {
    label: string;
    sourceName: string;
    tradition: string;
    text: string;
  }[];
};

function getKJVVerses(): SourceVerse[] {
  const filePath = path.join(
    process.cwd(),
    "app",
    "data",
    "scripture",
    "generatedKJV.json"
  );

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getGNTVerses(): SourceVerse[] {
  const filePath = path.join(
    process.cwd(),
    "app",
    "data",
    "scripture",
    "generatedGNT.json"
  );

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getLXXVerses(): SourceVerse[] {
  const filePath = path.join(
    process.cwd(),
    "app",
    "data",
    "scripture",
    "generatedLXX.json"
  );

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

type HebrewVerse = {
  book: string;
  chapter: number;
  verse: number;
  text: string;
};

function getHebrewVerses(): HebrewVerse[] {
  const filePath = path.join(
    process.cwd(),
    "app",
    "data",
    "scripture",
    "generatedHebrew.json"
  );

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const hebrewBookMap: Record<string, string> = {
  Genesis: "Gen",
  Exodus: "Exod",
  Leviticus: "Lev",
  Numbers: "Num",
  Deuteronomy: "Deut",
  Joshua: "Josh",
  Judges: "Judg",
  Ruth: "Ruth",
  "1 Samuel": "1Sam",
  "2 Samuel": "2Sam",
  "1 Kings": "1Kgs",
  "2 Kings": "2Kgs",
  "1 Chronicles": "1Chr",
  "2 Chronicles": "2Chr",
  Ezra: "Ezra",
  Nehemiah: "Neh",
  Esther: "Esth",
  Job: "Job",
  Psalms: "Ps",
  Psalm: "Ps",
  Proverbs: "Prov",
  Ecclesiastes: "Eccl",
  "Song of Solomon": "Song",
  Isaiah: "Isa",
  Jeremiah: "Jer",
  Lamentations: "Lam",
  Ezekiel: "Ezek",
  Daniel: "Dan",
  Hosea: "Hos",
  Joel: "Joel",
  Amos: "Amos",
  Obadiah: "Obad",
  Jonah: "Jonah",
  Micah: "Mic",
  Nahum: "Nah",
  Habakkuk: "Hab",
  Zephaniah: "Zeph",
  Haggai: "Hag",
  Zechariah: "Zech",
  Malachi: "Mal",
};

export default async function VersePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;

 const decodedId = decodeURIComponent(id);

const verse = allScripture.find(
  (v) => v.id === decodedId || v.reference === decodedId
);

  if (!verse) {
    notFound();
  }

  const generatedHebrew = getHebrewVerses();
  const generatedGNT = getGNTVerses();
  const generatedLXX = getLXXVerses();
  const generatedKJV = getKJVVerses();
  const hebrewBook = hebrewBookMap[verse.book];

  const hebrewVerse = generatedHebrew.find(
    (v) =>
      v.book === hebrewBook &&
      v.chapter === verse.chapter &&
      v.verse === verse.verse
  );

  const gntVerse = generatedGNT.find(
  (v) => v.reference === verse.reference
);

  const lxxVerse = generatedLXX.find(
    (v) => v.reference === verse.reference
  );

  const kjvVerse = generatedKJV.find(
    (v) => v.reference === verse.reference
  );

  const hebrewSource = hebrewVerse
    ? [
        {
          label: "Hebrew WLC",
          sourceName:
            "Open Scriptures Hebrew Bible / Westminster Leningrad Codex",
          tradition: "Hebrew",
          text: hebrewVerse.text,
          isOriginalLanguage: true,
        },
      ]
    : [];

  const sources = [
  ...hebrewSource,
  ...(lxxVerse
    ? lxxVerse.sources.map((source) => ({
        ...source,
        isOriginalLanguage: true,
      }))
    : []),
  ...(gntVerse
    ? gntVerse.sources.map((source) => ({
        ...source,
        isOriginalLanguage: true,
      }))
    : []),
  ...verse.sources.map((source) => ({
    ...source,
    isOriginalLanguage: false,
  })),
  ...(kjvVerse
    ? kjvVerse.sources.map((source) => ({
        ...source,
        isOriginalLanguage: false,
      }))
    : []),
];

  const backHref = q ? `/?q=${encodeURIComponent(q)}` : "/";

  return (
    <main className="min-h-screen bg-neutral-950 text-white px-6 py-8">
      <section className="mx-auto max-w-4xl">
        <AppNav />

        <form action="/" className="mb-8">
          <input
            name="q"
            defaultValue={q || ""}
            type="text"
            placeholder="Search Scripture..."
            className="w-full rounded-lg bg-neutral-900 border border-neutral-700 p-4 text-white"
          />
        </form>

        <div className="mb-6">
          <SacredNameToggle />
        </div>

        <Link
          href={backHref}
          className="inline-block mb-6 text-neutral-400 hover:text-white"
        >
          ← Back to Results
        </Link>

        <h1 className="text-4xl font-bold mb-8">
          {verse.reference}
        </h1>

        <div className="space-y-4">
          {sources.map((source, index) => (
            <div
              key={`${verse.id}-${source.tradition}-${source.sourceName}-${index}`}
              className="rounded-xl border border-neutral-800 bg-neutral-900 p-6"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-wide text-neutral-500 mb-2">
                    {source.label}
                  </p>

                  <p className="text-xs text-neutral-500">
                    {source.sourceName}
                  </p>
                </div>

                {source.isOriginalLanguage && (
                  <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-400">
                    Source Text
                  </span>
                )}
              </div>

              <p
                dir={source.tradition === "Hebrew" ? "rtl" : "ltr"}
                className={`leading-relaxed text-neutral-200 ${
                  source.tradition === "Hebrew"
                    ? "text-right text-3xl"
                    : source.isOriginalLanguage
                    ? "text-xl"
                    : ""
                }`}
              >
                {source.isOriginalLanguage ? (
                  source.text
                ) : (
                  <ScriptureText text={source.text} />
                )}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="text-xl font-bold mb-4">
            Evidence & Analysis
          </h2>

          <p className="text-neutral-400">
            Cross references, manuscript comparison, Hebrew and Greek
            word studies, and source-first AI analysis will appear here.
          </p>
        </div>
      </section>
    </main>
  );
}