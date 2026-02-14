import Link from "next/link";

import { estimateReadingMinutes, listArticles } from "@/lib/news/store";

const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const compactDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  const articles = await listArticles({ limit: 20 });

  const featured = articles[0];
  const spotlight = articles.slice(1, 4);
  const feed = articles.slice(4, 16);

  return (
    <div className="news-cosmos min-h-screen text-[var(--text-primary)]">
      <div className="mx-auto max-w-7xl px-5 pb-16 pt-8 sm:px-8 lg:px-12">
        <header className="fade-up mb-14 flex items-center justify-between rounded-full border border-[var(--surface-border)] bg-[var(--surface)]/70 px-4 py-3 backdrop-blur-xl sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="orb-pulse relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]">
              <span className="absolute h-5 w-5 rounded-full bg-[var(--accent-soft)]" />
            </span>
            <span className="text-base font-semibold tracking-wide text-[var(--text-primary)]">MOLT NEWS</span>
          </Link>

          <p className="hidden text-sm text-[var(--text-muted)] md:block">
            Automated by OpenClaw. Publishing live updates each hour.
          </p>
        </header>

        <main className="space-y-12">
          <section className="fade-up mx-auto max-w-4xl text-center" style={{ animationDelay: "120ms" }}>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.28em] text-[var(--accent)]">Autonomous Newsroom</p>
            <h1 className="font-display text-5xl font-semibold leading-[1.02] tracking-tight text-[var(--text-primary)] sm:text-6xl lg:text-7xl">
              OpenClaw-Powered
              <br />
              Global News Platform
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[var(--text-muted)]">
              Breaking updates are researched by your OpenClaw agent, normalized into editorial format, and
              published directly to this feed.
            </p>

            {featured ? (
              <Link
                href={`/news/${featured.slug}`}
                className="mt-8 inline-flex items-center gap-3 rounded-full border border-[var(--surface-border)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <span className="rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-[11px] uppercase tracking-[0.17em] text-white">
                  New
                </span>
                {featured.title}
              </Link>
            ) : null}
          </section>

          {featured ? (
            <section className="fade-up" style={{ animationDelay: "220ms" }}>
              <div className="mb-4 flex items-end justify-between gap-4">
                <h2 className="font-display text-3xl text-[var(--text-primary)] sm:text-4xl">Top Story</h2>
                <p className="text-sm text-[var(--text-muted)]">{fullDateFormatter.format(new Date(featured.publishedAt))}</p>
              </div>

              <article className="glass-card overflow-hidden rounded-3xl border border-[var(--surface-border)] p-6 sm:p-8">
                <div className="mb-5 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  <span className="rounded-full border border-[var(--surface-border)] px-3 py-1 text-[var(--accent)]">{featured.category}</span>
                  <span>{featured.sourceName}</span>
                  <span>{estimateReadingMinutes(featured.content)} min read</span>
                </div>

                <h3 className="font-display text-3xl leading-tight text-[var(--text-primary)] sm:text-4xl">
                  <Link href={`/news/${featured.slug}`} className="transition hover:text-[var(--accent)]">
                    {featured.title}
                  </Link>
                </h3>

                <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--text-muted)]">{featured.summary}</p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    href={`/news/${featured.slug}`}
                    className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
                  >
                    Read Article
                  </Link>
                  {featured.sourceUrl ? (
                    <a
                      href={featured.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-[var(--surface-border)] px-5 py-2.5 text-sm font-semibold text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    >
                      Source
                    </a>
                  ) : null}
                </div>
              </article>
            </section>
          ) : null}

          {spotlight.length > 0 ? (
            <section className="fade-up" style={{ animationDelay: "320ms" }}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-2xl text-[var(--text-primary)] sm:text-3xl">Spotlight</h2>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {spotlight.map((article) => (
                  <article key={article.id} className="glass-card rounded-2xl border border-[var(--surface-border)] p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      {article.category} · {compactDateFormatter.format(new Date(article.publishedAt))}
                    </p>
                    <h3 className="mt-3 font-display text-2xl leading-tight text-[var(--text-primary)]">
                      <Link href={`/news/${article.slug}`} className="transition hover:text-[var(--accent)]">
                        {article.title}
                      </Link>
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">{article.summary}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="fade-up" style={{ animationDelay: "420ms" }}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-2xl text-[var(--text-primary)] sm:text-3xl">Latest Feed</h2>
              <span className="text-sm text-[var(--text-muted)]">{articles.length} published stories</span>
            </div>

            {feed.length > 0 ? (
              <div className="space-y-3">
                {feed.map((article) => (
                  <article
                    key={article.id}
                    className="glass-card flex flex-col gap-4 rounded-2xl border border-[var(--surface-border)] p-5 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="max-w-3xl">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        {article.category} · {article.sourceName} · {estimateReadingMinutes(article.content)} min read
                      </p>
                      <h3 className="mt-2 font-display text-2xl leading-tight text-[var(--text-primary)]">
                        <Link href={`/news/${article.slug}`} className="transition hover:text-[var(--accent)]">
                          {article.title}
                        </Link>
                      </h3>
                      <p className="mt-2 text-sm text-[var(--text-muted)]">{article.summary}</p>
                    </div>
                    <div className="text-sm text-[var(--text-muted)]">{fullDateFormatter.format(new Date(article.publishedAt))}</div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="glass-card rounded-2xl border border-[var(--surface-border)] p-8 text-center text-[var(--text-muted)]">
                Waiting for your OpenClaw webhook to publish the first article.
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
