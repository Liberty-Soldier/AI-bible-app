import { NextResponse } from "next/server";
import type { EmetEvidencePacket } from "@/app/lib/emet/EmetEvidencePacket";
import { explainWithEmet } from "@/app/lib/emet/EmetServer";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      packet?: EmetEvidencePacket | null;
    };

    if (!body.packet) {
      return NextResponse.json(
        {
          status: "insufficient-evidence",
          explanation: "No SEE evidence packet was provided to EMET.",
          citations: [],
          limitations: ["Missing packet."],
        },
        { status: 400 }
      );
    }

    const result = await explainWithEmet(body.packet);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        status: "insufficient-evidence",
        explanation: "EMET could not explain this evidence packet yet.",
        citations: [],
        limitations: ["Unexpected EMET server error."],
      },
      { status: 500 }
    );
  }
}