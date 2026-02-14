import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { publishArticle } from "@/lib/news/store";
import type { PublishArticleInput } from "@/lib/news/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IncomingPayload = {
  externalId?: unknown;
  title?: unknown;
  slug?: unknown;
  summary?: unknown;
  content?: unknown;
  category?: unknown;
  sourceName?: unknown;
  sourceUrl?: unknown;
  imageUrl?: unknown;
  tags?: unknown;
  publishedAt?: unknown;
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

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.OPENCLAW_WEBHOOK_SECRET;
  if (!secret) {
    return false;
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return false;
  }

  const suppliedToken = header.slice("Bearer ".length).trim();
  return safeEqual(suppliedToken, secret);
}

function parsePayload(payload: IncomingPayload): PublishArticleInput {
  const title = toOptionalString(payload.title);
  const content = toOptionalString(payload.content);

  if (!title) {
    throw new Error("title is required");
  }

  if (!content) {
    throw new Error("content is required");
  }

  const tags = Array.isArray(payload.tags)
    ? payload.tags.filter((tag): tag is string => typeof tag === "string")
    : undefined;

  return {
    externalId: toOptionalString(payload.externalId),
    title,
    slug: toOptionalString(payload.slug),
    summary: toOptionalString(payload.summary),
    content,
    category: toOptionalString(payload.category),
    sourceName: toOptionalString(payload.sourceName),
    sourceUrl: toOptionalString(payload.sourceUrl),
    imageUrl: toOptionalString(payload.imageUrl),
    tags,
    publishedAt: toOptionalString(payload.publishedAt),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized webhook request. Check OPENCLAW_WEBHOOK_SECRET." },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json()) as IncomingPayload;
    const parsed = parsePayload(body);
    const { article, created } = await publishArticle(parsed);

    return NextResponse.json(
      {
        created,
        article: {
          id: article.id,
          slug: article.slug,
          title: article.title,
          publishedAt: article.publishedAt,
        },
      },
      { status: created ? 201 : 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to publish article.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
