import type { EmetAiClaimSupport } from "./EmetAiContract";

const MAX_RECENT_EXCHANGES = 8;
const MAX_SUMMARY_TOPICS = 12;
const MAX_SUMMARY_PASSAGES = 16;
const MAX_SUMMARY_CORRECTIONS = 4;
const MAX_QUESTION_LENGTH = 800;
const MAX_ANSWER_LENGTH = 2400;
const MAX_EXCHANGE_CLAIMS = 12;
const MAX_SUMMARY_CLAIMS = 16;

const CONTEXT_WORDS = new Set([
  "about", "after", "again", "also", "and", "answer", "apply", "before",
  "bible", "but", "chapter", "could", "does", "explain", "from", "have",
  "here", "how", "into", "mean", "means", "more", "previous", "question",
  "said", "say", "scripture", "should", "still", "teach", "that", "the",
  "their", "then", "there", "these", "they", "this", "those", "today",
  "verse", "what", "when", "where", "which", "who", "why", "with", "would",
]);

const FOLLOW_UP_PATTERN =
  /\b(this|that|it|they|them|he|she|there|then|previous|earlier|latter|former)\b|\bwhat about\b|\bhow about\b|\bdoes that\b|\bwhy\??$/i;

export type EmetConversationExchange = {
  question: string;
  answer: string;
  references: string[];
  claims: EmetConversationClaim[];
};

export type EmetConversationClaim = {
  text: string;
  support: EmetAiClaimSupport;
  references: string[];
};

export type EmetConversationSummary = {
  topics: string[];
  passages: string[];
  corrections: string[];
  earlierQuestions: string[];
  establishedClaims: EmetConversationClaim[];
};

export type EmetConversationContext = {
  recentExchanges: EmetConversationExchange[];
  summary: EmetConversationSummary;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function unique(values: string[], limit: number) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, limit);
}

const claimSupports = new Set<EmetAiClaimSupport>([
  "explicit-statement",
  "strong-implication",
  "theological-synthesis",
  "possible-interpretation",
  "does-not-establish",
]);

function cleanClaims(value: unknown): EmetConversationClaim[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const claims: EmetConversationClaim[] = [];
  for (const candidate of value.slice(-MAX_EXCHANGE_CLAIMS)) {
    if (!candidate || typeof candidate !== "object") return null;
    const claim = candidate as Record<string, unknown>;
    const text = cleanText(claim.text, 600);
    const support = claim.support as EmetAiClaimSupport;
    if (!text || !claimSupports.has(support) || !Array.isArray(claim.references)) {
      return null;
    }
    claims.push({
      text,
      support,
      references: unique(
        claim.references.map((reference) => cleanText(reference, 80)),
        12,
      ),
    });
  }
  return claims;
}

function topicTerms(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^['-]+|['-]+$/g, ""))
    .filter(
      (word) =>
        word.length > 2 &&
        word.length <= 32 &&
        !CONTEXT_WORDS.has(word),
    );
}

function summarizeOlderExchanges(
  exchanges: EmetConversationExchange[],
): EmetConversationSummary {
  const counts = new Map<string, { count: number; firstIndex: number }>();
  let termIndex = 0;

  for (const exchange of exchanges) {
    for (const term of topicTerms(exchange.question)) {
      const current = counts.get(term);
      counts.set(term, {
        count: (current?.count || 0) + 1,
        firstIndex: current?.firstIndex ?? termIndex,
      });
      termIndex += 1;
    }
  }

  const topics = Array.from(counts.entries())
    .sort(
      (left, right) =>
        right[1].count - left[1].count ||
        left[1].firstIndex - right[1].firstIndex,
    )
    .slice(0, MAX_SUMMARY_TOPICS)
    .map(([term]) => term);
  const passages = unique(
    exchanges.flatMap((exchange) => exchange.references),
    MAX_SUMMARY_PASSAGES,
  );
  const corrections = exchanges
    .map((exchange) => exchange.question)
    .filter((question) => /^(no\b|correction\b|i mean\b|not .+ i mean\b)/i.test(question))
    .slice(-MAX_SUMMARY_CORRECTIONS);

  return {
    topics,
    passages,
    corrections,
    earlierQuestions: exchanges.slice(-4).map((exchange) => exchange.question),
    establishedClaims: exchanges
      .flatMap((exchange) => exchange.claims)
      .slice(-MAX_SUMMARY_CLAIMS),
  };
}

