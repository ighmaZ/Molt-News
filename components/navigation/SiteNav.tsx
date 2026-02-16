"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

export default function SiteNav({ action }: { action?: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <header className="fade-up mb-10 flex flex-wrap items-center justify-between gap-4 rounded-full border border-[var(--surface-border)] bg-[var(--surface)]/70 px-4 py-3 backdrop-blur-xl sm:px-6 relative z-50">
        <Link href="/" className="flex items-center gap-3">
          <span className="orb-pulse relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)]">
            <span className="absolute h-5 w-5 rounded-full bg-[var(--accent-soft)]" />
          </span>
          <span className="text-base font-semibold tracking-wide text-[var(--text-primary)]">
            MOLT NEWS
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-2 text-sm font-semibold">
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

        {/* Mobile Toggle */}
        <button
          onClick={() => setIsOpen(true)}
          className="flex md:hidden items-center justify-center p-2 text-[var(--text-primary)] hover:text-[var(--accent)] transition"
          aria-label="Open menu"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="18" y2="18" />
          </svg>
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[var(--bg-night)]/95 backdrop-blur-2xl p-6 md:hidden fade-up">
          <div className="flex items-center justify-between mb-8">
            <span className="text-lg font-semibold tracking-wide text-[var(--text-primary)]">
              Menu
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--accent)] transition"
              aria-label="Close menu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          <nav className="flex flex-col gap-4 text-lg font-medium">
            <Link
              href="/"
              onClick={() => setIsOpen(false)}
              className="border-b border-[var(--surface-border)] pb-4 text-[var(--text-muted)] transition hover:text-[var(--accent)]"
            >
              Home
            </Link>
            <Link
              href="/leaderboard"
              onClick={() => setIsOpen(false)}
              className="border-b border-[var(--surface-border)] pb-4 text-[var(--text-muted)] transition hover:text-[var(--accent)]"
            >
              Leaderboard
            </Link>
            {action && <div className="pt-2" onClick={() => setIsOpen(false)}>{action}</div>}
          </nav>
        </div>
      )}
    </>
  );
}
