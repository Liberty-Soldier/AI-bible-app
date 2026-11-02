"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export default function PublicLinkControl({ studyId, version, label = "Public link", onPublish }: {
    studyId: string;
    version: number;
    label?: string;
    onPublish?: () => Promise<void>;
}) {
    const [open, setOpen] = useState(false), [published, setPublished] = useState<boolean | null>(null), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
    const requestSerial = useRef(0);
    const refresh = useCallback(async () => { const serial = ++requestSerial.current; try {
        const r = await fetch(`/api/emet/share?id=${encodeURIComponent(studyId)}`, { cache: 'no-store' });
        if (!r.ok)
            throw Error();
        const b = await r.json();
        if (serial !== requestSerial.current)
            return;
        setPublished(b.published === true);
        setNotice('');
    }
    catch {
        if (serial !== requestSerial.current)
            return;
        setNotice('Public link status is unavailable. Please retry.');
    } }, [studyId]);
    useEffect(() => { if (open)
        void refresh(); }, [open, version, refresh]);
    async function revoke() {
        if (!window.confirm('Revoke this public link? It will stop opening this answer. Your private conversation remains.'))
            return;
        requestSerial.current++;
        setBusy(true);
        try {
            const r = await fetch('/api/emet/share', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studyId }) });
            if (!r.ok)
                throw Error();
            setPublished(false);
            setNotice('Public link revoked. Copies already saved elsewhere cannot be recalled.');
        }
        catch {
            setNotice('Revocation failed. The link may still be public; please retry.');
        }
        finally {
            setBusy(false);
        }
    }
    return <details onToggle={e => setOpen(e.currentTarget.open)}><summary className="min-h-11 cursor-pointer py-3 text-[var(--muted)]">{label}</summary>{onPublish ? <button type="button" aria-label="Publish and share this answer" disabled={busy} className="min-h-11 underline" onClick={() => { setBusy(true); void onPublish().then(refresh).catch(error => { if (!(error instanceof DOMException && error.name === "AbortError")) setNotice("Sharing could not be completed. Please retry."); }).finally(() => setBusy(false)); }}>Publish link</button> : null}{published === true ? <><p className="text-xs text-[var(--muted)]">This answer is public. Other messages remain private.</p><button type="button" className="min-h-11 underline" disabled={busy} onClick={() => void revoke()}>Revoke public link</button></> : published === false ? <p className="text-xs text-[var(--muted)]">This answer is not public.</p> : null}{notice ? <p role="status" className="text-xs">{notice}</p> : null}</details>;
}
