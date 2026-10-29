import type {
  EmetAiEvidenceItem,
  EmetAiFoundationalIdentityContract,
  EmetAiIdentityQuestionSense,
} from "../EmetAiContract";
import type { EmetAiQuestionContract } from "../EmetAiQuestionContract";

export const EMET_AI_FOUNDATIONAL_IDENTITY_CONTRACT_VERSION =
  "foundational-identity@1" as const;

type ReviewedIdentityProposition = {
  id: string;
  text: string;
  evidenceReferences: string[];
};

type ReviewedIdentityInterpretationId =
  | "scripture-applies-god-language-to-yahshua"
  | "yahshua-personally-distinct-from-father"
  | "yahweh-is-the-father"
  | "yahshua-not-the-same-person-as-yahweh";

const REVIEWED_PROPOSITIONS = {
  "yahweh-divine-name": {
    id: "yahweh-divine-name",
    text: "Exodus 3:14-15 reveals the divine self-identification 'I AM' and states that Yahweh is the name to be remembered.",
    evidenceReferences: ["Exodus 3:14", "Exodus 3:15"],
  },
  "yahweh-israels-one-god": {
    id: "yahweh-israels-one-god",
    text: "Deuteronomy 6:4 identifies Yahweh as Israel's God and says that Yahweh is one.",
    evidenceReferences: ["Deuteronomy 6:4"],
  },
  "father-only-true-god": {
    id: "father-only-true-god",
    text: "In John 17:3, Yahshua addresses the Father as the only true God and identifies himself as Jesus Christ whom the Father sent.",
    evidenceReferences: ["John 17:3"],
  },
  "son-distinct-from-father": {
    id: "son-distinct-from-father",
    text: "In John 20:17, Yahshua distinguishes himself from the Father and calls the Father his God and the disciples' God.",
    evidenceReferences: ["John 20:17"],
  },
  "word-with-god-and-god-incarnate": {
    id: "word-with-god-and-god-incarnate",
    text: "John 1:1 describes the Word as with God and as God, and John 1:14 says that the Word became flesh.",
    evidenceReferences: ["John 1:1", "John 1:14"],
  },
  "thomas-addresses-yahshua-as-god": {
    id: "thomas-addresses-yahshua-as-god",
    text: "John 20:28 records Thomas addressing Yahshua as his Lord and his God.",
    evidenceReferences: ["John 20:28"],
  },
  "son-addressed-as-god-with-his-god": {
    id: "son-addressed-as-god-with-his-god",
    text: "Hebrews 1:8 addresses the Son as God, while Hebrews 1:9 also refers to God as the Son's God.",
    evidenceReferences: ["Hebrews 1:8", "Hebrews 1:9"],
  },
} as const satisfies Record<string, ReviewedIdentityProposition>;

type ReviewedIdentityPropositionId = keyof typeof REVIEWED_PROPOSITIONS;

export type EmetAiFoundationalIdentityPlan = {
  version: typeof EMET_AI_FOUNDATIONAL_IDENTITY_CONTRACT_VERSION;
  senses: EmetAiIdentityQuestionSense[];
  propositionIds: ReviewedIdentityPropositionId[];
  interpretationIds: ReviewedIdentityInterpretationId[];
  requiredReferences: string[];
};

const DIVINE_DESIGNATION_PROPOSITIONS: ReviewedIdentityPropositionId[] = [
  "father-only-true-god",
  "son-distinct-from-father",
  "word-with-god-and-god-incarnate",
  "thomas-addresses-yahshua-as-god",
  "son-addressed-as-god-with-his-god",
];

const FATHER_RELATIONSHIP_PROPOSITIONS: ReviewedIdentityPropositionId[] = [
  "father-only-true-god",
  "son-distinct-from-father",
  "word-with-god-and-god-incarnate",
  "son-addressed-as-god-with-his-god",
];

const YAHWEH_IDENTIFICATION_PROPOSITIONS: ReviewedIdentityPropositionId[] = [
  "yahweh-divine-name",
  "yahweh-israels-one-god",
  "father-only-true-god",
  "son-distinct-from-father",
  ...DIVINE_DESIGNATION_PROPOSITIONS,
];

const TERM_DISTINCTIONS: EmetAiFoundationalIdentityContract["termDistinctions"] = [
  { term: "Yahweh", meaning: "The personal divine name; EMET's governing interpretation identifies Yahweh as the Father." },
  { term: "God", meaning: "A title or designation whose personal referent must be established from its speaker and context." },
  { term: "Elohim", meaning: "A Hebrew designation translated according to context; the term alone does not establish personal identity." },
  { term: "Father", meaning: "The one whom Yahshua addresses as the only true God and calls his God; EMET identifies the Father as Yahweh." },
  { term: "Son", meaning: "Yahshua in his relationship to the Father; Son does not mean the same person as the Father." },
  { term: "Lord", meaning: "A title whose referent and force must be established by the particular passage." },
  { term: "divine", meaning: "A description of title, status, nature, attribute, or authority that must be specified and does not by itself establish personal identity." },
];