export function buildEmetConversationContext(
  exchanges: Array<
    Omit<EmetConversationExchange, "claims"> & {
      claims?: EmetConversationClaim[];
    }
  >,
): EmetConversationContext {
  const normalized = exchanges
    .slice(-24)
    .map((exchange) => ({
      question: cleanText(exchange.question, MAX_QUESTION_LENGTH),
      answer: cleanText(exchange.answer, MAX_ANSWER_LENGTH),
      references: unique(
        exchange.references.map((reference) => cleanText(reference, 80)),
        20,
      ),
      claims: cleanClaims(exchange.claims) || [],
    }))
    .filter((exchange) => exchange.question && exchange.answer);
  const splitIndex = Math.max(0, normalized.length - MAX_RECENT_EXCHANGES);

  return {
    recentExchanges: normalized.slice(splitIndex),
    summary: summarizeOlderExchanges(normalized.slice(0, splitIndex)),
  };
}

export function parseEmetConversationContext(
  value: unknown,
): EmetConversationContext | null {
  if (value === undefined) return buildEmetConversationContext([]);
  if (!value || typeof value !== "object") return null;

  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.recentExchanges)) return null;
  const exchanges: EmetConversationExchange[] = [];

  for (const candidate of input.recentExchanges.slice(-MAX_RECENT_EXCHANGES)) {
    if (!candidate || typeof candidate !== "object") return null;
    const exchange = candidate as Record<string, unknown>;
    const question = cleanText(exchange.question, MAX_QUESTION_LENGTH);
    const answer = cleanText(exchange.answer, MAX_ANSWER_LENGTH);
    const claims = cleanClaims(exchange.claims);
    if (
      !question ||
      !answer ||
      !Array.isArray(exchange.references) ||
      !claims
    ) return null;
    exchanges.push({
      question,
      answer,
      references: unique(
        exchange.references.map((reference) => cleanText(reference, 80)),
        20,
      ),
      claims,
    });
  }

  const rawSummary = input.summary;
  if (!rawSummary || typeof rawSummary !== "object") return null;
  const summary = rawSummary as Record<string, unknown>;
  const cleanList = (candidate: unknown, limit: number, maxLength: number) =>
    Array.isArray(candidate)
      ? unique(candidate.map((item) => cleanText(item, maxLength)), limit)
      : null;
  const topics = cleanList(summary.topics, MAX_SUMMARY_TOPICS, 32);
  const passages = cleanList(summary.passages, MAX_SUMMARY_PASSAGES, 80);
  const corrections = cleanList(
    summary.corrections,
    MAX_SUMMARY_CORRECTIONS,
    MAX_QUESTION_LENGTH,
  );
  const earlierQuestions = cleanList(summary.earlierQuestions, 4, MAX_QUESTION_LENGTH);
  const establishedClaims = cleanClaims(summary.establishedClaims);
  if (
    !topics ||
    !passages ||
    !corrections ||
    !earlierQuestions ||
    !establishedClaims
  ) return null;

  return {
    recentExchanges: exchanges,
    summary: {
      topics,
      passages,
      corrections,
      earlierQuestions,
      establishedClaims: establishedClaims.slice(-MAX_SUMMARY_CLAIMS),
    },
  };
}

