"use client";
import Link from "next/link";
import { normalizeReaderChapter } from "../data/scripture/ReaderVerseAdapter";
import { useEffect, useState } from "react";
import { getPreferredTranslation, buildReaderHref } from "../lib/translationPreference";
import { toggleBookmarks, areAllBookmarked, type ReaderMemoryVerse } from "../lib/readerMemory";
import { useSacredNames } from "../data/useSacredNames";
import { renderSacredNames } from "../data/renderSacredNames";
import type { dailyPassage } from "../lib/daily/passage";
type Passage = NonNullable<ReturnType<typeof dailyPassage>>;
export function localCalendarDate(now = new Date()) { return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
export default function DailyPassage() {
    const [passage, setPassage] = useState<Passage | null>(null);
    const [message, setMessage] = useState('');
    const [feedback, setFeedback] = useState('');
    const [saved, setSaved] = useState(false);
    const [bookmarkVerses, setBookmarkVerses] = useState<ReaderMemoryVerse[]>([]);
    const { sacredNames } = useSacredNames();
    useEffect(() => {
        if (!feedback) return;
        const timer = window.setTimeout(() => setFeedback(''), 4000);
        return () => window.clearTimeout(timer);
    }, [feedback]);
    useEffect(() => {
        let controller: AbortController | undefined;
        let lastKey = '';
        function load() {
            const date = localCalendarDate(), translation = getPreferredTranslation();
            const key = `${date}:${translation}`;
            if (key === lastKey)
                return;
            lastKey = key;
            controller?.abort();
            controller = new AbortController();
            void fetch(`/api/daily-passage?date=${date}&translation=${translation}`, { signal: controller.signal }).then(async (r) => { if (!r.ok)
                throw Error(); return r.json(); }).then(async (p: Passage) => {
                setPassage(p);
                setMessage('');
                setBookmarkVerses([]);
                const m = p.verses[0].reference.match(/^(.+) (\d+):/)!;
                const book = m[1].replace(/[^1-3A-Za-z ]/g, '').trim().replace(/\s+/g, '_');
                try {
                    const r = await fetch(`/scripture/runtime/${p.translation}/${book}/${m[2]}.json`, { signal: controller?.signal });
                    if (!r.ok)
                        throw Error();
                    const chapter = normalizeReaderChapter(await r.json());
                    const memory = p.verses.map(v => { const row = chapter.verses.find(row => row.reference === v.reference); return row ? { id: row.id, book: row.book, chapter: row.chapter, verse: row.verse, verseLabel: row.verseLabel, reference: v.reference, text: v.text, translation: v.translation } : null; });
                    if (memory.every(v => v !== null)) {
                        setBookmarkVerses(memory as ReaderMemoryVerse[]);
                        setSaved(areAllBookmarked(memory as ReaderMemoryVerse[]));
                    }
                }
                catch { /* Reader remains available; avoid creating a competing bookmark identity. */ }
            }).catch(e => { if (e.name !== 'AbortError') {
                lastKey = '';
                setMessage('Today’s passage is unavailable. You can still open the Bible.');
            } });
        }
        load();
        const timer = window.setInterval(load, 30000);
        let midnightTimer: ReturnType<typeof setTimeout>;
        function atMidnight() {
            const now = new Date();
            const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            midnightTimer = setTimeout(() => { load(); atMidnight(); }, midnight.getTime() - now.getTime());
        }
        atMidnight();
        window.addEventListener('focus', load);
        window.addEventListener('storage', load);
        return () => { controller?.abort(); clearInterval(timer); clearTimeout(midnightTimer); window.removeEventListener('focus', load); window.removeEventListener('storage', load); };
    }, []);
    const verses: ReaderMemoryVerse[] = passage?.verses.map(v => { const m = v.reference.match(/^(.+) (\d+):(\d+[a-z]?)$/)!; return { id: `${v.translation}:${m[1]}:${m[2]}:${m[3]}`, book: m[1], chapter: Number(m[2]), verse: Number.parseInt(m[3]), verseLabel: m[3], reference: v.reference, text: v.text, translation: v.translation }; }) || [];
    const exactText = passage ? `${passage.reference} (${passage.translation === 'brenton' ? 'Brenton' : passage.translation.toUpperCase()})\n\n${passage.verses.map(v => v.text).join('\n')}` : '';
    async function act(action: 'copy' | 'share') {
        setFeedback('');
        try {
            if (action === 'share' && navigator.share)
                await navigator.share({ title: passage?.reference, text: exactText });
            else {
                await navigator.clipboard.writeText(exactText);
                setFeedback(action === 'copy' ? 'Copied.' : 'Copied for sharing.');
            }
        }
        catch (e) {
            if (!(e instanceof DOMException && e.name === 'AbortError'))
                setFeedback('Sharing was unavailable. Please try copying the passage.');
        }
    }
    const first = verses[0];
    const excerpt = passage && passage.verses.length > 3 ? passage.verses.slice(0, 2) : passage?.verses || [];
    const isExcerpt = !!passage && excerpt.length < passage.verses.length;
    return <section aria-labelledby="daily-passage-title" className="my-9 py-2">
  <h2 id="daily-passage-title" className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Scripture for today</h2>
  {passage && first ? <>
   <p className="mt-3 text-sm text-[var(--muted)]">{passage.reference} · {passage.translation === 'brenton' ? 'Brenton' : passage.translation.toUpperCase()}</p>
   {isExcerpt ? <p className="mt-1 text-xs text-[var(--muted)]">Excerpt from today’s passage · {excerpt[0].reference}–{excerpt.at(-1)!.reference.split(":").at(-1)}</p> : null}
   <blockquote data-daily-excerpt className="mt-3 space-y-2 font-serif text-lg leading-7 sm:text-2xl sm:leading-relaxed">{excerpt.map(v => <p key={v.reference}>{sacredNames ? renderSacredNames(v.text, v.reference) : v.text}</p>)}</blockquote>
   {passage.fallback ? <p className="mt-3 text-sm text-[var(--muted)]">{passage.fallback}</p> : null}
   <div className="mt-4 flex flex-wrap gap-x-5 text-sm">
    <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href={buildReaderHref({ book: first.book, chapter: first.chapter, verse: first.verseLabel, translation: passage.translation })}>Read full passage</Link>
    <button className="min-h-11" disabled={!bookmarkVerses.length} aria-pressed={saved} onClick={() => { toggleBookmarks(bookmarkVerses); setSaved(areAllBookmarked(bookmarkVerses)); }}> {saved ? 'Bookmarked' : 'Bookmark'}</button>
    <button aria-label="Copy full passage" className="min-h-11" onClick={() => void act('copy')}>Copy</button><button aria-label="Share full passage" className="min-h-11" onClick={() => void act('share')}>Share</button>
   </div>
  </> : <p className="mt-4 text-sm text-[var(--muted)]">{message || 'Opening today’s Scripture…'}</p>}
  {passage && message ? <p role="status" className="text-sm text-[var(--muted)]">{message}</p> : null}
  {feedback ? <p role="status" className="text-sm text-[var(--muted)]">{feedback}</p> : null}
 </section>;
}
