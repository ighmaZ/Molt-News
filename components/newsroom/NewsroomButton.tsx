"use client";

import { useState } from "react";
import Link from "next/link";
import NewsroomModal from "@/components/newsroom/NewsroomModal";

export default function NewsroomButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Link
        href="/newsroom"
        className="rounded-full border border-[var(--surface-border)] px-4 py-2 text-sm font-semibold text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        Newsroom
      </Link>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white transition hover:bg-[var(--accent-strong)] hover:shadow-[0_0_24px_rgba(255,86,86,0.3)]"
      >
        Enter Newsroom
      </button>
      <NewsroomModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
