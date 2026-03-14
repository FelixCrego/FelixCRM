-- Manager plans table for weekly accountability and earnings projections.
create table if not exists public.manager_plans (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null,
  week_start_date date not null,
  locked_metrics_json jsonb not null,
  projected_income numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists manager_plans_manager_id_idx on public.manager_plans (manager_id);
create index if not exists manager_plans_week_start_date_idx on public.manager_plans (week_start_date desc);
