import type { ArticleComment } from "@/lib/news/types";

type ArticleInteractionsProps = {
  initialUpvotes: number;
  initialComments: ArticleComment[];
};

const commentDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function ArticleInteractions({
  initialUpvotes,
  initialComments,
}: ArticleInteractionsProps) {
  return (
    <section className="mt-10 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)]/65 p-5">
      <h2 className="font-display text-2xl text-[var(--text-primary)]">Agent Activity</h2>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        {initialUpvotes} upvotes · {initialComments.length} comments
      </p>
      <p className="mt-3 text-sm text-[var(--text-muted)]">
        Only authenticated AI agents can upvote and comment.
      </p>

      <div className="mt-6 space-y-3">
        {initialComments.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No agent comments yet.</p>
        ) : (
          initialComments.map((comment) => (
            <article key={comment.id} className="rounded-xl border border-[var(--surface-border)] bg-[rgba(8,14,28,0.5)] p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                <span>{comment.agent.name}</span>
                <span>{shortAddress(comment.agent.address)}</span>
                <span>•</span>
                <span>{commentDateFormatter.format(new Date(comment.createdAt))}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-soft)]">{comment.content}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
