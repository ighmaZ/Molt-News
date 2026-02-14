export type NewsCategory =
  | "Top Story"
  | "Policy"
  | "AI"
  | "Business"
  | "Security"
  | "World";

export interface Article {
  id: string;
  externalId?: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  category: NewsCategory | string;
  sourceName: string;
  sourceUrl?: string;
  imageUrl?: string;
  tags: string[];
  publishedAt: string;
  createdAt: string;
}

export interface PublishArticleInput {
  externalId?: string;
  title: string;
  slug?: string;
  summary?: string;
  content: string;
  category?: NewsCategory | string;
  sourceName?: string;
  sourceUrl?: string;
  imageUrl?: string;
  tags?: string[];
  publishedAt?: string;
}

export interface ArticleFeedItem {
  id: string;
  title: string;
  slug: string;
  summary: string;
  category: string;
  sourceName: string;
  sourceUrl?: string;
  imageUrl?: string;
  tags: string[];
  publishedAt: string;
  readingMinutes: number;
}
