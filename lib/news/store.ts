import "server-only";

import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { Article, PublishArticleInput } from "@/lib/news/types";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "articles.json");

let writeQueue: Promise<void> = Promise.resolve();

function queueWrite<T>(action: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(action, action);
  writeQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
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

async function ensureDataFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify({ articles: [] }, null, 2), "utf8");
  }
}

async function readArticles(): Promise<Article[]> {
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

async function writeArticles(articles: Article[]): Promise<void> {
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

export async function listArticles(options?: { limit?: number }): Promise<Article[]> {
  const limit = options?.limit && options.limit > 0 ? options.limit : undefined;
  const articles = await readArticles();

  return typeof limit === "number" ? articles.slice(0, limit) : articles;
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const articles = await readArticles();
  return articles.find((article) => article.slug === slug) ?? null;
}

export async function publishArticle(
  input: PublishArticleInput,
): Promise<{ article: Article; created: boolean }> {
  return queueWrite(async () => {
    const articles = await readArticles();

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
    await writeArticles(nextArticles);

    return { article, created: true };
  });
}

export function estimateReadingMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}
