import { getConceptEvidence } from "@/app/data/lexicon/getConceptEvidence";

export default function TestConceptPage() {
  const evidence = getConceptEvidence("what is torah");

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <pre>{JSON.stringify(evidence, null, 2)}</pre>
    </main>
  );
}