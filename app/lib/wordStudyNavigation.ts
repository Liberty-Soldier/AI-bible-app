export const WORD_STUDY_NAVIGATION_KEY = "emetsees-word-study-navigation-v1";

export type PreservedWordStudyState = {
  identity: string;
  view: "occurrences";
  selectedBook: string | null;
  selectedRendering: string | null;
  visibleOccurrenceCount: number;
  scrollTop: number;
  context: {
    entityId?: string;
    word: string;
    book: string;
    chapter: number;
    verse?: number;
    translation: string;
    selectedText?: string;
    originalWord?: string;
    verseText?: string;
    sourceOccurrenceId?: string;
    sourceLexicalId?: string;
    sourceCorpus?: "hebrew" | "greek-nt" | "lxx";
    sourceResolutionAuthority?: string;
    sourceResolutionMethod?: string;
  };
};

export function wordStudyRestoreReturnTo(returnTo: string) {
  const [pathname, query = ""] = returnTo.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("restoreWordStudy", "1");
  return `${pathname}?${params.toString()}`;
}
