import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameMode, QteDirection, SingleplayerState } from '../lib/types'
import {
  ENDLESS_MISTAKE_PENALTY_SECONDS,
  endlessSequenceLength,
  endlessTimeLimit,
  generateSequence,
  keyToDirection,
} from '../lib/qte'
import { useTelemetry } from './useTelemetry'

const PRESTART_DURATION_MS = 9_000
const SEQUENCE_LENGTH = 4

function createInitialState(mode: GameMode, limitSeconds: number = 5): SingleplayerState {
  return {
    phase: 'idle',
    mode,
    score: 0,
    sequence: null,
    progress: 0,
    timeLeftMs: limitSeconds * 1000,
    prestartTimeLeftMs: PRESTART_DURATION_MS,
    limitSeconds,
    failed: false,
    elapsedMs: 0,
  }
}

export interface UseSingleplayerState {
  state: SingleplayerState
  start: (mode: GameMode, limitSeconds: number, sequenceLength?: number) => void
  reset: () => void
  handleInput: (direction: QteDirection) => void
  telemetry: ReturnType<typeof useTelemetry>['telemetry']
}

export function useSingleplayerState(): UseSingleplayerState {
  const [state, setState] = useState<SingleplayerState>(() =>
    createInitialState('timer'),
  )

  const telemetry = useTelemetry()

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastTickRef = useRef<number>(0)
  const sequenceLengthRef = useRef<number>(SEQUENCE_LENGTH)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const start = useCallback(
    (mode: GameMode, limitSeconds: number, sequenceLength?: number) => {
      clearTimer()
      telemetry.start()
      const initialLength =
        mode === 'endless'
          ? endlessSequenceLength(0, SEQUENCE_LENGTH)
          : sequenceLength ?? SEQUENCE_LENGTH
      sequenceLengthRef.current = initialLength
      telemetry.setSequenceLength(initialLength)
      setState({
        phase: 'prestart',
        mode,
        score: 0,
        sequence: generateSequence(initialLength),
        progress: 0,
        timeLeftMs: (mode === 'endless' ? 15 : limitSeconds) * 1000,
        prestartTimeLeftMs: PRESTART_DURATION_MS,
        limitSeconds: mode === 'endless' ? 15 : limitSeconds,
        failed: false,
        elapsedMs: 0,
      })

      lastTickRef.current = Date.now()
      timerRef.current = setInterval(() => {
        const now = Date.now()
        const delta = now - lastTickRef.current
        lastTickRef.current = now

        setState((prev) => {
          if (prev.phase === 'prestart') {
            const nextPrestart = Math.max(0, prev.prestartTimeLeftMs - delta)
            if (nextPrestart <= 0) {
              return {
                ...prev,
                phase: 'playing',
                prestartTimeLeftMs: 0,
              }
            }
            return {
              ...prev,
              prestartTimeLeftMs: nextPrestart,
            }
          }

          if (prev.phase === 'playing') {
            if (prev.timeLeftMs <= 0) {
              clearTimer()
              telemetry.stop()
              return {
                ...prev,
                phase: 'gameover',
                sequence: null,
                timeLeftMs: 0,
                elapsedMs: prev.elapsedMs + delta,
              }
            }
            telemetry.tick()
            return {
              ...prev,
              timeLeftMs: Math.max(0, prev.timeLeftMs - delta),
              elapsedMs: prev.elapsedMs + delta,
            }
          }

          return prev
        })
      }, 50)
    },
    [clearTimer],
  )

  const reset = useCallback(() => {
    clearTimer()
    telemetry.reset()
    setState(createInitialState('timer'))
  }, [clearTimer, telemetry])

  const handleInput = useCallback(
    (direction: QteDirection) => {
      setState((prev) => {
        if (prev.phase !== 'playing' || !prev.sequence) return prev
        const expected = prev.sequence.steps[prev.progress]
        const correct = direction === expected
        telemetry.recordInput(correct)
        if (!correct) {
          if (prev.mode === 'endless') {
            // Punish the mistake directly against the clock the player is racing.
            const penalized = Math.max(0, prev.timeLeftMs - ENDLESS_MISTAKE_PENALTY_SECONDS * 1000)
            if (penalized <= 0) {
              clearTimer()
              telemetry.stop()
              return {
                ...prev,
                phase: 'gameover',
                sequence: null,
                timeLeftMs: 0,
                progress: 0,
              }
            }
            return { ...prev, progress: 0, timeLeftMs: penalized }
          }
          return { ...prev, failed: true, progress: 0 }
        }
        const nextProgress = prev.progress + 1
        if (nextProgress >= prev.sequence.steps.length) {
          telemetry.recordSequenceComplete()
          const newScore = prev.score + 1
          telemetry.setScore(newScore)
          // Endless mode: difficulty ramps continuously with score.
          const nextLimitSeconds =
            prev.mode === 'endless' ? endlessTimeLimit(newScore) : prev.limitSeconds
          const nextLength =
            prev.mode === 'endless'
              ? endlessSequenceLength(newScore, SEQUENCE_LENGTH)
              : sequenceLengthRef.current
          telemetry.setSequenceLength(nextLength)

          return {
            ...prev,
            score: newScore,
            sequence: generateSequence(nextLength),
            progress: 0,
            failed: false,
            timeLeftMs: prev.mode === 'endless' ? nextLimitSeconds * 1000 : prev.timeLeftMs,
            limitSeconds: prev.mode === 'endless' ? nextLimitSeconds : prev.limitSeconds,
          }
        }
        return { ...prev, progress: nextProgress, failed: false }
      })
    },
    [telemetry],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const direction = keyToDirection(e.key)
      if (direction) handleInput(direction)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleInput])

  useEffect(() => clearTimer, [clearTimer])

  return { state, start, reset, handleInput, telemetry: telemetry.telemetry }
}
