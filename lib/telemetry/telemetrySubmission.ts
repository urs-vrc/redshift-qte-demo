/**
 * Client for submitting a finished singleplayer session's telemetry to the
 * Supabase Edge Function (`submitTelemetry`). The function is invoked with the
 * anon key; RLS on the `telemetry` table controls write access.
 *
 * Submission is best-effort: failures are logged but never thrown to the caller,
 * so a telemetry hiccup can never block the player from seeing their results.
 */

import { supabase } from '../supabase'
import type { Telemetry } from './telemetry'
import { getDeviceInfo, type DeviceInfo } from '../deviceInfo'

export interface TelemetrySubmission {
  /** The game mode the session was played in. */
  mode: 'timer' | 'endless'
  /** Final score for the session. */
  score: number
  /** The accumulated telemetry metrics. */
  telemetry: Telemetry
  /** Device / OS metadata captured at submission time. */
  device: DeviceInfo
}

/**
 * Submit a completed singleplayer session. Resolves to `true` on success (or
 * when telemetry is disabled / not configured) and `false` on failure.
 */
export async function submitTelemetry(
  payload: Omit<TelemetrySubmission, 'device'>,
): Promise<boolean> {
  if (!supabase) {
    // No backend configured — nothing to submit, but not an error.
    return true
  }

  const body: TelemetrySubmission = {
    ...payload,
    device: getDeviceInfo(),
  }

  try {
    const { data, error } = await supabase.functions.invoke('submitTelemetry', {
      body,
    })
    if (error) {
      console.error('[telemetry] submission failed', error)
      return false
    }
    if (data && (data as { ok?: boolean }).ok === false) {
      console.error('[telemetry] submission rejected', data)
      return false
    }
    return true
  } catch (e) {
    console.error('[telemetry] submission error', e)
    return false
  }
}
