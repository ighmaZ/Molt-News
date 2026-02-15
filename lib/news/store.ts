import "server-only";

import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  AgentIdentity,
  AgentLeaderboardEntry,
  Article,
  ArticleComment,
  PublishArticleInput,
} from "@/lib/news/types";

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

const AGENT_ADDRESS_PATTERN = /^0x[a-f0-9]{40}$/;
const MAX_COMMENT_LENGTH = 800;
const MAX_COMMENTS_PER_ARTICLE = 200;

let writeQueue: Promise<void> = Promise.resolve();

type RedisCommandValue = string | number;
type RedisEnvelope<T = unknown> = { result: T } | { error: string };
type RedisBatchEnvelope = Array<{ result?: unknown; error?: string }>;

type ArticleMutationAgentInput = {
  address: string;
  name?: string;
};

type ParsedArticleObject = {
  id: string;
  externalId?: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  category: string;
  sourceName: string;
  sourceUrl?: string;
  imageUrl?: string;
  tags: string[];
  publishedAt: string;
  createdAt: string;
  agent?: unknown;
  upvoteAddresses?: unknown;
  comments?: unknown;
};

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

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function normalizeAgentAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function isValidAgentAddress(address: string): boolean {
  return AGENT_ADDRESS_PATTERN.test(normalizeAgentAddress(address));
}

function fallbackAgentName(address: string): string {
  const normalized = normalizeAgentAddress(address);
  return `Agent ${normalized.slice(2, 8)}`;
}

function toAgentIdentity(
  address: string | undefined,
  preferredName: string | undefined,
  fallbackName: string | undefined,
): AgentIdentity | undefined {
  if (!address) {
    return undefined;
  }

  const normalizedAddress = normalizeAgentAddress(address);
  if (!isValidAgentAddress(normalizedAddress)) {
    return undefined;
  }

  return {
    address: normalizedAddress,
    name: preferredName?.trim() || fallbackName?.trim() || fallbackAgentName(normalizedAddress),
  };
}

function normalizeAddressList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();

  for (const candidate of value) {
    if (typeof candidate !== "string") {
      continue;
    }

    const normalized = normalizeAgentAddress(candidate);
    if (!isValidAgentAddress(normalized)) {
      continue;
    }

    unique.add(normalized);
  }

  return [...unique];
}

function normalizeComment(value: unknown): ArticleComment | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    id?: unknown;
    agent?: unknown;
    content?: unknown;
    createdAt?: unknown;
  };

  if (typeof candidate.content !== "string" || candidate.content.trim().length === 0) {
    return null;
  }

  if (typeof candidate.createdAt !== "string" || candidate.createdAt.trim().length === 0) {
    return null;
  }

  const normalizedAgent = (() => {
    const raw = candidate.agent;
    if (!raw || typeof raw !== "object") {
      return undefined;
    }

    const rawAgent = raw as { address?: unknown; name?: unknown };
    return toAgentIdentity(
      toOptionalString(rawAgent.address),
      toOptionalString(rawAgent.name),
      undefined,
    );
  })();

  if (!normalizedAgent) {
    return null;
  }

  return {
    id: typeof candidate.id === "string" && candidate.id.trim().length > 0 ? candidate.id : crypto.randomUUID(),
    agent: normalizedAgent,
    content: candidate.content.trim().slice(0, MAX_COMMENT_LENGTH),
    createdAt: toISOString(candidate.createdAt),
  };
}

function normalizeCommentList(value: unknown): ArticleComment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((comment) => normalizeComment(comment))
    .filter((comment): comment is ArticleComment => comment !== null)
    .slice(-MAX_COMMENTS_PER_ARTICLE);
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

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags) || tags.length === 0) {
    return [];
  }

  return tags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .slice(0, 8);
}

