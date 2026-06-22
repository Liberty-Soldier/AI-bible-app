import { findConcept } from "@/app/data/lexicon/findConcept";
import { findHebrewLemma } from "@/app/data/lexicon/searchHebrewLemma";
import { findGreekNTLemma } from "@/app/data/lexicon/searchGreekNTLemma";

export function getConceptEvidence(query: string) {
  const concept = findConcept(query);

  if (!concept) return null;

  const hebrewEvidence = concept.hebrewLemmas
    .map((lemma: string) => findHebrewLemma(lemma))
    .filter(Boolean);

  const greekEvidence = concept.greekLemmas
    .map((lemma: string) => findGreekNTLemma(lemma))
    .filter(Boolean);

  return {
    concept,
    hebrewEvidence,
    greekEvidence,
  };
}