const ACCEPTANCE_RULES = [
  "Applying God, Elohim, Lord, or divine language to Yahshua does not by itself identify him as the Father or as the same person as Yahweh.",
  "Father/Son personal distinction, divine designation, divine attributes or authority, and personal identity with Yahweh are separate propositions.",
  "A project-governed synthesis must be labeled as interpretation and must not be presented as a direct quotation from one verse.",
  "Undefined phrases such as divine identity, God's identity, or shared deity do not receive acceptance until their intended proposition is stated precisely and supported at the corresponding evidence level.",
];

function interpretationIdsForSenses(
  senses: EmetAiIdentityQuestionSense[],
): ReviewedIdentityInterpretationId[] {
  const ids: ReviewedIdentityInterpretationId[] = [];
  if (senses.includes("divine-designation")) {
    ids.push("scripture-applies-god-language-to-yahshua");
  }
  if (senses.some((sense) => sense === "father-personal-identity" || sense === "divine-designation" || sense === "yahweh-identification")) {
    ids.push("yahshua-personally-distinct-from-father");
  }
  if (senses.includes("yahweh-identification")) {
    ids.push("yahweh-is-the-father", "yahshua-not-the-same-person-as-yahweh");
  }
  return ids;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function propositionIdsForExplicitReferences(
  explicitReferences: string[],
): ReviewedIdentityPropositionId[] {
  const requested = new Set(explicitReferences);
  return (Object.keys(REVIEWED_PROPOSITIONS) as ReviewedIdentityPropositionId[])
    .filter((id) => REVIEWED_PROPOSITIONS[id].evidenceReferences.some((reference) => requested.has(reference)));
}

/**
 * Routes an identity question to reviewed propositions. The route selects the
 * proposition being assessed; it never supplies a yes/no conclusion.
 */
export function planFoundationalIdentityContract(
  contract: EmetAiQuestionContract,
): EmetAiFoundationalIdentityPlan | null {
  if (contract.intent === "lexical" || contract.requestedLanguages.length > 0) return null;
  const question = contract.question;
  const entities = new Set(contract.biblicalEntities);
  const explicitPropositionIds = propositionIdsForExplicitReferences(contract.explicitReferences);
  const asksPassageMeaning = explicitPropositionIds.length > 0 &&
    /\b(?:explain|mean|meaning|refer(?:s|ring)?\s+to|who\s+is|what\s+is)\b/i.test(question);
  const namesMessiah = entities.has("Messiah") || /\b(?:the son|the word)\b/i.test(question);
  const namesFather = entities.has("Father");
  const namesYahweh = entities.has("Yahweh");
  const namesGod = entities.has("God");
  const asksIdentity = /\b(?:same\s+person|same\s+being|identit(?:y|ical)|identify|called\s+god|described\s+as\s+god|is\s+(?:jesus|yeshua|yahshua|the son|the word)\s+(?:the\s+)?(?:father|god|yahweh|yhwh)|who\s+is\s+(?:yahweh|god|the father)|only\s+true\s+god)\b/i.test(question);

  const senses: EmetAiIdentityQuestionSense[] = [];
  const propositionIds: ReviewedIdentityPropositionId[] = [];

  if (asksPassageMeaning) {
    senses.push("passage-referent");
    propositionIds.push(...explicitPropositionIds);
  }
  if (namesMessiah && namesFather) {
    senses.push("father-personal-identity");
    propositionIds.push(...FATHER_RELATIONSHIP_PROPOSITIONS);
  }
  if (namesMessiah && namesYahweh) {
    senses.push("yahweh-identification");
    propositionIds.push(...YAHWEH_IDENTIFICATION_PROPOSITIONS);
  }
  if (namesMessiah && namesGod && !namesYahweh && !namesFather) {
    senses.push("divine-designation");
    propositionIds.push(...DIVINE_DESIGNATION_PROPOSITIONS);
  }
  if (/\bonly\s+true\s+god\b/i.test(question)) {
    senses.push("passage-referent");
    propositionIds.push("father-only-true-god");
  }
  if (namesYahweh && !namesMessiah && asksIdentity) {
    senses.push("passage-referent");
    propositionIds.push("yahweh-divine-name", "yahweh-israels-one-god");
  }

  if ((!asksIdentity && !asksPassageMeaning) || propositionIds.length === 0) return null;
  const uniquePropositionIds = unique(propositionIds);
  const uniqueSenses = unique(senses);
  return {
    version: EMET_AI_FOUNDATIONAL_IDENTITY_CONTRACT_VERSION,
    senses: uniqueSenses,
    propositionIds: uniquePropositionIds,
    interpretationIds: interpretationIdsForSenses(uniqueSenses),
    requiredReferences: unique(uniquePropositionIds.flatMap((id) =>
      REVIEWED_PROPOSITIONS[id].evidenceReferences
    )),
  };
}

export function materializeFoundationalIdentityContract({
  plan,
  evidence,
}: {
  plan: EmetAiFoundationalIdentityPlan | null;
  evidence: EmetAiEvidenceItem[];
}): EmetAiFoundationalIdentityContract | undefined {
  if (!plan) return undefined;
  const evidenceByReference = new Map(
    evidence.flatMap((item) => item.kind === "scripture" && item.reference ? [[item.reference, item]] : []),
  );
  const evidenceIdsForReferences = (references: string[]) => references.flatMap((reference) => {
    const item = evidenceByReference.get(reference);
    return item ? [item.id] : [];
  });
  const interpretations: EmetAiFoundationalIdentityContract["interpretations"] = [];
  if (plan.interpretationIds.includes("scripture-applies-god-language-to-yahshua")) {
    interpretations.push({
      id: "scripture-applies-god-language-to-yahshua",
      text: "Yes—Scripture applies God-language to Yahshua: John 20:28 records Thomas addressing him as his Lord and his God, and Hebrews 1:8 addresses the Son as God.",
      evidenceLevel: "contextual-inference",
      basisIds: ["thomas-addresses-yahshua-as-god", "son-addressed-as-god-with-his-god"],
      evidenceReferences: ["John 20:28", "Hebrews 1:8"],
      evidenceIds: evidenceIdsForReferences(["John 20:28", "Hebrews 1:8"]),
    });
  }
  if (plan.interpretationIds.includes("yahshua-personally-distinct-from-father")) {
    interpretations.push({
      id: "yahshua-personally-distinct-from-father",
      text: "John 17:3 and John 20:17 contextually establish that Yahshua and the Father are personally distinct.",
      evidenceLevel: "contextual-inference",
      basisIds: ["father-only-true-god", "son-distinct-from-father"],
      evidenceReferences: ["John 17:3", "John 20:17"],
      evidenceIds: evidenceIdsForReferences(["John 17:3", "John 20:17"]),
    });
  }
  if (plan.interpretationIds.includes("yahweh-is-the-father")) {
    interpretations.push({
      id: "yahweh-is-the-father",
      text: "EMET's governing theological interpretation identifies Yahweh as the Father.",
      evidenceLevel: "project-governed-synthesis",
      basisIds: ["yahweh-divine-name", "yahweh-israels-one-god", "father-only-true-god", "son-distinct-from-father"],
      evidenceReferences: ["Exodus 3:15", "Deuteronomy 6:4", "John 17:3", "John 20:17"],
      evidenceIds: evidenceIdsForReferences(["Exodus 3:15", "Deuteronomy 6:4", "John 17:3", "John 20:17"]),
    });
  }
  if (plan.interpretationIds.includes("yahshua-not-the-same-person-as-yahweh")) {
    interpretations.push({
      id: "yahshua-not-the-same-person-as-yahweh",
      text: "Given EMET's Yahweh-is-the-Father interpretation and the contextual Father/Son distinction, EMET accepts that Yahshua is not the same person as Yahweh.",
      evidenceLevel: "project-governed-synthesis",
      basisIds: ["yahweh-is-the-father", "yahshua-personally-distinct-from-father"],
      evidenceReferences: ["Exodus 3:15", "Deuteronomy 6:4", "John 17:3", "John 20:17"],
      evidenceIds: evidenceIdsForReferences(["Exodus 3:15", "Deuteronomy 6:4", "John 17:3", "John 20:17"]),
    });
  }
  const answerRequirements: EmetAiFoundationalIdentityContract["answerRequirements"] = [];
  if (plan.senses.includes("divine-designation")) {
    answerRequirements.push(
      {
        id: "answer-divine-designation",
        sense: "divine-designation",
        authorityId: "scripture-applies-god-language-to-yahshua",
        required: true,
        answerBearing: true,
      },
      {
        id: "answer-father-son-distinction",
        sense: "divine-designation",
        authorityId: "yahshua-personally-distinct-from-father",
        required: true,
        answerBearing: true,
      },
    );
  }
  if (plan.senses.includes("yahweh-identification")) {
    answerRequirements.push(
      {
        id: "answer-identify-yahweh",
        sense: "yahweh-identification",
        authorityId: "yahweh-is-the-father",
        required: true,
        answerBearing: true,
      },
      {
        id: "answer-yahshua-yahweh-personal-identity",
        sense: "yahweh-identification",
        authorityId: "yahshua-not-the-same-person-as-yahweh",
        required: true,
        answerBearing: true,
      },
    );
  } else if (plan.senses.includes("father-personal-identity")) {
    answerRequirements.push({
      id: "answer-father-son-personal-identity",
      sense: "father-personal-identity",
      authorityId: "yahshua-personally-distinct-from-father",
      required: true,
      answerBearing: true,
    });
  }
  return {
    version: plan.version,
    senses: plan.senses,
    propositions: plan.propositionIds.map((id) => {
      const definition = REVIEWED_PROPOSITIONS[id];
      return {
        id: definition.id,
        text: definition.text,
        support: "explicit-statement",
        evidenceLevel: "direct-scripture",
        evidenceReferences: [...definition.evidenceReferences],
        evidenceIds: evidenceIdsForReferences(definition.evidenceReferences),
      };
    }),
    termDistinctions: TERM_DISTINCTIONS,
    interpretations,
    answerRequirements,
    acceptanceRules: ACCEPTANCE_RULES,
  };
}
