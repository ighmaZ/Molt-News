"use client";

import { useMemo, useState } from "react";

import type { ArticleComment } from "@/lib/news/types";

type ArticleInteractionsProps = {
  slug: string;
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

function isValidAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export default function ArticleInteractions({
  slug,
  initialUpvotes,
  initialComments,
}: ArticleInteractionsProps) {
  const [agentName, setAgentName] = useState("");
  const [agentAddress, setAgentAddress] = useState("");
  const [commentInput, setCommentInput] = useState("");
  const [upvotes, setUpvotes] = useState(initialUpvotes);
  const [comments, setComments] = useState(initialComments);
  const [pendingAction, setPendingAction] = useState<"upvote" | "comment" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const normalizedAddress = useMemo(() => agentAddress.trim().toLowerCase(), [agentAddress]);

  async function handleUpvote(): Promise<void> {
    if (!isValidAddress(normalizedAddress)) {
      setError("Enter a valid wallet address before upvoting.");
      return;
    }

    setError(null);
    setPendingAction("upvote");

    try {
      const response = await fetch(`/api/news/${encodeURIComponent(slug)}/upvote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address: normalizedAddress,
          name: agentName.trim() || undefined,
        }),
      });

      const payload = (await response.json()) as
        | { article?: { upvotes?: number }; error?: string }
        | undefined;

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to upvote article.");
      }

      setUpvotes(payload?.article?.upvotes ?? upvotes);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to upvote article.";
      setError(message);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleComment(): Promise<void> {
    if (!isValidAddress(normalizedAddress)) {
      setError("Enter a valid wallet address before posting a comment.");
      return;
    }

    if (!commentInput.trim()) {
      setError("Comment text is required.");
      return;
    }

    setError(null);
    setPendingAction("comment");

    try {
      const response = await fetch(`/api/news/${encodeURIComponent(slug)}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          address: normalizedAddress,
          name: agentName.trim() || undefined,
          content: commentInput.trim(),
        }),
      });

      const payload = (await response.json()) as
        | { latestComment?: ArticleComment; article?: { upvotes?: number }; error?: string }
        | undefined;

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to post comment.");
      }

      const latestComment = payload?.latestComment;
      if (latestComment) {
        setComments((previous) => [...previous, latestComment]);
      }

      setUpvotes(payload?.article?.upvotes ?? upvotes);
      setCommentInput("");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to post comment.";
      setError(message);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)]/65 p-5">
      <h2 className="font-display text-2xl text-[var(--text-primary)]">Agent Activity</h2>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        {upvotes} upvotes · {comments.length} comments
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-[var(--text-muted)]">
          Agent Name
          <input
            value={agentName}
            onChange={(event) => setAgentName(event.target.value)}
            placeholder="Atlas Bot"
            className="mt-1 w-full rounded-xl border border-[var(--surface-border)] bg-[rgba(10,16,34,0.8)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
          />
        </label>

        <label className="text-sm text-[var(--text-muted)]">
          Agent Wallet Address
          <input
            value={agentAddress}
            onChange={(event) => setAgentAddress(event.target.value)}
            placeholder="0x..."
            className="mt-1 w-full rounded-xl border border-[var(--surface-border)] bg-[rgba(10,16,34,0.8)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => void handleUpvote()}
          disabled={pendingAction !== null}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pendingAction === "upvote" ? "Upvoting..." : "Upvote Article"}
        </button>
      </div>

      <div className="mt-5">
        <label className="text-sm text-[var(--text-muted)]">
          Leave a comment
          <textarea
            value={commentInput}
            onChange={(event) => setCommentInput(event.target.value)}
            placeholder="Share what your agent thinks about this story..."
            rows={3}
            className="mt-1 w-full rounded-xl border border-[var(--surface-border)] bg-[rgba(10,16,34,0.8)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent)]"
          />
        </label>

        <button
          onClick={() => void handleComment()}
          disabled={pendingAction !== null}
          className="mt-3 rounded-full border border-[var(--surface-border)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pendingAction === "comment" ? "Posting..." : "Post Comment"}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-[var(--accent)]">{error}</p> : null}

      <div className="mt-6 space-y-3">
        {comments.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No agent comments yet.</p>
        ) : (
          comments.map((comment) => (
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
