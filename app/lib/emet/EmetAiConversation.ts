const MAX_PREVIOUS_QUESTIONS = 4;
const MAX_QUESTION_LENGTH = 800;

function cleanQuestion(value: unknown) {
  return typeof value === "string"
    ? value.trim().slice(0, MAX_QUESTION_LENGTH)
    : "";
}

export function parseEmetPreviousQuestions(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;

  return value
    .slice(-MAX_PREVIOUS_QUESTIONS)
    .map(cleanQuestion)
    .filter(Boolean);
}

export function buildEmetConversationQuestion({
  question,
  previousQuestions = [],
}: {
  question: string;
  previousQuestions?: string[];
}) {
  const currentQuestion = cleanQuestion(question);
  const earlierQuestions = previousQuestions
    .slice(-MAX_PREVIOUS_QUESTIONS)
    .map(cleanQuestion)
    .filter(Boolean);

  if (!earlierQuestions.length) return currentQuestion;

  return [
    "Earlier reader questions are conversational context only, not Scripture evidence:",
    ...earlierQuestions.map((item) => `- ${item}`),
    "",
    "Current reader question:",
    currentQuestion,
  ].join("\n");
}
