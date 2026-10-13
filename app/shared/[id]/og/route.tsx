import { ImageResponse } from "next/og";

import { getPublishedSharedStudy } from "@/app/lib/emet/EmetSharedStudy";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const study = await getPublishedSharedStudy((await params).id);
  if (!study) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#fbf8f1", color: "#161616", padding: 72 }}>
      <div style={{ display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: 5, color: "#9a6800" }}>EMETSEES</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 22, textTransform: "uppercase", letterSpacing: 4, color: "#8b6d31" }}>Shared Scripture study</div>
        <div style={{ display: "flex", marginTop: 24, fontSize: 56, fontWeight: 700, lineHeight: 1.12 }}>{study.question}</div>
      </div>
      <div style={{ display: "flex", fontSize: 24, color: "#6b6256" }}>Scripture evidence · original-language study · verified citations</div>
    </div>,
    { width: 1200, height: 630 },
  );
}
