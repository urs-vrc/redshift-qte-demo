// Supabase Edge Function: changeMode
//
// Updates a lobby's `variant` and/or `phase`. Host-authorization is enforced
// here: only the caller whose hostId matches the lobby's stored host_id may
// change it. Runs with the service_role key so it can write to `public.lobbies`
// (anon clients are SELECT-only per migration 0003).
//
// Deploy with: supabase functions deploy changeMode --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const VARIANTS = ['score', 'elimination', 'reaction'] as const
type Variant = (typeof VARIANTS)[number]

const PHASES = ['idle', 'prestart', 'playing', 'gameover'] as const
type Phase = (typeof PHASES)[number]

interface ChangeModeBody {
  code: string
  hostId: string
  variant?: string
  phase?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ ok: false, error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: ChangeModeBody
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { code, hostId, variant, phase } = body
  if (!code || !hostId) {
    return new Response(
      JSON.stringify({ ok: false, error: 'code and hostId are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const update: Record<string, string> = {}
  if (variant !== undefined) {
    if (!VARIANTS.includes(variant as Variant)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid variant' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    update.variant = variant
  }
  if (phase !== undefined) {
    if (!PHASES.includes(phase as Phase)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid phase' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    update.phase = phase
  }
  if (Object.keys(update).length === 0) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Nothing to update' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  // Verify the caller is the host before applying any change.
  const { data: lobby, error: lookupError } = await supabase
    .from('lobbies')
    .select('host_id')
    .eq('code', code)
    .maybeSingle()

  if (lookupError) {
    return new Response(
      JSON.stringify({ ok: false, error: lookupError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  if (!lobby) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Lobby not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  if (lobby.host_id !== hostId) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Only the host can change the lobby' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const { error: updateError } = await supabase
    .from('lobbies')
    .update(update)
    .eq('code', code)

  if (updateError) {
    return new Response(
      JSON.stringify({ ok: false, error: updateError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // A fresh round is starting: clear the previous round's standings so the
  // results screen only ever shows the current round's leaderboard.
  if (phase === 'playing') {
    const { error: clearError } = await supabase
      .from('leaderboard')
      .delete()
      .eq('lobby_code', code)
    if (clearError) {
      return new Response(
        JSON.stringify({ ok: false, error: clearError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
