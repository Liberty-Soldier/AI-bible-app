import { approvedConceptSeeds } from "./approvedConceptSeeds";

export type SourceConcept = {
  id: string;
  label: string;
  aliases: string[];
  hebrewLemmas: string[];
  greekLemmas: string[];
};

export const sourceConcepts: SourceConcept[] = approvedConceptSeeds;