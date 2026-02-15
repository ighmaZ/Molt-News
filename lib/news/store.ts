import "server-only";

import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { Article, PublishArticleInput } from "@/lib/news/types";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "articles.json");

const REDIS_API_URL = process.env.KV_REST_API_URL?.replace(/\/$/, "") ?? "";
const REDIS_API_TOKEN = process.env.KV_REST_API_TOKEN ?? "";

const REDIS_KEYS = {
  publishedSet: "molt:news:published",
  articlePrefix: "molt:news:article:slug:",
  externalIdPrefix: "molt:news:index:external:",
  sourceUrlPrefix: "molt:news:index:source:",
} as const;

let writeQueue: Promise<void> = Promise.resolve();

type RedisCommandValue = string | number;
type RedisEnvelope<T = unknown> = { result: T } | { error: string };
type RedisBatchEnvelope = Array<{ result?: unknown; error?: string }>;

function queueWrite<T>(action: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(action, action);
  writeQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function isRedisConfigured(): boolean {
  return REDIS_API_URL.length > 0 && REDIS_API_TOKEN.length > 0;
}

function isRunningOnVercel(): boolean {
  return process.env.VERCEL === "1" || process.env.VERCEL === "true";
}

function assertWritableStorageConfigured(): void {
  if (!isRedisConfigured() && isRunningOnVercel()) {
    throw new Error(
      "Writable storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN in Vercel.",
    );
  }
}

async function redisRawRequest(endpoint: "" | "/pipeline" | "/multi-exec", body: unknown): Promise<unknown> {
  if (!isRedisConfigured()) {
    throw new Error("Redis is not configured.");
  }

  const response = await fetch(`${REDIS_API_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${REDIS_API_TOKEN}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Redis request failed with status ${response.status}`;

    throw new Error(detail);
  }

  return payload;
}

function extractRedisResult<T>(payload: unknown): T {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Redis response payload.");
  }

  const envelope = payload as RedisEnvelope<T>;

  if ("error" in envelope) {
    throw new Error(envelope.error);
  }

  return envelope.result;
}

async function redisCommand<T = unknown>(command: RedisCommandValue[]): Promise<T> {
  const payload = await redisRawRequest("", command);
  return extractRedisResult<T>(payload);
}

async function redisPipeline(commands: RedisCommandValue[][]): Promise<RedisBatchEnvelope> {
  const payload = await redisRawRequest("/pipeline", commands);

  if (!Array.isArray(payload)) {
    throw new Error("Invalid Redis pipeline response.");
  }

  return payload as RedisBatchEnvelope;
}

async function redisMultiExec(commands: RedisCommandValue[][]): Promise<RedisBatchEnvelope> {
  const payload = await redisRawRequest("/multi-exec", commands);

  if (!Array.isArray(payload)) {
    throw new Error("Invalid Redis transaction response.");
  }

  return payload as RedisBatchEnvelope;
}

function articleKey(slug: string): string {
  return `${REDIS_KEYS.articlePrefix}${slug}`;
}

function externalIdKey(externalId: string): string {
  return `${REDIS_KEYS.externalIdPrefix}${externalId}`;
}

function sourceUrlKey(sourceUrl: string): string {
  const fingerprint = crypto.createHash("sha256").update(sourceUrl).digest("hex");
  return `${REDIS_KEYS.sourceUrlPrefix}${fingerprint}`;
}

function toISOString(value?: string): string {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normalizeSlug(value: string): string {
  const sanitized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || `story-${Date.now()}`;
}

function summarizeContent(summary: string | undefined, content: string): string {
  if (summary && summary.trim().length > 0) {
    return summary.trim();
  }

  const collapsed = content.replace(/\s+/g, " ").trim();
  if (collapsed.length <= 180) {
    return collapsed;
  }

  return `${collapsed.slice(0, 177)}...`;
}

function isArticle(value: unknown): value is Article {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Article>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.slug === "string" &&
    typeof candidate.summary === "string" &&
    typeof candidate.content === "string" &&
    typeof candidate.category === "string" &&
    typeof candidate.sourceName === "string" &&
    typeof candidate.publishedAt === "string" &&
    typeof candidate.createdAt === "string" &&
    Array.isArray(candidate.tags)
  );
}

