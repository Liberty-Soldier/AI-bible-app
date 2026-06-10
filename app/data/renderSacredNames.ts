import { nameRules } from "./nameRules";

export function renderSacredNames(text: string) {
  let renderedText = text;

  for (const rule of nameRules) {
    renderedText = renderedText.replaceAll(rule.source, rule.replacement);
  }

  return renderedText;
}