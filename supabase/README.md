# Supabase Backend Infrastructure

The following files are used to perform migrations on the Supabase database for the Redshift QTE Demo as well as necessary infrastructure. These migrations will create the necessary tables and relationships for the multiplayer mode of the game.

## Architecture

The multiplayer system operates on a client-authoritative model supported by Supabase Realtime and minimalist edge functions:

1. **Client-Authoritative Gameplay**: All scoring, round endings, and eliminations are computed locally by the client engine. There is no game state tick or loop on the backend.
2. **Supabase Realtime Presence**: Consolidates active gameplay state syncing onto a single live presence channel. This completely avoids database writes during high-frequency active play.
3. **Lobby Heartbeats & Reconciliation**: Clients maintain a lightweight heartbeat in the `lobby_participants` roster table. The database reconciles stale participants, host migration (promoting the earliest joiner deterministically), and empty lobby auto-cleanup.
4. **pg_cron Requirements**: For both local and cloud environments, `pg_cron` is required and enabled to run the `cleanup_stale_lobbies` background reconciliation task periodically.

## What's included here?

This includes the full backend infrastructure for the multiplayer mode of the Redshift QTE Demo, including:
 
- Tables for lobbies, participants, leaderboard, and telemetry
- Edge functions for telemetry, lobby creation, match configuration, and leaderboard persistence

## Deploying to a hosted Supabase project

The Supabase backend has two parts that must be deployed separately: the **database migrations** (tables, RLS policies) and the **Edge Functions** (server-side logic). Both target the same linked project.

### Prerequisites

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
```

You can find your project ref in the Supabase dashboard (Project Settings → General → Reference ID), or via `npx supabase projects list`.

### 1. Database migrations

Push the versioned SQL migrations under `supabase/migrations/` to the linked project. This creates the `lobbies`, `participants`, `telemetry`, and `leaderboard` tables along with their RLS policies.

```bash
npx supabase db push
```

> `db push` applies any new migration files without resetting existing data. To re-apply from scratch (destructive — wipes data), use `npx supabase db reset` against a local stack instead.

### 2. Edge Functions

The Edge Functions live under `supabase/functions/`. Each is deployed individually. The platform automatically injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` at runtime, so no manual secrets configuration is required.

| Function | Deploy command | Notes |
| --- | --- | --- |
| `submitTelemetry` | `npx supabase functions deploy submitTelemetry` | JWT verification disabled via `config.toml` so the browser's anonymous CORS preflight is accepted. Relies on the anon key + RLS. |
| `createLobby` | `npx supabase functions deploy createLobby --no-verify-jwt` | Uses the service role key; invoked anon, so JWT verification is skipped. |
| `changeMode` | `npx supabase functions deploy changeMode --no-verify-jwt` | Uses the service role key; invoked anon. |
| `submitStateToLeaderboard` | `npx supabase functions deploy submitStateToLeaderboard --no-verify-jwt` | Uses the service role key; invoked anon. |

Deploy all of them in one go:

```bash
npx supabase functions deploy submitTelemetry
npx supabase functions deploy createLobby --no-verify-jwt
npx supabase functions deploy changeMode --no-verify-jwt
npx supabase functions deploy submitStateToLeaderboard --no-verify-jwt
```

> `submitTelemetry` is called directly from the browser with the anon key, and its RLS policy permits anon inserts. JWT verification is disabled for it in `config.toml` (`[functions.submitTelemetry] verify_jwt = false`) so the anonymous CORS preflight is not rejected by the gateway. The other three functions run with the service role key and are invoked anon, so they use the `--no-verify-jwt` deploy flag.

### 3. Frontend environment variables

Once the project is deployed, copy the project URL and the **publishable** (anon) key from the Supabase dashboard (Project Settings → API) into your app's `.env`:

```bash
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-publishable-anon-key>
```

The frontend reads these via `lib/supabase.ts` to enable multiplayer and telemetry submission.

### 4. OAuth redirect URLs

The multiplayer mode supports GitHub/Discord sign-in via `supabase.auth.signInWithOAuth`, which redirects back to `window.location.origin` after login. Supabase only allows redirects to URLs listed in the project's allowlist, so every production (and local) origin must be registered.

These are configured in `supabase/config.toml` under `[auth]`:

```toml
[auth]
site_url = "http://127.0.0.1:5173"
additional_redirect_urls = [
  "http://127.0.0.1:5173",
  "https://redshift-qte-demo.urs.deno.net",
]
```

Add any additional deployment domains to `additional_redirect_urls` (comma-separated, no trailing comma), then re-apply the auth config with `npx supabase db push` (or set them in the dashboard under Authentication → URL Configuration). Without this, the OAuth callback is rejected in production even though it works on localhost.

### Local development

To run the entire stack locally instead:

```bash
npx supabase start        # spins up local DB, Realtime, Studio, and Edge Functions
npx supabase db reset     # (re)applies all migrations from scratch
```

`supabase start` writes `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the shell environment, which the integration tests pick up automatically. Convenience npm scripts (`supabase:start`, `supabase:stop`, `supabase:reset`, `supabase:push`) wrap these commands.