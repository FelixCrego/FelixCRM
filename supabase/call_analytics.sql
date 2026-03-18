create extension if not exists pgcrypto;

create table if not exists public.call_analytics (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null,
  contact_id text not null,
  customer_phone text,
  duration_seconds integer,
  overall_sentiment text,
  recording_url text,
  recording_url_expires_at timestamptz,
  recording_s3_uri text,
  analysis_s3_uri text,
  transcript_text text,
  transcript_json jsonb,
  ai_summary text,
  agent_talk_time_pct numeric(5,2),
  customer_talk_time_pct numeric(5,2),
  interruptions integer,
  event_source text,
  source_event_time timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.call_analytics add column if not exists customer_phone text;
alter table public.call_analytics add column if not exists recording_url_expires_at timestamptz;
alter table public.call_analytics add column if not exists source_event_time timestamptz;

create unique index if not exists call_analytics_contact_id_key on public.call_analytics (contact_id);
create index if not exists call_analytics_lead_id_created_at_idx on public.call_analytics (lead_id, created_at desc);
create index if not exists call_analytics_customer_phone_idx on public.call_analytics (customer_phone);

create or replace function public.set_call_analytics_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_call_analytics_updated_at on public.call_analytics;
create trigger trg_call_analytics_updated_at
before update on public.call_analytics
for each row
execute function public.set_call_analytics_updated_at();
