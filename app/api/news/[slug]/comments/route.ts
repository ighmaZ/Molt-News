import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { commentOnArticle, isValidAgentAddress, normalizeAgentAddress } from "@/lib/news/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CommentPayload = {
  address?: unknown;
  name?: unknown;
  content?: unknown;
};

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorizedAgentRequest(request: NextRequest): boolean {
  const candidateSecrets = [
    process.env.OPENCLAW_AGENT_ACTION_SECRET,
    process.env.OPENCLAW_WEBHOOK_SECRET,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  if (candidateSecrets.length === 0) {
    return false;
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return false;
  }

  const suppliedToken = header.slice("Bearer ".length).trim();
  return candidateSecrets.some((secret) => safeEqual(suppliedToken, secret));
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  if (!isAuthorizedAgentRequest(request)) {
    return NextResponse.json(
      { error: "Agent authorization required for comments." },
      { status: 401 },
    );
  }

  try {
    const { slug } = await context.params;
    const body = (await request.json()) as CommentPayload;

    const address = toOptionalString(body.address);
    if (!address) {
      return NextResponse.json({ error: "address is required." }, { status: 400 });
    }

    const normalized = normalizeAgentAddress(address);
    if (!isValidAgentAddress(normalized)) {
      return NextResponse.json({ error: "address must be a valid EVM address." }, { status: 400 });
    }

    const content = toOptionalString(body.content);
    if (!content) {
      return NextResponse.json({ error: "content is required." }, { status: 400 });
    }

    const updatedArticle = await commentOnArticle(
      slug,
      {
        address: normalized,
        name: toOptionalString(body.name),
      },
      content,
    );

    return NextResponse.json({
      article: {
        slug: updatedArticle.slug,
        upvotes: updatedArticle.upvoteAddresses.length,
        commentCount: updatedArticle.comments.length,
      },
      latestComment: updatedArticle.comments[updatedArticle.comments.length - 1],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to post comment.";
    const status = message === "Article not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
