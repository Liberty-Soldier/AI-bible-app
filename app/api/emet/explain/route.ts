import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function disabledResponse() {
  return NextResponse.json(
    {
      status: "disabled",
      explanation:
        "Live EMET is not available in the free-reader release.",
      citations: [],
      limitations: [
        "Live AI requires authenticated premium access and usage controls.",
      ],
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    },
  );
}

export async function GET() {
  return disabledResponse();
}

export async function POST() {
  return disabledResponse();
}
