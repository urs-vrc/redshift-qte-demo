// Supabase Edge Function: submitTelemetry
//
// Accepts a finished singleplayer session's telemetry (plus device metadata)
// and inserts it into the `public.telemetry` table. Invoked from the browser
// with the anon key; the table's RLS policy permits anon inserts only.
//
// Deploy with: supabase functions deploy submitTelemetry
// (verify_jwt is disabled in supabase/config.toml so the browser's anonymous
// CORS preflight is accepted.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface DeviceInfo {
  deviceType: string
  os: string
  osVersion: string | null
  browser: string
  isTouch: boolean
  userAgent: string
}

interface TelemetryPayload {
  totalInputs: number
  correctInputs: number
  wrongInputs: number
  sequencesCompleted: number
  avgSequenceLength: number
  maxCombo: number
  elapsedMs: number
  averageKpm: number
  highKpm: number
  lowKpm: number
  accuracy: number
}

interface SubmitBody {
  mode: 'timer' | 'endless'
  score: number
  telemetry: TelemetryPayload
  device: DeviceInfo
}

Deno.serve(async (req: Request) => {
  // CORS preflight
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
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ ok: false, error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: SubmitBody
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { mode, score, telemetry, device } = body
  if (!telemetry || (mode !== 'timer' && mode !== 'endless')) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid payload' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { error } = await supabase.from('telemetry').insert({
    mode,
    score: score ?? 0,
    total_inputs: telemetry.totalInputs ?? 0,
    correct_inputs: telemetry.correctInputs ?? 0,
    wrong_inputs: telemetry.wrongInputs ?? 0,
    sequences_completed: telemetry.sequencesCompleted ?? 0,
    avg_sequence_length: telemetry.avgSequenceLength ?? 0,
    max_combo: telemetry.maxCombo ?? 0,
    elapsed_ms: telemetry.elapsedMs ?? 0,
    average_kpm: telemetry.averageKpm ?? 0,
    high_kpm: telemetry.highKpm ?? 0,
    low_kpm: telemetry.lowKpm ?? 0,
    accuracy: telemetry.accuracy ?? 0,
    device_type: device?.deviceType ?? 'unknown',
    os: device?.os ?? 'unknown',
    os_version: device?.osVersion ?? null,
    browser: device?.browser ?? 'unknown',
    is_touch: device?.isTouch ?? false,
    user_agent: device?.userAgent ?? null,
  })

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
