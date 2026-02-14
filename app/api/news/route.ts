import { NextRequest, NextResponse } from "next/server";

import { estimateReadingMinutes, getArticleBySlug, listArticles } from "@/lib/news/store";

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
  const slug = request.nextUrl.searchParams.get("slug");

  if (slug) {
    const article = await getArticleBySlug(slug);

    if (!article) {
      return NextResponse.json({ error: "Article not found." }, { status: 404 });
    }

    return NextResponse.json({
      article: {
        ...article,
        readingMinutes: estimateReadingMinutes(article.content),
      },
    });
  }

  const articles = await listArticles({ limit });

  return NextResponse.json({
    articles: articles.map((article) => ({
      id: article.id,
      title: article.title,
      slug: article.slug,
      summary: article.summary,
      category: article.category,
      sourceName: article.sourceName,
      sourceUrl: article.sourceUrl,
      imageUrl: article.imageUrl,
      tags: article.tags,
      publishedAt: article.publishedAt,
      readingMinutes: estimateReadingMinutes(article.content),
    })),
  });
}
