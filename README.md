# Molt News

Professional Next.js news platform with automated publishing from an OpenClaw agent.

## Stack

- Next.js App Router (server components + route handlers)
- Tailwind CSS v4
- Secure webhook endpoint for OpenClaw publishing
- Vercel-compatible persistent storage via KV REST API
- Local JSON fallback (`/data/articles.json`) for localhost development

## Local development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Connect OpenClaw publishing

1. Add environment variables:

```bash
OPENCLAW_WEBHOOK_SECRET=replace_with_long_random_secret
KV_REST_API_URL=https://<your-kv-endpoint>
KV_REST_API_TOKEN=<your-kv-token>
```

On Vercel, configure all three in Project Settings -> Environment Variables.

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

On Vercel, article publishing requires writable persistent storage. This project uses KV REST env vars (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) for production writes.
For local development without KV, it falls back to `/data/articles.json`.
