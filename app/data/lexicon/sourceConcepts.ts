export type SourceConcept = {
  id: string;
  label: string;
  aliases: string[];
  hebrewLemmas: string[];
  greekLemmas: string[];
};

export const sourceConcepts: SourceConcept[] = [
  {
    id: "torah",
    label: "Torah",
    aliases: [
      "torah",
      "law",
      "instruction",
      "teaching",
      "law of god",
      "law of yahweh",
    ],
    hebrewLemmas: ["8451"],
    greekLemmas: [],
  },

  {
    id: "yahweh",
    label: "Yahweh",
    aliases: [
      "yahweh",
      "lord",
      "yhwh",
      "tetragrammaton",
    ],
    hebrewLemmas: ["3068"],
    greekLemmas: [],
  },

  {
    id: "elohim",
    label: "Elohim",
    aliases: [
      "elohim",
      "god",
      "mighty one",
    ],
    hebrewLemmas: ["430"],
    greekLemmas: [],
  },
  {
  id: "sin",
  label: "Sin",
  aliases: [
    "sin",
    "sins",
    "what is sin",
    "transgression",
    "iniquity",
    "lawlessness",
  ],
  hebrewLemmas: ["2403", "6588", "5771"],
  greekLemmas: ["G266", "G458"],
},
];