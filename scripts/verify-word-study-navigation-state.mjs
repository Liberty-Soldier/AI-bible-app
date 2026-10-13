import fs from "node:fs";
const source = fs.readFileSync("app/components/WordStudySheet.tsx", "utf8");
const restored = fs.readFileSync("app/components/RestoredWordStudyNavigation.tsx", "utf8");
const reader = fs.readFileSync("app/read/[book]/[chapter]/page.tsx", "utf8");
for (const marker of ["WORD_STUDY_NAVIGATION_KEY", "selectedBook", "selectedRendering", "visibleOccurrenceCount", "scrollTop", "onOpenOccurrence={preserveOccurrenceState}"]) {
  if (!source.includes(marker)) throw new Error(`Missing occurrence-navigation state marker: ${marker}`);
}
if (!source.includes("data?.entity?.id || entityId || sourceLexicalId")) {
  throw new Error("Occurrence state is not bound to the verified source-word identity.");
}
if (!source.includes("wordStudyRestoreReturnTo(readingReturnTo)")) throw new Error("Occurrence return URL lacks restoration marker.");
if (!restored.includes("<WordStudySheet {...saved.context}")) throw new Error("Saved source-word context is not restored.");
if (!reader.includes('<RestoredWordStudyNavigation active={restoreWordStudy === "1"}')) throw new Error("Reader does not restore the Word Study sheet on Back.");
console.log("Word Study occurrence navigation-state verification passed.");