function sortByPublishedDate(items: Article[]): Article[] {
  return items.sort((a, b) => {
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

function parseArticleString(value: unknown): Article | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isArticle(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function ensureDataFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify({ articles: [] }, null, 2), "utf8");
  }
}

async function readArticlesFromFile(): Promise<Article[]> {
  await ensureDataFile();

  const raw = await fs.readFile(DATA_FILE, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object") {
    return [];
  }

  const container = parsed as { articles?: unknown };
  if (!Array.isArray(container.articles)) {
    return [];
  }

  return sortByPublishedDate(container.articles.filter(isArticle));
}

async function writeArticlesToFile(articles: Article[]): Promise<void> {
  assertWritableStorageConfigured();
  await ensureDataFile();

  const tempFile = `${DATA_FILE}.tmp`;
  const nextPayload = JSON.stringify({ articles: sortByPublishedDate(articles) }, null, 2);

  await fs.writeFile(tempFile, nextPayload, "utf8");
  await fs.rename(tempFile, DATA_FILE);
}

function withUniqueSlug(articles: Article[], desiredSlug: string): string {
  if (!articles.some((article) => article.slug === desiredSlug)) {
    return desiredSlug;
  }

  let index = 2;
  let candidate = `${desiredSlug}-${index}`;

  while (articles.some((article) => article.slug === candidate)) {
    index += 1;
    candidate = `${desiredSlug}-${index}`;
  }

  return candidate;
}

async function withUniqueRedisSlug(desiredSlug: string): Promise<string> {
  let candidate = desiredSlug;
  let index = 2;

  while (true) {
    const existing = await redisCommand<string | null>(["GET", articleKey(candidate)]);
    if (!existing) {
      return candidate;
    }

    candidate = `${desiredSlug}-${index}`;
    index += 1;
  }
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags || tags.length === 0) {
    return [];
  }

  return tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .slice(0, 8);
}

async function listArticlesFromRedis(options?: { limit?: number }): Promise<Article[]> {
  const limit = options?.limit && options.limit > 0 ? options.limit : undefined;
  const rangeEnd = typeof limit === "number" ? limit - 1 : -1;

  const slugs = await redisCommand<string[]>(["ZREVRANGE", REDIS_KEYS.publishedSet, 0, rangeEnd]);

  if (!Array.isArray(slugs) || slugs.length === 0) {
    return [];
  }

  const responses = await redisPipeline(slugs.map((slug) => ["GET", articleKey(slug)]));

  const articles: Article[] = [];
  for (const response of responses) {
    if (response.error) {
      throw new Error(response.error);
    }

    const article = parseArticleString(response.result);
    if (article) {
      articles.push(article);
    }
  }

  return articles;
}

async function getArticleBySlugFromRedis(slug: string): Promise<Article | null> {
  const raw = await redisCommand<string | null>(["GET", articleKey(slug)]);
  return parseArticleString(raw);
}

