import "server-only";

import type { EmetAiQuestionContract } from "../EmetAiQuestionContract";
import { expandPlannedReferences } from "../EmetAiTopicEvidence";
import type { EmetAiFastDiscoveryDraft } from "./EmetAiFastDiscovery";
import {
  retrieveLockedScriptureReferences,
  retrieveLockedMessiahTopicTestimony,
  type FastScriptureLexicalTerm,
  type FastScripturePassage,
} from "./EmetAiFastScriptureRetrieval";

export type EmetAiEvidenceOrigin = "explicit" | "deterministic" | "discovery" | "context";
export type EmetAiEvidenceDisposition = "retained" | "rejected" | "excluded";

export type EmetAiEvidenceManifestEntry = {
  reference: string;
  origins: EmetAiEvidenceOrigin[];
  priority: number;
  disposition: EmetAiEvidenceDisposition;
  reason: string;
};

export type EmetAiAssembledEvidence = {
  passages: FastScripturePassage[];
  lexicalTerms: FastScriptureLexicalTerm[];
  manifest: EmetAiEvidenceManifestEntry[];
  errors: string[];
  retrievalMs: number;
};

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

/**
 * The single evidence authority for both fast paths. Discovery may expand the
 * locked deterministic foundation, but cannot replace it or certify coverage.
 */
