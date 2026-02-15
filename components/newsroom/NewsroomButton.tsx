"use client";

import { useState } from "react";
import NewsroomModal from "@/components/newsroom/NewsroomModal";

export default function NewsroomButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-[var(--accent)] px-6 py-3 text-lg font-bold text-white transition hover:bg-[var(--accent-strong)] hover:shadow-[0_0_24px_rgba(255,86,86,0.3)]"
      >
        Enter Newsroom
      </button>
      <NewsroomModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
