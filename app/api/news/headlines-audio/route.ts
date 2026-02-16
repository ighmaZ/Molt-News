import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { listArticles } from "@/lib/news/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
const MAX_HEADLINES = 30;
const AUDIO_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedAudio = {
  key: string;
  bytes: Uint8Array;
  expiresAt: number;
};

let cachedAudio: CachedAudio | null = null;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildNarration(titles: string[]): string {
  const list = titles
    .map((title) => collapseWhitespace(title))
    .join(". ");

  return `Molt News headlines. ${list}.`;
}

function toElevenLabsErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const shaped = payload as {
      detail?: { message?: unknown } | unknown;
      error?: unknown;
      message?: unknown;
    };

    if (
      shaped.detail &&
      typeof shaped.detail === "object" &&
      "message" in shaped.detail &&
      typeof shaped.detail.message === "string"
    ) {
      return shaped.detail.message;
    }

    if (typeof shaped.error === "string") {
      return shaped.error;
    }

    if (typeof shaped.message === "string") {
      return shaped.message;
    }
  }

  return `ElevenLabs request failed with status ${status}.`;
}

function toClientFacingError(status: number, detail: string): { status: number; message: string } {
  if (status === 401) {
    return {
      status: 502,
      message:
        "ElevenLabs authentication failed (401). Check ELEVENLABS_API_KEY, ensure it is active, then restart the server.",
    };
  }

  if (status === 429) {
    return {
      status: 502,
      message: "ElevenLabs rate limit reached. Please wait and try again.",
    };
  }

  return { status: 502, message: detail };
}

function parseOptionalConfig(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  // Treat README-style placeholders as unset.
  const lower = trimmed.toLowerCase();
  if (
    (trimmed.startsWith("<") && trimmed.endsWith(">")) ||
    lower.includes("your_elevenlabs") ||
    lower === "elevenlabs_voice_id" ||
    lower === "elevenlabs_model_id"
  ) {
    return undefined;
  }

  return trimmed;
}

function isInvalidVoiceIdError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("invalid id") || lower.includes("voice");
}

function buildCacheKey(input: {
  titles: string[];
  voiceId: string;
  modelId: string;
}): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

function getCachedAudio(key: string): Uint8Array | null {
  if (!cachedAudio) {
    return null;
  }

  if (Date.now() > cachedAudio.expiresAt) {
    cachedAudio = null;
    return null;
  }

  return cachedAudio.key === key ? cachedAudio.bytes : null;
}

async function handleHeadlinesAudio(): Promise<Response> {
  const apiKey = parseOptionalConfig(process.env.ELEVENLABS_API_KEY);
  const configuredVoiceId = parseOptionalConfig(process.env.ELEVENLABS_VOICE_ID);
  const voiceId = configuredVoiceId || DEFAULT_VOICE_ID;
  const modelId = parseOptionalConfig(process.env.ELEVENLABS_MODEL_ID) || DEFAULT_MODEL_ID;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ElevenLabs is not configured. Set ELEVENLABS_API_KEY on the server." },
      { status: 500 },
    );
  }

  const articles = await listArticles({ limit: MAX_HEADLINES });
  if (articles.length === 0) {
    return NextResponse.json(
      { error: "No headlines are available yet." },
      { status: 404 },
    );
  }

  const titles = articles.map((article) => article.title);
  const narration = buildNarration(titles);
  const cacheKey = buildCacheKey({ titles, voiceId, modelId });
  const cachedBytes = getCachedAudio(cacheKey);
  if (cachedBytes) {
    return new Response(Buffer.from(cachedBytes), {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Length": String(cachedBytes.byteLength),
        "Content-Type": "audio/mpeg",
      },
    });
  }

  async function requestAudio(selectedVoiceId: string): Promise<Response> {
    return fetch(
      `${ELEVENLABS_BASE_URL}/${selectedVoiceId}?output_format=mp3_22050_32&optimize_streaming_latency=4`,
      {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey!,
        },
        body: JSON.stringify({
          text: narration,
          model_id: modelId,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.75,
          },
        }),
        cache: "no-store",
      },
    );
  }

  let elevenLabsResponse = await requestAudio(voiceId);

  if (!elevenLabsResponse.ok) {
    const firstErrorPayload = await elevenLabsResponse.json().catch(() => null);
    const firstErrorMessage = toElevenLabsErrorMessage(firstErrorPayload, elevenLabsResponse.status);

    // If a custom voice ID is invalid, retry once with a known-good default voice.
    if (
      configuredVoiceId &&
      configuredVoiceId !== DEFAULT_VOICE_ID &&
      isInvalidVoiceIdError(firstErrorMessage)
    ) {
      elevenLabsResponse = await requestAudio(DEFAULT_VOICE_ID);
    }

    if (!elevenLabsResponse.ok) {
      const errorPayload = await elevenLabsResponse.json().catch(() => null);
      const detail = toElevenLabsErrorMessage(errorPayload, elevenLabsResponse.status);
      const mapped = toClientFacingError(elevenLabsResponse.status, detail);
      return NextResponse.json(
        { error: mapped.message },
        { status: mapped.status },
      );
    }
  }

  const stream = elevenLabsResponse.body;
  if (!stream) {
    const audioBuffer = await elevenLabsResponse.arrayBuffer();
    const bytes = new Uint8Array(audioBuffer);
    cachedAudio = {
      key: cacheKey,
      bytes,
      expiresAt: Date.now() + AUDIO_CACHE_TTL_MS,
    };

    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Length": String(bytes.byteLength),
        "Content-Type": "audio/mpeg",
      },
    });
  }

  const [clientStream, cacheStream] = stream.tee();

  void new Response(cacheStream)
    .arrayBuffer()
    .then((buffer) => {
      cachedAudio = {
        key: cacheKey,
        bytes: new Uint8Array(buffer),
        expiresAt: Date.now() + AUDIO_CACHE_TTL_MS,
      };
    })
    .catch(() => {
      // Best-effort caching; streaming response should still succeed.
    });

  return new Response(clientStream, {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Type": "audio/mpeg",
    },
  });
}

export async function GET(): Promise<Response> {
  return handleHeadlinesAudio();
}

export async function POST(): Promise<Response> {
  return handleHeadlinesAudio();
}
