import "server-only";
import { DAILY_SCHEDULE } from "../../data/daily/annual";
import { resolveSimpleReference } from "../emet/experimental/SimpleEmetScripture";
import type { TranslationPreference } from "../translationPreference";
export function dailyPassage(date: string, requested: TranslationPreference) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        return null;
    const [y, m, d] = date.split('-').map(Number);
    const test = new Date(Date.UTC(y, m - 1, d));
    if (test.getUTCFullYear() !== y || test.getUTCMonth() !== m - 1 || test.getUTCDate() !== d)
        return null;
    const selection = DAILY_SCHEDULE.find(s => s.date === date.slice(5));
    if (!selection)
        return null;
    // Only editorially reviewed reader references bridge differing editions.
    // Never infer LXX numbering arithmetically or substitute a same-numbered verse.
    const numberingFallback = requested === 'brenton' && (selection.brentonReference === null ||
        (selection.reference.startsWith('Psalms ') && !selection.brentonReference));
    const requestedReference = requested === 'brenton' ? selection.brentonReference || selection.reference : selection.reference;
    let translation = requested;
    let reference = requestedReference;
    let verses = numberingFallback ? null : resolveSimpleReference(reference, requested);
    if (!verses) {
        translation = selection.sourceTranslation || 'web';
        reference = selection.reference;
        verses = resolveSimpleReference(reference, translation);
    }
    if (!verses)
        throw new Error('Scheduled Scripture unavailable');
    const label = translation === 'brenton' ? 'Brenton' : translation.toUpperCase();
    const fallback = translation !== requested
        ? (numberingFallback ? 'WEB used because this selection has no verified Brenton reader equivalent.' : `${label} used because this passage is unavailable in the selected translation.`)
        : reference !== selection.reference ? `Brenton reader reference for ${selection.reference}.` : null;
    return { date, reference, requestedTranslation: requested, translation, fallback, verses };
}
