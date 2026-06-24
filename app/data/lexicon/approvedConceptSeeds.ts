export type ApprovedConceptSeed = {
  id: string;
  label: string;
  aliases: string[];
  hebrewLemmas: string[];
  greekLemmas: string[];
};

export const approvedConceptSeeds: ApprovedConceptSeed[] = [
  {
    id: "torah",
    label: "Torah / Law",
    aliases: ["torah", "law", "instruction", "teaching", "law of god", "law of yahweh"],
    hebrewLemmas: ["8451"],
    greekLemmas: ["G3551"],
  },
  {
    id: "sin",
    label: "Sin",
    aliases: ["sin", "sins", "what is sin", "transgression", "iniquity", "lawlessness"],
    hebrewLemmas: ["2398", "2403", "6588", "5771"],
    greekLemmas: ["G0266", "G0458"],
  },
  {
    id: "faith",
    label: "Faith / Faithfulness",
    aliases: ["faith", "believe", "trust", "faithfulness", "faithful"],
    hebrewLemmas: ["539", "530"],
    greekLemmas: ["G4102", "G4100", "G4103"],
  },
  {
    id: "love",
    label: "Love",
    aliases: ["love", "loved", "loving", "beloved"],
    hebrewLemmas: ["157", "160"],
    greekLemmas: ["G0025", "G0026", "G5368"],
  },
  {
    id: "righteousness",
    label: "Righteousness",
    aliases: ["righteous", "righteousness", "just", "justice"],
    hebrewLemmas: ["6662", "6664", "6666"],
    greekLemmas: ["G1342", "G1343", "G1344"],
  },
  {
    id: "holy",
    label: "Holy / Set Apart",
    aliases: ["holy", "holiness", "sanctify", "set apart"],
    hebrewLemmas: ["6942", "6944"],
    greekLemmas: ["G0037", "G0038", "G0040"],
  },
  {
    id: "spirit",
    label: "Spirit / Breath",
    aliases: ["spirit", "breath", "wind", "holy spirit"],
    hebrewLemmas: ["7307"],
    greekLemmas: ["G4151"],
  },
  {
    id: "sabbath",
    label: "Sabbath",
    aliases: ["sabbath", "sabbaths", "seventh day"],
    hebrewLemmas: ["7676", "7673"],
    greekLemmas: ["G4521"],
  },
];