import { NextRequest, NextResponse } from "next/server";

import { getMember } from "@/lib/newsroom/membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const address = request.nextUrl.searchParams.get("address")?.trim();

  if (!address) {
    return NextResponse.json(
      { error: "Query parameter 'address' is required." },
      { status: 400 },
    );
  }

  try {
    const member = await getMember(address);

    if (!member) {
      return NextResponse.json({ isMember: false, address: address.toLowerCase() });
    }

    return NextResponse.json({
      isMember: true,
      address: member.address,
      memberSince: member.memberSince,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to check membership.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
