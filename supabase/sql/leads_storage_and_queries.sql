-- Supabase SQL: Leads storage + query helpers
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  city text not null,
  business_type text not null,
  phone text,
  email text,
  website_url text,
  website_status text,
  normalized_name text not null,
  normalized_phone text,
  normalized_domain text,
  dedupe_key text not null unique,
  owner_id uuid references auth.users (id) on delete set null,
  status text not null default 'NEW' check (status in ('NEW', 'CONTACTED', 'IN_PROGRESS', 'CLOSED', 'DISQUALIFIED')),
  deployed_url text,
  site_status text check (site_status in ('UNBUILT', 'BUILDING', 'LIVE', 'FAILED')),
  source_provider text,
  source_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_city_business_type_idx on public.leads (city, business_type);
create index if not exists leads_owner_status_idx on public.leads (owner_id, status);
create index if not exists leads_updated_status_idx on public.leads (updated_at desc, status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row
execute function public.set_updated_at();

alter table public.leads enable row level security;

-- Owners can view/update their leads. Service role can do all operations.
drop policy if exists "leads_select_own" on public.leads;
create policy "leads_select_own"
on public.leads
for select
to authenticated
using (owner_id = auth.uid() or owner_id is null);

drop policy if exists "leads_insert_own" on public.leads;
create policy "leads_insert_own"
on public.leads
for insert
to authenticated
with check (owner_id = auth.uid() or owner_id is null);

drop policy if exists "leads_update_own" on public.leads;
create policy "leads_update_own"
on public.leads
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- Optional read-only access for anon clients. Remove if you want fully private leads.
drop policy if exists "leads_select_anon" on public.leads;
create policy "leads_select_anon"
on public.leads
for select
to anon
using (true);

-- Query helper: list leads with filters + pagination.
create or replace function public.get_leads(
  p_owner_id uuid default null,
  p_status text default null,
  p_city text default null,
  p_business_type text default null,
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns setof public.leads
language sql
stable
as $$
  select l.*
  from public.leads l
  where (p_owner_id is null or l.owner_id = p_owner_id)
    and (p_status is null or l.status = p_status)
    and (p_city is null or l.city = p_city)
    and (p_business_type is null or l.business_type = p_business_type)
    and (
      p_search is null
      or l.business_name ilike '%' || p_search || '%'
      or coalesce(l.phone, '') ilike '%' || p_search || '%'
      or coalesce(l.email, '') ilike '%' || p_search || '%'
    )
  order by l.updated_at desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

-- Upsert helper for scraper ingestion.
create or replace function public.upsert_lead(
  p_business_name text,
  p_city text,
  p_business_type text,
  p_phone text,
  p_email text,
  p_website_url text,
  p_website_status text,
  p_normalized_name text,
  p_normalized_phone text,
  p_normalized_domain text,
  p_dedupe_key text,
  p_source_provider text,
  p_source_payload jsonb default '{}'::jsonb
)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.leads;
begin
  insert into public.leads (
    business_name,
    city,
    business_type,
    phone,
    email,
    website_url,
    website_status,
    normalized_name,
    normalized_phone,
    normalized_domain,
    dedupe_key,
    source_provider,
    source_payload
  ) values (
    p_business_name,
    p_city,
    p_business_type,
    p_phone,
    p_email,
    p_website_url,
    p_website_status,
    p_normalized_name,
    p_normalized_phone,
    p_normalized_domain,
    p_dedupe_key,
    p_source_provider,
    p_source_payload
  )
  on conflict (dedupe_key)
  do update set
    phone = excluded.phone,
    email = excluded.email,
    website_url = excluded.website_url,
    website_status = excluded.website_status,
    source_provider = excluded.source_provider,
    source_payload = excluded.source_payload,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;
