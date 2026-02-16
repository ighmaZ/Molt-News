"use client";

import { useEffect, useRef, useState } from "react";

type PlaybackState = "idle" | "loading" | "playing";
const HEADLINES_AUDIO_ENDPOINT = "/api/news/headlines-audio";

function PlayIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-current"
    >
      <path d="M8 6.5a1 1 0 0 1 1.51-.86l8.5 5.5a1 1 0 0 1 0 1.72l-8.5 5.5A1 1 0 0 1 8 17.5z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-current"
    >
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  );
}

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to play headlines right now.";
}

export default function PlayNewsButton() {
  const [state, setState] = useState<PlaybackState>("idle");
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const warmedRef = useRef(false);

  function cleanupAudio(): void {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }

  useEffect(() => {
    return () => cleanupAudio();
  }, []);

  useEffect(() => {
    if (warmedRef.current) {
      return;
    }

    warmedRef.current = true;

    const timeoutId = window.setTimeout(() => {
      fetch(HEADLINES_AUDIO_ENDPOINT, { method: "GET" }).catch(() => {
        // Best-effort warmup only.
      });
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, []);

  async function handleClick(): Promise<void> {
    setError(null);

    if (state === "loading") {
      return;
    }

    if (state === "playing") {
      cleanupAudio();
      setState("idle");
      return;
    }

    setState("loading");

    try {
      cleanupAudio();
      const audio = new Audio(HEADLINES_AUDIO_ENDPOINT);
      audio.preload = "auto";
      audioRef.current = audio;

      audio.onplaying = () => {
        setState("playing");
      };

      audio.onended = () => {
        cleanupAudio();
        setState("idle");
      };

      audio.onerror = () => {
        cleanupAudio();
        setState("idle");
        setError("Audio playback failed.");
      };

      await audio.play();
    } catch (nextError) {
      cleanupAudio();
      setState("idle");
      setError(toMessage(nextError));
    }
  }

  const isLoading = state === "loading";
  const isPlaying = state === "playing";

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--accent)] bg-[var(--surface)] px-9 py-3 text-lg font-bold text-[var(--accent)] transition hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-80"
      >
        {isPlaying ? <StopIcon /> : <PlayIcon />}
        <span>{isLoading ? "Preparing..." : isPlaying ? "Stop News" : "Play News"}</span>
      </button>
      {error ? <p className="text-xs text-[var(--accent-soft)]">{error}</p> : null}
    </div>
  );
}
