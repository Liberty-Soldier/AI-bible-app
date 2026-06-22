import { sourceConcepts, type SourceConcept } from "./sourceConcepts";

export function findConcept(query: string): SourceConcept | null {
  const normalized = query.toLowerCase();

  return (
    sourceConcepts.find((concept) =>
      concept.aliases.some((alias) =>
        normalized.includes(alias.toLowerCase())
      )
    ) || null
  );
}