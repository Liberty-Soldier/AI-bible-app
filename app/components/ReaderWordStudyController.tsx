"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import WordStudySheet from "@/app/components/WordStudySheet";

export default function ReaderWordStudyController({
  book,
  chapter,
  translation,
}: {
  book: string;
  chapter: number;
  translation: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedWord = searchParams.get("word");

  function closeWordStudy() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("word");

    const query = params.toString();

    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  return (
    <WordStudySheet
      word={selectedWord}
      book={book}
      chapter={chapter}
      translation={translation}
      onClose={closeWordStudy}
    />
  );
}