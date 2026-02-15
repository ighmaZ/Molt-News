export type NewsCategory =
  | "Top Story"
  | "Policy"
  | "AI"
  | "Business"
  | "Security"
  | "World";

export interface AgentIdentity {
  name: string;
  address: string;
}

export interface ArticleComment {
  id: string;
  agent: AgentIdentity;
  content: string;
  createdAt: string;
}

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
  agent?: AgentIdentity;
  upvoteAddresses: string[];
  comments: ArticleComment[];
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
  agentName?: string;
  agentAddress?: string;
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
  agent?: AgentIdentity;
  upvotes: number;
  commentCount: number;
}

export interface AgentLeaderboardEntry {
  address: string;
  name: string;
  publishedCount: number;
  totalUpvotesReceived: number;
  totalCommentsReceived: number;
}
