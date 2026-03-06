create table if not exists public.demos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid,
  lead_name text not null,
  selected_date date not null,
  selected_time text not null,
  meet_link text not null,
  rep_id uuid not null,
  rep_email text,
  created_at timestamptz not null default now()
);

create index if not exists demos_rep_id_idx on public.demos (rep_id);
create index if not exists demos_selected_date_idx on public.demos (selected_date);

create index if not exists demos_lead_id_idx on public.demos (lead_id);
