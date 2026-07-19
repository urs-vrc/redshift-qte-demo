import { useState, useEffect, useRef } from 'react'
import type { GameMode, QteDirection, SingleplayerState } from '../lib/types'
import { keyToDirection } from '../lib/game-engine/input'
import { useTelemetry } from './useTelemetry'
import { GameEngine } from '../lib/game-engine'

export interface UseSingleplayerState {
  state: SingleplayerState
  start: (mode: GameMode, limitSeconds: number, sequenceLength?: number) => void
  reset: () => void
  handleInput: (direction: QteDirection) => void
  telemetry: ReturnType<typeof useTelemetry>['telemetry']
}

function toSingleplayerState(s: any): SingleplayerState {
  return {
    phase: s.phase,
    mode: s.mode === 'endless' ? 'endless' : 'timer',
    score: s.score,
    sequence: s.sequence,
    progress: s.progress,
    timeLeftMs: s.timeLeftMs,
    prestartTimeLeftMs: s.prestartTimeLeftMs,
    limitSeconds: s.limitSeconds,
    failed: s.failed,
    elapsedMs: s.elapsedMs,
  }
}

export function useSingleplayerState(): UseSingleplayerState {
  const telemetry = useTelemetry()
  const engineRef = useRef<GameEngine | null>(null)
  const [, forceUpdate] = useState(0)

  // Create the engine once; reconfigure on each start() call.
  if (!engineRef.current) {
    engineRef.current = new GameEngine({
      mode: 'timer',
      windowSeconds: 5,
      baseLength: 4,
      callbacks: {
        onTick() { telemetry.tick() },
        onInput(correct) { telemetry.recordInput(correct) },
        onSequenceComplete(score) { telemetry.setScore(score); telemetry.recordSequenceComplete() },
        onTimeUp() { telemetry.stop() },
        onStateChange() { forceUpdate((n) => n + 1) },
      },
    })
  }

  const engine = engineRef.current

  const start = (mode: GameMode, limitSeconds: number, sequenceLength?: number) => {
    telemetry.start()
    if (sequenceLength !== undefined) {
      telemetry.setSequenceLength(sequenceLength)
    }
    const engMode = mode === 'endless' ? 'endless' : 'timer'
    engine.reconfigure(engMode, limitSeconds, sequenceLength ?? 4)
    engine.start()
  }

  const reset = () => {
    engine.reset()
    telemetry.reset()
    forceUpdate((n) => n + 1)
  }

  const handleInput = (direction: QteDirection) => {
    engine.handleInput(direction)
    forceUpdate((n) => n + 1)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const direction = keyToDirection(e.key)
      if (direction) handleInput(direction)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleInput])

  return {
    state: toSingleplayerState(engine.state),
    start,
    reset,
    handleInput,
    telemetry: telemetry.telemetry,
  }
}
