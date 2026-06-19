export type AskTopic = {
  id: string;
  label: string;
  triggers: string[];
  primaryTerms: string[];
  secondaryTerms: string[];
  conceptTerms: string[];
};

export const askTopics: AskTopic[] = [
  {
    id: "sin",
    label: "Sin",
    triggers: ["what is sin", "define sin", "meaning of sin"],
    primaryTerms: ["sin", "transgression", "iniquity"],
    secondaryTerms: ["law", "commandment", "commandments"],
    conceptTerms: ["unrighteousness", "wickedness", "evil", "disobedience"],
  },
  {
    id: "sabbath",
    label: "Sabbath",
    triggers: ["sabbath", "seventh day", "day of rest"],
    primaryTerms: ["sabbath", "seventh day"],
    secondaryTerms: ["rest", "holy", "convocation"],
    conceptTerms: ["creation", "commandment", "sign"],
  },
  {
    id: "kingdom",
    label: "Kingdom",
    triggers: ["kingdom of god", "kingdom of heaven", "kingdom"],
    primaryTerms: ["kingdom", "reign", "throne"],
    secondaryTerms: ["king", "dominion", "rule"],
    conceptTerms: ["david", "messiah", "covenant"],
  },
];

export function understandQuestion(input: string) {
  const query = input.toLowerCase().trim();

  const topic =
    askTopics.find((topic) =>
      topic.triggers.some((trigger) => query.includes(trigger))
    ) ||
    askTopics.find((topic) =>
      [...topic.primaryTerms, ...topic.secondaryTerms, ...topic.conceptTerms].some(
        (term) => query.includes(term)
      )
    );

  if (!topic) {
    return {
      mode: "basic" as const,
      topic: null,
      terms: query.split(/\s+/).filter(Boolean),
    };
  }

  return {
    mode: "topic" as const,
    topic,
    terms: [
      ...topic.primaryTerms,
      ...topic.secondaryTerms,
      ...topic.conceptTerms,
    ],
  };
}

export function scoreVerseForTopic(text: string, reference: string, topic: AskTopic) {
  const source = `${reference} ${text}`.toLowerCase();

  let score = 0;

  for (const term of topic.primaryTerms) {
    if (source.includes(term)) score += 10;
  }

  for (const term of topic.secondaryTerms) {
    if (source.includes(term)) score += 5;
  }

  for (const term of topic.conceptTerms) {
    if (source.includes(term)) score += 2;
  }

  return score;
}