async function publishArticleToRedis(
  input: PublishArticleInput,
): Promise<{ article: Article; created: boolean }> {
  const externalId = input.externalId?.trim();
  const sourceUrl = input.sourceUrl?.trim();

  if (externalId) {
    const existingSlug = await redisCommand<string | null>(["GET", externalIdKey(externalId)]);
    if (existingSlug) {
      const existingArticle = await getArticleBySlugFromRedis(existingSlug);
      if (existingArticle) {
        return { article: existingArticle, created: false };
      }
    }
  }

  if (sourceUrl) {
    const existingSlug = await redisCommand<string | null>(["GET", sourceUrlKey(sourceUrl)]);
    if (existingSlug) {
      const existingArticle = await getArticleBySlugFromRedis(existingSlug);
      if (existingArticle) {
        return { article: existingArticle, created: false };
      }
    }
  }

  const createdAt = new Date().toISOString();
  const baseSlug = normalizeSlug(input.slug ?? input.title);
  const slug = await withUniqueRedisSlug(baseSlug);

  const article: Article = {
    id: crypto.randomUUID(),
    externalId: externalId || undefined,
    title: input.title.trim(),
    slug,
    summary: summarizeContent(input.summary, input.content),
    content: input.content.trim(),
    category: input.category?.trim() || "Top Story",
    sourceName: input.sourceName?.trim() || "OpenClaw",
    sourceUrl: sourceUrl || undefined,
    imageUrl: input.imageUrl?.trim() || undefined,
    tags: normalizeTags(input.tags),
    publishedAt: toISOString(input.publishedAt),
    createdAt,
  };

  const score = new Date(article.publishedAt).getTime();
  const commands: RedisCommandValue[][] = [
    ["SET", articleKey(slug), JSON.stringify(article)],
    ["ZADD", REDIS_KEYS.publishedSet, score, slug],
  ];

  if (externalId) {
    commands.push(["SET", externalIdKey(externalId), slug]);
  }

  if (sourceUrl) {
    commands.push(["SET", sourceUrlKey(sourceUrl), slug]);
  }

  const transactionResult = await redisMultiExec(commands);
  for (const entry of transactionResult) {
    if (entry.error) {
      throw new Error(entry.error);
    }
  }

  return { article, created: true };
}

async function publishArticleToFile(
  input: PublishArticleInput,
): Promise<{ article: Article; created: boolean }> {
  const articles = await readArticlesFromFile();

  const byExternalId =
    input.externalId && input.externalId.trim().length > 0
      ? articles.find((article) => article.externalId === input.externalId)
      : undefined;

  if (byExternalId) {
    return { article: byExternalId, created: false };
  }

  const bySourceUrl =
    input.sourceUrl && input.sourceUrl.trim().length > 0
      ? articles.find((article) => article.sourceUrl === input.sourceUrl)
      : undefined;

  if (bySourceUrl) {
    return { article: bySourceUrl, created: false };
  }

  const createdAt = new Date().toISOString();
  const baseSlug = normalizeSlug(input.slug ?? input.title);
  const slug = withUniqueSlug(articles, baseSlug);

  const article: Article = {
    id: crypto.randomUUID(),
    externalId: input.externalId?.trim() || undefined,
    title: input.title.trim(),
    slug,
    summary: summarizeContent(input.summary, input.content),
    content: input.content.trim(),
    category: input.category?.trim() || "Top Story",
    sourceName: input.sourceName?.trim() || "OpenClaw",
    sourceUrl: input.sourceUrl?.trim() || undefined,
    imageUrl: input.imageUrl?.trim() || undefined,
    tags: normalizeTags(input.tags),
    publishedAt: toISOString(input.publishedAt),
    createdAt,
  };

  const nextArticles = [article, ...articles];
  await writeArticlesToFile(nextArticles);

  return { article, created: true };
}

export async function listArticles(options?: { limit?: number }): Promise<Article[]> {
  if (isRedisConfigured()) {
    return listArticlesFromRedis(options);
  }

  const limit = options?.limit && options.limit > 0 ? options.limit : undefined;
  const articles = await readArticlesFromFile();
  return typeof limit === "number" ? articles.slice(0, limit) : articles;
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  if (isRedisConfigured()) {
    return getArticleBySlugFromRedis(slug);
  }

  const articles = await readArticlesFromFile();
  return articles.find((article) => article.slug === slug) ?? null;
}

export async function publishArticle(
  input: PublishArticleInput,
): Promise<{ article: Article; created: boolean }> {
  return queueWrite(async () => {
    if (isRedisConfigured()) {
      return publishArticleToRedis(input);
    }

    return publishArticleToFile(input);
  });
}

export function estimateReadingMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}
