import { Suspense } from "react";
import AskPanel from "@/app/components/AskPanel";

export default function AskPage() {
  return (
    <Suspense fallback={null}>
      <AskPanel />
    </Suspense>
  );
}