export function assembleFastTwoPathEvidence({
  contract,
  initialPassages,
  initialLexicalTerms,
  discovery = null,
  deterministicLexicalLookups = [],
  passageBudget = 64,
}: {
  contract: EmetAiQuestionContract;
  initialPassages: FastScripturePassage[];
  initialLexicalTerms: FastScriptureLexicalTerm[];
  discovery?: EmetAiFastDiscoveryDraft | null;
  deterministicLexicalLookups?: Array<{
    reference: string;
    corpus: "hebrew" | "greek-nt" | "lxx";
    lookup: string;
    mode?: "term" | "verse-sequence";
  }>;
  passageBudget?: number;
}): EmetAiAssembledEvidence {
  const startedAt = performance.now();
  const manifest: EmetAiEvidenceManifestEntry[] = [];
  const errors: string[] = [];
  const explicitReferences = unique(contract.explicitReferences.flatMap(expandPlannedReferences));
  const requestedChapters = contract.requestedCoverage.passages
    .filter((passage) => passage.startVerse === undefined)
    .map((passage) => `${passage.book} ${passage.chapter}`);
  const chapterAnchors = initialPassages.filter((passage) =>
    requestedChapters.some((chapter) => passage.reference.startsWith(`${chapter}:`))
  );
  const chapterContextReferences = unique(chapterAnchors.flatMap((passage) => {
    const match = passage.reference.match(/^(.+\s+\d+):(\d+)$/);
    if (!match) return [];
    const verse = Number(match[2]);
    return Array.from({ length: 5 }, (_, offset) => verse + offset - 2)
      .filter((candidate) => candidate > 0)
      .map((candidate) => `${match[1]}:${candidate}`);
  }));
  const applicabilitySubjectTerms = contract.commandApplicability
    ? unique([
        ...contract.biblicalEntities
          .filter((entity) => !/^(?:Messiah|Christian|believer|follower)$/i.test(entity))
          .flatMap((entity) => entity.toLocaleLowerCase("en-US").match(/[a-z0-9]+/g) || []),
        ...(contract.question.toLocaleLowerCase("en-US").match(/[a-z0-9]+/g) || [])
          .filter((term) => term.length > 4 && !/^(?:modern|christian|supposed|observe|should|followers|messiah)$/.test(term)),
      ])
    : [];
  const subjectRelevantInitial = applicabilitySubjectTerms.length
    ? initialPassages.filter((passage) => {
        const text = passage.text.toLocaleLowerCase("en-US");
        return applicabilitySubjectTerms.some((term) => text.includes(term));
      })
    : initialPassages;
  const initialCore = subjectRelevantInitial.slice(0, 6);
  const needsCrossTestament = contract.commandApplicability &&
    /\b(?:messiah|christians?|believers?|followers?|new testament|new covenant)\b/i.test(contract.question);
  const firstNt = needsCrossTestament
    ? subjectRelevantInitial.find((passage) => /^(?:Matthew|Mark|Luke|John|Acts|Romans|[12] Corinthians|Galatians|Ephesians|Philippians|Colossians|[12] Thessalonians|[12] Timothy|Titus|Philemon|Hebrews|James|[12] Peter|[123] John|Jude|Revelation)\b/.test(passage.reference))
    : undefined;
  const messiahTopicTestimony = needsCrossTestament
    ? retrieveLockedMessiahTopicTestimony({
        topicTerms: contract.biblicalEntities.filter((entity) => entity !== "Messiah"),
        limit: 3,
      })
    : [];
  const selectedInitial = discovery
    ? Array.from(new Map([
        ...initialCore,
        ...(contract.commandApplicability ? initialPassages : []),
        ...chapterAnchors,
        ...messiahTopicTestimony,
        ...(firstNt ? [firstNt] : []),
      ].map((passage) => [passage.reference, passage])).values())
    : initialPassages;
  const initialByReference = new Map(selectedInitial.map((passage) => [passage.reference, passage]));

  const discovered = (discovery?.references || []).flatMap((item) => {
    if (
      contract.commandApplicability &&
      (
        /(?:\bwithout\b.{0,40}\b(?:including|listing|naming)\b|\bnot\s+(?:among|included|listed|named)\b|\bdoes not\s+(?:include|list|name)\b|\bno\b.{0,50}\b(?:requirement|instruction|obligation)\b|\b(?:not|without|omit(?:s|ted)?|absence)\b.{0,80}\b(?:requirement|command|instruction|obligation|sabbath)\b)/i.test(item.relevance) ||
        (/(?:\b(?:lists?|listed|specified)\b.{0,80}\b(?:requirements?|abstentions?|obligations?|instructions?)\b|\b(?:written\s+decision|items?\s+named)\b)/i.test(item.relevance) &&
          applicabilitySubjectTerms.length > 0 &&
          !applicabilitySubjectTerms.some((term) => item.relevance.toLocaleLowerCase("en-US").includes(term)))
      )
    ) {
      manifest.push({
        reference: item.reference,
        origins: ["discovery"],
        priority: 3,
        disposition: "rejected",
        reason: "Discovery relevance relied on omission from a later list.",
      });
      return [];
    }
    const expanded = expandPlannedReferences(item.reference);
    if (!expanded.length) {
      manifest.push({
        reference: item.reference,
        origins: ["discovery"],
        priority: 3,
        disposition: "rejected",
        reason: "The discovered reference did not match the canonical Scripture-reference grammar.",
      });
      return [];
    }
    return expanded.map((reference) => ({ reference, required: item.required, relevance: item.relevance }));
  });

  const baseReferences = unique([
    ...explicitReferences,
    ...chapterContextReferences,
    ...selectedInitial.map((passage) => passage.reference),
    ...discovered.map((item) => item.reference),
  ]);
  const lexicalLookups = deterministicLexicalLookups.length
    ? deterministicLexicalLookups
    : discovery?.lexicalLookups || [];
  const locked = retrieveLockedScriptureReferences({
    references: baseReferences,
    lexicalLookups,
    includeContext: false,
  });
  const contextLocked = retrieveLockedScriptureReferences({
    references: unique([...explicitReferences, ...chapterContextReferences, ...discovered.map((item) => item.reference)]),
    includeContext: true,
  });
  const lockedByReference = new Map(locked.passages.map((passage) => [passage.reference, passage]));

  for (const reference of explicitReferences) {
    if (!lockedByReference.has(reference)) {
      errors.push(`Explicitly requested reference ${reference} is absent from locked Scripture.`);
      manifest.push({ reference, origins: ["explicit"], priority: 1, disposition: "rejected", reason: "Absent from locked Scripture." });
    }
  }
  for (const item of discovered) {
    if (lockedByReference.has(item.reference)) continue;
    manifest.push({
      reference: item.reference,
      origins: ["discovery"],
      priority: 3,
      disposition: "rejected",
      reason: "Absent from locked Scripture.",
    });
  }
  for (const lookup of locked.unresolvedLexicalLookups) {
    if (deterministicLexicalLookups.length || contract.requestedLanguages.length) {
      errors.push(`Required lexical lookup ${lookup.corpus}:${lookup.lookup} at ${lookup.reference} is unverified.`);
    }
  }

  const baseEntries = baseReferences.flatMap((reference) => {
    const passage = lockedByReference.get(reference) || initialByReference.get(reference);
    if (!passage) return [];
    const origins: EmetAiEvidenceOrigin[] = [];
    if (explicitReferences.includes(reference)) origins.push("explicit");
    if (chapterContextReferences.includes(reference)) origins.push("explicit");
    if (initialByReference.has(reference)) origins.push("deterministic");
    if (discovered.some((item) => item.reference === reference)) origins.push("discovery");
    const requiredDiscovery = discovered.some((item) => item.reference === reference && item.required);
    const priority = origins.includes("explicit") ? 1 : origins.includes("deterministic") || requiredDiscovery ? 2 : 3;
    return [{ passage, origins, priority }];
  });
  const baseSet = new Set(baseEntries.map((entry) => entry.passage.reference));
  const contextEntries = contextLocked.passages
    .filter((passage) => !baseSet.has(passage.reference))
    .map((passage) => ({ passage, origins: ["context"] as EmetAiEvidenceOrigin[], priority: 5 }));
  const ordered = [...baseEntries, ...contextEntries]
    .sort((left, right) => left.priority - right.priority);

  const requiredEntries = baseEntries.filter((entry) => entry.priority === 1);
  if (requiredEntries.length > passageBudget) {
    errors.push(`The ${passageBudget}-passage evidence budget cannot preserve every material base reference.`);
  }
  const retained: typeof ordered = [];
  for (const priority of [1, 2, 3, 5]) {
    const entries = ordered.filter((entry) => entry.priority === priority);
    const byChapter = new Map<string, typeof entries>();
    for (const entry of entries) {
      const chapter = entry.passage.reference.replace(/:\d+$/, "");
      byChapter.set(chapter, [...(byChapter.get(chapter) || []), entry]);
    }
    const groups = Array.from(byChapter.values());
    for (let verseIndex = 0; retained.length < passageBudget; verseIndex += 1) {
      let added = false;
      for (const group of groups) {
        const entry = group[verseIndex];
        if (!entry || retained.includes(entry)) continue;
        retained.push(entry);
        added = true;
        if (retained.length >= passageBudget) break;
      }
      if (!added) break;
    }
  }
  for (const entry of ordered) {
    const kept = retained.includes(entry);
    manifest.push({
      reference: entry.passage.reference,
      origins: entry.origins,
      priority: entry.priority,
      disposition: kept ? "retained" : "excluded",
      reason: kept ? "Verified and retained in the final evidence packet." : "Excluded only after all higher-priority material evidence was retained.",
    });
  }

  const lexicalTerms = lexicalLookups.length ? locked.lexicalTerms : initialLexicalTerms;
  const retainedPassages = retained.map((entry) => entry.passage);
  if (
    contract.commandApplicability &&
    /\b(?:messiah|christians?|believers?|followers?|new testament|new covenant)\b/i.test(contract.question)
  ) {
    const hasNt = retainedPassages.some((passage) => /^(?:Matthew|Mark|Luke|John|Acts|Romans|[12] Corinthians|Galatians|Ephesians|Philippians|Colossians|[12] Thessalonians|[12] Timothy|Titus|Philemon|Hebrews|James|[12] Peter|[123] John|Jude|Revelation)\b/.test(passage.reference));
    const hasOt = retainedPassages.some((passage) => !/^(?:Matthew|Mark|Luke|John|Acts|Romans|[12] Corinthians|Galatians|Ephesians|Philippians|Colossians|[12] Thessalonians|[12] Timothy|Titus|Philemon|Hebrews|James|[12] Peter|[123] John|Jude|Revelation)\b/.test(passage.reference));
    if (!hasOt || !hasNt) {
      errors.push("The verified evidence does not yet contain both the earlier Scriptural foundation and relevant later testimony required by this applicability question.");
    }
  }
  return {
    passages: retainedPassages,
    lexicalTerms,
    manifest,
    errors,
    retrievalMs: Math.round((performance.now() - startedAt) * 100) / 100,
  };
}
