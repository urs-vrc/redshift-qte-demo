import type { QteSequence } from './types'

/** The multiplayer game variants. */
export type MultiplayerVariant = 'score' | 'elimination' | 'reaction'

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

// Imported at the bottom to avoid a circular type reference with ./types
// (./types defines QteSequence which Lobby/Participant depend on, while
// ./types has no dependency on this module).
import type { GamePhase } from './types'