export function relevantEmetConversation({
  question,
  conversation,
}: {
  question: string;
  conversation: EmetConversationContext;
}) {
  if (
    !conversation.recentExchanges.length &&
    !conversation.summary.topics.length &&
    !conversation.summary.establishedClaims.length
  ) {
    return null;
  }

  const currentTerms = new Set(topicTerms(question));
  const memoryTerms = new Set([
    ...conversation.summary.topics,
    ...conversation.summary.earlierQuestions.flatMap(topicTerms),
    ...conversation.recentExchanges.flatMap((exchange) =>
      topicTerms(exchange.question),
    ),
    ...conversation.summary.establishedClaims.flatMap((claim) =>
      topicTerms(claim.text),
    ),
    ...conversation.recentExchanges.flatMap((exchange) =>
      exchange.claims.flatMap((claim) => topicTerms(claim.text)),
    ),
  ]);
  const overlaps = Array.from(currentTerms).some((term) => memoryTerms.has(term));

  return FOLLOW_UP_PATTERN.test(question) || overlaps ? conversation : null;
}

export function relevantEmetConversationClaimReferences(
  conversation: EmetConversationContext | null,
) {
  if (!conversation) return [];

  const recentClaims = conversation.recentExchanges
    .slice(-2)
    .flatMap((exchange) => exchange.claims);
  const claims = recentClaims.length
    ? recentClaims
    : conversation.summary.establishedClaims.slice(-MAX_SUMMARY_CLAIMS);
  const references: Array<{ reference: string; claim: string }> = [];
  const seen = new Set<string>();

  for (const claim of claims.slice().reverse()) {
    for (const reference of claim.references) {
      const key = reference
        .normalize("NFKC")
        .toLocaleLowerCase("en-US")
        .replace(/\s+/g, " ")
        .trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      references.push({ reference, claim: claim.text });
      if (references.length >= 4) return references;
    }
  }

  return references;
}

export function conversationRetrievalQuestion({
  question,
  conversation,
}: {
  question: string;
  conversation: EmetConversationContext | null;
}) {
  if (!conversation) return question.trim();

  return [
    ...conversation.summary.topics,
    ...conversation.summary.earlierQuestions,
    ...conversation.recentExchanges.slice(-2).map((exchange) => exchange.question),
    question,
  ].join("\n");
}

export function buildEmetConversationQuestion({
  question,
  conversation,
}: {
  question: string;
  conversation: EmetConversationContext | null;
}) {
  const currentQuestion = cleanText(question, MAX_QUESTION_LENGTH);
  if (!conversation) return currentQuestion;

  const summaryLines = [
    conversation.summary.topics.length
      ? `Earlier topics: ${conversation.summary.topics.join(", ")}`
      : "",
    conversation.summary.passages.length
      ? `Earlier passages discussed: ${conversation.summary.passages.join(", ")}`
      : "",
    ...conversation.summary.corrections.map(
      (correction) => `Reader correction: ${correction}`,
    ),
    ...conversation.summary.establishedClaims.map(
      (claim) =>
        `Earlier structured claim to re-check (${claim.support}; not evidence): ${claim.text}${claim.references.length ? ` [previously cited: ${claim.references.join(", ")}]` : ""}`,
    ),
  ].filter(Boolean);
  const recentLines = conversation.recentExchanges.flatMap((exchange) => [
    `Earlier reader question: ${exchange.question}`,
    ...(exchange.references.length
      ? [`Verified passages cited in that exchange: ${exchange.references.join(", ")}`]
      : []),
    ...exchange.claims.map(
      (claim) =>
        `Earlier structured claim to re-check (${claim.support}; not evidence): ${claim.text}${claim.references.length ? ` [previously cited: ${claim.references.join(", ")}]` : ""}`,
    ),
  ]);

  return [
    "Conversation context below is for resolving the current subject only. It is not Scripture evidence. Earlier answer prose is intentionally excluded:",
    ...summaryLines,
    ...recentLines,
    "",
    "Current reader question:",
    currentQuestion,
  ].join("\n");
}
