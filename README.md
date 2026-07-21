## The Redshift QTE Demo (browser edition)

This is an implementation of the upcoming gate start mechanic for [Redshift](https://github.com/urs-vrc/observatory), which allows a more skill-based implementation of a start mechanic for the Umamusume-inspired racing game. 

The goal of this demo is to experiment and showcase the core gameplay loop of the QTE mechanic, and to provide a reference implementation for the eventual final version in the VRChat version. To make the demo more engaging, it is presented as a browser-based game, which you can play with any modern web browser.

## Developing

This demo uses Vite, React, and TypeScript, with Supabase as the backend for the multiplayer mode. To run the demo locally, you will need to have Node.js and npm installed on your machine. You can then clone the repository and run the following commands:

```bash
npm install
npm run dev
```

Make sure to set the `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` environment variables in a `.env` file in the root of the project, which you can get from your Supabase project settings.

### Performing Migrations on Supabase

The multiplayer mode needs database tables for lobbies and participants. These are defined as versioned SQL migrations under `supabase/migrations/` and applied with the Supabase CLI.

**Local development** (spins up a local Supabase stack and applies all migrations):

```bash
npx supabase start
npx supabase db reset   # re-applies migrations from scratch
```

**Remote project** (push migrations to your hosted Supabase project):

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Convenience npm scripts are also available: `npm run supabase:start`, `npm run supabase:stop`, `npm run supabase:reset`, and `npm run supabase:push`.

> Note: the current multiplayer flow uses Realtime presence channels, so the lobby tables are optional infrastructure for persisted lobbies. They are safe to apply regardless.

## What does this demo include?

This demo includes a reference implementation of the QTE mechanic, inspired from the "strategem" mechanic in [Helldivers 2](https://www.helldivers.com/). The demo includes a simple interface that showcases the main screen of the game, where the player can interact with the QTE mechanic by pressing the correct keys in the sequence at the right time. 

The game includes two modes:

- **Timer Mode**: This is the implementation that will ship with the VRChat version of Redshift. In this mode, the player has a limited amount of time to complete the QTE sequence, and the game will end if the player fails to complete the sequence in time. You are given an infinite amount of sequences and attempts until the timer runs out and your final score is calculated based on the correct amount of sequences you completed under the time limit.

- **Endless Mode**: This mode is a more "endurance" mode, where it retains the same gameplay loop as the timer mode, but you will fail if you don't enter the correct sequence in time. The game also progressively gets harder as the time limit for each sequence gets shorter. This is the only browser-exclusive mode, and will not be present in the VRChat version of Redshift.

### Multiplayer Mode

The QTE also includes a multiplayer mode, which allows players to compete against each other with the same modes as the singleplayer version. This is implemented as a "lobby" system, where players can create or join a lobby and compete against each other in real-time. The only alterations for the modes on the multiplayer version is:

- Endless Mode is an "elimination" mode, where players will be eliminated if they fail to complete the sequence in time. The last player standing wins the game.

- Timer Mode is a "score" mode, where players will compete to see who can complete the most sequences in the time limit. The player with the highest score at the end of the timer wins the game. In the "reaction" mode, you win by whoever completes the sequence first.

#### Architecture (Client-Authoritative)

The multiplayer implementation features a robust, client-authoritative, single-channel architecture:

- **Client-Authoritative Model**: Clients remain the sole source of truth for all local gameplay and scoring. Each client runs the singleplayer engine (`useSingleplayerState`) locally, and computes round-end, elimination, and win states locally using pure deterministic functions (`getDerivedMatchState`).
- **Single Presence Channel**: All active live gameplay syncing is consolidated onto a single Supabase Realtime Presence channel (`lobby:${CODE}`).
- **Minimalist Roster Heartbeat**: The DB roster table (`lobby_participants`) is used strictly for liveness detection (heartbeat) and server-reconciled host migration. It does not duplicate live gameplay state.
- **Deterministic Host Migration**: Stale-heartbeat pruning and earliest-joiner promotion are handled strictly server-side by database-level server reconciliation. This deterministic reconciliation is run periodically by `pg_cron`. For local development, `pg_cron` runs inside the local Dockerized Supabase stack (started via `supabase start`).
- **Adapter Interface**: All multiplayer interactions are decoupled via a unified `MultiplayerBackend` adapter pattern (supporting both `SupabaseMultiplayerBackend` and `MockMultiplayerBackend`), allowing the frontend code to remain identical between mock and real modes.