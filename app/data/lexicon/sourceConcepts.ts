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
  id: "covenant",
  label: "Covenant",
  aliases: ["covenant", "agreement", "promise"],
  hebrewLemmas: ["1285"],
  greekLemmas: ["G1242"],
},
{
  id: "kingdom",
  label: "Kingdom",
  aliases: ["kingdom", "reign", "rule", "kingdom of god", "kingdom of heaven"],
  hebrewLemmas: ["4467"],
  greekLemmas: ["G0932"],
},
];