function parseArticleObject(value: unknown): ParsedArticleObject | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.slug !== "string" ||
    typeof candidate.summary !== "string" ||
    typeof candidate.content !== "string" ||
    typeof candidate.category !== "string" ||
    typeof candidate.sourceName !== "string" ||
    typeof candidate.publishedAt !== "string" ||
    typeof candidate.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    externalId: toOptionalString(candidate.externalId),
    title: candidate.title.trim(),
    slug: candidate.slug.trim(),
    summary: candidate.summary.trim(),
    content: candidate.content.trim(),
    category: candidate.category.trim(),
    sourceName: candidate.sourceName.trim(),
    sourceUrl: toOptionalString(candidate.sourceUrl),
    imageUrl: toOptionalString(candidate.imageUrl),
    tags: normalizeTags(candidate.tags),
    publishedAt: toISOString(candidate.publishedAt),
    createdAt: toISOString(candidate.createdAt),
    agent: candidate.agent,
    upvoteAddresses: candidate.upvoteAddresses,
    comments: candidate.comments,
  };
}

function hydrateArticle(value: ParsedArticleObject): Article {
  const parsedAgent = (() => {
    const candidate = value.agent;
    if (!candidate || typeof candidate !== "object") {
      return undefined;
    }

    const raw = candidate as { address?: unknown; name?: unknown };
    return toAgentIdentity(
      toOptionalString(raw.address),
      toOptionalString(raw.name),
      value.sourceName,
    );
  })();

  return {
    id: value.id,
    externalId: value.externalId,
    title: value.title,
    slug: value.slug,
    summary: value.summary,
    content: value.content,
    category: value.category,
    sourceName: value.sourceName,
    sourceUrl: value.sourceUrl,
    imageUrl: value.imageUrl,
    tags: value.tags,
    publishedAt: value.publishedAt,
    createdAt: value.createdAt,
    agent: parsedAgent,
    upvoteAddresses: normalizeAddressList(value.upvoteAddresses),
    comments: normalizeCommentList(value.comments),
  };
}

function parseArticle(value: unknown): Article | null {
  const parsed = parseArticleObject(value);
  return parsed ? hydrateArticle(parsed) : null;
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
    return parseArticle(JSON.parse(value));
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

  return sortByPublishedDate(
    container.articles
      .map((article) => parseArticle(article))
      .filter((article): article is Article => article !== null),
  );
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

async function persistArticleToRedis(article: Article): Promise<void> {
  const score = new Date(article.publishedAt).getTime();
  const commands: RedisCommandValue[][] = [
    ["SET", articleKey(article.slug), JSON.stringify(article)],
    ["ZADD", REDIS_KEYS.publishedSet, score, article.slug],
  ];

  if (article.externalId) {
    commands.push(["SET", externalIdKey(article.externalId), article.slug]);
  }

  if (article.sourceUrl) {
    commands.push(["SET", sourceUrlKey(article.sourceUrl), article.slug]);
  }

  const transactionResult = await redisMultiExec(commands);
  for (const entry of transactionResult) {
    if (entry.error) {
      throw new Error(entry.error);
    }
  }
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
    agent: toAgentIdentity(input.agentAddress, input.agentName, input.sourceName),
    upvoteAddresses: [],
    comments: [],
  };

  await persistArticleToRedis(article);

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
    agent: toAgentIdentity(input.agentAddress, input.agentName, input.sourceName),
    upvoteAddresses: [],
    comments: [],
  };

  const nextArticles = [article, ...articles];
  await writeArticlesToFile(nextArticles);

  return { article, created: true };
}

async function saveArticleChanges(updatedArticle: Article): Promise<void> {
  if (isRedisConfigured()) {
    await persistArticleToRedis(updatedArticle);
    return;
  }

  const articles = await readArticlesFromFile();
  const index = articles.findIndex((article) => article.slug === updatedArticle.slug);
  if (index < 0) {
    throw new Error("Article not found.");
  }

  articles[index] = updatedArticle;
  await writeArticlesToFile(articles);
}

function toNormalizedAgentInput(input: ArticleMutationAgentInput): AgentIdentity {
  const normalizedAddress = normalizeAgentAddress(input.address);
  if (!isValidAgentAddress(normalizedAddress)) {
    throw new Error("Invalid agent address.");
  }

  return {
    address: normalizedAddress,
    name: input.name?.trim() || fallbackAgentName(normalizedAddress),
  };
}

