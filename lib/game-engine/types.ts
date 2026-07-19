import type { GamePhase, QteSequence } from '../types'

/** The two gameplay modes the engine supports. */
export type EngineMode = 'timer' | 'endless'

/** Immutable snapshot of the engine's current state. */
export interface EngineState {
  phase: GamePhase
  mode: EngineMode
  score: number
  sequence: QteSequence | null
  progress: number
  timeLeftMs: number
  /** Current per-sequence time limit in seconds. */
  limitSeconds: number
  prestartTimeLeftMs: number
  elapsedMs: number
  failed: boolean
}

/**
 * Callbacks the engine invokes as the game progresses. All are optional so
 * consumers can subscribe only to the events they care about.
 */
export interface EngineCallbacks {
  /** Fired on every playing-phase tick with the remaining time in ms. */
  onTick?(timeLeftMs: number): void
  /** Fired once when the game ends (timer expired or endless death). */
  onTimeUp?(state: EngineState): void
  /** Fired after each input with whether it matched the expected direction. */
  onInput?(correct: boolean): void
  /** Fired when a full sequence is completed, with the new score. */
  onSequenceComplete?(score: number): void
  /** Fired whenever the engine state changes (drives React re-renders). */
  onStateChange?(state: EngineState): void
}
