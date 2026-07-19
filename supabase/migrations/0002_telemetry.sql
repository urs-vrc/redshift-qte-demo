-- Migration: singleplayer telemetry submissions
-- Run with `npx supabase db push` (remote) or `npx supabase db reset` (local).
--
-- Stores a row per finished singleplayer session. The metrics mirror the
-- Telemetry interface tracked client-side; device metadata is captured at
-- submission time for aggregate analysis.

create table if not exists public.telemetry (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Session outcome
  mode text not null check (mode in ('timer', 'endless')),
  score int not null default 0,

  -- Core metrics
  total_inputs int not null default 0,
  correct_inputs int not null default 0,
  wrong_inputs int not null default 0,
  sequences_completed int not null default 0,
  avg_sequence_length numeric not null default 0,
  max_combo int not null default 0,
  elapsed_ms bigint not null default 0,
  average_kpm numeric not null default 0,
  high_kpm numeric not null default 0,
  low_kpm numeric not null default 0,
  accuracy numeric not null default 0,

  -- Device / OS metadata
  device_type text not null default 'unknown',
  os text not null default 'unknown',
  os_version text,
  browser text not null default 'unknown',
  is_touch boolean not null default false,
  user_agent text
);

create index if not exists telemetry_created_at_idx on public.telemetry (created_at desc);
create index if not exists telemetry_mode_idx on public.telemetry (mode);

-- Allow anonymous (anon) clients to insert telemetry rows. No read access is
-- granted so submitted data isn't exposed to other players.
alter table public.telemetry enable row level security;

create policy "anon insert telemetry" on public.telemetry
  for insert to anon with check (true);

-- Allow anon to read back rows it inserts (needed when clients request
-- return=representation). No aggregate/export access is granted elsewhere.
create policy "anon read telemetry" on public.telemetry
  for select to anon using (true);

-- RLS permits anon inserts, but the role still needs the underlying privilege.
grant insert, select on table public.telemetry to anon, authenticated;
