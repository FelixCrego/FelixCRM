-- ATS schema for manager recruiting workflows.
create extension if not exists pgcrypto;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null,
  title text not null,
  description text not null,
  department text,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists jobs_manager_id_idx on public.jobs (manager_id);
create index if not exists jobs_status_idx on public.jobs (status);

create table if not exists public.applicants (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  resume_url text,
  linkedin_url text,
  status text not null default 'New' check (status in ('New', 'Reviewing', 'Interviewing', 'Hired', 'Rejected')),
  applied_at timestamptz not null default now()
);

create index if not exists applicants_job_id_idx on public.applicants (job_id);
create index if not exists applicants_status_idx on public.applicants (status);
create index if not exists applicants_applied_at_idx on public.applicants (applied_at desc);
