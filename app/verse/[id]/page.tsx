import Link from "next/link";
import { notFound } from "next/navigation";
import ScriptureText from "../../components/ScriptureText";
import SacredNameToggle from "../../components/SacredNameToggle";
import AppNav from "@/app/components/AppNav";
import {
  normalizeReaderChapter,
  type ReaderVerse,
} from "@/app/data/scripture/ReaderVerseAdapter";

type Translation = "web" | "kjv" | "brenton";

function safeBook(book: string) {
  return String(book || "")
    .replace(/[^1-3A-Za-z ]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

function parseReference(reference: string) {
  const match = reference.match(/^(.+?)\s+(\d+):([0-9A-Za-z]+)$/);

  if (!match) return null;

  return {
    book: match[1],
    chapter: Number(match[2]),
    verseLabel: match[3],
  };
}

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

async function loadChapter(
  translation: Translation,
  book: string,
  chapter: number
): Promise<ReaderVerse[]> {
  const url = `${getBaseUrl()}/scripture/runtime/${translation}/${safeBook(
    book
  )}/${chapter}.json`;

  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) return [];
    return normalizeReaderChapter(await response.json()).verses;
  } catch {
    return [];
  }
}

function getLabel(translation: Translation) {
  if (translation === "kjv") return "King James Version";
  if (translation === "brenton") return "Brenton Septuagint";
  return "World English Bible";
}

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
  const parsed = parseReference(decodedId);

  if (!parsed) notFound();

  const translations: Translation[] = ["web", "kjv", "brenton"];

  const chapterData = await Promise.all(
    translations.map(async (translation) => ({
      translation,
      verses: await loadChapter(translation, parsed.book, parsed.chapter),
    }))
  );

  const verseSources = chapterData
    .map(({ translation, verses }) => {
      const verse = verses.find(
        (item) => (item.verseLabel || String(item.verse)) === parsed.verseLabel,
      );
      if (!verse) return null;

      return {
        label: getLabel(translation),
        sourceName: verse.sources?.[0]?.sourceName || getLabel(translation),
        tradition: translation === "brenton" ? "Septuagint" : "Translation",
        text: verse.sources?.[0]?.text || "",
        isOriginalLanguage: false,
      };
    })
    .filter(Boolean);

  if (!verseSources.length) {
    notFound();
  }

  const backHref = q ? `/?q=${encodeURIComponent(q)}` : "/";

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-8 text-white">
      <section className="mx-auto max-w-4xl">
        <AppNav />

        <form action="/" className="mb-8">
          <input
            name="q"
            defaultValue={q || ""}
            type="text"
            placeholder="Search Scripture..."
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 p-4 text-white"
          />
        </form>

        <div className="mb-6">
          <SacredNameToggle />
        </div>

        <Link
          href={backHref}
          className="mb-6 inline-block text-neutral-400 hover:text-white"
        >
          ← Back to Results
        </Link>

        <h1 className="mb-8 text-4xl font-bold">{decodedId}</h1>

        <div className="space-y-4">
          {verseSources.map((source, index) => (
            <div
              key={`${decodedId}-${source?.label}-${index}`}
              className="rounded-xl border border-neutral-800 bg-neutral-900 p-6"
            >
              <div className="mb-4">
                <p className="mb-2 text-sm uppercase tracking-wide text-neutral-500">
                  {source?.label}
                </p>

                <p className="text-xs text-neutral-500">
                  {source?.sourceName}
                </p>
              </div>

              <p className="leading-relaxed text-neutral-200">
                <ScriptureText text={source?.text || ""} />
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="mb-4 text-xl font-bold">Evidence & Analysis</h2>

          <p className="text-neutral-400">
            Cross references, manuscript comparison, Hebrew and Greek word
            studies, and source-first AI analysis will appear here.
          </p>
        </div>
      </section>
    </main>
  );
}