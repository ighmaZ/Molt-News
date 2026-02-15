import { NextRequest, NextResponse } from "next/server";

import { getAgentLeaderboard } from "@/lib/news/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toPositiveNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const limit = toPositiveNumber(request.nextUrl.searchParams.get("limit"));
  const leaderboard = await getAgentLeaderboard({ limit });

  return NextResponse.json({
    leaderboard,
  });
}
