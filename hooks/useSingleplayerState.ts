import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameMode, QteDirection, SingleplayerState } from '../lib/types'
import { endlessTimeLimit, generateSequence, keyToDirection } from '../lib/qte'

const TIMER_MODE_DURATION_MS = 30_000
const TIMER_MODE_SEQUENCE_LIMIT_MS = 5000
const PRESTART_DURATION_MS = 9_000
const SEQUENCE_LENGTH = 4

function createInitialState(mode: GameMode): SingleplayerState {
  return {
    phase: 'idle',
    mode,
    score: 0,
    sequence: null,
    progress: 0,
    gameTimeLeftMs: TIMER_MODE_DURATION_MS,
    sequenceTimeLeftMs: mode === 'timer' ? TIMER_MODE_SEQUENCE_LIMIT_MS : endlessTimeLimit(0),
    prestartTimeLeftMs: PRESTART_DURATION_MS,
    failed: false,
  }
}

export interface UseSingleplayerState {
  state: SingleplayerState
  start: (mode: GameMode) => void
  reset: () => void
}

export function useSingleplayerState(): UseSingleplayerState {
  const [state, setState] = useState<SingleplayerState>(() =>
    createInitialState('timer'),
  )

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastTickRef = useRef<number>(0)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const start = useCallback(
    (mode: GameMode) => {
      clearTimer()
      setState({
        phase: 'prestart',
        mode,
        score: 0,
        sequence: generateSequence(SEQUENCE_LENGTH),
        progress: 0,
        gameTimeLeftMs: TIMER_MODE_DURATION_MS,
        sequenceTimeLeftMs: endlessTimeLimit(0),
        prestartTimeLeftMs: PRESTART_DURATION_MS,
        failed: false,
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
            if (prev.mode === 'timer') {
              const nextGameTime = Math.max(0, prev.gameTimeLeftMs - delta)
              if (nextGameTime <= 0) {
                clearTimer()
                return {
                  ...prev,
                  phase: 'gameover',
                  sequence: null,
                  gameTimeLeftMs: 0,
                }
              }
              return {
                ...prev,
                gameTimeLeftMs: nextGameTime,
              }
            } else {
              // Endless mode uses sequence timer
              const nextSeqTime = Math.max(0, prev.sequenceTimeLeftMs - delta)
              if (nextSeqTime <= 0) {
                clearTimer()
                return {
                  ...prev,
                  phase: 'gameover',
                  sequence: null,
                  sequenceTimeLeftMs: 0,
                }
              }
              return {
                ...prev,
                sequenceTimeLeftMs: nextSeqTime,
              }
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
    setState(createInitialState('timer'))
  }, [clearTimer])

  const handleInput = useCallback(
    (direction: QteDirection) => {
      setState((prev) => {
        if (prev.phase !== 'playing' || !prev.sequence) return prev
        const expected = prev.sequence.steps[prev.progress]
        if (direction !== expected) {
          if (prev.mode === 'endless') {
            clearTimer()
            return {
              ...prev,
              phase: 'gameover',
              failed: true,
              sequence: null,
              sequenceTimeLeftMs: 0,
            }
          }
          // Timer mode: a wrong input just resets the current sequence progress.
          return { ...prev, failed: true, progress: 0 }
        }
        const nextProgress = prev.progress + 1
        if (nextProgress >= prev.sequence.steps.length) {
          const newScore = prev.score + 1
          // Generate next sequence
          const nextLimit = prev.mode === 'endless' ? endlessTimeLimit(newScore) : prev.sequenceTimeLeftMs
          return {
            ...prev,
            score: newScore,
            sequence: generateSequence(SEQUENCE_LENGTH),
            progress: 0,
            failed: false,
            sequenceTimeLeftMs: nextLimit,
          }
        }
        return { ...prev, progress: nextProgress, failed: false }
      })
    },
    [clearTimer],
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

  return { state, start, reset }
}
