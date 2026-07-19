import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { submitTelemetry } from '../telemetry/telemetrySubmission'
import type { Telemetry } from '../telemetry'

// Integration tests against a *running* local Supabase stack.
//
// These are skipped unless VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are
// set — which `supabase start` does automatically (it writes them to the
// shell environment). In CI this runs after `supabase start`; locally you can
// run:  eval "$(supabase start)" && pnpm test:integration
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const describeOrSkip = url && anonKey ? describe : describe.skip

const sampleTelemetry: Telemetry = {
  totalInputs: 10,
  correctInputs: 8,
  wrongInputs: 2,
  sequencesCompleted: 3,
  avgSequenceLength: 3.3,
  maxCombo: 5,
  elapsedMs: 12_000,
  currentKpm: 40,
  averageKpm: 40,
  highKpm: 55,
  lowKpm: 30,
  accuracy: 0.8,
  samples: [],
}

describeOrSkip('telemetry submission (integration)', () => {
  let sb: SupabaseClient

  beforeAll(() => {
    sb = createClient(url!, anonKey!)
  })

  it('inserts a telemetry row via the Edge Function with device metadata', async () => {
    const ok = await submitTelemetry({
      mode: 'timer',
      score: 42,
      telemetry: sampleTelemetry,
    })
    expect(ok).toBe(true)

    // Verify the row landed with the expected columns + device metadata.
    const { data, error } = await sb
      .from('telemetry')
      .select('mode, score, device_type, os, browser, is_touch')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(error).toBeNull()
    expect(data!.mode).toBe('timer')
    expect(data!.score).toBe(42)
    expect(data!.device_type).toBeTruthy()
    expect(data!.browser).toBeTruthy()
    expect(typeof data!.is_touch).toBe('boolean')
  })

  it('rejects an invalid mode at the Edge Function (400)', async () => {
    const res = await sb.functions.invoke('submitTelemetry', {
      body: { mode: 'bogus', score: 0, telemetry: sampleTelemetry },
    })
    expect(res.error).not.toBeNull()
  })
})