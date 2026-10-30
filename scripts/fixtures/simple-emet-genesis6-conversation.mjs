// Owner-supplied conversation for offline replay and future human-reviewed live
// evaluation. This file is test data; application code must never import it.
export const genesis6Conversation = {
  question: 'If all living things were destroyed in the Flood, how were there giants afterward?',
  // The owner supplied a summary of the initial answer, not its verbatim text.
  initialAnswerSummary: 'The Flood destroyed those outside the ark. Later Scripture describes the Anakim, Rephaim, and Nephilim, but their relationship to the pre-Flood giants is not explicitly explained. EMET offered several possible interpretations.',
  correction: 'In Genesis 6:4 it states right there that the Nephilim were there in those days and after. So your answer is wrong and the explanation for Numbers 13:33 is weak.',
  // Preserved verbatim as a known good response, not a required future template
  // and not an independently certified translation of the quoted Scripture.
  observedImprovedAnswer: `Genesis 6:4 does say, 'The Nephilim were on the earth in those days, and also afterward' (wording varies by translation). So the text explicitly affirms their presence both before the Flood and 'afterward.' The key issue is what 'afterward' refers to in context.

In the immediate context, Genesis 6 is describing the period leading up to the Flood: the corruption of humanity, the union of the 'sons of God' with the daughters of men, and the resulting violent world.

Genesis 6:4 is stronger than simply saying 'the Bible never connects them,' because it does use 'afterward.' But it still does not explicitly tell us how they were present afterward.

Numbers 13:33 is relevant because the spies use the term Nephilim to describe the Anakim they saw in Canaan. But that report does not independently establish the mechanism of their origin.`,
  feedback: 'Great answer.',
  // No assistant reply to the compliment was recorded. This is only a transport
  // fixture illustrating a short acknowledgment, not an observed model output.
  acknowledgmentFixture: 'Glad that helped.',
  // Human/live-model criteria, deliberately not a keyword scorer or a doctrinal
  // validator. A different well-reasoned answer may satisfy this rubric.
  liveReviewCriteria: [
    'Engages thoughtfully with the correction rather than reflexively defending the earlier response.',
    'Reexamines the actual wording of the passages raised by the user.',
    'Acknowledges overlooked evidence without defensiveness.',
    'Distinguishes explicit textual statements from contextual inferences.',
    'Explains genuine textual ambiguity without inventing certainty or an unsupported origin mechanism.',
    'Provides the context and depth needed to explain the ambiguity.',
    'Avoids unsolicited denominational counterarguments.',
    'Responds naturally to positive feedback without needlessly repeating the explanation.',
  ],
};
