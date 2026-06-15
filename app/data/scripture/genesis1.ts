import type { Verse } from "../types";

export const genesis1: Verse[] = [
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
    sourceName: "King James Version",
    language: "english",
    text: "In the beginning God created the heaven and the earth.",
  },
],
  },

  {
    id: "gen-1-2",
    reference: "Genesis 1:2",
    book: "Genesis",
    chapter: 1,
    verse: 2,
    sources: [
      {
        tradition: "septuagint",
        label: "Septuagint",
        sourceName: "Brenton Septuagint",
        language: "english",
        text: "But the earth was unsightly and unfurnished, and darkness was over the deep, and the Spirit of God moved over the water.",
      },
      {
  tradition: "masoretic",
  label: "Masoretic / KJV",
  sourceName: "King James Version",
  language: "english",
  text: "And the earth was without form, and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters.",
},
    ],
  },

  {
    id: "gen-1-3",
    reference: "Genesis 1:3",
    book: "Genesis",
    chapter: 1,
    verse: 3,
    sources: [
      {
        tradition: "septuagint",
        label: "Septuagint",
        sourceName: "Brenton Septuagint",
        language: "english",
        text: "And God said, Let there be light, and there was light.",
      },
      {
  tradition: "masoretic",
  label: "Masoretic / KJV",
  sourceName: "King James Version",
  language: "english",
  text: "And God said, Let there be light: and there was light.",
},
    ],
  },
];