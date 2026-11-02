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
    // LXX Psalm numbering is not interchangeable with the Hebrew-based schedule.
    // Use a disclosed WEB fallback until a reviewed versification map exists.
    const numberingFallback = requested === 'brenton' && selection.reference.startsWith('Psalms ');
    let translation = requested;
    let verses = numberingFallback ? null : resolveSimpleReference(selection.reference, requested);
    if (!verses) {
        translation = 'web';
        verses = resolveSimpleReference(selection.reference, 'web');
    }
    if (!verses)
        throw new Error('Scheduled Scripture unavailable');
    return { date, reference: selection.reference, requestedTranslation: requested, translation, fallback: translation !== requested ? (numberingFallback ? 'WEB used because Septuagint Psalm numbering differs.' : 'WEB used because this passage is unavailable in the selected translation.') : null, verses };
}
