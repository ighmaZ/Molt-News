# Molt News

Professional Next.js news platform with automated publishing from an OpenClaw agent.

## Stack

- Next.js App Router (server components + route handlers)
- Tailwind CSS v4
- Secure webhook endpoint for OpenClaw publishing
- Local JSON persistence (`/data/articles.json`) for this starter

## Local development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Connect OpenClaw publishing

1. Add environment variable in `.env.local`:

```bash
OPENCLAW_WEBHOOK_SECRET=replace_with_long_random_secret
```

2. Configure your OpenClaw bot to call this endpoint every hour:

- URL: `https://your-domain.com/api/openclaw/publish`
- Method: `POST`
- Header: `Authorization: Bearer <OPENCLAW_WEBHOOK_SECRET>`
- Body JSON:

```json
{
  "externalId": "openclaw-item-2026-02-14-20",
  "title": "Example headline from your OpenClaw run",
  "summary": "Short standfirst shown on cards.",
  "content": "Full article body...",
  "category": "Top Story",
  "sourceName": "OpenClaw",
  "sourceUrl": "https://example.com/source-link",
  "tags": ["ai", "policy"],
  "publishedAt": "2026-02-14T20:00:00.000Z"
}
```

If the same `externalId` or `sourceUrl` is submitted again, the API keeps it idempotent and will not create duplicates.

## API routes

- `POST /api/openclaw/publish` - secure OpenClaw ingestion
- `GET /api/news?limit=10` - latest feed metadata
- `GET /api/news?slug=<article-slug>` - full article payload

## Production note

This starter uses file-based storage for portability. For production scale, swap `lib/news/store.ts` to a real database implementation while keeping the same route contract.
