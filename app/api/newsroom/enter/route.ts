import { NextRequest, NextResponse } from "next/server";

import { registerMember, getMember } from "@/lib/newsroom/membership";
import { verifyMonPayment } from "@/lib/monad/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TREASURY = process.env.NEWSROOM_TREASURY_ADDRESS ?? "";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      address?: string;
      txHash?: string;
    };

    const address = body.address?.trim();
    const txHash = body.txHash?.trim();

    if (!address || !txHash) {
      return NextResponse.json(
        { error: "Both 'address' and 'txHash' are required." },
        { status: 400 },
      );
    }

    if (!TREASURY) {
      return NextResponse.json(
        { error: "Treasury address not configured on server." },
        { status: 500 },
      );
    }

    /* Already a member? Return early */
    const existing = await getMember(address);
    if (existing) {
      return NextResponse.json({
        success: true,
        alreadyMember: true,
        membership: {
          address: existing.address,
          memberSince: existing.memberSince,
        },
      });
    }

    /* Verify on-chain payment */
    const verification = await verifyMonPayment(txHash, TREASURY);

    if (!verification.valid) {
      return NextResponse.json(
        {
          error: "Payment verification failed.",
          reason: verification.reason,
          details: {
            from: verification.from,
            to: verification.to,
            valueMon: verification.valueMon,
          },
        },
        { status: 400 },
      );
    }

    /* Check the sender matches */
    if (verification.from !== address.toLowerCase()) {
      return NextResponse.json(
        {
          error: "Transaction sender does not match the provided address.",
        },
        { status: 400 },
      );
    }

    /* Register */
    const record = await registerMember(address, txHash);

    return NextResponse.json(
      {
        success: true,
        membership: {
          address: record.address,
          memberSince: record.memberSince,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process entry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
