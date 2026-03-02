# Felix CRM

Production-ready starter for a lead-gen CRM with scrape, instant site deployment, and AI script generation.

## Features
- Onboarding modal on first load (niche, tone, calendar link) + tutorial cues.
- Scrape tab (city + business type) with dedupe insert logic.
- Lead cards with **Create Site** deployment flow (Vercel API + mock fallback).
- AI Sales Playbook (Scripts with upvotes, sorted by success signal).
- Magic Bar for quick natural-language filtering/actions.
- Dark/light mode toggle.
- Prisma PostgreSQL schema for Users, Leads, Scripts, votes, success markers.
- 30-day lead release rule implemented in app logic + SQL cron example.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel
1. Push repo to GitHub.
2. Import project in Vercel.
3. Configure env vars:

```bash
DATABASE_URL=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
VERCEL_TOKEN=
VERCEL_TEMPLATE_PROJECT=
VERCEL_TEMPLATE_REPO=
VERCEL_TEMPLATE_BRANCH=main
SCRAPING_API_URL=
SCRAPING_API_KEY=
MAPS_API_KEY=
GEMINI_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

> If keys are missing, the app uses graceful mock behavior so UI still works end-to-end.


## Lead scraper (CRM + Supabase)

- `POST /api/scrape` now runs a Google Maps text-search + place-details scraping workflow when `MAPS_API_KEY` is configured.
- Results are persisted through Prisma into your Supabase Postgres (`DATABASE_URL`).
- Dedupe is handled by the existing `Lead.dedupeKey` plus in-run duplicate guards for place IDs, normalized names, and normalized phone numbers.
- If `GEMINI_API_KEY` is set, the scraper also:
  - generates micro-queries from the city+niche input, and
  - creates an AI research summary per lead for enrichment.
- The scrape response includes `chatbotPrompt`, a ready-to-use lead-scraping assistant prompt template.

## Prisma

```bash
npx prisma generate
npx prisma migrate dev --name init
```

## 30-Day Rule SQL (pg_cron)

```sql
create extension if not exists pg_cron;

select cron.schedule(
  'release-stale-leads-daily',
  '0 2 * * *',
  $$
  update "Lead"
  set "ownerId" = null,
      "updatedAt" = now()
  where "ownerId" is not null
    and "updatedAt" < now() - interval '30 days'
    and "status" not in ('IN_PROGRESS', 'CLOSED');
  $$
);
```


## Supabase database + roles

- Copy `.env.example` to `.env.local` and set your Supabase values.
- The app uses `DATABASE_URL` for Prisma. If `DATABASE_URL` is not set but `POSTGRES_PRISMA_URL` is available, it automatically falls back to `POSTGRES_PRISMA_URL`.
- User roles are defined at the database layer as `UserRole` with: `REP`, `MANAGER`, `TEAM_LEAD`, `SUPER_ADMIN`.

Run migrations:

```bash
npx prisma migrate deploy
```
