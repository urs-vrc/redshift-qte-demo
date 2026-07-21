import type { QteDirection } from './types'
import {
  ENDLESS_MISTAKE_PENALTY_SECONDS,
  ENDLESS_TIME_START_SECONDS,
  endlessSequenceLength,
  endlessTimeLimit,
  generateSequence,
} from './sequence'
import type { EngineCallbacks, EngineMode, EngineState } from './types'
import { keyToDirection } from './input'

export interface GameEngineOptions {
  mode: EngineMode
  windowSeconds: number
  baseLength: number
  callbacks?: EngineCallbacks
}

/**
 * Framework-agnostic game engine that owns the core QTE gameplay loop:
 * the prestart countdown, the playing clock, input handling, and the
 * gameover transition. It drives itself via an internal interval and
 * notifies consumers through {@link EngineCallbacks}.
 *
 * State is held mutably on the instance; React (or any other UI layer)
 * re-renders by subscribing to `onStateChange`.
 */
export class GameEngine {
  public state!: EngineState

  private mode: EngineMode = 'timer'
  private windowSeconds: number = 5
  private baseLength: number = 4
  private callbacks: EngineCallbacks = {}
  private timerRef: ReturnType<typeof setInterval> | null = null

  constructor(opts: GameEngineOptions) {
    this.mode = opts.mode
    this.windowSeconds = opts.windowSeconds
    this.baseLength = opts.baseLength
    this.callbacks = opts.callbacks ?? {}
    this.reset()
  }

  /** Begin a round with a 9s prestart countdown before play starts. */
  start(): void {
    this.clearTimer()
    const initialLength =
      this.mode === 'endless'
        ? endlessSequenceLength(0, this.baseLength)
        : this.baseLength
    const initialTimeMs =
      this.mode === 'endless'
        ? ENDLESS_TIME_START_SECONDS * 1000
        : this.windowSeconds * 1000

    this.state = {
      phase: 'prestart',
      mode: this.mode,
      score: 0,
      sequence: generateSequence(initialLength),
      progress: 0,
      timeLeftMs: initialTimeMs,
      limitSeconds: this.mode === 'endless' ? ENDLESS_TIME_START_SECONDS : this.windowSeconds,
      prestartTimeLeftMs: 9_000,
      elapsedMs: 0,
      failed: false,
    }

    this.beginTimer()
  }

  /** Begin a round immediately in the playing phase (no prestart countdown). */
  startImmediate(): void {
    this.clearTimer()
    const initialLength =
      this.mode === 'endless'
        ? endlessSequenceLength(0, this.baseLength)
        : this.baseLength
    const initialTimeMs =
      this.mode === 'endless'
        ? ENDLESS_TIME_START_SECONDS * 1000
        : this.windowSeconds * 1000

    this.state = {
      phase: 'playing',
      mode: this.mode,
      score: 0,
      sequence: generateSequence(initialLength),
      progress: 0,
      timeLeftMs: initialTimeMs,
      limitSeconds: this.mode === 'endless' ? ENDLESS_TIME_START_SECONDS : this.windowSeconds,
      prestartTimeLeftMs: 0,
      elapsedMs: 0,
      failed: false,
    }

    this.beginTimer()
  }

  /** Start the engine's internal clock. Safe to call after the state is set. */
  private beginTimer(): void {
    this.clearTimer()
    let lastTick = Date.now()
    this.timerRef = setInterval(() => {
      const now = Date.now()
      const delta = now - lastTick
      lastTick = now
      this.tick(delta)
    }, 50)
  }

  /** Reset to the idle state, clearing any running timer. */
  reset(): void {
    this.clearTimer()
    this.state = {
      phase: 'idle',
      mode: this.mode,
      score: 0,
      sequence: null,
      progress: 0,
      timeLeftMs:
        this.mode === 'endless'
          ? ENDLESS_TIME_START_SECONDS * 1000
          : this.windowSeconds * 1000,
      limitSeconds: this.mode === 'endless' ? ENDLESS_TIME_START_SECONDS : this.windowSeconds,
      prestartTimeLeftMs: 9_000,
      elapsedMs: 0,
      failed: false,
    }
  }

  /** Change the engine's mode/settings. Does not start a new round. */
  reconfigure(mode: EngineMode, windowSeconds: number, baseLength: number): void {
    this.clearTimer()
    this.mode = mode
    this.windowSeconds = windowSeconds
    this.baseLength = baseLength
  }

