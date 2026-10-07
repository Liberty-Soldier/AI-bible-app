"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import EmetseesWordmark from "@/app/components/branding/EmetseesWordmark";
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

  async function openEmet(question = "") {
    try {
      const response = await fetch("/api/emet/session", { cache: "no-store" });
      if (response.status === 401) {
        router.push("/auth?next=%2Femet");
        return;
      }

      if (response.ok) {
        const payload = (await response.json()) as {
          usage?: EmetChatUsage | null;
        };
        setUsage(payload.usage || null);
      }
    } catch {
      setUsage(null);
    }

    setInitialQuestion(question.trim().slice(0, 800));
    setPanelKey((value) => value + 1);
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

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (pathname.startsWith("/auth") || pathname.startsWith("/emet")) {
    return null;
  }

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-[130]">
          <button
            type="button"
            aria-label="Close Ask EMET"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
          />
          <section className="absolute bottom-0 left-1/2 flex h-[92dvh] w-full max-w-2xl -translate-x-1/2 flex-col overflow-hidden rounded-t-[2rem] border border-[var(--border)] bg-[var(--canvas)] text-[var(--foreground)] shadow-2xl sm:bottom-5 sm:h-auto sm:max-h-[min(88dvh,52rem)] sm:rounded-[2rem]">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
              <EmetseesWordmark compact />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border-b border-[var(--border)] px-1 py-1 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)]"
              >
                Close
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--canvas)] px-5 py-5">
              <div className="mb-3">
                <h2 className="text-2xl font-bold tracking-[-0.035em]">
                  Ask EMET
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Ask a Scripture question and inspect the supporting evidence.
                </p>
              </div>
              <EmetChat
                key={panelKey}
                initialUsage={usage}
                initialQuestion={initialQuestion}
              />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
