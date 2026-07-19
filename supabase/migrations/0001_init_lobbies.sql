-- Migration: initial multiplayer lobby schema
-- Run with `npx supabase db push` (remote) or `npx supabase db reset` (local).
--
-- NOTE: The current multiplayer flow in hooks/useMultiplayerState.ts uses
-- Realtime presence channels, so these tables are optional infrastructure for
-- persisted lobbies (survive disconnects, browsable lobby list, server state).
-- They are safe to apply even while presence-based gameplay is in use.

create table if not exists public.lobbies (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id text not null,
  variant text not null check (variant in ('score', 'elimination', 'reaction')),
  phase text not null default 'idle'
    check (phase in ('idle', 'prestart', 'playing', 'gameover')),
  created_at timestamptz not null default now()
);

create index if not exists lobbies_code_idx on public.lobbies (code);

create table if not exists public.lobby_participants (
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  participant_id text not null,
  name text not null,
  score int not null default 0,
  alive boolean not null default true,
  progress int not null default 0,
  sequence jsonb,
  updated_at timestamptz not null default now(),
  primary key (lobby_id, participant_id)
);

create index if not exists lobby_participants_lobby_idx
  on public.lobby_participants (lobby_id);

-- Enable Realtime so clients can subscribe to row changes on these tables.
alter publication supabase_realtime add table public.lobbies;
alter publication supabase_realtime add table public.lobby_participants;

-- Row Level Security: allow anonymous (anon) access for the demo so the
-- browser client can read/write lobbies without per-user auth.
alter table public.lobbies enable row level security;
alter table public.lobby_participants enable row level security;

create policy "anon read lobbies" on public.lobbies
  for select to anon using (true);

create policy "anon insert lobbies" on public.lobbies
  for insert to anon with check (true);

create policy "anon update lobbies" on public.lobbies
  for update to anon using (true);

create policy "anon delete lobbies" on public.lobbies
  for delete to anon using (true);

create policy "anon read participants" on public.lobby_participants
  for select to anon using (true);

create policy "anon insert participants" on public.lobby_participants
  for insert to anon with check (true);

create policy "anon update participants" on public.lobby_participants
  for update to anon using (true);

create policy "anon delete participants" on public.lobby_participants
  for delete to anon using (true);

-- RLS policies alone don't grant table privileges; the anon/authenticated
-- roles still need explicit GRANTs to actually read/write these tables.
grant select, insert, update, delete on table public.lobbies to anon, authenticated;
grant select, insert, update, delete on table public.lobby_participants to anon, authenticated;
