import { useCallback, useEffect, useState } from 'react'
import { telemetryClient } from '../lib/telemetry/telemetryClient'
import { createEmptyTelemetry } from '../lib/telemetry'
import type { Telemetry } from '../lib/telemetry'

export interface UseTelemetry {
  /** Current telemetry snapshot. */
  telemetry: Telemetry
  /** Begin a fresh session. */
  start: () => void
  /** Freeze the clock (call at game over). */
  stop: () => void
  /** Advance the clock; call from the game loop to keep KPM fresh. */
  tick: () => void
  /** Record a keystroke. */
  recordInput: (correct: boolean) => void
  /** Record a completed sequence. */
  recordSequenceComplete: () => void
  /** Update the cumulative score. */
  setScore: (score: number) => void
  /** Record the length of the in-progress sequence. */
  setSequenceLength: (length: number) => void
  /** Reset to a blank session. */
  reset: () => void
}

/**
 * Shared telemetry hook used by both singleplayer and multiplayer game loops.
 *
 * Telemetry tracking now runs in a dedicated Web Worker (see
 * {@link telemetryClient}); this hook only forwards commands to the worker and
 * re-renders when a throttled snapshot arrives. Because the worker owns the
 * compute and pushes snapshots at a fixed cadence, the gameplay render loop is
 * never blocked by telemetry bookkeeping.
 */
export function useTelemetry(): UseTelemetry {
  const [telemetry, setTelemetry] = useState<Telemetry>(createEmptyTelemetry())

  // Subscribe to worker snapshots for the lifetime of the hook.
  useEffect(() => {
    return telemetryClient.subscribe(setTelemetry)
  }, [])

  const start = useCallback(() => {
    telemetryClient.start()
  }, [])

  const stop = useCallback(() => {
    telemetryClient.stop()
  }, [])

  const tick = useCallback(() => {
    telemetryClient.tick()
  }, [])

  const recordInput = useCallback((correct: boolean) => {
    telemetryClient.recordInput(correct)
  }, [])

  const recordSequenceComplete = useCallback(() => {
    telemetryClient.recordSequenceComplete()
  }, [])

  const setScore = useCallback((score: number) => {
    telemetryClient.setScore(score)
  }, [])

  const setSequenceLength = useCallback((length: number) => {
    telemetryClient.setSequenceLength(length)
  }, [])

  const reset = useCallback(() => {
    telemetryClient.reset()
  }, [])

  return {
    telemetry,
    start,
    stop,
    tick,
    recordInput,
    recordSequenceComplete,
    setScore,
    setSequenceLength,
    reset,
  }
}
