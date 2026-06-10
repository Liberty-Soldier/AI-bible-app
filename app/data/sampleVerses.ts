import type { Verse } from "./types";

export const sampleVerses: Verse[] = [
  {
    id: "gen-1-1",
    reference: "Genesis 1:1",
    book: "Genesis",
    chapter: 1,
    verse: 1,
    sources: [
      {
        tradition: "septuagint",
        label: "Septuagint",
        sourceName: "Brenton Septuagint",
        language: "english",
        text: "In the beginning God made the heaven and the earth.",
      },
      {
        tradition: "masoretic",
        label: "Masoretic / KJV",
        sourceName: "KJV",
        language: "english",
        text: "In the beginning God created the heaven and the earth.",
      },
      {
        tradition: "dead-sea-scrolls",
        label: "Dead Sea Scrolls",
        sourceName: "DSS Notes",
        language: "hebrew",
        text: "",
        notes: ["Placeholder for manuscript witness notes."],
      },
    ],
  },
];