create extension if not exists pgcrypto;

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_email text,
  session_status text not null default 'ACTIVE' check (session_status in ('ACTIVE', 'ENDED')),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  last_path text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists user_sessions_user_id_idx on public.user_sessions (user_id);
create index if not exists user_sessions_started_at_idx on public.user_sessions (started_at desc);
create index if not exists user_sessions_status_idx on public.user_sessions (session_status);
