"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import WordStudySheet from "@/app/components/WordStudySheet";
import { WORD_STUDY_NAVIGATION_KEY, type PreservedWordStudyState } from "@/app/lib/wordStudyNavigation";

export default function RestoredWordStudyNavigation({ active }: { active: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(active);
  const saved = useMemo(() => {
    if (!active || typeof window === "undefined") return null;
    try {
      return JSON.parse(sessionStorage.getItem(WORD_STUDY_NAVIGATION_KEY) || "null") as PreservedWordStudyState | null;
    } catch {
      return null;
    }
  }, [active]);
  if (!open || !saved?.context.word) return null;
  return <WordStudySheet {...saved.context} onClose={() => {
    setOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("restoreWordStudy");
    router.replace(`${url.pathname}${url.search}`);
  }} />;
}
