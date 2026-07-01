import { nameRules } from "./nameRules";
import { sacredNameVerseOverrides } from "./sacredNameVerseOverrides";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyWholeWordReplace(text: string, source: string, replacement: string) {
  const pattern = new RegExp(`\\b${escapeRegex(source)}\\b`, "g");
  return text.replace(pattern, replacement);
}

export function renderSacredNames(text: string, reference?: string) {
  let renderedText = text;

  const override = reference ? sacredNameVerseOverrides[reference] : null;

  if (override?.replaceLordWithYahweh) {
    renderedText = applyWholeWordReplace(renderedText, "the Lord", "Yahweh");
    renderedText = applyWholeWordReplace(renderedText, "Lord", "Yahweh");
  }

  for (const rule of nameRules) {
    const source = escapeRegex(rule.source);

    const pattern = rule.wholeWord
      ? new RegExp(`\\b${source}\\b`, "g")
      : new RegExp(source, "g");

    renderedText = renderedText.replace(pattern, rule.replacement);
  }

  return renderedText;
}