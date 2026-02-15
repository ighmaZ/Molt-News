import { NextRequest, NextResponse } from "next/server";

import { isValidAgentAddress, normalizeAgentAddress, upvoteArticle } from "@/lib/news/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpvotePayload = {
  address?: unknown;
  name?: unknown;
};

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    const { slug } = await context.params;
    const body = (await request.json()) as UpvotePayload;

    const address = toOptionalString(body.address);
    if (!address) {
      return NextResponse.json({ error: "address is required." }, { status: 400 });
    }

    const normalized = normalizeAgentAddress(address);
    if (!isValidAgentAddress(normalized)) {
      return NextResponse.json({ error: "address must be a valid EVM address." }, { status: 400 });
    }

    const result = await upvoteArticle(slug, {
      address: normalized,
      name: toOptionalString(body.name),
    });

    return NextResponse.json({
      added: result.added,
      article: {
        slug: result.article.slug,
        upvotes: result.article.upvoteAddresses.length,
        commentCount: result.article.comments.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upvote article.";
    const status = message === "Article not found." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