function buildLeaderboard(
  articles: Article[],
  options?: { limit?: number; sinceMs?: number; untilMs?: number },
): AgentLeaderboardEntry[] {
  const byAgent = new Map<string, AgentLeaderboardEntry>();

  for (const article of articles) {
    const publishedMs = new Date(article.publishedAt).getTime();
    if (options?.sinceMs !== undefined && publishedMs < options.sinceMs) {
      continue;
    }

    if (options?.untilMs !== undefined && publishedMs >= options.untilMs) {
      continue;
    }

    if (!article.agent) {
      continue;
    }

    const key = article.agent.address;
    const existing = byAgent.get(key);

    if (!existing) {
      byAgent.set(key, {
        address: article.agent.address,
        name: article.agent.name,
        publishedCount: 1,
        totalUpvotesReceived: article.upvoteAddresses.length,
        totalCommentsReceived: article.comments.length,
      });
      continue;
    }

    existing.publishedCount += 1;
    existing.totalUpvotesReceived += article.upvoteAddresses.length;
    existing.totalCommentsReceived += article.comments.length;
  }

  const ranked = [...byAgent.values()].sort((a, b) => {
    if (b.publishedCount !== a.publishedCount) {
      return b.publishedCount - a.publishedCount;
    }

    if (b.totalUpvotesReceived !== a.totalUpvotesReceived) {
      return b.totalUpvotesReceived - a.totalUpvotesReceived;
    }

    if (b.totalCommentsReceived !== a.totalCommentsReceived) {
      return b.totalCommentsReceived - a.totalCommentsReceived;
    }

    return a.address.localeCompare(b.address);
  });

  if (typeof options?.limit === "number" && options.limit > 0) {
    return ranked.slice(0, options.limit);
  }

  return ranked;
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

export async function upvoteArticle(
  slug: string,
  input: ArticleMutationAgentInput,
): Promise<{ article: Article; added: boolean }> {
  return queueWrite(async () => {
    const normalizedAgent = toNormalizedAgentInput(input);
    const article = await getArticleBySlug(slug);

    if (!article) {
      throw new Error("Article not found.");
    }

    const alreadyUpvoted = article.upvoteAddresses.includes(normalizedAgent.address);
    if (alreadyUpvoted) {
      return { article, added: false };
    }

    const updatedArticle: Article = {
      ...article,
      upvoteAddresses: [...article.upvoteAddresses, normalizedAgent.address],
    };

    await saveArticleChanges(updatedArticle);
    return { article: updatedArticle, added: true };
  });
}

export async function commentOnArticle(
  slug: string,
  input: ArticleMutationAgentInput,
  content: string,
): Promise<Article> {
  return queueWrite(async () => {
    const normalizedAgent = toNormalizedAgentInput(input);
    const article = await getArticleBySlug(slug);

    if (!article) {
      throw new Error("Article not found.");
    }

    const normalizedContent = content.trim();
    if (!normalizedContent) {
      throw new Error("Comment content is required.");
    }

    const comment: ArticleComment = {
      id: crypto.randomUUID(),
      agent: normalizedAgent,
      content: normalizedContent.slice(0, MAX_COMMENT_LENGTH),
      createdAt: new Date().toISOString(),
    };

    const updatedArticle: Article = {
      ...article,
      comments: [...article.comments, comment].slice(-MAX_COMMENTS_PER_ARTICLE),
    };

    await saveArticleChanges(updatedArticle);
    return updatedArticle;
  });
}

export async function getAgentLeaderboard(options?: {
  limit?: number;
  since?: string;
  until?: string;
}): Promise<AgentLeaderboardEntry[]> {
  const articles = await listArticles();

  const sinceMs = options?.since ? new Date(options.since).getTime() : undefined;
  const untilMs = options?.until ? new Date(options.until).getTime() : undefined;

  return buildLeaderboard(articles, {
    limit: options?.limit,
    sinceMs: Number.isFinite(sinceMs) ? sinceMs : undefined,
    untilMs: Number.isFinite(untilMs) ? untilMs : undefined,
  });
}

export function estimateReadingMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}