  /** Process a directional input against the current sequence. */
  handleInput(direction: QteDirection): void {
    if (this.state.phase !== 'playing' || !this.state.sequence) return

    const expected = this.state.sequence.steps[this.state.progress]
    const correct = direction === expected
    this.callbacks.onInput?.(correct)

    if (!correct) {
      if (this.state.mode === 'endless') {
        const penalized = Math.max(0, this.state.timeLeftMs - ENDLESS_MISTAKE_PENALTY_SECONDS * 1000)
        if (penalized <= 0) {
          this.clearTimer()
          const dead = { ...this.state, phase: 'gameover' as const, sequence: null, timeLeftMs: 0, progress: 0 }
          this.callbacks.onTimeUp?.(dead)
          this.state = dead
          this.callbacks.onStateChange?.(dead)
          return
        }
        const next = { ...this.state, progress: 0, timeLeftMs: penalized }
        this.state = next
        this.callbacks.onStateChange?.(next)
        return
      }
      const next = { ...this.state, failed: true, progress: 0 }
      this.state = next
      this.callbacks.onStateChange?.(next)
      return
    }

    const nextProgress = this.state.progress + 1
    if (nextProgress >= this.state.sequence.steps.length) {
      const newScore = this.state.score + 1
      const nextLimitSeconds =
        this.state.mode === 'endless' ? endlessTimeLimit(newScore) : this.state.limitSeconds
      const nextLength =
        this.state.mode === 'endless'
          ? endlessSequenceLength(newScore, this.baseLength)
          : this.baseLength
      const nextSeq = generateSequence(nextLength)
      const updated: EngineState = {
        ...this.state,
        score: newScore,
        sequence: nextSeq,
        progress: 0,
        failed: false,
        timeLeftMs:
          this.state.mode === 'endless' ? nextLimitSeconds * 1000 : this.state.timeLeftMs,
        limitSeconds: nextLimitSeconds,
      }
      this.state = updated
      console.log('Sequence completed, new ID:', nextSeq.id)
      this.callbacks.onSequenceComplete?.(newScore)
      this.callbacks.onStateChange?.(updated)
      return
    }

    const next = { ...this.state, progress: nextProgress, failed: false }
    this.state = next
    this.callbacks.onStateChange?.(next)
  }

  /** Initialize keyboard input listeners. Uses the de-duplicated keyToDirection map. */
  initInput(): void {
    const onKey = (e: KeyboardEvent) => {
      const direction = keyToDirection(e.key)
      if (direction) this.handleInput(direction)
    }
    window.addEventListener('keydown', onKey)
    this.cleanupInput = () => window.removeEventListener('keydown', onKey)
  }

  /** Clean up keyboard input listeners. */
  destroyInput(): void {
    this.cleanupInput?.()
    this.cleanupInput = undefined
  }

  private cleanupInput?: () => void

  /** Advance the clock by `delta` ms, handling phase transitions. */
  tick(delta: number): void {
    if (this.state.phase === 'prestart') {
      const nextPrestart = Math.max(0, this.state.prestartTimeLeftMs - delta)
      if (nextPrestart <= 0) {
        const next = { ...this.state, phase: 'playing' as const, prestartTimeLeftMs: 0 }
        this.state = next
        this.callbacks.onStateChange?.(next)
        return
      }
      const next = { ...this.state, prestartTimeLeftMs: nextPrestart }
      this.state = next
      this.callbacks.onStateChange?.(next)
      return
    }

    if (this.state.phase === 'playing') {
      if (this.state.timeLeftMs <= 0) {
        this.clearTimer()
        const final = {
          ...this.state,
          phase: 'gameover' as const,
          sequence: null,
          timeLeftMs: 0,
          elapsedMs: this.state.elapsedMs + delta,
        }
        this.callbacks.onTimeUp?.(final)
        this.state = final
        this.callbacks.onStateChange?.(final)
        return
      }

      const next = {
        ...this.state,
        timeLeftMs: Math.max(0, this.state.timeLeftMs - delta),
        elapsedMs: this.state.elapsedMs + delta,
      }
      this.callbacks.onTick?.(next.timeLeftMs)
      this.state = next
      this.callbacks.onStateChange?.(next)
    }
  }

  /** Stop the engine and clear its timer. */
  destroy(): void {
    this.clearTimer()
  }

  private clearTimer(): void {
    if (this.timerRef !== null) {
      clearInterval(this.timerRef)
      this.timerRef = null
    }
  }
}
