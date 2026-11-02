"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export type HistoryTurn = {
    request_id: string;
    question: string;
    state: string;
    response: Record<string, unknown> | null;
    imported: boolean;
    context?: unknown;
    http_status?: number;
};
type Conversation = {
    id: string;
    title: string;
    revision: number;
    updated_at: string;
};
export default function ConversationHistory({ userId, activeId, pending, enabled, onOpen, legacy, ownerLegacy, onAvailability }: {
    userId?: string;
    activeId: string;
    pending: boolean;
    enabled: boolean;
    onOpen: (id: string, turns: HistoryTurn[], revision?: number) => void;
    legacy: () => unknown[];
    ownerLegacy?: () => unknown[];
    onAvailability: (ready: boolean) => void;
}) {
    const [items, setItems] = useState<Conversation[]>([]);
    const [notice, setNotice] = useState('');
    const [cursor, setCursor] = useState<string | null>(null);
    const loadedOlder = useRef(false);
    const [opened, setOpened] = useState(false);
    const [editing, setEditing] = useState('');
    const [managing, setManaging] = useState('');
    const [title, setTitle] = useState('');
    const [busy, setBusy] = useState(false);
    const revision = useRef(new Map<string, number>());
    const currentId = useRef(activeId);
    currentId.current = activeId;
    const callbacks = useRef({ onOpen, onAvailability, pending });
    callbacks.current = { onOpen, onAvailability, pending };
    const refresh = useCallback(async () => {
        if (!userId || !enabled)
            return;
        try {
            const r = await fetch('/api/emet/conversations', { cache: 'no-store' });
            if (!r.ok)
                throw Error();
            const body = await r.json();
            if (body.userId !== userId) {
                callbacks.current.onOpen("", []);
                throw Error();
            }
            setItems(previous => {
                if (!loadedOlder.current)
                    return body.conversations;
                const last = body.conversations.at(-1);
                const older = previous.filter(i => last && i.updated_at < last.updated_at && !body.conversations.some((n: Conversation) => n.id === i.id));
                return [...body.conversations, ...older];
            });
            if (!loadedOlder.current)
                setCursor(body.nextCursor || null);
            callbacks.current.onAvailability(true);
            setNotice('');
            const selected = body.conversations.find((c: Conversation) => c.id === activeId);
            if (selected && !pending && revision.current.get(activeId) !== selected.revision) {
                const turns: HistoryTurn[] = [];
                let after = 0;
                for (;;) {
                    const response = await fetch(`/api/emet/conversations?id=${activeId}&after=${after}`, { cache: 'no-store' });
                    if (!response.ok)
                        throw Error();
                    const data = await response.json();
                    turns.push(...data.turns);
                    if (data.turns.length < 200)
                        break;
                    after = data.turns.at(-1).sequence;
                }
                if (currentId.current !== activeId || callbacks.current.pending)
                    return;
                revision.current.set(activeId, selected.revision);
                callbacks.current.onOpen(activeId, turns, selected.revision);
            }
            else if (!selected && revision.current.has(activeId) && !pending) {
                setNotice('This conversation was deleted on another device. Start a new conversation to continue.');
                callbacks.current.onAvailability(false);
            }
        }
        catch {
            setNotice('Cloud history is unavailable. Your browser copy is retained; generation pauses until synchronization recovers.');
            callbacks.current.onAvailability(false);
        }
    }, [userId, enabled, activeId, pending]);
    useEffect(() => { void refresh(); if (!enabled)
        return; const timer = setInterval(() => void refresh(), 5000); const focus = () => void refresh(); window.addEventListener('focus', focus); return () => { clearInterval(timer); window.removeEventListener('focus', focus); }; }, [refresh, enabled]);
    async function more() {
        if (!cursor || busy)
            return;
        setBusy(true);
        try {
            const r = await fetch(`/api/emet/conversations?cursor=${encodeURIComponent(cursor)}`, { cache: 'no-store' });
            if (!r.ok)
                throw Error();
            const b = await r.json();
            if (b.userId !== userId)
                throw Error();
            loadedOlder.current = true;
            setItems(previous => [...previous, ...b.conversations.filter((i: Conversation) => !previous.some(p => p.id === i.id))]);
            setCursor(b.nextCursor || null);
        }
        catch {
            setNotice('Older conversations could not be loaded. Please retry.');
        }
        finally {
            setBusy(false);
        }
    }
    async function edit(item: Conversation, remove = false) {
        if (remove && !window.confirm('Delete this conversation from your account on all devices?'))
            return;
        setBusy(true);
        try {
            const r = await fetch('/api/emet/conversations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, revision: item.revision, ...(remove ? { delete: true } : { title }) }) });
            if (!r.ok) {
                setNotice(r.status === 409 ? 'Conversation changed on another device. Refresh and try again.' : 'History could not be saved.');
                return;
            }
            if (remove)
                setItems(previous => previous.filter(i => i.id !== item.id));
            setEditing('');
            await refresh();
        }
        catch {
            setNotice('History could not be saved. Please retry.');
        }
        finally {
            setBusy(false);
        }
    }
    async function importLegacy(ownerHistory = false) {
        if (!window.confirm('Only import if this browser history belongs to you. It will be saved privately to your signed-in account. Existing browser data will remain.'))
            return;
        setBusy(true);
        try {
            const r = await fetch('/api/emet/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmOwnership: true, turns: ownerHistory ? ownerLegacy?.() : legacy() }) });
            if (!r.ok)
                throw Error();
            const body = await r.json();
            revision.current.delete(body.id);
            callbacks.current.onOpen(body.id, []);
            await refresh();
            setNotice('Browser history imported privately. Reopen it from History.');
        }
        catch {
            setNotice('Import failed. Original browser history is untouched.');
        }
        finally {
            setBusy(false);
        }
    }
    if (!userId)
        return null;
    return <div className="px-3 sm:px-5">
  <button type="button" aria-expanded={opened} onClick={() => setOpened(!opened)} className="min-h-11 text-sm text-[var(--muted)]">History</button>
  {notice ? <p role="status" className="pb-2 text-sm">{notice}</p> : null}
  {opened ? <section aria-label="Conversation history" className="max-h-[min(45dvh,24rem)] overflow-y-auto border-b border-[var(--border)] pb-3">
   <p className="text-xs text-[var(--muted)]">Private to your account · synchronizes across devices</p>
   {items.length ? <ul>{items.map(item => <li key={item.id} className="flex flex-wrap items-center gap-x-2 py-0.5 text-sm">
    {editing === item.id ? <form onSubmit={e => { e.preventDefault(); void edit(item); }} className="flex flex-wrap gap-2"><input aria-label="Conversation name" maxLength={120} value={title} onChange={e => setTitle(e.target.value)} className="min-h-11 rounded border border-[var(--border)] bg-[var(--canvas)] px-2"/><button disabled={busy} className="min-h-11">Save</button><button type="button" className="min-h-11" onClick={() => setEditing('')}>Cancel</button></form> : <><button disabled={pending || busy} className="min-h-11 min-w-0 flex-1 truncate text-left disabled:opacity-50" aria-current={activeId === item.id ? 'true' : undefined} onClick={() => { revision.current.delete(item.id); callbacks.current.onOpen(item.id, []); setOpened(false); }}>{item.title}</button><button type="button" className="min-h-11 min-w-11" title="Conversation options" aria-label={`Manage conversation: ${item.title}`} aria-expanded={managing === item.id} disabled={pending || busy} onClick={() => setManaging(managing === item.id ? '' : item.id)}><span aria-hidden="true">⋯</span></button>{managing === item.id ? <div className="flex w-full justify-end gap-4"><button className="min-h-11" disabled={pending || busy} onClick={() => { setEditing(item.id); setTitle(item.title); setManaging(''); }}>Rename</button><button className="min-h-11" disabled={pending || busy} onClick={() => void edit(item, true)}>Delete</button></div> : null}</>}
   </li>)}</ul> : <p className="py-3 text-sm">Your saved conversations will appear here.</p>}
   {cursor ? <button className="min-h-11 text-sm underline" disabled={busy} onClick={() => void more()}>Load older conversations</button> : null}
   {ownerLegacy?.().length ? <button className="min-h-11 text-sm underline" disabled={pending || busy} onClick={() => void importLegacy(true)}>Import my previous owner-test conversation</button> : null}
   {legacy().length ? <button className="min-h-11 text-sm underline" disabled={pending || busy} onClick={() => void importLegacy()}>Import my existing browser history</button> : null}
  </section> : null}
 </div>;
}
