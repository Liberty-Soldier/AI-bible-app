"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  buildReaderHref,
  getPreferredTranslation,
  type TranslationPreference,
} from "@/app/lib/translationPreference";

export default function BookPassageSelector({
  book,
  chapterCount,
  translation: suppliedTranslation,
  currentChapter,
}: {
  book: string;
  chapterCount: number;
  translation?: TranslationPreference;
  currentChapter?: number;
}) {
  const [translation, setTranslation] = useState(suppliedTranslation || "web");

  useEffect(() => {
    setTranslation(suppliedTranslation || getPreferredTranslation());
  }, [suppliedTranslation]);

  return (
    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8" aria-label={`${book} chapters`}>
      {Array.from({ length: chapterCount }, (_, index) => index + 1).map((chapter) => (
        <Link
          key={chapter}
          href={buildReaderHref({ book, chapter, translation })}
          prefetch={false}
          aria-label={`Read ${book} ${chapter}`}
          aria-current={chapter === currentChapter ? "page" : undefined}
          className={`grid min-h-11 place-items-center rounded-lg px-1 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] ${
            chapter === currentChapter
              ? "bg-[var(--surface-soft)] text-[var(--foreground)]"
              : "text-[var(--foreground)] hover:bg-[var(--surface)]"
          }`}
        >
          {chapter}
        </Link>
      ))}
    </div>
  );
}
