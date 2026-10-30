"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { safeChatReturnHref } from "@/app/components/emet/chatPresentation";
import EmetChat, {
  type EmetChatUsage,
} from "@/app/components/emet/EmetChat";

export const OPEN_EMET_EVENT = "emetsees:open-emet";

type OpenEmetDetail = {
  question?: string;
};

export default function GlobalAskButton() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [initialQuestion, setInitialQuestion] = useState("");
  const [usage, setUsage] = useState<EmetChatUsage | null>(null);
  const [panelKey, setPanelKey] = useState(0);
  const [hasOpened, setHasOpened] = useState(false);
  const [serverEngine, setServerEngine] = useState<"simple" | "current">("simple");
  const [ownerDiagnostics, setOwnerDiagnostics] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);

  async function openEmet(question = "") {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
      const response = await fetch("/api/emet/session", { cache: "no-store" });
      if (response.status === 401) {
        const returnTo = safeChatReturnHref(`${window.location.pathname}${window.location.search}${window.location.hash}`);
        const params = new URLSearchParams();
        if (question.trim()) params.set("q", question.trim().slice(0, 800));
        if (returnTo) params.set("returnTo", returnTo);
        const next = `/emet${params.size ? `?${params.toString()}` : ""}`;
        router.push(`/auth?next=${encodeURIComponent(next)}`);
        return;
      }

      if (response.ok) {
        const payload = (await response.json()) as {
          usage?: EmetChatUsage | null;
          engine?: "simple" | "current";
          ownerDiagnostics?: boolean;
        };
        setUsage(payload.usage || null);
        setServerEngine(payload.engine === "current" ? "current" : "simple");
        setOwnerDiagnostics(payload.ownerDiagnostics === true);
      } else {
        setOwnerDiagnostics(false);
      }
    } catch {
      setUsage(null);
      setOwnerDiagnostics(false);
    }

    setInitialQuestion(question.trim().slice(0, 800));
    setPanelKey((value) => value + 1);
    setHasOpened(true);
    setOpen(true);
  }

  useEffect(() => {
    function handleOpen(event: Event) {
      const detail = (event as CustomEvent<OpenEmetDetail>).detail;
      void openEmet(detail?.question || "");
    }

    window.addEventListener(OPEN_EMET_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_EMET_EVENT, handleOpen);
  });

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = originalOverflow;
      returnFocusRef.current?.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => { setOpen(false); }, [pathname]);

  if (pathname.startsWith("/auth") || pathname.startsWith("/emet")) {
    return null;
  }

  return (
    <>
      {hasOpened ? (
        <div hidden={!open} className="fixed inset-0 z-[130]">
          <button
            type="button"
            aria-label="Close Ask EMET"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
          />
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal={open ? true : undefined}
            aria-label="Ask EMET"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
              }
              if (event.key === "Tab") {
                const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') || [])
                  .filter((control) => control.getClientRects().length > 0);
                if (!controls?.length) return;
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
                  event.preventDefault();
                  last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus();
                }
              }
            }}
            className="absolute bottom-0 left-1/2 h-[96dvh] w-full max-w-3xl -translate-x-1/2 overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--canvas)] text-[var(--foreground)] sm:bottom-3 sm:h-[calc(100dvh-1.5rem)] sm:rounded-2xl"
          >
            <EmetChat
              active={open}
              launchKey={panelKey}
              initialUsage={usage}
              initialEngine={serverEngine}
              initialOwnerDiagnostics={ownerDiagnostics}
              initialQuestion={initialQuestion}
              onClose={() => setOpen(false)}
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
