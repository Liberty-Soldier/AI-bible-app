import type { BibleIQEntity } from "./BibleIQTypes";

export const bibleIQEntitySeed: Record<string, BibleIQEntity> = {
  "person:abel": {
    id: "person:abel",
    type: "person",
    title: "Abel",
    subtitle: "Son of Adam and Eve",

    simple: {
      meaning: "Breath / vapor",
      inThisVerse:
        "Abel is introduced as Cainâ€™s brother and as a keeper of sheep.",
      whyItMatters:
        "Abel becomes one of Scriptureâ€™s earliest examples of faithful worship and righteous blood being shed.",
      summary:
        "Abel was the second son of Adam and Eve. His offering was accepted, and Cain killed him in jealousy.",
    },

    evidence: {
      originalLanguage: {
        source: "hebrew",
        word: "×”Ö¶×‘Ö¶×œ",
        transliteration: "Hevel",
        strong: "H1893",
        lemmaId: "hebrew:H1893",
      },

      firstMention: "Genesis 4:2",

      keyReferences: ["Genesis 4:2-10", "Matthew 23:35", "Hebrews 11:4"],

      related: {
        people: ["Adam", "Eve", "Cain"],
        places: [],
        concepts: ["Offering", "Righteousness", "Blood", "Judgment"],
        events: ["Cain kills Abel"],
      },

      occurrences: [
        {
          reference: "Genesis 4:2",
          book: "Genesis",
          chapter: 4,
          verse: 2,
          englishText:
            "And she again bare his brother Abel. And Abel was a keeper of sheep, but Cain was a tiller of the ground.",
          sourceWord: "×”Ö¶×‘Ö¶×œ",
          source: "hebrew",
          routeTranslation: "web",
        },
        {
          reference: "Genesis 4:4",
          book: "Genesis",
          chapter: 4,
          verse: 4,
          englishText:
            "And Abel, he also brought of the firstlings of his flock and of the fat thereof. And Yahweh had respect unto Abel and to his offering.",
          sourceWord: "×”Ö¶×‘Ö¶×œ",
          source: "hebrew",
          routeTranslation: "web",
        },
        {
          reference: "Genesis 4:8",
          book: "Genesis",
          chapter: 4,
          verse: 8,
          englishText:
            "And Cain talked with Abel his brother: and it came to pass, when they were in the field, that Cain rose up against Abel his brother, and slew him.",
          sourceWord: "×”Ö¶×‘Ö¶×œ",
          source: "hebrew",
          routeTranslation: "web",
        },
      ],
    },
  },

  "person:cain": {
    id: "person:cain",
    type: "person",
    title: "Cain",
    subtitle: "Son of Adam and Eve",

    simple: {
      meaning: "Acquired / possession",
      inThisVerse:
        "Cain is presented as Abelâ€™s brother and as a tiller of the ground.",
      whyItMatters:
        "Cain shows the danger of jealousy, sin ruling over a person, and violence against the righteous.",
      summary:
        "Cain was the first son of Adam and Eve. He killed his brother Abel after Yahweh accepted Abelâ€™s offering.",
    },

    evidence: {
      originalLanguage: {
        source: "hebrew",
        word: "×§Ö·×™Ö´×Ÿ",
        transliteration: "Qayin",
        strong: "H7014",
        lemmaId: "hebrew:H7014",
      },

      firstMention: "Genesis 4:1",

      keyReferences: ["Genesis 4:1-16", "Hebrews 11:4", "1 John 3:12", "Jude 1:11"],

      related: {
        people: ["Adam", "Eve", "Abel"],
        places: ["Nod"],
        concepts: ["Sin", "Jealousy", "Murder", "Judgment"],
        events: ["Cain kills Abel"],
      },

      occurrences: [
        {
          reference: "Genesis 4:1",
          book: "Genesis",
          chapter: 4,
          verse: 1,
          englishText:
            "And Adam knew Eve his wife; and she conceived, and bare Cain, and said, I have gotten a man from Yahweh.",
          sourceWord: "×§Ö·×™Ö´×Ÿ",
          source: "hebrew",
          routeTranslation: "web",
        },
        {
          reference: "Genesis 4:2",
          book: "Genesis",
          chapter: 4,
          verse: 2,
          englishText:
            "And she again bare his brother Abel. And Abel was a keeper of sheep, but Cain was a tiller of the ground.",
          sourceWord: "×§Ö·×™Ö´×Ÿ",
          source: "hebrew",
          routeTranslation: "web",
        },
        {
          reference: "Genesis 4:8",
          book: "Genesis",
          chapter: 4,
          verse: 8,
          englishText:
            "And Cain talked with Abel his brother: and it came to pass, when they were in the field, that Cain rose up against Abel his brother, and slew him.",
          sourceWord: "×§Ö·×™Ö´×Ÿ",
          source: "hebrew",
          routeTranslation: "web",
        },
      ],
    },
  },
};