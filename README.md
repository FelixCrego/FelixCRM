# Felix CRM

Production-ready starter for a lead-gen CRM with scrape, instant site deployment, and AI script generation.

## Features
- Onboarding modal on first load (niche, tone, calendar link) + tutorial cues.
- Scrape tab (city + business type) with dedupe insert logic.
- Lead cards with **Create Site** deployment flow (Vercel API).
- AI Sales Playbook (Scripts with upvotes, sorted by success signal).
- Magic Bar for quick natural-language filtering/actions.
- Dark/light mode toggle.
- Supabase-backed PostgreSQL schema for Users, Leads, Scripts, votes, success markers.
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
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
VERCEL_TOKEN=
VERCEL_TEMPLATE_PROJECT=
VERCEL_TEMPLATE_REPO=
VERCEL_TEMPLATE_BRANCH=main
MAPS_API_KEY=
GEMINI_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=https://felix-crm-xi.vercel.app
SUPABASE_SERVICE_ROLE_KEY=
```

> Most features degrade gracefully without optional keys, but lead scraping specifically requires `MAPS_API_KEY`.

## Template deployment payload contract

`POST /api/deploy` now builds a single versioned payload and sends it to the template as `TEMPLATE_CONFIG_JSON` plus a few scalar env vars (`TEMPLATE_CONFIG_VERSION`, `BUSINESS_NAME`, `CONTACT_PHONE`, `CONTACT_EMAIL`, `SOCIAL_LINKS`) for compatibility.

### `TEMPLATE_CONFIG_JSON` (v1.1.0)

```json
{
  "templateVersion": "1.1.0",
  "leadId": "string",
  "business": {
    "name": "string",
    "city": "string",
    "category": "string",
    "websiteUrl": "string"
  },
  "geo": {
    "primaryLocation": "string",
    "serviceAreas": ["string"]
  },
  "branding": {
    "logoUrl": "string",
    "heroImageUrl": "string",
    "primaryColor": "string",
    "secondaryColor": "string"
  },
  "content": {
    "hero": {
      "headline": "string",
      "subheadline": "string",
      "ctaLabel": "string"
    },
    "contact": {
      "phone": "string",
      "email": "string",
      "address": "string",
      "hours": "string",
      "formCta": "string"
    },
    "serviceBlocks": [
      { "title": "string", "description": "string" }
    ]
  },
  "links": {
    "googleBusinessProfile": "string",
    "socials": [
      { "label": "string", "url": "string" }
    ]
  },
  "research": {
    "summary": "string"
  }
}
```

`templateConfigOverrides` can be passed to `/api/deploy` and is merged over lead defaults. `researchOutput` is also supported and will replace `lead.aiResearchSummary` when provided.



## Lead scraper (CRM + Supabase)

- `POST /api/scrape` runs exclusively on Google Places API (Text Search + Place Details) and requires `MAPS_API_KEY`.
- Results are persisted through the Supabase client into your Supabase Postgres.
- Dedupe is handled by the existing `Lead.dedupeKey` plus in-run duplicate guards for place IDs, normalized names, and normalized phone numbers.
- If `GEMINI_API_KEY` is set, the scraper also:
  - generates micro-queries from the city+niche input, and
  - creates an AI research summary per lead for enrichment.
- The scrape response includes `chatbotPrompt`, a ready-to-use lead-scraping assistant prompt template.

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
- The app uses `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` for server-side database operations.
- Set `NEXT_PUBLIC_APP_URL` to your deployed app origin so Supabase confirmation emails return to the correct domain (instead of localhost).
- In Supabase Auth settings, add `https://felix-crm-xi.vercel.app/login?confirmed=1` to your allowed redirect URLs.
- User roles are defined at the database layer as `UserRole` with: `REP`, `MANAGER`, `TEAM_LEAD`, `SUPER_ADMIN`.

Manage your schema directly in Supabase (SQL editor, migrations, or CLI) and keep table names/columns aligned with the app queries.
