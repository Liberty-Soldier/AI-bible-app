import {
  findCanonicalHit,
  type CanonicalCompoundRoute,
} from "@/app/data/scripture/CanonicalVerseStore";
import { toEvidenceBook } from "@/app/data/evidence/evidenceBookMap";
import {
  loadWordStudyEntity,
  normalizeWordEntityId,
  type WordStudyRuntimeEntity,
  type WordStudyRuntimeReference,
} from "./WordStudyEntityStore";
import {
  loadFinalEmetRecord,
  type FinalEmetRuntimeRecord,
} from "./EmetFinalStore";
import type {
  BibleIQEntity,
  BibleIQEntityEvidence,
  BibleIQKnowledgeExample,
  BibleIQMeaningInVerse,
  BibleIQOccurrence,
  BibleIQReference,
  BibleIQRequest,
  BibleIQResponse,
  BibleIQSeeEvidence,
  BibleIQSeeKnowledge,
  BibleIQSource,
  BibleIQSourceAlignment,
  BibleIQTranslation,
  BibleIQV2SourceRoute,
} from "./BibleIQTypes";

const NEW_TESTAMENT_BOOKS = new Set([
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "3 John",
  "1 John",
  "2 John",
  "Jude",
  "Revelation",
]);

function normalize(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

function normalizedBookKey(book: string) {
  const key = String(book || "")
    .replace(/[^0-9A-Za-z]+/g, "")
    .toLowerCase();

  if (key === "songofsongs" || key === "songofsolomon") {
    return "song";
  }

  return key;
}

function booksEquivalent(left: string, right: string) {
  const leftEvidence = toEvidenceBook(left);
  const rightEvidence = toEvidenceBook(right);

  return (
    normalizedBookKey(leftEvidence) ===
      normalizedBookKey(rightEvidence) ||
    normalizedBookKey(left) === normalizedBookKey(right)
  );
}

function determinePreferredSource(input: BibleIQRequest): BibleIQSource {
  const rawBook = String(input.book || "").trim();
  const evidenceBook = toEvidenceBook(rawBook);

  if (
    NEW_TESTAMENT_BOOKS.has(rawBook) ||
    Array.from(NEW_TESTAMENT_BOOKS).some(
      (bookName) => toEvidenceBook(bookName) === evidenceBook,
    )
  ) {
    return "greek-nt";
  }

  const translation = normalize(input.translation);
  if (
    translation.includes("brenton") ||
    translation.includes("septuagint") ||
    translation.includes("lxx")
  ) {
    return "lxx";
  }

  return "hebrew";
}

function unresolved(
  input: BibleIQRequest,
  preferredSource: BibleIQSource,
): BibleIQResponse {
  return {
    resolved: false,
    resolutionType: "unresolved",
    preferredSource,
    query: input.displayWord,
    message:
      "SEE could not resolve this word from the aligned source context yet.",
  };
}

function sourceLabel(source: BibleIQSource) {
  if (source === "greek-nt") return "Greek NT";
  if (source === "lxx") return "Greek LXX";
  return "Hebrew";
}

function translationKey(value?: string): BibleIQTranslation {
  const normalized = normalize(value || "");

  if (normalized.includes("kjv") || normalized.includes("king james")) {
    return "kjv";
  }

  if (
    normalized.includes("brenton") ||
    normalized.includes("septuagint") ||
    normalized.includes("lxx")
  ) {
    return "brenton";
  }

  return "web";
}

function translationLabel(value: string) {
  const key = translationKey(value);
  if (key === "kjv") return "KJV";
  if (key === "brenton") return "Brenton LXX";
  return "WEB";
}

function routeTranslationForSource(
  source: BibleIQSource,
  selectedTranslation?: string,
): BibleIQTranslation {
  if (source === "lxx") return "brenton";

  const selected = translationKey(selectedTranslation);
  return selected === "kjv" ? "kjv" : "web";
}

function referenceLabel(book: string, chapter: number, verse: number) {
  return `${book} ${chapter}:${verse}`;
}

function renderingsForTranslation(
  reference: WordStudyRuntimeReference,
  routeTranslation: BibleIQTranslation,
) {
  const preferred = reference.renderings[routeTranslation];
  if (preferred?.length) return preferred;

  return Object.values(reference.renderings).flat();
}

function toPublicReference(
  reference: WordStudyRuntimeReference,
  source: BibleIQSource,
  selectedTranslation?: string,
): BibleIQReference {
  const routeTranslation = routeTranslationForSource(
    source,
    selectedTranslation,
  );

  return {
    reference: referenceLabel(
      reference.book,
      reference.chapter,
      reference.verse,
    ),
    book: reference.book,
    chapter: reference.chapter,
    verse: reference.verse,
    source,
    routeTranslation,
    renderings: renderingsForTranslation(reference, routeTranslation),
    occurrenceCount: reference.occurrenceCount,
    evidenceId: reference.evidenceId,
  };
}

function chronologyReference(
  value:
    | {
        book: string;
        chapter: number;
        verse: number;
      }
    | undefined,
  source: BibleIQSource,
  selectedTranslation?: string,
): BibleIQReference | undefined {
  if (!value) return undefined;

  return {
    reference: referenceLabel(value.book, value.chapter, value.verse),
    book: value.book,
    chapter: value.chapter,
    verse: value.verse,
    source,
    routeTranslation: routeTranslationForSource(
      source,
      selectedTranslation,
    ),
  };
}

function uniqueReferences(values: BibleIQReference[]) {
  const result: BibleIQReference[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const key = `${value.source}|${value.book}|${value.chapter}|${value.verse}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

function buildKeyReferences(
  runtime: WordStudyRuntimeEntity,
  selectedTranslation?: string,
  finalEmet?: FinalEmetRuntimeRecord | null,
) {
  const source = runtime.corpus;
  const routeTranslation = routeTranslationForSource(
    source,
    selectedTranslation,
  );

  const citationReferences = (finalEmet?.status === "approved"
    ? finalEmet.citations
    : [])
    .filter(
      (citation) =>
        Boolean(citation.book) &&
        Number.isFinite(citation.chapter) &&
        Number.isFinite(citation.verse),
    )
    .map((citation): BibleIQReference => ({
      reference: referenceLabel(
        citation.book!,
        citation.chapter!,
        citation.verse!,
      ),
      book: citation.book!,
      chapter: citation.chapter!,
      verse: citation.verse!,
      source,
      routeTranslation,
      evidenceId: citation.evidenceId,
    }),
  );

  const representative = runtime.occurrences.representativeReferences.map(
    (reference) =>
      toPublicReference(reference, source, selectedTranslation),
  );

  const chronology = [
    chronologyReference(
      runtime.occurrences.firstOccurrence,
      source,
      selectedTranslation,
    ),
    chronologyReference(
      runtime.occurrences.lastOccurrence,
      source,
      selectedTranslation,
    ),
  ].filter((value): value is BibleIQReference => Boolean(value));

  return uniqueReferences([
    ...citationReferences,
    ...chronology,
    ...representative,
  ]);
}

function buildMeaningInVerse({
  input,
  runtime,
  sourceWord,
  morph,
}: {
  input: BibleIQRequest;
  runtime: WordStudyRuntimeEntity;
  sourceWord?: string;
  morph?: string;
}): BibleIQMeaningInVerse {
  const identity = runtime.identity;
  const source = sourceLabel(runtime.corpus);
  const reference = referenceLabel(
    input.book,
    input.chapter,
    input.verse,
  );
  const selectedEnglish = input.selectedText || input.displayWord;
  const lemma = identity.lemma || identity.normalizedLemma;
  const lexicalId = identity.lexicalId;
  const translation = translationLabel(input.translation);

  const parts = [
    `In ${reference}, the selected ${translation} word “${selectedEnglish}” is aligned to the ${source} source form${
      sourceWord ? ` ${sourceWord}` : ""
    }.`,
  ];

  if (lemma && lemma !== sourceWord) {
    parts.push(`It is a grammatical form of the lemma ${lemma}${lexicalId ? ` (${lexicalId})` : ""}.`);
  } else if (lexicalId) {
    parts.push(`SEE identifies the source-word entity as ${lexicalId}.`);
  }

  return {
    reference,
    selectedEnglish,
    selectedTranslation: translation,
    verseText: input.verseText,
    sourceWord,
    lemma,
    lexicalId,
    morph,
    statement: parts.join(" "),
  };
}

function buildSeeKnowledge(
  runtime: WordStudyRuntimeEntity,
  selectedTranslation?: string,
): BibleIQSeeKnowledge {
  const source = runtime.corpus;

  function mapExample(
    example: WordStudyRuntimeEntity["seeKnowledge"]["relationships"][number],
  ): BibleIQKnowledgeExample {
    return {
      reference: example.reference
        ? {
            reference: referenceLabel(
              example.reference.book,
              example.reference.chapter,
              example.reference.verse,
            ),
            book: example.reference.book,
            chapter: example.reference.chapter,
            verse: example.reference.verse,
            source,
            routeTranslation: routeTranslationForSource(
              source,
              selectedTranslation,
            ),
          }
        : undefined,
      label: example.label,
      details: example.details,
      confidence: example.confidence,
    };
  }

  return {
    available: runtime.seeKnowledge.available,
    relationshipCount: runtime.seeKnowledge.relationshipCount,
    eventCount: runtime.seeKnowledge.eventCount,
    themeCount: runtime.seeKnowledge.themeCount,
    totalReferenceCount: runtime.seeKnowledge.totalReferenceCount,
    relationships: runtime.seeKnowledge.relationships.map(mapExample),
    events: runtime.seeKnowledge.events.map(mapExample),
    themes: runtime.seeKnowledge.themes.map(mapExample),
  };
}

function buildEntityEvidence(
  runtime: WordStudyRuntimeEntity,
  selectedTranslation?: string,
): BibleIQEntityEvidence {
  return {
    lexical: {
      ...runtime.identity,
    },
    occurrenceSummary: {
      corpusOccurrenceCount:
        runtime.occurrences.corpusOccurrenceCount,
      totalEntityOccurrences:
        runtime.occurrences.totalEntityOccurrences,
      uniqueVerseCount: runtime.occurrences.uniqueVerseCount,
      alignedSourceTokenCount:
        runtime.occurrences.alignedSourceTokenCount,
      alignedVerseCount: runtime.occurrences.alignedVerseCount,
      translationAlignmentCount:
        runtime.occurrences.translationAlignmentCount,
    },
    renderings: {
      available: runtime.renderings.available,
      totalAlignedRenderings:
        runtime.renderings.totalAlignedRenderings,
      translations: runtime.renderings.byTranslation.map(
        (translation) => ({
          translation: translation.translation,
          count:
            runtime.renderings.translationCounts.find(
              (item) =>
                item.translation === translation.translation,
            )?.count || 0,
          forms: translation.forms.map((form) => ({
            ...form,
            translation: translation.translation,
          })),
        }),
      ),
      mostCommon: runtime.renderings.mostCommon,
    },
    chronology: {
      firstOccurrence: chronologyReference(
        runtime.occurrences.firstOccurrence,
        runtime.corpus,
        selectedTranslation,
      ),
      lastOccurrence: chronologyReference(
        runtime.occurrences.lastOccurrence,
        runtime.corpus,
        selectedTranslation,
      ),
    },
    representativeReferences:
      runtime.occurrences.representativeReferences.map(
        (reference) =>
          toPublicReference(
            reference,
            runtime.corpus,
            selectedTranslation,
          ),
      ),
    health: {
      ...runtime.health,
    },
  };
}

function buildOccurrences({
  input,
  runtime,
  sourceWord,
}: {
  input: BibleIQRequest;
  runtime: WordStudyRuntimeEntity;
  sourceWord?: string;
}): BibleIQOccurrence[] {
  return runtime.occurrences.orderedReferences.map((reference) => {
    const publicReference = toPublicReference(
      reference,
      runtime.corpus,
      input.translation,
    );
    const isSelectedOccurrence =
      booksEquivalent(reference.book, input.book) &&
      reference.chapter === input.chapter &&
      reference.verse === input.verse;

    return {
      ...publicReference,
      englishText: isSelectedOccurrence
        ? input.verseText || undefined
        : undefined,
      sourceWord: isSelectedOccurrence ? sourceWord : undefined,
    };
  });
}

function buildRuntimeEntity({
  input,
  runtime,
  sourceWord,
  morph,
  finalEmet,
}: {
  input: BibleIQRequest;
  runtime: WordStudyRuntimeEntity;
  sourceWord?: string;
  morph?: string;
  finalEmet?: FinalEmetRuntimeRecord | null;
}): BibleIQEntity {
  const identity = runtime.identity;
  const lemma =
    identity.lemma ||
    identity.normalizedLemma ||
    sourceWord ||
    identity.lexicalId ||
    input.displayWord;
  const firstOccurrence = chronologyReference(
    runtime.occurrences.firstOccurrence,
    runtime.corpus,
    input.translation,
  );
  const lastOccurrence = chronologyReference(
    runtime.occurrences.lastOccurrence,
    runtime.corpus,
    input.translation,
  );
  const keyReferences = buildKeyReferences(
    runtime,
    input.translation,
    finalEmet,
  );
  const seeKnowledge = buildSeeKnowledge(
    runtime,
    input.translation,
  );
  const occurrences = buildOccurrences({
    input,
    runtime,
    sourceWord,
  });
  const selectedReference = referenceLabel(
    input.book,
    input.chapter,
    input.verse,
  );

  const see: BibleIQSeeEvidence = {
    evidenceId: `p03:${runtime.entityId}`,
    countId: runtime.entityId.replace(/^word:/, ""),
    occurrenceCount:
      runtime.occurrences.corpusOccurrenceCount ||
      runtime.occurrences.totalEntityOccurrences,
    firstOccurrence: firstOccurrence?.reference,
    lastOccurrence: lastOccurrence?.reference,
    relationshipCount: seeKnowledge.relationshipCount,
    eventCount: seeKnowledge.eventCount,
    themeCount: seeKnowledge.themeCount,
  };

  const alignment: BibleIQSourceAlignment = {
    selectedEnglish: input.selectedText || input.displayWord,
    sourceWord,
    source: runtime.corpus,
    strong: runtime.corpus === "lxx" ? undefined : identity.strong,
    lexicalId: identity.lexicalId,
    lemma,
    morph,
    entityId: runtime.entityId,
    seeEvidenceId: see.evidenceId,
  };

  const approvedExplanation =
    finalEmet?.status === "approved"
      ? finalEmet
      : null;

  const citationDetails = (approvedExplanation?.citations || [])
    .filter(
      (citation) =>
        Boolean(citation.book) &&
        Number.isFinite(citation.chapter) &&
        Number.isFinite(citation.verse),
    )
    .map((citation) => ({
      reference:
        citation.reference ||
        referenceLabel(
          citation.book!,
          citation.chapter!,
          citation.verse!,
        ),
      book: citation.book!,
      chapter: citation.chapter!,
      verse: citation.verse!,
      evidenceId: citation.evidenceId,
      kind: citation.kind,
    }));

  const emet =
    finalEmet?.status === "approved"
      ? {
          status: "complete" as const,
          approval: "approved-p07" as const,
          explanation: finalEmet.explanation,
          citations: finalEmet.citations.map(
            (citation) => citation.reference,
          ),
          citationDetails,
          explanationChecksum:
            finalEmet.explanationChecksum,
          packetChecksum: finalEmet.viewChecksum,
          packet: null,
        }
      : finalEmet?.status === "no-explanation"
        ? {
            status: "insufficient-evidence" as const,
            approval: "no-explanation-p07" as const,
            explanation: undefined,
            citations: [],
            citationDetails: [],
            packet: null,
          }
        : {
            status: "missing" as const,
            explanation: undefined,
            citations: [],
            citationDetails: [],
            packet: null,
          };

  return {
    id: runtime.entityId,
    type: "word",
    title: input.selectedText || input.displayWord,
    subtitle: `${lemma} • ${sourceLabel(runtime.corpus)}`,
    emet,
    meaningInVerse: buildMeaningInVerse({
      input,
      runtime,
      sourceWord,
      morph,
    }),
    see,
    seeKnowledge,
    alignment,
    entityEvidence: buildEntityEvidence(
      runtime,
      input.translation,
    ),
    keyReferences,
    simple: {
      meaning:
        identity.shortDefinitions[0] ||
        identity.glosses[0] ||
        lemma,
      inThisVerse: `The selected word is aligned to ${
        sourceWord || lemma
      } in ${selectedReference}.`,
      whyItMatters:
        "This study preserves the aligned source occurrence and the supporting SEE evidence.",
      summary:
        approvedExplanation?.explanation ||
        `SEE preserves the source identity, usage, and references for ${lemma}.`,
    },
    contextConnections: {
      people: [],
      places: [],
      events: seeKnowledge.events.map((item) => item.label),
      concepts: seeKnowledge.relationships.map(
        (item) => item.label,
      ),
      themes: seeKnowledge.themes.map((item) => item.label),
      laterReferences: [],
    },
    evidence: {
      originalLanguage: {
        source: runtime.corpus,
        word: sourceWord || lemma,
        transliteration: identity.transliteration,
        pronunciation: identity.pronunciation,
        strong:
          runtime.corpus === "lxx"
            ? undefined
            : identity.strong,
        lemma,
        lemmaId: identity.lexicalId,
        partOfSpeech: identity.partsOfSpeech.join(", ") || undefined,
        forms: identity.sourceForms.map(
          (form) => form.surface,
        ),
        morph,
        seeEvidenceId: see.evidenceId,
      },
      definitions: {
        short:
          identity.shortDefinitions[0] ||
          identity.glosses[0],
        usage: identity.glosses.join("; ") || undefined,
        sources: identity.witnesses,
      },
      firstMention: firstOccurrence?.reference,
      keyReferences: keyReferences.map(
        (reference) => reference.reference,
      ),
      related: {
        people: [],
        places: [],
        concepts: seeKnowledge.relationships.map(
          (item) => item.label,
        ),
        events: seeKnowledge.events.map(
          (item) => item.label,
        ),
      },
      occurrenceCount:
        runtime.occurrences.corpusOccurrenceCount ||
        runtime.occurrences.totalEntityOccurrences,
      occurrences,
    },
  };
}

function buildV2SpanAlignmentEntity({
  input,
  preferredSource,
  hit,
}: {
  input: BibleIQRequest;
  preferredSource: BibleIQSource;
  hit: NonNullable<Awaited<ReturnType<typeof findCanonicalHit>>>;
}): BibleIQEntity {
  const route = hit.v2Route!;
  const reference = referenceLabel(
    input.book,
    input.chapter,
    input.verse,
  );
  const routes: BibleIQV2SourceRoute[] = route.sourceRoutes || [];
  const lexical = routes.filter((item) => item.kind === "lexical");
  const grammar = routes.filter((item) => item.kind === "grammar");
  const sourceWords = routes
    .map((item) => item.sourceWord)
    .filter((value): value is string => Boolean(value));
  const sourceWord = sourceWords.join(" + ") || hit.sourceWord;
  const routeLabel =
    route.mode === "segment-context"
      ? "Source Segment Context"
      : route.mode === "exact-multi"
        ? "Multiple Exact Source Components"
        : grammar.length
          ? "Exact Grammatical Source Component"
          : "Exact Source Alignment";

  const statement =
    route.mode === "segment-context"
      ? "This English word belongs to an established WEB rendering of the shown Hebrew source segment. No one-token source identity is claimed."
      : route.mode === "exact-multi"
        ? "This English word is supported by multiple exact Hebrew source components. SEE preserves all of them instead of selecting only the first."
        : grammar.length
          ? "This English word renders an exact grammatical component of the Hebrew source occurrence; it is not being relabeled as a lexical Strong entry."
          : "The selected word is aligned to " +
            (sourceWord || "the exact Hebrew source occurrence") +
            ".";

  const alignment: BibleIQSourceAlignment = {
    selectedEnglish: input.selectedText || input.displayWord,
    sourceWord,
    source: preferredSource,
    strong:
      lexical.length === 1 && routes.length === 1
        ? lexical[0].strong
        : undefined,
    lexicalId:
      lexical.length === 1 && routes.length === 1
        ? lexical[0].lexicalId
        : undefined,
    lemma: routes.length === 1 ? routes[0].lemma : undefined,
    morph: routes.length === 1 ? routes[0].morph : undefined,
    entityId: hit.entityId,
    routeMode: route.mode,
    sourceRoutes: routes,
    sourceSegment: route.sourceSegment,
    noForcedSingleSourceIdentity:
      route.mode !== "exact-single" || grammar.length > 0,
  };

  return {
    id: hit.entityId,
    type: "word",
    title: input.selectedText || input.displayWord,
    subtitle: routeLabel + " • Hebrew",
    alignment,
    emet: {
      status: "insufficient-evidence",
      packet: null,
      explanation: undefined,
      citations: [reference],
    },
    meaningInVerse: {
      reference,
      selectedEnglish: input.selectedText || input.displayWord,
      selectedTranslation: translationLabel(input.translation),
      verseText: input.verseText,
      sourceWord,
      lemma: alignment.lemma,
      lexicalId: alignment.lexicalId,
      morph: alignment.morph,
      statement,
    },
    simple: {
      meaning: sourceWord || input.displayWord,
      inThisVerse: statement,
      whyItMatters:
        "SEE keeps source occurrence, component, and segment identity separate and does not invent a one-Strong-per-English-token relationship.",
      summary:
        "This is an evidence-grounded alignment context. No synthetic cached EMET explanation was created, and no live AI was invoked.",
    },
    evidence: {
      originalLanguage: {
        source: preferredSource,
        word: sourceWord || input.displayWord,
        strong: alignment.strong,
        lemma: alignment.lemma,
        lemmaId: alignment.lexicalId,
        morph: alignment.morph,
      },
      keyReferences: [reference],
      related: {
        people: [],
        places: [],
        concepts: [routeLabel],
        events: [],
      },
      occurrences: [
        {
          reference,
          book: input.book,
          chapter: input.chapter,
          verse: input.verse,
          englishText: input.verseText || undefined,
          sourceWord,
          source: preferredSource,
          routeTranslation: routeTranslationForSource(
            preferredSource,
            input.translation,
          ),
        },
      ],
    },
  };
}

function buildCanonicalAlignmentEntity({
  input,
  preferredSource,
  entityId,
  sourceWord,
  strong,
  lemma,
  morph,
  compoundRoute,
}: {
  input: BibleIQRequest;
  preferredSource: BibleIQSource;
  entityId: string;
  sourceWord?: string;
  strong?: string;
  lemma?: string;
  morph?: string;
  compoundRoute?: CanonicalCompoundRoute;
}): BibleIQEntity {
  const title = lemma || sourceWord || input.displayWord.trim();
  const reference = referenceLabel(
    input.book,
    input.chapter,
    input.verse,
  );
  const label = sourceLabel(preferredSource);
  const routeTranslation = routeTranslationForSource(
    preferredSource,
    input.translation,
  );

  const alignment: BibleIQSourceAlignment = {
    selectedEnglish: input.displayWord,
    sourceWord,
    source: preferredSource,
    strong: preferredSource === "lxx" ? undefined : strong,
    lexicalId:
      compoundRoute?.lexicalId ||
      entityId.split(":").at(-1) ||
      undefined,
    lemma,
    morph,
    entityId,
    isCompoundRoute: Boolean(compoundRoute),
    compoundRouteKind: compoundRoute?.routeKind,
    componentLexicalIds:
      compoundRoute?.componentLexicalIds,
  };

  return {
    id: entityId,
    type: "word",
    title: input.displayWord,
    subtitle: compoundRoute
      ? `${title} • ${label} Compound Source Alignment`
      : `${title} • ${label} Source Alignment`,
    alignment,
    emet: {
      status: compoundRoute
        ? "insufficient-evidence"
        : "missing",
      packet: null,
      explanation: undefined,
      citations: [reference],
    },
    meaningInVerse: {
      reference,
      selectedEnglish: input.displayWord,
      selectedTranslation: translationLabel(input.translation),
      verseText: input.verseText,
      sourceWord,
      lemma,
      lexicalId: alignment.lexicalId,
      morph,
      statement: compoundRoute
        ? `The selected word is aligned to the compound Greek source form ${
            sourceWord || title
          } (${compoundRoute.componentLexicalIds.join(
            " + ",
          )}). The compound route is preserved without forcing it onto only one component.`
        : `The selected word is aligned to ${
            sourceWord || title
          } in the ${label} source text. The full cached study is temporarily unavailable.`,
    },
    simple: {
      meaning: title,
      inThisVerse: sourceWord
        ? `The selected English word is aligned to ${sourceWord}.`
        : `This word appears in ${reference}.`,
      whyItMatters: compoundRoute
        ? "SEE preserves both components of this compound Greek source form instead of assigning the English word to an unsupported single component."
        : "SEE preserved the source alignment, but the full cached study could not be loaded.",
      summary: compoundRoute
        ? "This is a transparent compound-source alignment. No synthetic cached EMET explanation was created, and no live AI was invoked."
        : "The source alignment remains available. No live AI was invoked.",
    },
    evidence: {
      originalLanguage: {
        source: preferredSource,
        word: sourceWord || title,
        strong: preferredSource === "lxx" ? undefined : strong,
        lemma,
        lemmaId: alignment.lexicalId,
        morph,
      },
      keyReferences: [reference],
      related: {
        people: [],
        places: [],
        concepts: compoundRoute
          ? [
              "Compound Greek source alignment",
              ...compoundRoute.componentLexicalIds,
            ]
          : ["Canonical source alignment available"],
        events: [],
      },
      occurrences: [
        {
          reference,
          book: input.book,
          chapter: input.chapter,
          verse: input.verse,
          englishText: input.verseText || undefined,
          sourceWord,
          source: preferredSource,
          routeTranslation,
        },
      ],
    },
  };
}

function buildPlaceholderEntity(
  input: BibleIQRequest,
  preferredSource: BibleIQSource,
): BibleIQEntity {
  const title = input.displayWord.trim();
  const reference = referenceLabel(
    input.book,
    input.chapter,
    input.verse,
  );

  return {
    id: `${preferredSource}:${input.book}:${input.chapter}:${input.verse}:${normalize(
      title,
    )}`,
    type: "word",
    title,
    subtitle: "SEE Evidence",
    emet: {
      status: "insufficient-evidence",
      packet: null,
      explanation: undefined,
      citations: [reference],
    },
    simple: {
      meaning: undefined,
      inThisVerse: input.verseText
        ? `This word appears in ${reference}.`
        : "This word appears in the selected verse.",
      whyItMatters:
        "SEE has not connected this display token to a source entity.",
      summary:
        "This word has not been connected to source evidence yet.",
    },
    evidence: {
      originalLanguage: input.originalWord
        ? {
            source: preferredSource,
            word: input.originalWord,
          }
        : undefined,
      keyReferences: [reference],
      related: {
        people: [],
        places: [],
        concepts: [],
        events: [],
      },
      occurrences: [
        {
          reference,
          book: input.book,
          chapter: input.chapter,
          verse: input.verse,
          englishText: input.verseText || undefined,
          sourceWord: input.originalWord,
          source: preferredSource,
          routeTranslation: routeTranslationForSource(
            preferredSource,
            input.translation,
          ),
        },
      ],
    },
  };
}

export async function resolveBibleIQ(
  input: BibleIQRequest,
  origin: string,
): Promise<BibleIQResponse> {
  const preferredSource = determinePreferredSource(input);

  if (!input.displayWord?.trim()) {
    return unresolved(input, preferredSource);
  }

  const hit = await findCanonicalHit({
    origin,
    translation: input.translation,
    book: input.book,
    chapter: input.chapter,
    verse: input.verse,
    displayTokenIndex: input.displayTokenIndex,
  });

  if (hit) {
    const source = hit.sourceToken?.source || preferredSource;
    const v2NeedsContextEntity = Boolean(
      hit.v2Route &&
        !(
          hit.v2Route.mode === "exact-single" &&
          hit.v2Route.sourceRoutes.length === 1 &&
          hit.v2Route.sourceRoutes[0]?.kind === "lexical" &&
          /^word:hebrew:H\d+$/.test(hit.entityId)
        ),
    );

    if (v2NeedsContextEntity) {
      return {
        resolved: true,
        resolutionType: "verse-context",
        preferredSource: source,
        query: input.displayWord,
        entity: buildV2SpanAlignmentEntity({
          input,
          preferredSource: source,
          hit,
        }),
      };
    }

    const canonicalEntityId =
      normalizeWordEntityId(hit.entityId) || hit.entityId;
    const runtime = hit.compoundRoute
      ? null
      : await loadWordStudyEntity(
          origin,
          canonicalEntityId,
        );
    const finalEmet = runtime
      ? await loadFinalEmetRecord(origin, runtime.entityId)
      : null;

    const entity = runtime
      ? buildRuntimeEntity({
          input,
          runtime,
          sourceWord: hit.sourceWord,
          morph: hit.sourceToken?.morph,
          finalEmet,
        })
      : buildCanonicalAlignmentEntity({
          input,
          preferredSource: source,
          entityId: canonicalEntityId,
          sourceWord: hit.sourceWord,
          strong: hit.sourceToken?.strong,
          lemma: hit.sourceToken?.lemma,
          morph: hit.sourceToken?.morph,
          compoundRoute: hit.compoundRoute,
        });

    return {
      resolved: true,
      resolutionType: "verse-context",
      preferredSource: source,
      query: input.displayWord,
      entity,
    };
  }

  const entity = buildPlaceholderEntity(input, preferredSource);
  return {
    resolved: true,
    resolutionType: "unresolved",
    preferredSource,
    query: input.displayWord,
    entity,
  };
}

export const BibleIQEngine = {
  resolve: resolveBibleIQ,
};
