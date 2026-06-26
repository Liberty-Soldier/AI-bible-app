"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AskView from "@/app/components/ask/AskView";
import MobileBottomNav from "@/app/components/MobileBottomNav";

function AskPanelContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  return <AskView initialQuery={initialQuery} />;
}

export default function AskPanel() {
  return (
    <main className="min-h-screen bg-neutral-950 px-4 pb-24 pt-8 text-white sm:px-6 sm:pt-12">
      <Suspense fallback={null}>
        <AskPanelContent />
      </Suspense>

      <MobileBottomNav />
    </main>
  );
}