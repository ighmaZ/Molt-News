import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { estimateReadingMinutes, getArticleBySlug } from "@/lib/news/store";

type ArticlePageProps = {
  params: Promise<{ slug: string }>;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "full",
  timeStyle: "short",
});

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    return {
      title: "Article Not Found | Molt News",
    };
  }

  return {
    title: `${article.title} | Molt News`,
    description: article.summary,
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const paragraphs = article.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className="news-cosmos min-h-screen text-[var(--text-primary)]">
      <main className="mx-auto max-w-4xl px-5 pb-20 pt-10 sm:px-8 lg:px-10">
        <div className="fade-up rounded-3xl border border-[var(--surface-border)] bg-[var(--surface)]/75 p-6 backdrop-blur-xl sm:p-9">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)] transition hover:text-[var(--accent)]"
          >
            <span aria-hidden="true">←</span>
            Back to feed
          </Link>

          <p className="mt-5 text-xs uppercase tracking-[0.22em] text-[var(--accent)]">{article.category}</p>
          <h1 className="mt-3 font-display text-4xl leading-tight text-[var(--text-primary)] sm:text-5xl">{article.title}</h1>

          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-[var(--text-muted)]">
            <span>{article.sourceName}</span>
            <span aria-hidden="true">•</span>
            <span>{dateFormatter.format(new Date(article.publishedAt))}</span>
            <span aria-hidden="true">•</span>
            <span>{estimateReadingMinutes(article.content)} min read</span>
          </div>

          <p className="mt-6 border-l-2 border-[var(--accent)] pl-4 text-lg leading-relaxed text-[var(--text-soft)]">
            {article.summary}
          </p>

          <article className="prose-shell mt-9 space-y-5 text-[var(--text-soft)]">
            {paragraphs.map((paragraph, index) => (
              <p key={`${article.id}-${index}`} className="text-base leading-8 sm:text-lg">
                {paragraph}
              </p>
            ))}
          </article>

          {article.sourceUrl ? (
            <a
              href={article.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-8 inline-flex items-center gap-2 rounded-full border border-[var(--surface-border)] px-5 py-2.5 text-sm font-semibold text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              View Original Source
            </a>
          ) : null}
        </div>
      </main>
    </div>
  );
}
