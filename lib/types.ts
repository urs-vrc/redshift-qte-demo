export type GameMode = 'timer' | 'endless'

export type MultiplayerVariant = 'score' | 'elimination' | 'reaction'

export type GamePhase = 'idle' | 'prestart' | 'playing' | 'gameover'

export type QteDirection = 'up' | 'down' | 'left' | 'right'

export interface QteSequence {
  id: string
  steps: QteDirection[]
}

export interface SingleplayerState {
  phase: GamePhase
  mode: GameMode
  score: number
  sequence: QteSequence | null
  /** Index of the next step the player must input. */
  progress: number
  /** Remaining time in milliseconds for the active phase. */
  timeLeftMs: number
  /** Remaining time in milliseconds for the prestart countdown (starts at 9s). */
  prestartTimeLeftMs: number
  /** The selected initial duration in seconds (5, 10, or 15). */
  limitSeconds: number
  /** Whether the most recent input was wrong. */
  failed: boolean
  /** Total time elapsed in milliseconds while playing (used for endless mode survival time). */
  elapsedMs: number
}

export interface MultiplayerParticipant {
  id: string
  name: string
  score: number
  alive: boolean
  /** Whether the participant has signalled they are ready in the lobby. */
  ready: boolean
  /** Whether the participant has finished their round (timer expired or completed). */
  finished: boolean
  /** Current sequence assigned to this participant, if any. */
  sequence: QteSequence | null
  /** Progress within the current sequence. */
  progress: number
}

export interface Lobby {
  id: string
  code: string
  hostId: string
  participants: MultiplayerParticipant[]
  variant: MultiplayerVariant
  /** Initial per-round window in seconds for timer-like variants (score/reaction). */
  windowSeconds: number
  /** Initial combo length for the first sequence of each round. */
  sequenceLength: number
  phase: GamePhase
  /** Epoch ms when the host started the round; clients anchor their local
   *  countdown to this so everyone shares the same synchronized clock. */
  startedAt: number | null
}
