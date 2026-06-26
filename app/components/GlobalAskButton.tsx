"use client";

import { Suspense, useState } from "react";
import AskPanel from "@/app/components/AskPanel";

export default function GlobalAskButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-5 z-50 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black shadow-lg"
      >
        Ask
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] bg-black/50">
          <button
            type="button"
            aria-label="Close Ask Scripture"
            onClick={() => setOpen(false)}
            className="absolute inset-0"
          />

          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-[2rem] bg-neutral-950 text-white">
            <div className="sticky top-0 z-10 bg-neutral-950 px-5 pt-4">
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutral-700" />

              <div className="mb-4 flex items-center justify-between border-b border-neutral-900 pb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">
                    BibleIQ
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold">Ask Scripture</h2>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="px-4 pb-8">
              <Suspense fallback={null}>
                <AskPanel />
              </Suspense>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}