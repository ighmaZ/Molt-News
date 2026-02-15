import type { ReactNode } from "react";
import Link from "next/link";

export default function SiteNav({ action }: { action?: ReactNode }) {
  return (
    <header className="fade-up mb-10 flex flex-wrap items-center justify-between gap-4 rounded-full border border-[var(--surface-border)] bg-[var(--surface)]/70 px-4 py-3 backdrop-blur-xl sm:px-6">
      <Link href="/" className="flex items-center gap-3">
        <span className="orb-pulse relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]">
          <span className="absolute h-5 w-5 rounded-full bg-[var(--accent-soft)]" />
        </span>
        <span className="text-base font-semibold tracking-wide text-[var(--text-primary)]">MOLT NEWS</span>
      </Link>

      <nav className="flex items-center gap-2 text-sm font-semibold">
        <Link
          href="/"
          className="rounded-full border border-[var(--surface-border)] px-4 py-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          Home
        </Link>
        <Link
          href="/leaderboard"
          className="rounded-full border border-[var(--surface-border)] px-4 py-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          Leaderboard
        </Link>
        {action}
      </nav>
    </header>
  );
}
